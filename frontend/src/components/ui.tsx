import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Equal, Trophy, User, UserX, XCircle } from "lucide-react";
import type { CaseCard, CaseStatus, Outcome, Quality } from "@/lib/types";
import {
  OUTCOME_TONE, STATUS_TONE, duration, edgeColor, gen, headline, shortAddress,
  stamp,
} from "@/lib/format";
import { addressUrl } from "@/lib/chain";

/* --- badges -------------------------------------------------------------- */

export function StatusBadge({ status }: { status: CaseStatus }) {
  const tone = STATUS_TONE[status];
  if (!tone) return null;
  return (
    <span className="badge" style={{ color: tone.text, background: tone.wash, borderColor: tone.color + "55" }}>
      {tone.label}
    </span>
  );
}

/** The outcome, with the icon that says which way it went at a glance. */
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (!outcome || !(outcome in OUTCOME_TONE)) return null;
  const tone = OUTCOME_TONE[outcome as Exclude<Outcome, "">];
  const Icon = outcome === "PLAINTIFF_WINS" ? Trophy : outcome === "DEFENDANT_WINS" ? XCircle : Equal;
  return (
    <span className="badge" style={{ color: tone.text, background: tone.wash, borderColor: tone.color + "55" }}>
      <Icon size={12} strokeWidth={2.2} aria-hidden />
      {tone.label}
    </span>
  );
}

/* --- addresses ------------------------------------------------------------ */

export function Address({
  value, label, plain = false,
}: { value: string; label?: string; plain?: boolean }) {
  if (!value) return <span className="text-ivory-3">—</span>;
  const text = label ?? shortAddress(value);
  // `plain` exists because an anchor cannot be nested inside another anchor.
  // A docket row is itself a link to the case, so the addresses inside it are
  // rendered as text; everywhere else they link to the explorer.
  if (plain) return <span className="mono-addr text-ivory-2" title={value}>{text}</span>;
  return (
    <a href={addressUrl(value)} target="_blank" rel="noreferrer noopener" className="mono-addr link-quiet" title={value}>
      {text}
    </a>
  );
}

/** A party, named by their role as well as by their address. */
export function Party({
  role, address, plain = false,
}: { role: "plaintiff" | "defendant"; address: string; plain?: boolean }) {
  const isP = role === "plaintiff";
  const Icon = isP ? User : UserX;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={13} strokeWidth={2} aria-hidden
            style={{ color: isP ? "var(--plaintiff)" : "var(--defendant-text)" }} />
      <Address value={address} plain={plain} />
    </span>
  );
}

/* --- layout --------------------------------------------------------------- */

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1120px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-8 sm:p-10 text-center">
      <p className="display h3">{title}</p>
      <p className="mt-2 text-[0.95rem] text-ivory-3 mx-auto max-w-[46ch]">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info", title, children, icon,
}: { tone?: "info" | "warn" | "bad"; title?: string; children: ReactNode; icon?: ReactNode }) {
  const color = tone === "bad" ? "var(--defendant-text)" : tone === "warn" ? "var(--partial)" : "var(--gold)";
  const wash = tone === "bad" ? "var(--defendant-wash)" : tone === "warn" ? "var(--partial-wash)" : "var(--plaintiff-wash)";
  return (
    <div
      className="rounded-[10px] border px-4 py-3 text-[0.9rem] leading-relaxed"
      style={{ background: wash, borderColor: color + "44", color: "var(--ivory-2)" }}
    >
      {title ? (
        <p className="font-semibold mb-0.5 flex items-center gap-1.5" style={{ color }}>
          {icon}{title}
        </p>
      ) : null}
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
 * also why the figures are tabular. It lifts under the pointer and takes a gold
 * edge, because it is a link and should say so.
 */
export function CaseRow({ c }: { c: CaseCard }) {
  const tone = headline(c);
  const decided = Boolean(c.outcome);
  return (
    <Link
      href={`/case/${c.case_id}`}
      className="file-edge card card-link block py-4 pr-4"
      style={{ ["--edge" as string]: edgeColor(c) }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="tnum text-[0.78rem] font-bold text-gold-dim">#{c.case_id}</span>
        <span className="serif text-[1.02rem] min-w-0 flex flex-wrap items-center gap-x-1.5">
          <Party role="plaintiff" address={c.plaintiff} plain />
          <span className="italic text-ivory-3">v</span>
          <Party role="defendant" address={c.defendant} plain />
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {decided ? <OutcomeBadge outcome={c.outcome} /> : <StatusBadge status={c.status} />}
        </span>
      </div>

      <p className="mt-2.5 text-[0.92rem] text-ivory-2 leading-snug line-clamp-2">{c.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.82rem] text-ivory-3">
        <span>
          Claimed <span className="tnum font-semibold text-ivory">{gen(c.amount_claimed_wei)}</span> GEN
        </span>
        {decided ? (
          <span>
            Awarded{" "}
            <span className="tnum font-semibold" style={{ color: tone.text }}>{gen(c.award_wei)}</span>
            {" "}GEN · {c.award_pct}%
          </span>
        ) : c.status === "FILED" ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} aria-hidden />
            {c.response_overdue ? "Answer overdue" : `${duration(c.seconds_left_to_respond)} left to answer`}
          </span>
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
 * The most informative thing about a verdict on this court is not the number —
 * it is that the number came out of a WINDOW the evidence had already fixed
 * before the jury saw anything. So the bar draws the whole 0-100% scale, shades
 * the window the evidence permitted, and marks the point inside it that the
 * jury chose. A bare percentage would hide the constraint that makes the
 * verdict trustworthy.
 */
export function AwardLadder({
  awardPct, bracket, tone, animate = false,
}: { awardPct: number; bracket?: [number, number]; tone: string; animate?: boolean }) {
  const lo = bracket?.[0] ?? 0;
  const hi = bracket?.[1] ?? 100;
  const width = Math.max(hi - lo, 0.6);
  return (
    <div>
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
             style={{ background: "var(--rule)" }} />
        {bracket ? (
          <div className="absolute top-1/2 -translate-y-1/2 h-[10px] rounded-full"
               style={{ left: `${lo}%`, width: `${width}%`, background: tone, opacity: 0.22 }} />
        ) : null}
        <div className={`absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full ${animate ? "award-fill" : ""}`}
             style={{ width: `${awardPct}%`, background: tone, boxShadow: `0 0 12px -1px ${tone}` }} />
        <div className={`absolute top-1/2 -translate-y-1/2 ${animate ? "award-mark" : ""}`}
             style={{ left: `${awardPct}%` }}>
          <div className="w-[15px] h-[15px] rounded-full -ml-[7.5px]"
               style={{ background: tone, boxShadow: `0 0 0 3px var(--card), 0 0 0 4px ${tone}, 0 0 18px -2px ${tone}` }} />
        </div>
      </div>
      <div className="flex justify-between text-[0.72rem] text-ivory-3 tnum">
        <span>0%</span>
        {bracket ? <span>Evidence allowed {lo}–{hi}%</span> : null}
        <span>100%</span>
      </div>
    </div>
  );
}

/* --- key/value ledger ----------------------------------------------------- */

export function Ledger({ rows }: { rows: Array<{ label: string; value: ReactNode; tone?: string }> }) {
  return (
    <dl>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex items-baseline justify-between gap-4 py-2.5 ${i ? "border-t" : ""}`}
          style={{ borderColor: "var(--rule)" }}
        >
          <dt className="text-[0.88rem] text-ivory-3">{r.label}</dt>
          <dd className="text-[0.93rem] font-semibold tnum text-right" style={{ color: r.tone ?? "var(--ivory)" }}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The quality finding, with the icon for which way it leant. */
export function QualityLine({ quality }: { quality: Quality }) {
  if (!quality) return null;
  const Icon = quality === "PLAINTIFF" ? Trophy : quality === "DEFENDANT" ? XCircle : Equal;
  const color =
    quality === "PLAINTIFF" ? "var(--plaintiff)"
      : quality === "DEFENDANT" ? "var(--defendant-text)" : "var(--partial)";
  const text =
    quality === "PLAINTIFF" ? "Plaintiff's evidence was stronger"
      : quality === "DEFENDANT" ? "Defendant's evidence was stronger"
        : "Evenly matched on the evidence";
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.84rem]" style={{ color }}>
      <Icon size={13} strokeWidth={2} aria-hidden />
      {text}
    </span>
  );
}
