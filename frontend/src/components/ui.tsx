import Link from "next/link";
import type { ReactNode } from "react";
import type { CaseCard, CaseStatus, Outcome } from "@/lib/types";
import {
  OUTCOME_TONE, STATUS_TONE, edgeColor, gen, headline, shortAddress, stamp,
} from "@/lib/format";
import { addressUrl } from "@/lib/chain";

/* --- badges -------------------------------------------------------------- */

export function StatusBadge({ status }: { status: CaseStatus }) {
  const tone = STATUS_TONE[status];
  if (!tone) return null;
  return (
    <span
      className="badge"
      style={{ color: tone.color, background: tone.wash, borderColor: tone.color + "33" }}
    >
      {tone.label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (!outcome || !(outcome in OUTCOME_TONE)) return null;
  const tone = OUTCOME_TONE[outcome as Exclude<Outcome, "">];
  return (
    <span
      className="badge"
      style={{ color: tone.color, background: tone.wash, borderColor: tone.color + "33" }}
    >
      {tone.label}
    </span>
  );
}

/* --- addresses ------------------------------------------------------------ */

export function Address({
  value, label, plain = false,
}: { value: string; label?: string; plain?: boolean }) {
  if (!value) return <span className="text-ink-3">—</span>;
  const text = label ?? shortAddress(value);
  // `plain` exists because an anchor cannot be nested inside another anchor.
  // A docket row is itself a link to the case, so the addresses inside it are
  // rendered as text; everywhere else they link to the explorer.
  if (plain) {
    return <span className="mono-addr text-ink-2" title={value}>{text}</span>;
  }
  return (
    <a
      href={addressUrl(value)}
      target="_blank"
      rel="noreferrer noopener"
      className="mono-addr link-quiet"
      title={value}
    >
      {text}
    </a>
  );
}

/* --- layout --------------------------------------------------------------- */

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[1120px] px-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-8 sm:p-10 text-center">
      <p className="display h3">{title}</p>
      <p className="mt-2 text-[0.95rem] text-ink-3 mx-auto max-w-[46ch]">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info", title, children,
}: { tone?: "info" | "warn" | "bad"; title?: string; children: ReactNode }) {
  const color =
    tone === "bad" ? "var(--defendant)" : tone === "warn" ? "var(--partial)" : "var(--brand)";
  const wash =
    tone === "bad" ? "var(--defendant-wash)" : tone === "warn" ? "var(--partial-wash)" : "var(--brand-wash)";
  return (
    <div
      className="rounded-[9px] border px-4 py-3 text-[0.9rem] leading-relaxed"
      style={{ background: wash, borderColor: color + "33", color: "var(--ink-2)" }}
    >
      {title ? <p className="font-semibold mb-0.5" style={{ color }}>{title}</p> : null}
      {children}
    </div>
  );
}

/* --- the docket row ------------------------------------------------------- */

/**
 * One case in a list.
 *
 * A row keyed by a coloured file edge rather than a card in a grid. A docket is
 * a record you scan down, comparing amounts and dates in columns — which is
 * also why the figures are tabular. Identical rounded cards would make the same
 * information harder to compare, not easier.
 */
export function CaseRow({ c }: { c: CaseCard }) {
  const tone = headline(c);
  const decided = Boolean(c.outcome);
  return (
    <Link
      href={`/case/${c.case_id}`}
      className="file-edge block bg-card border border-rule rounded-[9px] py-4 pr-4 hover:border-rule-strong transition-colors"
      style={{ ["--edge" as string]: edgeColor(c) }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-[0.8rem] font-semibold text-ink-3">#{c.case_id}</span>
        <span className="serif text-[1.02rem] text-ink min-w-0">
          <Address value={c.plaintiff} plain />
          <span className="italic text-ink-3 mx-1.5">v</span>
          <Address value={c.defendant} plain />
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {decided ? <OutcomeBadge outcome={c.outcome} /> : <StatusBadge status={c.status} />}
        </span>
      </div>

      <p className="mt-2 text-[0.92rem] text-ink-2 leading-snug line-clamp-2">{c.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.82rem] text-ink-3">
        <span>
          Claimed <span className="tnum font-semibold text-ink">{gen(c.amount_claimed_wei)}</span> GEN
        </span>
        {decided ? (
          <span>
            Awarded{" "}
            <span className="tnum font-semibold" style={{ color: tone.color }}>
              {gen(c.award_wei)}
            </span>{" "}
            GEN · {c.award_pct}%
          </span>
        ) : c.status === "FILED" ? (
          <span>{c.response_overdue ? "Answer overdue" : "Awaiting the defendant"}</span>
        ) : (
          <span>Both sides filed</span>
        )}
        <span className="ml-auto">{stamp(c.filed_at)}</span>
      </div>
    </Link>
  );
}

/* --- the award ladder ----------------------------------------------------- */

/**
 * Where the award landed, on the scale of what could have been awarded.
 *
 * The single most informative thing about a verdict on this court is not the
 * number — it is that the number came out of a WINDOW the evidence had already
 * fixed before the jury saw anything. So the bar draws the whole 0-100% scale,
 * shades the window the evidence permitted, and marks the point inside it that
 * the jury chose. A bare percentage would hide the constraint that makes the
 * verdict trustworthy.
 */
export function AwardLadder({
  awardPct, bracket, tone, animate = false,
}: {
  awardPct: number;
  bracket?: [number, number];
  tone: string;
  animate?: boolean;
}) {
  const lo = bracket?.[0] ?? 0;
  const hi = bracket?.[1] ?? 100;
  const width = Math.max(hi - lo, 0.6);
  return (
    <div>
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-rule" />
        {bracket ? (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[9px] rounded-full opacity-[0.22]"
            style={{ left: `${lo}%`, width: `${width}%`, background: tone }}
          />
        ) : null}
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full ${animate ? "award-fill" : ""}`}
          style={{ width: `${awardPct}%`, background: tone }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${animate ? "award-mark" : ""}`}
          style={{ left: `${awardPct}%` }}
        >
          <div
            className="w-[15px] h-[15px] rounded-full border-[3px] border-card -ml-[7.5px]"
            style={{ background: tone, boxShadow: "0 0 0 1px " + tone }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[0.72rem] text-ink-3 tnum">
        <span>0%</span>
        {bracket ? (
          <span>
            Evidence allowed {lo}–{hi}%
          </span>
        ) : null}
        <span>100%</span>
      </div>
    </div>
  );
}

/* --- key/value ledger ----------------------------------------------------- */

export function Ledger({ rows }: { rows: Array<{ label: string; value: ReactNode; tone?: string }> }) {
  return (
    <dl className="divide-y divide-rule">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[0.88rem] text-ink-3">{r.label}</dt>
          <dd className="text-[0.93rem] font-medium tnum text-right" style={r.tone ? { color: r.tone } : undefined}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
