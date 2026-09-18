"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CaseCard, Outcome } from "@/lib/types";
import { OUTCOME_TONE, QUALITY_LABEL, gen, headline, stamp } from "@/lib/format";
import { Address, AwardLadder, Empty } from "@/components/ui";
import type { Quality } from "@/lib/types";

/* The labels here are the SAME WORDS the verdict badge uses. An outcome that is
   filtered as "Split" and displayed as "Partial award" is two names for one
   thing, and the vocabulary of an interface is how people learn their way
   around it. */
const TABS: Array<{ id: Outcome | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "PLAINTIFF_WINS", label: "Plaintiff wins" },
  { id: "PARTIAL", label: "Partial award" },
  { id: "DEFENDANT_WINS", label: "Defendant wins" },
  { id: "DISMISSED", label: "Dismissed" },
];

export function VerdictsBrowser({ verdicts }: { verdicts: CaseCard[] }) {
  const [tab, setTab] = useState<Outcome | "all">("all");

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: verdicts.length };
    for (const v of verdicts) out[v.outcome || "none"] = (out[v.outcome || "none"] ?? 0) + 1;
    return out;
  }, [verdicts]);

  const shown = tab === "all" ? verdicts : verdicts.filter((v) => v.outcome === tab);

  return (
    <>
      <div className="flex flex-wrap gap-1 mb-6" role="tablist" aria-label="Filter verdicts">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`btn !py-1.5 !px-3 text-[0.86rem] ${tab === t.id ? "btn-primary" : "btn-secondary"}`}
          >
            {t.label}
            <span className={`tnum text-[0.78rem] ${tab === t.id ? "opacity-80" : "text-ink-3"}`}>
              {counts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty
          title="No verdicts of that kind yet"
          body="Every decided case appears here, whichever way it went."
        />
      ) : (
        <div className="space-y-4">
          {shown.map((v) => <VerdictCard key={v.case_id} v={v} />)}
        </div>
      )}
    </>
  );
}

function VerdictCard({ v }: { v: CaseCard }) {
  const tone = headline(v);
  const jury = v.resolution === "VERDICT";
  return (
    <article className="card overflow-hidden">
      <div className="px-5 py-4 sm:px-6" style={{ background: tone.wash }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
          <div>
            <p className="flex items-baseline gap-2.5">
              <span className="serif text-[1.35rem] leading-none" style={{ color: tone.color }}>
                {OUTCOME_TONE[v.outcome as Exclude<Outcome, "">]?.label ?? tone.label}
              </span>
              <span className="tnum text-[0.78rem] text-ink-3">Case #{v.case_id}</span>
            </p>
            <p className="mt-1.5 serif text-[0.98rem] text-ink-2">
              <Address value={v.plaintiff} />
              <span className="italic text-ink-3 mx-1.5">v</span>
              <Address value={v.defendant} />
            </p>
          </div>
          <div className="text-right">
            <p className="tnum serif text-[1.6rem] leading-none" style={{ color: tone.color }}>
              {gen(v.award_wei)}
              <span className="text-[0.45em] text-ink-3 ml-1">GEN</span>
            </p>
            <p className="tnum text-[0.79rem] text-ink-3 mt-0.5">
              {v.award_pct}% of {gen(v.amount_claimed_wei)} claimed
            </p>
          </div>
        </div>
        {jury ? (
          <div className="mt-3.5 max-w-[34rem]">
            <AwardLadder awardPct={v.award_pct} tone={tone.color} />
          </div>
        ) : null}
      </div>

      <div className="px-5 py-4 sm:px-6">
        {v.reasoning ? (
          <p className="serif text-[1rem] leading-[1.62] text-ink-2 max-w-[74ch] line-clamp-4">
            {v.reasoning}
          </p>
        ) : null}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.8rem] text-ink-3">
          <span>{stamp(v.settled_at)}</span>
          {v.evidence_quality ? (
            <span>{QUALITY_LABEL[v.evidence_quality as Exclude<Quality, "">]}</span>
          ) : null}
          {!jury ? (
            <span>
              {v.resolution === "ACCEPTED" ? "Conceded before any jury sat"
                : v.resolution === "DEFAULT" ? "No answer was filed"
                  : v.resolution === "WITHDRAWN" ? "Dropped by the plaintiff"
                    : "Jury round never settled"}
            </span>
          ) : null}
          <Link href={`/case/${v.case_id}`} className="ml-auto link-quiet inline-flex items-center gap-1">
            Read the file <ArrowUpRight size={12} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
