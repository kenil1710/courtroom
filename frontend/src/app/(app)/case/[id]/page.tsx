import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, CircleDashed, FileText, Gavel, Hourglass, Scale, Timer,
} from "lucide-react";
import { getCase, getConfig } from "@/lib/court";
import {
  QUALITY_LABEL, duration, gen, headline, isTerminal, relative, stamp,
} from "@/lib/format";
import {
  Address, AwardLadder, Ledger, Notice, OutcomeBadge, Shell, StatusBadge,
} from "@/components/ui";
import { CaseActions } from "@/components/case-actions";
import { VerifyPanel } from "@/components/verify-panel";
import type { CaseDetail, Quality } from "@/lib/types";

export const revalidate = 10;

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Case #${id}`,
    description: `The filings, the verdict and the settlement for case #${id}.`,
  };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId < 1) notFound();

  let c: CaseDetail | null = null;
  let config = null;
  try {
    [c, config] = await Promise.all([getCase(caseId), getConfig()]);
  } catch {
    c = null;
  }

  if (c === null || config === null) {
    return (
      <Shell>
        <Notice tone="bad" title="The court is not answering">
          We could not read case #{caseId}. This is usually the testnet RPC being
          busy — reload in a moment.
        </Notice>
      </Shell>
    );
  }
  if (!c.found) notFound();

  const tone = headline(c);
  const decided = isTerminal(c.status);

  return (
    <Shell>
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-[0.86rem] link-quiet mb-5">
        <ArrowLeft size={14} aria-hidden /> The docket
      </Link>

      {/* --- caption ------------------------------------------------------- */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tnum text-[0.85rem] font-semibold text-ink-3">Case #{c.case_id}</span>
          {decided ? <OutcomeBadge outcome={c.outcome} /> : null}
          <StatusBadge status={c.status} />
          {c.resolution && c.resolution !== "VERDICT" ? (
            <span className="text-[0.8rem] text-ink-3">
              {c.resolution === "ACCEPTED" ? "conceded by the defendant"
                : c.resolution === "DEFAULT" ? "no answer was filed"
                  : c.resolution === "WITHDRAWN" ? "dropped by the plaintiff"
                    : "jury round never settled"}
            </span>
          ) : null}
        </div>
        <h1 className="display h2 mt-2">
          <Address value={c.plaintiff} />
          <span className="italic text-ink-3 mx-2">v</span>
          <Address value={c.defendant} />
        </h1>
        <p className="mt-2 text-[0.9rem] text-ink-3">
          Filed {stamp(c.filed_at)} · claiming{" "}
          <span className="tnum font-semibold text-ink">{gen(c.amount_claimed_wei)}</span> GEN
        </p>
      </header>

      {/* --- live deadline -------------------------------------------------- */}
      {c.status === "FILED" ? (
        <div className="mb-6">
          {c.response_overdue ? (
            <Notice tone="warn" title="The answer window has closed">
              The defendant did not answer in time. Anyone can now enter judgment
              by default — though the defendant bonded nothing, so only the filing
              fee actually moves.
            </Notice>
          ) : (
            <Notice title="Waiting on the defendant">
              <span className="inline-flex items-center gap-2">
                <Timer size={14} aria-hidden />
                {duration(c.seconds_left_to_respond)} left to answer and bond{" "}
                {gen(c.amount_claimed_wei)} GEN. The deadline was fixed when the
                case was filed and cannot be moved by anyone.
              </span>
            </Notice>
          )}
        </div>
      ) : null}

      {c.judging_since && !decided ? (
        <div className="mb-6">
          <Notice tone="warn" title="The jury is sitting">
            <span className="inline-flex items-center gap-2">
              <Hourglass size={14} aria-hidden />
              Opened {relative(c.judging_since, c.now)}. A round that never
              settles can be cleared after {duration(config.stall_ttl_s)},
              refunding both sides in full.
            </span>
          </Notice>
        </div>
      ) : null}

      {/* --- the verdict ---------------------------------------------------- */}
      {decided ? <VerdictPanel c={c} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start mt-6">
        <div className="min-w-0 space-y-6">
          {/* --- the two sides ---------------------------------------------- */}
          <section className="card overflow-hidden">
            <div className="split p-5 sm:p-6">
              <div className="pr-0 lg:pr-7 min-w-0">
                <SideHead role="Plaintiff" color="var(--plaintiff)" address={c.plaintiff} />
                <Filing title="The claim" body={c.claim_text} />
                <Filing title="Evidence" body={c.evidence_text} />
                <p className="mt-4 text-[0.84rem] text-ink-3">
                  Posted a <span className="tnum font-semibold text-ink">{gen(c.filing_fee_wei)}</span> GEN filing fee.
                </p>
              </div>

              <div className="split-rule" aria-hidden />

              <div className="pl-0 lg:pl-7 mt-7 lg:mt-0 pt-7 lg:pt-0 border-t lg:border-t-0 border-rule min-w-0">
                <SideHead role="Defendant" color="var(--defendant)" address={c.defendant} />
                {c.response_text ? (
                  <>
                    <Filing title="The answer" body={c.response_text} />
                    <Filing title="Counter-evidence" body={c.counter_evidence} />
                    <p className="mt-4 text-[0.84rem] text-ink-3">
                      Bonded <span className="tnum font-semibold text-ink">{gen(c.escrow_wei)}</span> GEN
                      {BigInt(c.counter_amount_wei) > 0n
                        ? <> and offered <span className="tnum font-semibold text-ink">{gen(c.counter_amount_wei)}</span> GEN to settle.</>
                        : <> and offered nothing to settle.</>}
                    </p>
                  </>
                ) : (
                  <div className="mt-5 flex items-start gap-2.5 text-[0.9rem] text-ink-3">
                    <CircleDashed size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <p className="leading-relaxed">
                      {c.status === "FILED"
                        ? "No answer yet. Until one is filed, this side of the record is empty and the jury cannot sit."
                        : c.resolution === "ACCEPTED"
                          ? "The defendant accepted the claim in full rather than answering it."
                          : c.resolution === "DEFAULT"
                            ? "The defendant never answered. Judgment was entered without their side of the record."
                            : "No answer was filed."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* --- timeline ---------------------------------------------------- */}
          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold text-[0.95rem] mb-4">What happened, and when</h2>
            <ol className="relative">
              {c.timeline.map((e, i) => (
                <li key={`${e.event}-${e.at}`} className="relative pl-6 pb-5 last:pb-0">
                  {i < c.timeline.length - 1 ? (
                    <span className="absolute left-[4px] top-3 bottom-0 w-px bg-rule" aria-hidden />
                  ) : null}
                  <span
                    className="absolute left-0 top-[5px] w-[9px] h-[9px] rounded-full border-2 border-card"
                    style={{ background: i === c.timeline.length - 1 ? tone.color : "var(--rule-strong)" }}
                    aria-hidden
                  />
                  <p className="text-[0.9rem] font-medium capitalize">{e.event.toLowerCase()}</p>
                  <p className="text-[0.86rem] text-ink-2 mt-0.5">{e.detail}</p>
                  <p className="text-[0.78rem] text-ink-3 mt-1">
                    {stamp(e.at)} · <Address value={e.by} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* --- right rail ---------------------------------------------------- */}
        <div className="space-y-5 lg:sticky lg:top-20">
          <CaseActions c={c} config={config} />

          <section className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Scale size={16} strokeWidth={1.9} className="text-brand" aria-hidden />
              <h2 className="font-semibold text-[0.95rem]">The money</h2>
            </div>
            <Ledger
              rows={[
                { label: "Claimed", value: <>{gen(c.amount_claimed_wei)} GEN</> },
                { label: "Filing fee held", value: <>{gen(c.filing_fee_wei)} GEN</> },
                { label: "Defendant's bond", value: <>{gen(c.escrow_wei)} GEN</> },
                ...(decided
                  ? [
                      { label: "To the plaintiff", value: <>{gen(c.to_plaintiff_wei)} GEN</>, tone: "var(--plaintiff)" },
                      { label: "To the defendant", value: <>{gen(c.to_defendant_wei)} GEN</>, tone: "var(--defendant)" },
                    ]
                  : []),
                ...(BigInt(c.unenforced_wei) > 0n
                  ? [{ label: "Awarded but unenforceable", value: <>{gen(c.unenforced_wei)} GEN</>, tone: "var(--partial)" }]
                  : []),
              ]}
            />
            {BigInt(c.unenforced_wei) > 0n ? (
              <p className="mt-3 text-[0.82rem] text-ink-3 leading-relaxed">
                The defendant never posted a bond, so this court is holding
                nothing to pay the award from. It is a ruling, not a payment, and
                the contract says so rather than pretending otherwise.
              </p>
            ) : null}
          </section>

          {decided ? <VerifyPanel caseId={c.case_id} /> : null}
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------------- */

function SideHead({ role, color, address }: { role: string; color: string; address: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[0.78rem] font-semibold" style={{ color }}>{role}</span>
      <Address value={address} />
    </div>
  );
}

function Filing({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink-3 mb-1.5">
        <FileText size={12} aria-hidden /> {title}
      </h3>
      <p className="serif text-[1.02rem] leading-[1.62] text-ink-2 whitespace-pre-wrap break-words">
        {body}
      </p>
    </div>
  );
}

/**
 * The verdict.
 *
 * The award is drawn on the whole 0-100% scale with the window the evidence
 * permitted shaded behind it, because on this court the interesting fact is not
 * the percentage — it is that the percentage came out of a range fixed before
 * the jury read anything. This is also the one place on the site where
 * something moves without being asked to.
 */
function VerdictPanel({ c }: { c: CaseDetail }) {
  const tone = headline(c);
  const jury = c.resolution === "VERDICT";
  return (
    <section className="card overflow-hidden" style={{ borderColor: tone.color + "40" }}>
      <div className="px-5 sm:px-7 py-5" style={{ background: tone.wash }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
          <div>
            <p className="serif text-[1.75rem] leading-none" style={{ color: tone.color }}>
              {tone.label}
            </p>
            <p className="mt-1.5 text-[0.88rem] text-ink-2">{tone.meaning}</p>
          </div>
          <div className="text-right">
            <p className="tnum serif text-[2.1rem] leading-none" style={{ color: tone.color }}>
              {gen(c.award_wei)}
              <span className="text-[0.42em] text-ink-3 ml-1.5">GEN</span>
            </p>
            <p className="mt-1 text-[0.82rem] text-ink-3 tnum">
              {c.award_pct}% of the amount claimed
            </p>
          </div>
        </div>

        {jury ? (
          <div className="mt-5 max-w-[42rem]">
            <AwardLadder
              awardPct={c.award_pct}
              bracket={c.bracket_pct}
              tone={tone.color}
              animate
            />
          </div>
        ) : null}
      </div>

      <div className="px-5 sm:px-7 py-5">
        <h2 className="text-[0.8rem] font-semibold text-ink-3 mb-2">The judgment</h2>
        <p className="serif text-[1.06rem] leading-[1.65] text-ink-2 max-w-[72ch]">
          {c.reasoning}
        </p>

        {jury ? (
          <dl className="mt-5 pt-4 border-t border-rule grid gap-x-8 gap-y-3 sm:grid-cols-2 text-[0.85rem]">
            <Row label="Agreed verdict key" value={<code className="mono-addr">{c.verdict_key}</code>} />
            <Row
              label="Evidence"
              value={c.evidence_quality ? QUALITY_LABEL[c.evidence_quality as Exclude<Quality, "">] : "—"}
            />
            <Row
              label="The jury's choice"
              value={`option ${c.jury_option + 1} of ${c.option_count} the evidence allowed`}
            />
            <Row
              label="Commitment to the evidence"
              value={<code className="mono-addr break-all">{c.content_hash}</code>}
            />
          </dl>
        ) : (
          <p className="mt-4 pt-4 border-t border-rule text-[0.84rem] text-ink-3 leading-relaxed">
            <Gavel size={13} className="inline mr-1.5 -mt-0.5" aria-hidden />
            Decided by rule rather than by jury, so no validator had to weigh
            anything. The commitment to the evidence is still recorded:{" "}
            <code className="mono-addr break-all">{c.content_hash}</code>
          </p>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-ink-2">{value}</dd>
    </div>
  );
}
