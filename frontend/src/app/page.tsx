import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, BookOpen, CheckCircle, Clock, Coins,
  FileText, Gavel, Scale, ShieldCheck, Users,
} from "lucide-react";
import { getLanding } from "@/lib/court";
import { gen, headline, QUALITY_LABEL } from "@/lib/format";
import { AwardLadder, Party, Shell } from "@/components/ui";
import { MarketingHeader, SiteFooter } from "@/components/chrome";
import { ScalesDefs, ScalesHero } from "@/components/scales";
import { CountUp, Motion, Reveal } from "@/components/motion";
import type { CaseCard, Quality } from "@/lib/types";

export const revalidate = 30;

/* A case moves through these in order and cannot skip one, so they are
   numbered. Nothing else on this page is. */
const STEPS = [
  {
    Icon: FileText,
    title: "File",
    body: "Name the wallet you are claiming against, write what happened, attach your evidence, and post a 0.1 GEN filing fee.",
  },
  {
    Icon: Users,
    title: "Answer",
    body: "The defendant has 48 hours to reply with their side and bond the amount you claimed. Miss it and judgment is entered without them.",
  },
  {
    Icon: Scale,
    title: "Judge",
    body: "Anyone can send the case to the jury. Validators read both filings independently and have to agree on the same verdict before it counts.",
  },
  {
    Icon: Gavel,
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
    <Motion>
      <ScalesDefs />
      <MarketingHeader />

      <main>
        {/* --- hero ---------------------------------------------------------
            The most characteristic thing in this product's world is a pair of
            scales that has not settled yet, so that is what opens the page —
            beside the claim, not decorating it. ------------------------------ */}
        <section className="pt-12 pb-10 sm:pt-16 sm:pb-14">
          <Shell>
            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-6 items-center">
              <Reveal>
                <h1 className="display h1 max-w-[13ch]">
                  Justice without lawyers.
                  <span className="block italic" style={{ color: "var(--gold)" }}>
                    Verdicts without judges.
                  </span>
                </h1>
                <p className="lede mt-6">
                  Somebody owes you a few hundred and it is not worth a
                  solicitor&rsquo;s first email. File it here instead: you both
                  put your case on the record, validators read it, and the
                  contract pays out the moment they agree. Filing costs {fee} GEN
                  and you get it back if you win.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/file" className="btn btn-primary">
                    <FileText size={15} aria-hidden />File a case
                  </Link>
                  <Link href="/verdicts" className="btn btn-secondary">
                    <Gavel size={15} aria-hidden />Browse verdicts
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={1} className="justify-self-center w-full max-w-[26rem] lg:max-w-none">
                <ScalesHero className="w-full h-auto" />
              </Reveal>
            </div>
          </Shell>
        </section>

        {/* --- the banner of live figures ---------------------------------- */}
        {ok && stats ? (
          <section className="py-6">
            <Shell>
              <Reveal>
                <div className="card px-5 py-6 sm:px-8 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7">
                  <Figure Icon={CheckCircle} label="Cases decided" value={<CountUp value={stats.total_settled} />} />
                  <Figure Icon={Coins} label="Awarded to plaintiffs"
                          value={<><CountUp value={Number(gen(stats.total_awarded_wei).replace(/,/g, ""))} decimals={1} />
                            <span className="text-[0.46em] text-ivory-3 ml-1.5">GEN</span></>} />
                  <Figure Icon={Users} label="Cases filed" value={<CountUp value={stats.total_cases} />} />
                  <Figure Icon={AlertTriangle} label="Still open" value={<CountUp value={stats.open_cases} />} />
                </div>
              </Reveal>
            </Shell>
          </section>
        ) : null}

        {/* --- how it works ------------------------------------------------- */}
        <section className="py-16 sm:py-24">
          <Shell>
            <Reveal>
              <h2 className="display h2 max-w-[20ch]">Four steps, and a deadline on each one.</h2>
            </Reveal>
            <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} as="li" delay={(i % 3 + 1) as 1 | 2 | 3}>
                  <div className="flex items-center gap-2.5">
                    <span className="tnum text-[0.78rem] font-bold w-5" style={{ color: "var(--gold)" }}>
                      {i + 1}
                    </span>
                    <s.Icon size={18} strokeWidth={1.8} aria-hidden style={{ color: "var(--gold-dim)" }} />
                    <h3 className="serif text-[1.22rem] text-ivory">{s.title}</h3>
                  </div>
                  <p className="mt-2.5 pl-[1.9rem] text-[0.91rem] leading-relaxed text-ivory-2">
                    {s.body}
                  </p>
                </Reveal>
              ))}
            </ol>
          </Shell>
        </section>

        {/* --- why ---------------------------------------------------------- */}
        <section>
          <Shell>
            <div className="grid gap-4 sm:grid-cols-3">
              <Reveal><Why Icon={Clock} stat={`${windowHours} hours`} title="A deadline that cannot move"
                body="The answer window is fixed when the court is deployed and there is no method that changes it. Not for the owner, not for either party." /></Reveal>
              <Reveal delay={1}><Why Icon={Coins} stat={`${fee} GEN`} title="The whole cost of filing"
                body="And it is a bond, not a fee: it comes back unless the defendant wins. This court keeps nothing — the owner has no withdraw method at all." /></Reveal>
              <Reveal delay={2}><Why Icon={ShieldCheck} stat="Every field" title="Is agreed, not asserted"
                body="Validators compare the outcome, the percentage, which side had the better evidence, the settlement down to the wei, and the written judgment itself." /></Reveal>
            </div>
          </Shell>
        </section>

        {/* --- the case study ------------------------------------------------
            A real decided case, read live from the chain, shown the way the
            court itself shows it. Nothing on this page is a mock-up. --------- */}
        {exhibit ? <CaseStudy c={exhibit} /> : null}

        {/* --- how decided cases came out ----------------------------------- */}
        {ok && stats && stats.verdicts_returned > 0 ? (
          <section className="py-4">
            <Shell>
              <Reveal>
                <div className="card p-6 sm:p-7">
                  <p className="text-[0.88rem] text-ivory-3 mb-4">
                    How decided cases came out — including the ones that went against the plaintiff
                  </p>
                  <Split stats={stats} />
                </div>
              </Reveal>
            </Shell>
          </section>
        ) : null}

        {/* --- close --------------------------------------------------------- */}
        <section className="py-16 sm:py-24">
          <Shell>
            <Reveal>
              <div className="card p-8 sm:p-12 text-center">
                <h2 className="display h2 max-w-[18ch] mx-auto">Put it on the record.</h2>
                <p className="lede mt-4 mx-auto">
                  Filing takes about two minutes. If you win, the fee comes back
                  with the award.
                </p>
                <div className="mt-7 flex flex-wrap gap-3 justify-center">
                  <Link href="/file" className="btn btn-primary">
                    <FileText size={15} aria-hidden />File a case
                  </Link>
                  <Link href="/docs" className="btn btn-secondary">
                    <BookOpen size={15} aria-hidden />Read how judging works
                  </Link>
                </div>
              </div>
            </Reveal>
          </Shell>
        </section>
      </main>

      <SiteFooter network={false} />
    </Motion>
  );
}

/* ------------------------------------------------------------------------- */

function Figure({
  Icon, label, value,
}: { Icon: typeof Clock; label: string; value: React.ReactNode }) {
  return (
    <div>
      <Icon size={15} strokeWidth={1.9} aria-hidden style={{ color: "var(--gold-dim)" }} />
      <p className="mt-2.5 serif text-[2.1rem] leading-none" style={{ color: "var(--gold)" }}>
        {value}
      </p>
      <p className="mt-2 text-[0.83rem] text-ivory-3">{label}</p>
    </div>
  );
}

function Why({
  Icon, stat, title, body,
}: { Icon: typeof Clock; stat: string; title: string; body: string }) {
  return (
    <div className="card p-6 h-full">
      <Icon size={18} strokeWidth={1.8} aria-hidden style={{ color: "var(--gold)" }} />
      <p className="mt-3.5 serif text-[1.6rem] leading-none text-ivory">{stat}</p>
      <p className="mt-2 font-semibold text-[0.95rem] text-ivory">{title}</p>
      <p className="mt-2 text-[0.88rem] leading-relaxed text-ivory-2">{body}</p>
    </div>
  );
}

function CaseStudy({ c }: { c: CaseCard }) {
  const tone = headline(c);
  const decided = Boolean(c.outcome);
  return (
    <section className="py-16 sm:py-24">
      <Shell>
        <Reveal>
          <h2 className="display h2 max-w-[22ch]">A case, as the court recorded it.</h2>
          <p className="mt-2.5 text-[0.93rem] text-ivory-3 max-w-[58ch]">
            Read live from the contract. The filings are what the parties
            actually wrote; the judgment is what the validators actually agreed.
          </p>
        </Reveal>

        <Reveal delay={1}>
          <article className="card mt-7 overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 sm:px-7 pt-5">
              <span className="tnum text-[0.78rem] font-bold" style={{ color: "var(--gold-dim)" }}>
                Case #{c.case_id}
              </span>
              <Link href={`/case/${c.case_id}`}
                    className="ml-auto text-[0.84rem] link-quiet inline-flex items-center gap-1">
                Read the file <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>

            <div className="split px-5 sm:px-7 pt-4 pb-6">
              <div className="pr-0 lg:pr-7 min-w-0">
                <p className="text-[0.78rem] font-semibold mb-1" style={{ color: "var(--plaintiff)" }}>
                  Plaintiff
                </p>
                <Party role="plaintiff" address={c.plaintiff} />
                <p className="filing mt-3.5 text-[0.98rem]">{c.summary}</p>
                <p className="mt-3.5 text-[0.85rem] text-ivory-3">
                  Claiming <span className="tnum font-semibold text-ivory">{gen(c.amount_claimed_wei)}</span> GEN
                </p>
              </div>

              <div className="split-rule" aria-hidden />

              <div className="pl-0 lg:pl-7 mt-6 lg:mt-0 pt-6 lg:pt-0 border-t lg:border-t-0 min-w-0"
                   style={{ borderColor: "var(--rule)" }}>
                <p className="text-[0.78rem] font-semibold mb-1" style={{ color: "var(--defendant-text)" }}>
                  Defendant
                </p>
                <Party role="defendant" address={c.defendant} />
                <p className="filing mt-3.5 text-[0.98rem]">
                  {c.resolution === "DEFAULT" ? "Filed no answer within the deadline."
                    : c.resolution === "ACCEPTED" ? "Accepted the claim in full and paid."
                      : "Answered, and bonded the full amount claimed."}
                </p>
              </div>
            </div>

            {decided ? (
              <div className="border-t px-5 sm:px-7 py-6"
                   style={{ background: tone.wash, borderColor: tone.color + "33" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
                  <p className="serif text-[1.5rem]" style={{ color: tone.text }}>{tone.label}</p>
                  <p className="text-[0.86rem] text-ivory-2">
                    <span className="tnum font-semibold" style={{ color: tone.text }}>
                      {gen(c.award_wei)} GEN
                    </span>{" "}
                    awarded
                    {c.evidence_quality
                      ? ` · ${QUALITY_LABEL[c.evidence_quality as Exclude<Quality, "">]}`
                      : ""}
                  </p>
                </div>
                <div className="mt-4 max-w-[40rem]">
                  <AwardLadder awardPct={c.award_pct} tone={tone.color} />
                </div>
                {c.reasoning ? (
                  <p className="mt-3 serif text-[0.96rem] leading-relaxed text-ivory-2 max-w-[72ch] line-clamp-3">
                    {c.reasoning}
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
        </Reveal>
      </Shell>
    </section>
  );
}

/** Win rates as one bar, because the only thing worth knowing is the proportion
 *  between them. */
function Split({
  stats,
}: {
  stats: {
    plaintiff_win_rate_pct: number;
    defendant_win_rate_pct: number;
    partial_rate_pct: number;
    outcomes: Record<string, number>;
  };
}) {
  const parts = [
    { label: "Plaintiff", pct: stats.plaintiff_win_rate_pct, color: "var(--plaintiff)" },
    { label: "Partial", pct: stats.partial_rate_pct, color: "var(--partial)" },
    { label: "Defendant", pct: stats.defendant_win_rate_pct, color: "var(--defendant)" },
  ].filter((p) => p.pct > 0);
  const dismissed = stats.outcomes?.DISMISSED ?? 0;
  return (
    <>
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--rule)" }}>
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${p.pct}%`, background: p.color }} title={`${p.label} ${p.pct}%`} />
        ))}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.84rem] text-ivory-2">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.label} <span className="tnum font-semibold text-ivory">{p.pct}%</span>
          </span>
        ))}
        {dismissed > 0 ? (
          <span className="text-ivory-3">
            plus {dismissed} dismissed, which is not a win for anybody
          </span>
        ) : null}
      </div>
    </>
  );
}
