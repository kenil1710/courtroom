import Link from "next/link";
import {
  ArrowUpRight, FileText, MessageSquareReply, Gavel, Banknote,
  Clock, Coins, ScrollText, ShieldCheck,
} from "lucide-react";
import { getLanding } from "@/lib/court";
import { gen, headline, OUTCOME_TONE, QUALITY_LABEL, stamp } from "@/lib/format";
import { Address, AwardLadder, Shell } from "@/components/ui";
import { MarketingHeader, SiteFooter } from "@/components/chrome";
import type { CaseCard, Outcome, Quality } from "@/lib/types";

export const revalidate = 30;

/* The four steps are a real sequence — a case moves through them in order and
   cannot skip one — so they are numbered. Nothing else on this page is. */
const STEPS = [
  {
    icon: FileText,
    title: "File",
    body: "Name the wallet you are claiming against, write what happened, attach your evidence, and post a 0.1 GEN filing fee.",
  },
  {
    icon: MessageSquareReply,
    title: "Answer",
    body: "The defendant has 48 hours to reply with their side and bond the amount you claimed. Miss it and judgment is entered without them.",
  },
  {
    icon: Gavel,
    title: "Judge",
    body: "Anyone can send the case to the jury. Validators read both filings independently and have to agree on the same verdict before it counts.",
  },
  {
    icon: Banknote,
    title: "Settle",
    body: "The contract divides the bond the moment the verdict lands. No release step, no discretion, nobody to appeal to for a different answer.",
  },
];

export default async function LandingPage() {
  const { ok, stats, config, verdicts } = await getLanding();
  const exhibit = verdicts.find((v) => v.resolution === "VERDICT") ?? verdicts[0] ?? null;
  const fee = config ? gen(config.filing_fee_wei) : "0.1";
  const windowHours = config ? Math.round(config.response_window_s / 3600) : 48;

  return (
    <>
      <MarketingHeader />

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* The hero is a real case, not a picture of one. The most           */}
        {/* characteristic thing in this product's world is two filings and a */}
        {/* line down the middle, so that is what opens the page.             */}
        {/* ---------------------------------------------------------------- */}
        <section className="pt-14 pb-8 sm:pt-20 sm:pb-12">
          <Shell>
            <h1 className="display h1 max-w-[16ch]">
              Justice without lawyers.
              <br />
              Verdicts without judges.
            </h1>
            <p className="lede mt-5">
              Somebody owes you a few hundred and it is not worth a
              solicitor&rsquo;s first email. File it here instead: you both put
              your case on the record, validators read it, and the contract pays
              out the moment they agree. Filing costs {fee} GEN and you get it
              back if you win.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/file" className="btn btn-primary">File a case</Link>
              <Link href="/verdicts" className="btn btn-secondary">Browse verdicts</Link>
            </div>
          </Shell>
        </section>

        {exhibit ? <Exhibit c={exhibit} /> : null}

        {/* --- how it works ------------------------------------------------ */}
        <section className="py-16 sm:py-20">
          <Shell>
            <h2 className="display h2 max-w-[20ch]">Four steps, and a deadline on each one.</h2>
            <ol className="mt-9 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="flex items-center gap-2.5">
                    <span className="tnum text-[0.78rem] font-bold text-brand w-5">{i + 1}</span>
                    <s.icon size={17} strokeWidth={1.9} className="text-ink-3" aria-hidden />
                    <h3 className="serif text-[1.18rem]">{s.title}</h3>
                  </div>
                  <p className="mt-2 pl-[1.85rem] text-[0.91rem] leading-relaxed text-ink-2">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </Shell>
        </section>

        {/* --- why ---------------------------------------------------------- */}
        <section className="py-4 sm:py-6">
          <Shell>
            <div className="grid gap-4 sm:grid-cols-3">
              <Why
                icon={Clock}
                stat={`${windowHours} hours`}
                title="A deadline that cannot move"
                body="The answer window is fixed when the court is deployed and there is no method that changes it. Not for the owner, not for either party."
              />
              <Why
                icon={Coins}
                stat={`${fee} GEN`}
                title="The whole cost of filing"
                body="And it is a bond, not a fee: it comes back to you unless the defendant wins. This court keeps nothing — there is no withdraw method for the owner at all."
              />
              <Why
                icon={ShieldCheck}
                stat="Every field"
                title="Is agreed, not asserted"
                body="Validators compare the outcome, the percentage, which side had the better evidence, the settlement down to the wei and the written judgment itself. A value they did not compare is a value one node chose."
              />
            </div>
          </Shell>
        </section>

        {/* --- the docket --------------------------------------------------- */}
        {ok && stats ? (
          <section className="py-16 sm:py-20">
            <Shell>
              <h2 className="display h2">The record so far</h2>
              <p className="mt-2 text-[0.93rem] text-ink-3">
                Read live from the contract, including the cases that went
                against the plaintiff.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
                <Stat value={String(stats.total_cases)} label="Cases filed" />
                <Stat value={String(stats.total_settled)} label="Decided" />
                <Stat value={`${gen(stats.total_awarded_wei)} GEN`} label="Awarded to plaintiffs" />
                <Stat
                  value={stats.verdicts_returned ? `${stats.average_award_pct}%` : "—"}
                  label="Average award"
                />
              </div>

              {stats.verdicts_returned > 0 ? (
                <div className="mt-8 card p-5">
                  <p className="text-[0.86rem] text-ink-3 mb-3">How decided cases came out</p>
                  <Split stats={stats} />
                </div>
              ) : null}
            </Shell>
          </section>
        ) : null}

        {/* --- close -------------------------------------------------------- */}
        <section className="pb-16 sm:pb-20">
          <Shell>
            <div className="card p-8 sm:p-10">
              <h2 className="display h2 max-w-[18ch]">Put it on the record.</h2>
              <p className="lede mt-3">
                Filing takes about two minutes. If you win, the fee comes back
                with the award.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/file" className="btn btn-primary">File a case</Link>
                <Link href="/docs" className="btn btn-secondary">
                  <ScrollText size={15} aria-hidden />
                  Read how judging works
                </Link>
              </div>
            </div>
          </Shell>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------------- */

function Exhibit({ c }: { c: CaseCard }) {
  const tone = headline(c);
  const decided = Boolean(c.outcome);
  return (
    <section className="pb-6">
      <Shell>
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 sm:px-7 pt-5">
            <span className="tnum text-[0.78rem] font-semibold text-ink-3">Case #{c.case_id}</span>
            <span className="text-[0.78rem] text-ink-3">{stamp(c.settled_at || c.filed_at)}</span>
            <Link href={`/case/${c.case_id}`} className="ml-auto text-[0.84rem] link-quiet inline-flex items-center gap-1">
              Read the file <ArrowUpRight size={13} aria-hidden />
            </Link>
          </div>

          <div className="split px-5 sm:px-7 pt-4 pb-6">
            <div className="pr-0 lg:pr-7">
              <p className="text-[0.78rem] font-semibold text-plaintiff">Plaintiff</p>
              <p className="mt-0.5"><Address value={c.plaintiff} /></p>
              <p className="mt-3 serif text-[1.02rem] leading-[1.55] text-ink-2">{c.summary}</p>
              <p className="mt-3 text-[0.85rem] text-ink-3">
                Claiming <span className="tnum font-semibold text-ink">{gen(c.amount_claimed_wei)}</span> GEN
              </p>
            </div>

            <div className="split-rule" aria-hidden />

            <div className="pl-0 lg:pl-7 mt-6 lg:mt-0 pt-6 lg:pt-0 border-t lg:border-t-0 border-rule">
              <p className="text-[0.78rem] font-semibold text-defendant">Defendant</p>
              <p className="mt-0.5"><Address value={c.defendant} /></p>
              <p className="mt-3 serif text-[1.02rem] leading-[1.55] text-ink-2">
                {c.resolution === "DEFAULT"
                  ? "Filed no answer within the deadline."
                  : c.resolution === "ACCEPTED"
                    ? "Accepted the claim in full and paid."
                    : "Answered and bonded the amount claimed."}
              </p>
            </div>
          </div>

          {decided ? (
            <div className="border-t border-rule px-5 sm:px-7 py-5" style={{ background: tone.wash }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="serif text-[1.3rem]" style={{ color: tone.color }}>
                  {OUTCOME_TONE[c.outcome as Exclude<Outcome, "">]?.label ?? tone.label}
                </p>
                <p className="text-[0.86rem] text-ink-2">
                  <span className="tnum font-semibold">{gen(c.award_wei)} GEN</span> awarded
                  {c.evidence_quality ? ` · ${QUALITY_LABEL[c.evidence_quality as Exclude<Quality, "">]}` : ""}
                </p>
              </div>
              <div className="mt-3 max-w-[38rem]">
                <AwardLadder awardPct={c.award_pct} tone={tone.color} />
              </div>
              {c.reasoning ? (
                <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-2 max-w-[70ch] line-clamp-3">
                  {c.reasoning}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Shell>
    </section>
  );
}

function Why({
  icon: Icon, stat, title, body,
}: { icon: typeof Clock; stat: string; title: string; body: string }) {
  return (
    <div className="card p-5">
      <Icon size={17} strokeWidth={1.9} className="text-brand" aria-hidden />
      <p className="mt-3 serif text-[1.55rem] leading-none">{stat}</p>
      <p className="mt-1.5 font-semibold text-[0.95rem]">{title}</p>
      <p className="mt-1.5 text-[0.88rem] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum serif text-[1.95rem] leading-none">{value}</p>
      <p className="mt-1.5 text-[0.85rem] text-ink-3">{label}</p>
    </div>
  );
}

/** Win rates as one bar rather than three numbers, because the only thing worth
 *  knowing is the proportion between them. */
function Split({ stats }: { stats: { plaintiff_win_rate_pct: number; defendant_win_rate_pct: number; partial_rate_pct: number; outcomes: Record<string, number> } }) {
  const parts = [
    { label: "Plaintiff", pct: stats.plaintiff_win_rate_pct, color: "var(--plaintiff)" },
    { label: "Partial", pct: stats.partial_rate_pct, color: "var(--partial)" },
    { label: "Defendant", pct: stats.defendant_win_rate_pct, color: "var(--defendant)" },
  ].filter((p) => p.pct > 0);
  const dismissed = stats.outcomes?.DISMISSED ?? 0;
  return (
    <>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-rule">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${p.pct}%`, background: p.color }} title={`${p.label} ${p.pct}%`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[0.83rem] text-ink-2">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.label} <span className="tnum font-semibold">{p.pct}%</span>
          </span>
        ))}
        {dismissed > 0 ? (
          <span className="text-ink-3">
            plus {dismissed} dismissed, which is not a win for anybody
          </span>
        ) : null}
      </div>
    </>
  );
}
