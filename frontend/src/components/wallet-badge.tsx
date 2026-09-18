"use client";

import { useState } from "react";
import { Coins, Copy, Check, KeyRound, Trash2, Loader2 } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { gen, shortAddress } from "@/lib/format";
import { addressUrl } from "@/lib/chain";

/**
 * Who you are in this court, and whether you can afford to be here.
 *
 * It shows the balance next to the address because on this court those two
 * facts are always needed together: you cannot file without the fee and you
 * cannot answer without the bond, and finding that out at the moment you press
 * the button is the worst time to find it out.
 */
export function WalletBadge() {
  const { ready, address, balanceWei, create, forget, fund, funding, exportKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!ready) {
    return <span className="badge border-rule-strong text-ink-3">Loading…</span>;
  }

  if (!address) {
    return (
      <button type="button" onClick={create} className="btn btn-secondary !py-2 !px-3 text-[0.86rem]">
        <KeyRound size={14} aria-hidden />
        Create a testnet key
      </button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked; the address is on screen anyway */ }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-[7px] border border-rule-strong bg-card px-2.5 py-1.5 text-[0.84rem] hover:border-ink-3 transition-colors"
        aria-expanded={open}
      >
        <span className="tnum font-semibold">{gen(balanceWei.toString(), 2)}</span>
        <span className="text-ink-3 text-[0.75rem]">GEN</span>
        <span className="w-px h-3.5 bg-rule-strong" aria-hidden />
        <span className="mono-addr text-ink-2">{shortAddress(address)}</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 z-50 w-[19rem] card p-4 shadow-[var(--shadow-lift)]">
            <p className="text-[0.8rem] text-ink-3">Your address in this court</p>
            <div className="mt-1 flex items-center gap-2">
              <a
                href={addressUrl(address)}
                target="_blank"
                rel="noreferrer noopener"
                className="mono-addr link-quiet break-all text-[0.78rem]"
              >
                {address}
              </a>
              <button type="button" onClick={copy} className="btn btn-ghost !p-1.5 shrink-0" aria-label="Copy address">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-[0.8rem] text-ink-3">Balance</span>
              <span className="tnum font-semibold">{gen(balanceWei.toString())} GEN</span>
            </div>

            <button
              type="button"
              onClick={() => void fund()}
              disabled={funding}
              className="btn btn-secondary w-full mt-3"
            >
              {funding ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
              {funding ? "Asking the faucet…" : "Add 50 test GEN"}
            </button>

            <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-3">
              This is a throwaway key generated in this browser and stored only
              here. It is funded from a public faucet and the GEN it holds is
              worth nothing. Do not send it anything you care about.
            </p>

            <div className="mt-3 pt-3 border-t border-rule flex items-center justify-between">
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(exportKey() ?? ""); }}
                className="text-[0.78rem] link-quiet"
              >
                Copy private key
              </button>
              <button
                type="button"
                onClick={() => { forget(); setOpen(false); }}
                className="text-[0.78rem] inline-flex items-center gap-1.5 text-defendant hover:underline"
              >
                <Trash2 size={12} aria-hidden /> Forget this key
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
