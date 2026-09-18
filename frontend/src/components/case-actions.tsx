"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CheckCircle2, Coins, Gavel, Handshake, KeyRound, Loader2,
  Scale, Undo2, Wallet,
} from "lucide-react";
import { useWallet, type CallArg } from "@/lib/wallet";
import { gen, sameAddress, toWei } from "@/lib/format";
import { txUrl } from "@/lib/chain";
import { Notice } from "@/components/ui";
import type { CaseDetail, Config } from "@/lib/types";

/**
 * Everything a person can do to a case, filtered to what THIS person can
 * actually do to THIS case right now.
 *
 * Nothing here is shown speculatively. The contract decides who may answer,
 * when a default becomes available and whether the jury can sit, and this panel
 * asks the same questions in the same order rather than offering a button that
 * is going to be refused. The one exception is `judge`, which is deliberately
 * offered to everybody, because it is deliberately permissionless.
 */

interface Props {
  c: CaseDetail;
  config: Config;
}

type Msg = { ok: boolean; text: string; hash?: string } | null;

export function CaseActions({ c, config }: Props) {
  const router = useRouter();
  const { ready, address, balanceWei, send, fund, funding, create } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [owed, setOwed] = useState<bigint>(0n);

  const isPlaintiff = sameAddress(address, c.plaintiff);
  const isDefendant = sameAddress(address, c.defendant);
  const claimed = BigInt(c.amount_claimed_wei);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        if (!cancelled) setOwed(0n);
        return;
      }
      try {
        const res = await fetch(`/api/payout?address=${address}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setOwed(BigInt(json.owed_wei ?? "0"));
      } catch { /* an unreadable balance is not a balance of zero */ }
    })();
    return () => { cancelled = true; };
  }, [address, c.status]);

  async function run(label: string, fn: string, args: CallArg[], value = 0n) {
    setBusy(label);
    setMsg(null);
    const out = await send(fn, args, value);
    setBusy(null);
    if (out.status === "REJECTED") {
      setMsg({ ok: false, text: out.reason ?? "The court refused that.", hash: out.hash });
      return false;
    }
    if (out.status === "NO_VERDICT") {
      setMsg({
        ok: false,
        text: String(out.returned?.reason ?? "The jury did not reach a verdict. Nothing changed — you can send it again."),
        hash: out.hash,
      });
      router.refresh();
      return false;
    }
    if (!out.ok) {
      setMsg({ ok: false, text: out.error ?? "That did not settle.", hash: out.hash });
      return false;
    }
    setMsg({ ok: true, text: successText(fn, out.returned), hash: out.hash });
    router.refresh();
    return true;
  }

  if (!ready) return null;

  const needKey = !address;
  const canPayBond = balanceWei >= claimed;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Scale size={16} strokeWidth={1.9} className="text-gold" aria-hidden />
        <h2 className="font-semibold text-[0.95rem]">What you can do</h2>
      </div>

      {needKey ? (
        <>
          <p className="text-[0.86rem] text-ivory-3 leading-relaxed mt-2">
            You need an identity in this court before you can act on a case.
            One click, no extension, testnet only.
          </p>
          <button type="button" onClick={create} className="btn btn-primary w-full mt-4">
            <KeyRound size={15} aria-hidden /> Create a testnet key
          </button>
        </>
      ) : (
        <>
          <p className="text-[0.84rem] text-ivory-3 mt-1.5">
            {isPlaintiff ? "You filed this case."
              : isDefendant ? "This case names you as the defendant."
                : "You are not a party to this case."}
          </p>

          <div className="mt-4 space-y-2.5">
            {/* --- the defendant's two options ---------------------------- */}
            {isDefendant && c.can_respond ? (
              <RespondForm c={c} config={config} onDone={() => router.refresh()} />
            ) : null}

            {isDefendant && (c.status === "FILED" || c.status === "RESPONDED") && !c.judging_since ? (
              canPayBond || c.status === "RESPONDED" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("accept", "accept_claim", [c.case_id],
                    c.status === "RESPONDED" ? 0n : claimed)}
                  className="btn btn-secondary w-full"
                >
                  {busy === "accept" ? <Loader2 size={15} className="animate-spin" /> : <Handshake size={15} />}
                  Accept the claim and pay {gen(c.amount_claimed_wei)} GEN
                </button>
              ) : null
            ) : null}

            {/* --- the plaintiff's one option ----------------------------- */}
            {isPlaintiff && c.can_withdraw ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("withdraw", "withdraw_case", [c.case_id])}
                className="btn btn-secondary w-full"
              >
                {busy === "withdraw" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                Withdraw and take the fee back
              </button>
            ) : null}

            {/* --- anybody's options -------------------------------------- */}
            {c.can_judge ? (
              <div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("judge", "judge", [c.case_id])}
                  className="btn btn-primary w-full"
                >
                  {busy === "judge" ? <Loader2 size={15} className="animate-spin" /> : <Gavel size={15} />}
                  {busy === "judge" ? "The jury is sitting…" : "Send to the jury"}
                </button>
                <p className="mt-1.5 text-[0.8rem] text-ivory-3 leading-snug">
                  Anyone can do this, including you. Validators read both filings
                  and must agree before anything is paid. It takes about a minute.
                </p>
              </div>
            ) : null}

            {c.can_default ? (
              <div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("default", "default_judgment", [c.case_id])}
                  className="btn btn-primary w-full"
                >
                  {busy === "default" ? <Loader2 size={15} className="animate-spin" /> : <Gavel size={15} />}
                  Enter judgment by default
                </button>
                <p className="mt-1.5 text-[0.8rem] text-ivory-3 leading-snug">
                  The answer window has closed. The plaintiff wins on the merits,
                  but the defendant bonded nothing, so only the filing fee is
                  actually paid — the claim itself stands unenforced.
                </p>
              </div>
            ) : null}

            {c.judging_stuck ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("stalled", "settle_stalled", [c.case_id])}
                className="btn btn-secondary w-full"
              >
                {busy === "stalled" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                Clear the stuck round and refund both sides
              </button>
            ) : null}

            {/* --- money waiting for you ---------------------------------- */}
            {owed > 0n ? (
              <div className="pt-2.5 border-t border-[var(--rule)]">
                <div className="flex items-baseline justify-between text-[0.88rem] mb-2">
                  <span className="text-ivory-2">This court owes you</span>
                  <span className="tnum font-semibold">{gen(owed.toString())} GEN</span>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("claim", "claim_payout", [])}
                  className="btn btn-primary w-full"
                >
                  {busy === "claim" ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />}
                  Withdraw it
                </button>
              </div>
            ) : null}

            {balanceWei < BigInt(config.filing_fee_wei) ? (
              <button type="button" onClick={() => void fund()} disabled={funding} className="btn btn-secondary w-full">
                {funding ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                Get test GEN
              </button>
            ) : null}
          </div>

          {!c.can_judge && !c.can_default && !c.can_withdraw && !c.can_respond && owed === 0n && !c.judging_stuck ? (
            <p className="mt-4 text-[0.85rem] text-ivory-3 leading-relaxed">
              {c.status === "FILED" && !isDefendant
                ? "Nothing to do until the defendant answers or the window closes."
                : c.judging_since
                  ? "The jury is sitting on this case right now."
                  : "This case is closed. Nothing about it can change."}
            </p>
          ) : null}
        </>
      )}

      {msg ? (
        <div className="mt-4">
          <Notice tone={msg.ok ? "info" : "bad"}>
            <p className="flex items-start gap-2">
              {msg.ok
                ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--plaintiff)]" aria-hidden />
                : <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--defendant-text)]" aria-hidden />}
              <span>{msg.text}</span>
            </p>
            {msg.hash ? (
              <a href={txUrl(msg.hash)} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-block text-[0.82rem] link-quiet">
                Transaction
              </a>
            ) : null}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

function successText(fn: string, returned: Record<string, unknown> | null): string {
  if (fn === "judge") {
    const outcome = String(returned?.outcome ?? "");
    const bps = Number(returned?.award_bps ?? 0);
    return outcome ? `The jury returned ${outcome.toLowerCase().replace(/_/g, " ")} at ${bps / 100}%. The money has been assigned.` : "The jury returned a verdict.";
  }
  if (fn === "respond") return "Your answer is on the record and your bond is held. Anyone can now send it to the jury.";
  if (fn === "accept_claim") return "Accepted. The plaintiff has been paid in full and the case is closed.";
  if (fn === "withdraw_case") return "Withdrawn. Your filing fee is waiting to be claimed.";
  if (fn === "default_judgment") return "Judgment entered by default.";
  if (fn === "settle_stalled") return "The stuck round is cleared and both sides have been refunded.";
  if (fn === "claim_payout") return "Withdrawn. On this testnet the transfer is queued on finalisation rather than delivered — see the docs.";
  return "Done.";
}

/* ------------------------------------------------------------------------- */

function RespondForm({
  c, config, onDone,
}: { c: CaseDetail; config: Config; onDone: () => void }) {
  const { send, balanceWei, fund, funding } = useWallet();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [counter, setCounter] = useState("");
  const [offer, setOffer] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const claimed = BigInt(c.amount_claimed_wei);
  const offerWei = toWei(offer || "0");
  const enough = balanceWei >= claimed;
  const valid =
    text.trim().length >= config.min_filing_chars &&
    counter.trim().length >= config.min_filing_chars &&
    offerWei !== null &&
    BigInt(offerWei) <= claimed;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full">
        <Gavel size={15} aria-hidden /> Answer this claim
      </button>
    );
  }

  return (
    <form
      className="border border-[var(--rule)] rounded-[9px] p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        setErr(null);
        const out = await send(
          "respond",
          [c.case_id, text.trim(), counter.trim(), offerWei!],
          claimed,
        );
        setBusy(false);
        if (out.status === "REJECTED") { setErr(out.reason ?? "The court refused your answer."); return; }
        if (!out.ok) { setErr(out.error ?? "Your answer did not settle."); return; }
        setOpen(false);
        onDone();
      }}
    >
      <p className="font-semibold text-[0.92rem]">Your answer</p>
      <p className="mt-1 text-[0.83rem] text-ivory-3 leading-snug">
        To answer you must bond the full {gen(c.amount_claimed_wei)} GEN claimed.
        Anything the jury does not award comes straight back to you.
      </p>

      <label className="block mt-3">
        <span className="text-[0.85rem] font-medium">Your side of it</span>
        <textarea
          className="field mt-1 min-h-[5.5rem] resize-y text-[0.9rem]"
          maxLength={config.max_response_chars}
          placeholder="I delivered the full site on 28 April, two days before the deadline. The brief changed twice after the quote."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <label className="block mt-3">
        <span className="text-[0.85rem] font-medium">Your evidence</span>
        <textarea
          className="field mt-1 min-h-[6.5rem] resize-y text-[0.9rem]"
          maxLength={config.max_counter_evidence_chars}
          placeholder="Delivery email of 28 April with 34 files attached. Signed variation of 19 April changing the scope. Server logs showing 41 deploys."
          value={counter}
          onChange={(e) => setCounter(e.target.value)}
        />
      </label>

      <label className="block mt-3">
        <span className="text-[0.85rem] font-medium">What you think is fair</span>
        <span className="block text-[0.8rem] text-ivory-3 mb-1">
          Zero if you owe nothing. The jury sees this, but it is not what secures
          the case — the bond is.
        </span>
        <div className="relative">
          <input
            className="field tnum pr-14 text-[0.9rem]"
            inputMode="decimal"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.82rem] text-ivory-3">GEN</span>
        </div>
      </label>

      {err ? <p className="mt-3 text-[0.84rem] text-[var(--defendant-text)]">{err}</p> : null}

      <div className="mt-4 flex gap-2">
        {enough ? (
          <button type="submit" disabled={!valid || busy} className="btn btn-primary flex-1">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Gavel size={15} />}
            Answer and bond {gen(c.amount_claimed_wei)} GEN
          </button>
        ) : (
          <button type="button" onClick={() => void fund()} disabled={funding} className="btn btn-primary flex-1">
            {funding ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
            Get test GEN for the bond
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button>
      </div>
    </form>
  );
}
