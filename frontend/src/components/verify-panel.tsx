"use client";

import { useState } from "react";
import { BadgeCheck, ChevronDown, Loader2, ShieldAlert } from "lucide-react";
import type { Verification } from "@/lib/types";

/**
 * Recompute the verdict from the evidence and compare it to what was stored.
 *
 * This is the claim the whole design rests on, so it is offered as a button
 * rather than as a sentence. Everything except the jury's single choice is pure
 * arithmetic over text that is on chain and cannot be edited, so anyone can run
 * it, now or in ten years, and get the same answer. The jury's choice itself is
 * checked the only way it can be — that it was inside the window the evidence
 * permitted.
 */
export function VerifyPanel({ caseId }: { caseId: number }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<Verification | null>(null);
  const [open, setOpen] = useState(false);

  async function run() {
    setState("busy");
    try {
      const res = await fetch(`/api/verify?id=${caseId}`);
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
      setState("done");
      setOpen(true);
    } catch {
      setState("error");
    }
  }

  const checks = result?.checks ? Object.entries(result.checks) : [];

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <BadgeCheck size={16} strokeWidth={1.9} className="text-brand" aria-hidden />
        <h2 className="font-semibold text-[0.95rem]">Check this verdict yourself</h2>
      </div>
      <p className="mt-1.5 text-[0.84rem] text-ink-3 leading-relaxed">
        Re-derives the outcome, the percentage, the settlement and the written
        judgment from the filings as stored, and compares them to what the court
        recorded.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        className="btn btn-secondary w-full mt-4"
      >
        {state === "busy" ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
        {state === "busy" ? "Recomputing…" : "Recompute from the evidence"}
      </button>

      {state === "error" ? (
        <p className="mt-3 text-[0.85rem] text-defendant">
          The court did not answer. This is usually the testnet RPC being busy —
          try again in a moment.
        </p>
      ) : null}

      {state === "done" && result ? (
        <div className="mt-4">
          {!result.verifiable ? (
            <p className="text-[0.88rem] text-ink-2">{result.reason}</p>
          ) : (
            <>
              <p
                className="flex items-center gap-2 font-semibold text-[0.92rem]"
                style={{ color: result.matches ? "var(--plaintiff)" : "var(--defendant)" }}
              >
                {result.matches
                  ? <><BadgeCheck size={16} aria-hidden /> Everything matches</>
                  : <><ShieldAlert size={16} aria-hidden /> Something does not match</>}
              </p>
              <p className="mt-1 text-[0.84rem] text-ink-3">
                {result.decided_by === "contract"
                  ? "Settled by rule rather than by jury, so there is no jury choice to re-derive — the commitment to the evidence is checked instead."
                  : `${checks.filter(([, v]) => v).length} of ${checks.length} checks passed.`}
              </p>

              {checks.length ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="mt-3 inline-flex items-center gap-1 text-[0.84rem] link-quiet"
                    aria-expanded={open}
                  >
                    {open ? "Hide" : "Show"} each check
                    <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden />
                  </button>
                  {open ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {checks.map(([name, ok]) => (
                        <li key={name} className="flex items-baseline justify-between gap-3 text-[0.84rem]">
                          <span className="text-ink-2">{humanCheck(name)}</span>
                          <span style={{ color: ok ? "var(--plaintiff)" : "var(--defendant)" }} className="font-semibold shrink-0">
                            {ok ? "matches" : "differs"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const CHECK_NAMES: Record<string, string> = {
  outcome: "Who won",
  award_bps: "The percentage awarded",
  award_wei: "The amount awarded",
  evidence_quality: "Which side had the better evidence",
  verdict_key: "The agreed verdict key",
  reasoning: "The written judgment",
  content_hash: "The commitment to the evidence",
  signals_csv: "The evidence scoring",
  bracket: "The window the evidence permitted",
  option_in_bracket: "The jury chose inside that window",
  settlement_split: "Who was paid what",
  conservation: "Nothing was created or lost",
};

const humanCheck = (name: string) => CHECK_NAMES[name] ?? name;
