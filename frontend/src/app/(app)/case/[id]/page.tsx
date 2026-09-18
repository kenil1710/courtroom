import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CheckCircle, Clock, Coins, FileText, Gavel,
  Hourglass, XCircle,
} from "lucide-react";
import { getCase, getConfig } from "@/lib/court";
import { duration, gen, headline, isTerminal, relative, stamp } from "@/lib/format";
import {
  Address, AwardLadder, Ledger, Notice, OutcomeBadge, Party, QualityLine,
  Shell, StatusBadge,
} from "@/components/ui";
import { CaseActions } from "@/components/case-actions";
import { VerifyPanel } from "@/components/verify-panel";
import { GavelKnock, Reveal, VerdictReveal } from "@/components/motion";
import type { CaseDetail } from "@/lib/types";

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
        <Notice tone="bad" title="The court is not answering" icon={<AlertTriangle size={14} />}>
          We could not read case #{caseId}. This is usually the testnet RPC being
          busy — reload in a moment.
        </Notice>
      </Shell>
    );
  }
  if (!c.found) notFound();

  const decided = isTerminal(c.status);

  return (
    <Shell>
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-[0.86rem] link-quiet mb-5">
        <ArrowLeft size={14} aria-hidden /> The docket
      </Link>

      {/* --- caption ------------------------------------------------------- */}
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tnum text-[0.85rem] font-bold" style={{ color: "var(--gold-dim)" }}>
            Case #{c.case_id}
          </span>
          {decided ? <OutcomeBadge outcome={c.outcome} /> : null}
          <StatusBadge status={c.status} />
          {c.resolution && c.resolution !== "VERDICT" ? (
            <span className="text-[0.8rem] text-ivory-3">
              {c.resolution === "ACCEPTED" ? "conceded by the defendant"
                : c.resolution === "DEFAULT" ? "no answer was filed"
                  : c.resolution === "WITHDRAWN" ? "dropped by the plaintiff"
                    : "jury round never settled"}
            </span>
          ) : null}
        </div>
        <h1 className="display h2 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Party role="plaintiff" address={c.plaintiff} />
          <span className="italic text-ivory-3">v</span>
          <Party role="defendant" address={c.defendant} />
        </h1>
        <p className="mt-2.5 text-[0.9rem] text-ivory-3">
          Filed {stamp(c.filed_at)} · claiming{" "}
          <span className="tnum font-semibold text-ivory">{gen(c.amount_claimed_wei)}</span> GEN
        </p>
      </header>

      {/* --- live deadline -------------------------------------------------- */}
      {c.status === "FILED" ? (
        <div className="mb-6">
          {c.response_overdue ? (
            <Notice tone="warn" title="The answer window has closed" icon={<AlertTriangle size={14} />}>
              The defendant did not answer in time. Anyone can now enter judgment
              by default — though the defendant bonded nothing, so only the
              filing fee actually moves.
            </Notice>
          ) : (
            <Notice title="Waiting on the defendant" icon={<Clock size={14} />}>
              {duration(c.seconds_left_to_respond)} left to answer and bond{" "}
              {gen(c.amount_claimed_wei)} GEN. The deadline was fixed when the
              case was filed and cannot be moved by anyone.
            </Notice>
          )}
        </div>
      ) : null}

      {/* --- the jury is sitting -------------------------------------------- */}
      {c.judging_since && !decided ? (
        <div className="mb-6">
          <Notice tone="warn" title="The jury is sitting" icon={<Hourglass size={14} />}>
            <p>
              Opened {relative(c.judging_since, c.now)}. A round that never
              settles can be cleared after {duration(config.stall_ttl_s)},
              refunding both sides in full.
            </p>
            {/* Indeterminate on purpose. A jury takes as long as it takes, and a
                bar claiming to know how far along it was would be inventing a
                number. */}
            <div className="judging-track mt-3" role="progressbar" aria-label="The jury is deliberating" />
          </Notice>
        </div>
      ) : null}

      {/* --- the verdict ---------------------------------------------------- */}
      {decided ? <VerdictPanel c={c} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20.5rem] items-start mt-6">
        <div className="min-w-0 space-y-6">
          {/* --- the two sides --------------------------------------------- */}
          <Reveal as="section">
            <div className="card overflow-hidden">
              <div className="split p-5 sm:p-7">
                {/* The plaintiff's side is bordered in gold, the defendant's in
                    crimson. The same two colours key every verdict on the site,
                    so a reader learns them once. */}
                <div className="pr-0 lg:pr-7 min-w-0 border-l-2 pl-4 lg:pl-5"
                     style={{ borderColor: "var(--plaintiff)" }}>
                  <p className="text-[0.78rem] font-semibold mb-1.5" style={{ color: "var(--plaintiff)" }}>
                    Plaintiff
                  </p>
                  <Address value={c.plaintiff} />
                  <Filing title="The claim" body={c.claim_text} />
                  <Filing title="Evidence" body={c.evidence_text} />
                  <p className="mt-4 text-[0.84rem] text-ivory-3">
                    Posted a <span className="tnum font-semibold text-ivory">{gen(c.filing_fee_wei)}</span> GEN filing fee.
                  </p>
                </div>

                <div className="split-rule" aria-hidden />

                <div className="pl-0 lg:pl-7 mt-7 lg:mt-0 pt-7 lg:pt-0 border-t lg:border-t-0 min-w-0"
                     style={{ borderColor: "var(--rule)" }}>
                  <div className="border-l-2 pl-4 lg:pl-5" style={{ borderColor: "var(--defendant)" }}>
                    <p className="text-[0.78rem] font-semibold mb-1.5" style={{ color: "var(--defendant-text)" }}>
                      Defendant
                    </p>
                    <Address value={c.defendant} />
                    {c.response_text ? (
                      <>
                        <Filing title="The answer" body={c.response_text} />
                        <Filing title="Counter-evidence" body={c.counter_evidence} />
                        <p className="mt-4 text-[0.84rem] text-ivory-3">
                          Bonded <span className="tnum font-semibold text-ivory">{gen(c.escrow_wei)}</span> GEN
                          {BigInt(c.counter_amount_wei) > 0n
                            ? <> and offered <span className="tnum font-semibold text-ivory">{gen(c.counter_amount_wei)}</span> GEN to settle.</>
                            : <> and offered nothing to settle.</>}
                        </p>
                      </>
                    ) : (
                      <p className="mt-5 text-[0.9rem] leading-relaxed text-ivory-3">
                        {c.status === "FILED"
                          ? "No answer yet. Until one is filed, this side of the record is empty and the jury cannot sit."
                          : c.resolution === "ACCEPTED"
                            ? "The defendant accepted the claim in full rather than answering it."
                            : c.resolution === "DEFAULT"
                              ? "The defendant never answered. Judgment was entered without their side of the record."
                              : "No answer was filed."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* --- timeline ---------------------------------------------------- */}
          <Reveal as="section">
            <div className="card p-5 sm:p-7">
              <h2 className="font-semibold text-[0.95rem] mb-5 flex items-center gap-2">
                <Clock size={15} strokeWidth={1.9} aria-hidden style={{ color: "var(--gold)" }} />
                What happened, and when
              </h2>
              <ol className="relative">
                {c.timeline.map((e, i) => {
                  const last = i === c.timeline.length - 1;
                  return (
                    <li key={`${e.event}-${e.at}`} className="relative pl-7 pb-6 last:pb-0">
                      {!last ? (
                        <span className="absolute left-[5px] top-4 bottom-0 w-px"
                              style={{ background: "var(--rule-strong)" }} aria-hidden />
                      ) : null}
                      <span className="absolute left-0 top-[6px] w-[11px] h-[11px] rounded-full"
                            style={{
                              background: last ? "var(--gold)" : "var(--card)",
                              boxShadow: last
                                ? "0 0 0 2px var(--gold), 0 0 14px -1px var(--gold)"
                                : "0 0 0 2px var(--rule-strong)",
                            }} aria-hidden />
                      <p className="text-[0.9rem] font-semibold capitalize text-ivory">
                        {e.event.toLowerCase()}
                      </p>
                      <p className="text-[0.86rem] text-ivory-2 mt-0.5">{e.detail}</p>
                      <p className="text-[0.78rem] text-ivory-3 mt-1.5">
                        {stamp(e.at)} · <Address value={e.by} />
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Reveal>
        </div>

        {/* --- right rail ---------------------------------------------------- */}
        <div className="space-y-5 lg:sticky lg:top-24">
          <CaseActions c={c} config={config} />

          <section className="card p-5">
            <div className="flex items-center gap-2 mb-3.5">
              <Coins size={16} strokeWidth={1.9} aria-hidden style={{ color: "var(--gold)" }} />
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
                      { label: "To the defendant", value: <>{gen(c.to_defendant_wei)} GEN</>, tone: "var(--defendant-text)" },
                    ]
                  : []),
                ...(BigInt(c.unenforced_wei) > 0n
                  ? [{ label: "Awarded but unenforceable", value: <>{gen(c.unenforced_wei)} GEN</>, tone: "var(--partial)" }]
                  : []),
              ]}
            />
            {BigInt(c.unenforced_wei) > 0n ? (
              <p className="mt-3.5 text-[0.82rem] text-ivory-3 leading-relaxed">
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

/** A filing is set the way an exhibit is set in a legal document: serif,
 *  leaded, and indented off a gold rule. */
function Filing({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-ivory-3 mb-2">
        <FileText size={12} aria-hidden /> {title}
      </h3>
      <p className="filing">{body}</p>
    </div>
  );
}

/**
 * The verdict, turned over like a sealed envelope.
 *
 * The award is drawn on the whole 0-100% scale with the window the evidence
 * permitted shaded behind it, because the interesting fact is not the
 * percentage — it is that the percentage came out of a range fixed before the
 * jury read anything.
 */
function VerdictPanel({ c }: { c: CaseDetail }) {
  const tone = headline(c);
  const jury = c.resolution === "VERDICT";
  const Icon = c.outcome === "DEFENDANT_WINS" ? XCircle : CheckCircle;
  return (
    <VerdictReveal>
      <section className="card overflow-hidden" style={{ borderColor: tone.color + "55" }}>
        <div className="px-5 sm:px-8 py-7" style={{ background: tone.wash }}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div>
              <p className="serif text-[2rem] leading-none flex items-center gap-3" style={{ color: tone.text }}>
                <GavelKnock>
                  <Gavel size={26} strokeWidth={1.8} aria-hidden style={{ color: tone.color }} />
                </GavelKnock>
                {tone.label}
              </p>
              <p className="mt-2.5 text-[0.9rem] text-ivory-2 max-w-[44ch]">{tone.meaning}</p>
              {c.evidence_quality ? (
                <p className="mt-2.5"><QualityLine quality={c.evidence_quality} /></p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="tnum serif text-[2.9rem] leading-none" style={{ color: tone.text }}>
                {gen(c.award_wei)}
                <span className="text-[0.36em] text-ivory-3 ml-2">GEN</span>
              </p>
              <p className="mt-1.5 text-[0.82rem] text-ivory-3 tnum">
                {c.award_pct}% of the amount claimed
              </p>
            </div>
          </div>

          {jury ? (
            <div className="mt-6 max-w-[44rem]">
              <AwardLadder awardPct={c.award_pct} bracket={c.bracket_pct} tone={tone.color} animate />
            </div>
          ) : null}
        </div>

        <div className="px-5 sm:px-8 py-6">
          <h2 className="text-[0.78rem] font-semibold text-ivory-3 mb-2.5">The judgment</h2>
          <p className="filing" style={{ borderColor: tone.color + "66" }}>{c.reasoning}</p>

          {jury ? (
            <dl className="mt-6 pt-5 border-t grid gap-x-8 gap-y-4 sm:grid-cols-2 text-[0.85rem]"
                style={{ borderColor: "var(--rule)" }}>
              <Row label="Agreed verdict key" value={<code className="mono-addr" style={{ color: "var(--gold)" }}>{c.verdict_key}</code>} />
              <Row label="The jury's choice"
                   value={`option ${c.jury_option + 1} of ${c.option_count} the evidence allowed`} />
              <Row label="Window the evidence permitted"
                   value={`${c.bracket_pct[0]}–${c.bracket_pct[1]}% of the claim`} />
              <Row label="Commitment to the evidence"
                   value={<code className="mono-addr break-all" style={{ color: "var(--gold)" }}>{c.content_hash}</code>} />
            </dl>
          ) : (
            <p className="mt-5 pt-5 border-t text-[0.84rem] text-ivory-3 leading-relaxed"
               style={{ borderColor: "var(--rule)" }}>
              <Icon size={13} className="inline mr-1.5 -mt-0.5" aria-hidden />
              Decided by rule rather than by jury, so no validator had to weigh
              anything. The commitment to the evidence is still recorded:{" "}
              <code className="mono-addr break-all" style={{ color: "var(--gold)" }}>{c.content_hash}</code>
            </p>
          )}
        </div>
      </section>
    </VerdictReveal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ivory-3">{label}</dt>
      <dd className="mt-1 text-ivory-2">{value}</dd>
    </div>
  );
}
