"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import { CHAIN, COURT_ADDRESS } from "./chain";

/**
 * The visitor's identity in this court.
 *
 * A DISPOSABLE KEY HELD IN THIS BROWSER, not a wallet extension. That is a
 * deliberate choice and it is worth saying why, because "connect your wallet"
 * would have been the reflex.
 *
 * Who signs matters here in a way it does not on a read-only app. The plaintiff
 * of a case IS the address that filed it, and only the named defendant can
 * answer. A server-side relayer — the usual way to make a testnet demo
 * frictionless — would make every visitor the same plaintiff and every case a
 * dispute between one address and itself, which is not a demonstration of this
 * contract at all. So the signer has to be the visitor.
 *
 * The alternative, MetaMask, needs Flask plus the GenLayer Snap on this
 * network: a lot of setup to try a testnet court. A key generated here is a
 * real, distinct signer with none of that.
 *
 * It is a throwaway testnet key and the interface says so wherever it appears.
 * It never leaves this browser, it is funded from a public faucet, and the GEN
 * it holds is worth nothing.
 */

const KEY_STORAGE = "courtroom.key.v1";

type Phase = "idle" | "signing" | "settling" | "done" | "error";

export interface SendResult {
  ok: boolean;
  hash?: string;
  /** The status object every write in this contract returns. Nothing raises, so
   *  this object IS the outcome — including a refusal, which arrives as
   *  {status: "REJECTED", reason}. */
  returned: Record<string, unknown> | null;
  status: string;
  reason?: string;
  error?: string;
}

interface WalletState {
  ready: boolean;
  address: string | null;
  balanceWei: bigint;
  phase: Phase;
  create: () => void;
  forget: () => void;
  refresh: () => Promise<void>;
  fund: () => Promise<boolean>;
  funding: boolean;
  send: (fn: string, args: CallArg[], value?: bigint, address?: string) => Promise<SendResult>;
  exportKey: () => string | null;
}

/** What the calldata encoder accepts. Narrower than `unknown` on purpose: a
 *  value it cannot encode fails at submit time with a message about bytes, and
 *  the compiler can catch it here instead. */
export type CallArg = string | number | boolean | bigint;

const Ctx = createContext<WalletState | null>(null);

const TERMINAL = ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];

function isHexKey(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<`0x${string}` | null>(null);
  const [ready, setReady] = useState(false);
  const [balanceWei, setBalanceWei] = useState(0n);
  const [phase, setPhase] = useState<Phase>("idle");
  const [funding, setFunding] = useState(false);
  const readRef = useRef(createClient({ chain: studioDevnet }));

  /*
   * Read the stored key AFTER mount, deliberately.
   *
   * `localStorage` does not exist while this renders on the server, so the key
   * cannot be a lazy `useState` initialiser without the first client render
   * disagreeing with the server's HTML — a hydration mismatch, which is a worse
   * bug than the one the lint rule below is guarding against. `ready` stays
   * false until this has run so that nothing renders a half-known identity.
   *
   * The two disables below are scoped to these lines and nothing else.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY_STORAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isHexKey(stored)) setKey(stored);
    } catch {
      /* private mode, blocked storage: the app works, it just cannot remember */
    }
    setReady(true);
  }, []);

  const account = useMemo(() => (key ? createAccount(key) : null), [key]);
  const address = account?.address ?? null;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setBalanceWei(await readRef.current.getBalance({ address: address as `0x${string}` }));
    } catch {
      /* a balance we could not read is not a balance of zero, so leave it */
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    void refresh();
    const t = setInterval(() => void refresh(), 20000);
    return () => clearInterval(t);
  }, [address, refresh]);

  const create = useCallback(() => {
    const fresh = generatePrivateKey() as `0x${string}`;
    try {
      window.localStorage.setItem(KEY_STORAGE, fresh);
    } catch {
      /* not fatal — the key lives for this session either way */
    }
    setKey(fresh);
  }, []);

  const forget = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY_STORAGE);
    } catch { /* nothing to clean up */ }
    setKey(null);
    setBalanceWei(0n);
  }, []);

  /** Studio Dev's faucet. Public, and the only reason this court is usable
   *  without asking anyone for anything. */
  const fund = useCallback(async () => {
    if (!address) return false;
    setFunding(true);
    try {
      const res = await fetch(CHAIN.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "sim_fundAccount",
          params: [address, Number(50n * 10n ** 18n)],
        }),
      });
      const json = await res.json();
      await new Promise((r) => setTimeout(r, 2500));
      await refresh();
      return Boolean(json?.result);
    } catch {
      return false;
    } finally {
      setFunding(false);
    }
  }, [address, refresh]);

  /**
   * Submit a write and wait for it to reach a terminal state.
   *
   * NEVER THROWS. Every caller branches on the result, and an exception escaping
   * into a form's submit handler would leave the button spinning with nothing
   * said. A give-up is a result with `ok: false` and a reason a person can read.
   */
  const send = useCallback<WalletState["send"]>(
    async (fn, args, value = 0n, to = COURT_ADDRESS) => {
      if (!account) return { ok: false, returned: null, status: "NO_KEY", error: "No signing key in this browser yet." };
      const wallet = createClient({ chain: studioDevnet, account });
      const read = readRef.current;
      const target = to as `0x${string}`;
      setPhase("signing");
      try {
        // Studio Dev prices every transaction and REFUSES one whose attached
        // feeValue is below the floor, and a method that posts an internal
        // message needs an allocation naming its real recipient. Simulating the
        // real call with the real signer is the only way to get that right.
        let fees: Record<string, unknown> | undefined;
        try {
          const est = await wallet.estimateTransactionFeesForWrite({
            address: target, functionName: fn, args, value,
          });
          if (est?.distribution) {
            fees = {
              distribution: est.distribution,
              ...(est.messageAllocations ? { messageAllocations: est.messageAllocations } : {}),
              feeValue: est.feeValue,
            };
          }
        } catch {
          /* a pricing endpoint having a bad minute must not block a filing;
             without an explicit fee the node applies its own default */
        }

        const hash = await wallet.writeContract({
          address: target, functionName: fn, args, value,
          ...(fees ? { fees } : {}),
        });
        setPhase("settling");

        const started = Date.now();
        for (;;) {
          if (Date.now() - started > 300_000) {
            setPhase("error");
            return { ok: false, hash, returned: null, status: "TIMEOUT", error: "The network did not settle this in five minutes. It may still land — check the explorer." };
          }
          await new Promise((r) => setTimeout(r, 2500));
          let tx: Record<string, unknown> | null = null;
          try {
            tx = (await read.getTransaction({ hash })) as Record<string, unknown>;
          } catch {
            continue; // a poll the RPC could not answer is not an outcome
          }
          const byCode = transactionsStatusNumberToName as unknown as Record<number, string>;
          const statusName = byCode[Number(tx?.status)];
          if (!statusName || !TERMINAL.includes(statusName)) continue;

          const receipt = (tx as { consensus_data?: { leader_receipt?: Array<Record<string, unknown>> } })
            ?.consensus_data?.leader_receipt?.[0];
          const payload = (receipt?.result as { payload?: { readable?: string } } | undefined)?.payload;
          let returned: Record<string, unknown> | null = null;
          if (payload && typeof payload.readable === "string") {
            try {
              const parsed = JSON.parse(payload.readable);
              if (parsed && typeof parsed === "object") returned = parsed;
            } catch { /* a return we cannot decode is not a failure */ }
          }
          const exec = receipt?.execution_result;
          const rolledBack = (receipt?.result as { status?: string } | undefined)?.status === "rollback";
          const reverted = exec === "ERROR" || rolledBack;
          const accepted = statusName === "ACCEPTED" || statusName === "FINALIZED";
          const contractStatus = String(returned?.status ?? (accepted && !reverted ? "OK" : "FAILED"));

          void refresh();
          setPhase(contractStatus === "OK" ? "done" : "error");
          return {
            ok: accepted && !reverted && contractStatus !== "REJECTED",
            hash, returned, status: contractStatus,
            reason: typeof returned?.reason === "string" ? returned.reason : undefined,
          };
        }
      } catch (e) {
        setPhase("error");
        return { ok: false, returned: null, status: "FAILED", error: String((e as Error)?.message ?? e) };
      }
    },
    [account, refresh],
  );

  const exportKey = useCallback(() => key, [key]);

  const value = useMemo<WalletState>(() => ({
    ready, address, balanceWei, phase, create, forget, refresh, fund, funding,
    send, exportKey,
  }), [ready, address, balanceWei, phase, create, forget, refresh, fund, funding, send, exportKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
