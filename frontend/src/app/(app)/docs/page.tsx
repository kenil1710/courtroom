import type { Metadata } from "next";
import Link from "next/link";
import { getConfig, getStats } from "@/lib/court";
import { Notice, Shell } from "@/components/ui";
import { duration, gen } from "@/lib/format";
import {
  CHAIN, COURT_ADDRESS, CONSUMER_ADDRESS, FAST_COURT_ADDRESS, GITHUB, addressUrl,
} from "@/lib/chain";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What CourtRoom does with your money, how validators reach a verdict, and what this court cannot do.",
};

export const revalidate = 120;

export default async function DocsPage() {
  let config = null;
  let stats = null;
  try {
    [config, stats] = await Promise.all([getConfig(), getStats()]);
  } catch { /* the page is still worth reading without live numbers */ }

  const fee = config ? gen(config.filing_fee_wei) : "0.1";
  const windowText = config ? duration(config.response_window_s) : "48h";

  return (
    <Shell>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] items-start">
        <article className="min-w-0">
          <header className="mb-8">
            <h1 className="display h2">How this court works</h1>
            <p className="lede mt-2">
              What happens to your money, how a verdict is reached, and the
              things this court deliberately cannot do.
            </p>
          </header>

          <Section id="start" title="Getting started">
            <p>
              You need three things and none of them cost real money. First, an
              identity: press <em>Create a testnet key</em> and one is generated
              in your browser. It is a throwaway key for a test network, stored
              only on this device, and the interface says so wherever it appears.
            </p>
            <p>
              Second, some GEN. This is a test network with a public faucet, so
              the <em>Add 50 test GEN</em> button in the wallet menu funds you
              directly. The GEN here is worth nothing.
            </p>
            <p>
              Third, the wallet address of whoever you are claiming against. Only
              that address can answer your case, so it has to be right.
            </p>
            <p>
              Everything runs on {CHAIN.name}. The court is at{" "}
              <a className="link-quiet mono-addr" href={addressUrl(COURT_ADDRESS)} target="_blank" rel="noreferrer noopener">
                {COURT_ADDRESS}
              </a>{" "}
              and every read on this site comes from it.
            </p>
          </Section>

          <Section id="filing" title="Filing a case">
            <p>
              A filing is four things: who you are claiming against, what
              happened, your evidence, and how much you want. You post a{" "}
              {fee} GEN filing fee at the same time.
            </p>
            <p>
              <strong>The fee is a bond, not a charge.</strong> It comes back to
              you on every outcome except one: if the defendant wins, it goes to
              them, as compensation for having had to answer a claim that failed.
              The court itself keeps nothing — there is no method by which the
              owner can withdraw anything, because there is nothing to withdraw.
            </p>
            <p>
              Write the evidence as though somebody who was not there has to
              check it, because that is exactly what happens. Dates, amounts,
              invoice numbers, transaction hashes and what a document actually
              says all count. &ldquo;I know I am right&rdquo; does not, and the
              filing page will tell you so before you pay.
            </p>
            <p>One case per wallet per hour.</p>
          </Section>

          <Section id="answering" title="Answering a case">
            <p>
              The defendant has {windowText} to answer. That deadline was fixed
              when this court was deployed and there is no method that changes
              it — not for the owner, not for either party. Both sides can read
              it before they commit to anything.
            </p>
            <p>
              <strong>Answering means bonding the full amount claimed</strong>,
              not the amount you think is fair. The brief this was built to asked
              only for the counter-offer to be bonded, and that is not enough: a
              bond that only covers what the defendant already agrees to is a
              bond that cannot pay a verdict they disagree with, and a court whose
              judgments are enforceable only when the loser consented is not a
              court. Anything the jury does not award comes straight back, so
              bonding costs you nothing if you are right.
            </p>
            <p>
              You can also just accept the claim, pay it, and close the case. And
              if you do not answer at all, anyone can enter judgment by default
              once the window closes — see below for what that is actually worth.
            </p>
          </Section>

          <Section id="judging" title="How a verdict is reached">
            <p>
              Anyone can send an answered case to the jury. It is permissionless
              on purpose: if only a party could summon the jury, whichever side
              held the weaker case would simply never call, and both escrows
              would sit there until somebody gave up.
            </p>
            <p>
              What happens then is the part worth understanding. The court first
              scores both filings on how <em>checkable</em> they are — how many
              dates, figures and documentary references each side put on the
              record, and how substantial each filing is. That score is pure
              arithmetic over text that is already on chain, so every validator
              computes the same one.
            </p>
            <p>
              That score fixes a <strong>window</strong>: a range of at most three
              rungs on a nine-rung ladder, from nothing to the full amount. The
              jury chooses inside that window and cannot reach outside it. A model
              is asked one question with a single digit for an answer, and the
              digit indexes a list the contract itself built.
            </p>
            <p>
              This is the whole safety argument. The leader node&rsquo;s only
              freedom is that one index. Everything stored — who won, the
              percentage, which side had the better evidence, the settlement down
              to the wei, the written judgment — is recomputed from that index
              after the validators agree. A leader cannot forge a number it was
              never allowed to express.
            </p>
            {config ? (
              <p>
                Validators compare{" "}
                <code className="mono-addr">{config.consensus_key}</code> and{" "}
                {config.consensus_also_binds.length} further fields besides. If
                they disagree, no verdict is recorded, no money moves, and anyone
                can send the case again.
              </p>
            ) : null}
            <p>
              If the model cannot be reached at all, the case simply does not
              settle that round. A court that hands down a judgment nobody judged
              is worse than a court that is briefly closed.
            </p>
          </Section>

          <Section id="settlement" title="The settlement maths">
            <p>
              Once a verdict lands the contract divides what it is holding, in
              one place, with no discretion:
            </p>
            <ul>
              <li>
                <strong>Plaintiff wins.</strong> The full claim goes to the
                plaintiff out of the defendant&rsquo;s bond, and the filing fee
                goes back to the plaintiff.
              </li>
              <li>
                <strong>Partial.</strong> The awarded share of the claim goes to
                the plaintiff, the rest of the bond goes back to the defendant,
                and the filing fee goes back to the plaintiff.
              </li>
              <li>
                <strong>Defendant wins.</strong> The whole bond goes back to the
                defendant, and the filing fee goes to them too.
              </li>
              <li>
                <strong>Dismissed.</strong> Neither side put enough on the
                record. The bond goes back, the fee goes back, and nobody is
                found against. This is not a defendant win and the statistics on
                this site do not count it as one.
              </li>
            </ul>
            <p>
              Every one of those divides exactly:{" "}
              <code className="mono-addr">to_plaintiff + to_defendant = bond + fee</code>,
              with no remainder, on every path. Where the arithmetic cannot split
              a wei evenly it goes to the party the court is not finding against.
            </p>
            <p>
              A <strong>default judgment</strong> is the honest exception. The
              plaintiff wins on the merits at 100%, but the defendant never posted
              a bond, so the court is holding nothing to pay it from. Only the
              filing fee actually moves, and the claim is recorded as an
              unenforced judgment rather than dressed up as a payment.
            </p>
          </Section>

          <Section id="payouts" title="Getting paid">
            <p>
              The verdict assigns the money immediately — no release step and
              nobody&rsquo;s permission. Withdrawing it is a separate click,
              which is the standard pull pattern and is what lets the
              settlement itself post a single, predictable transfer per person.
            </p>
            <Notice tone="warn" title="On this testnet, payouts are queued rather than delivered">
              <p>
                Studio Dev accepts a value transfer gated on finalisation, records
                it correctly, and then does not execute it. We measured this three
                ways on a purpose-built probe contract — every spelling posts a
                correctly-formed message with the right recipient and the right
                amount, the transaction finalises, and no balance moves.
              </p>
              <p className="mt-2">
                It is a property of the network, not of the contract. Rather than
                hide it, the court reports it:{" "}
                <code className="mono-addr">get_stats</code> publishes its real
                on-chain balance next to its own books and names the gap as{" "}
                <code className="mono-addr">undelivered_wei</code>
                {stats ? <> — currently {gen(stats.undelivered_wei)} GEN</> : null}.
              </p>
            </Notice>
          </Section>

          <Section id="limits" title="What this court cannot do">
            <p>
              The owner can pause new filings and change the filing fee for
              future cases. That is the entire list of owner powers. There is no
              method by which an owner can touch a case, touch an escrow, change
              a verdict, stop a payout, stop a defendant from answering, move a
              deadline, or withdraw anything.
            </p>
            <p>
              A case that reaches a terminal status is frozen. Nothing rewrites
              it — not a second jury, not a late answer, not the owner.
            </p>
            <p>
              The filing fee already paid on a case is snapshotted into that case.
              Raising the fee tomorrow cannot restate the price of a case filed
              today.
            </p>
            <p>
              And one thing it deliberately does not have: there is no way to put
              a case into the &ldquo;jury is sitting&rdquo; state by hand. That
              means <code className="mono-addr">settle_stalled</code>, the
              recovery path for a jury round that hangs, cannot be demonstrated
              on demand here — because the only way to make it demonstrable would
              be a method that freezes a case, which is precisely the power this
              court is built not to have. It is proved in the offline suite
              instead, and its refusal path is exercised on chain.
            </p>
          </Section>

          <Section id="deadlines" title="Why there are two courts">
            <p>
              The canonical court runs the {windowText} answer window. That makes
              the two paths which only open once a deadline passes —
              default judgment and stall recovery — impossible to watch on a
              testnet, and a payment path nobody has seen execute is a payment
              path nobody has tested.
            </p>
            <p>
              So a second instance of the same contract is deployed with
              five-minute deadlines, purely so those paths can be exercised on
              chain. It is at{" "}
              <a className="link-quiet mono-addr" href={addressUrl(FAST_COURT_ADDRESS)} target="_blank" rel="noreferrer noopener">
                {FAST_COURT_ADDRESS}
              </a>
              . The deadlines are constructor arguments, fixed before any case
              exists and immutable afterwards — an owner who could retune a window
              could time an expiry onto a defendant they disliked, and that is the
              thing worth preventing, not the number itself.
            </p>
          </Section>

          <Section id="composability" title="Reading verdicts from another contract">
            <p>
              <code className="mono-addr">get_ruling(case_id)</code> is the
              machine-readable verdict, and it is deliberately blunt about
              uncertainty: <code className="mono-addr">decided</code> is false for
              anything that has not reached a terminal status, so a caller that
              treated &ldquo;nobody has heard this yet&rdquo; the same as
              &ldquo;dismissed&rdquo; would be caught by its own reading.
            </p>
            <p>
              A worked example is deployed at{" "}
              <a className="link-quiet mono-addr" href={addressUrl(CONSUMER_ADDRESS)} target="_blank" rel="noreferrer noopener">
                {CONSUMER_ADDRESS}
              </a>
              : a marketplace that opens a dispute on an order, pins exactly what
              is being alleged, and then enforces whatever this court rules. It
              takes no custody of anything — the buyer files in their own name and
              is paid by the court directly — and a case can only be attached to
              an order if four facts read back out of the court match it.
            </p>
          </Section>

          <Section id="faq" title="Questions people actually ask">
            <Faq q="Is this real money?">
              No. {CHAIN.name} is a test network and the GEN here is worth
              nothing. A judgment from this court is not enforceable anywhere.
            </Faq>
            <Faq q="Can the other side just ignore me?">
              They can, and there is a cost to it: after the window closes anyone
              can enter judgment by default and it goes on the record against
              them. But because they bonded nothing, the court has nothing to pay
              you from. The claim stands unenforced. This court is honest about
              that rather than issuing you a receipt for money that never existed.
            </Faq>
            <Faq q="What stops someone filing nonsense at me?">
              It costs them the filing fee, and if you answer and win, that fee
              becomes yours. Answering costs you the bond, which comes straight
              back unless you lose.
            </Faq>
            <Faq q="Can I appeal?">
              No. A decided case is frozen and there is no method anywhere that
              reopens it. That is a design decision, not an omission: an appeal
              that the owner could grant would be an owner who decides cases.
            </Faq>
            <Faq q="What if the validators disagree?">
              Then nothing is recorded and no money moves. Anyone can send the
              case to the jury again. Failing in that direction is deliberate —
              the alternative is storing a verdict that was never actually agreed.
            </Faq>
            <Faq q="Who wrote the judgment I am reading?">
              The contract did, from the agreed verdict. A written paragraph that
              validators never compared would be a stored value one node chose, so
              the reasoning is composed from the same facts every validator
              agreed on and can be recomputed by anyone. Use the{" "}
              <em>Recompute from the evidence</em> button on any decided case.
            </Faq>
          </Section>

          <div className="mt-10 pt-7 border-t border-[var(--rule)] flex flex-wrap gap-3">
            <Link href="/file" className="btn btn-primary">File a case</Link>
            <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="btn btn-secondary">
              Read the contract
            </a>
          </div>
        </article>

        <nav className="hidden lg:block lg:sticky lg:top-20 text-[0.86rem]">
          <p className="font-semibold mb-2.5">On this page</p>
          <ul className="space-y-1.5 text-ivory-3">
            {[
              ["start", "Getting started"],
              ["filing", "Filing a case"],
              ["answering", "Answering a case"],
              ["judging", "How a verdict is reached"],
              ["settlement", "The settlement maths"],
              ["payouts", "Getting paid"],
              ["limits", "What this court cannot do"],
              ["deadlines", "Why there are two courts"],
              ["composability", "Reading verdicts elsewhere"],
              ["faq", "Questions"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-ivory">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Shell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mb-10">
      <h2 className="display h3 mb-3">{title}</h2>
      <div className="prose-court [&_ul]:mt-3 [&_ul]:space-y-2 [&_li]:list-disc [&_ul]:pl-5 [&_code]:text-[0.92em] [&_strong]:text-ivory [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-[var(--rule)] py-3.5">
      <summary className="cursor-pointer font-medium text-ivory list-none flex items-baseline justify-between gap-4">
        {q}
        <span className="text-ivory-3 text-[1.1rem] leading-none group-open:rotate-45 transition-transform" aria-hidden>+</span>
      </summary>
      <div className="mt-2 text-[0.93rem] leading-relaxed text-ivory-2">{children}</div>
    </details>
  );
}
