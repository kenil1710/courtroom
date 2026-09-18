import Link from "next/link";
import { Scale, Code2 } from "lucide-react";
import { GITHUB, CHAIN, COURT_ADDRESS, addressUrl } from "@/lib/chain";
import { Shell } from "./ui";

/** The mark: a balance beam that is level, because the point of this court is
 *  that neither side is favoured by the machine. Drawn rather than imported so
 *  it can sit on the baseline of the wordmark. */
export function Mark({ size = 20 }: { size?: number }) {
  return <Scale size={size} strokeWidth={1.75} className="text-brand shrink-0" aria-hidden />;
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 group">
      <Mark />
      <span className="serif text-[1.16rem] tracking-[-0.015em] text-ink">CourtRoom</span>
    </Link>
  );
}

/** The marketing header. NO WALLET — a visitor reading about a court should not
 *  be asked for an identity before they have decided they want one. */
export function MarketingHeader() {
  return (
    <header className="border-b border-rule bg-paper/85 backdrop-blur-sm sticky top-0 z-30">
      <Shell className="flex h-14 items-center justify-between gap-3">
        <Wordmark />
        {/*
          * The responsive display goes on a WRAPPER, never on the link itself.
          * `.btn` sets `display: inline-flex` and is a class selector of the
          * same specificity as Tailwind's `.hidden`, defined later in the
          * stylesheet — so `hidden` on a `.btn` silently does nothing, the link
          * stays visible, and the header overflows a phone. It is invisible to
          * both tsc and eslint and was caught here only by measuring the page
          * width at 390px.
          */}
        <nav className="flex items-center gap-0.5 sm:gap-2 text-[0.9rem] min-w-0">
          <span className="hidden min-[420px]:block">
            <Link href="/verdicts" className="btn btn-ghost !px-2 sm:!px-3">Verdicts</Link>
          </span>
          <Link href="/cases" className="btn btn-ghost !px-2 sm:!px-3">Cases</Link>
          <span className="hidden sm:block">
            <Link href="/docs" className="btn btn-ghost !px-3">How it works</Link>
          </span>
          <Link href="/file" className="btn btn-primary !px-3 sm:!px-4 whitespace-nowrap">File a case</Link>
        </nav>
      </Shell>
    </header>
  );
}

export function NetworkBadge() {
  return (
    <a
      href={addressUrl(COURT_ADDRESS)}
      target="_blank"
      rel="noreferrer noopener"
      className="badge border-rule-strong text-ink-3 hover:text-ink transition-colors"
      title={`CourtRoom at ${COURT_ADDRESS} on ${CHAIN.name}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-plaintiff" aria-hidden />
      Studio Dev
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule mt-20 py-10 bg-paper">
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-[34ch]">
            <Wordmark />
            <p className="mt-2.5 text-[0.86rem] text-ink-3 leading-relaxed">
              A small claims court that runs as a contract. Testnet only — the
              GEN here is worth nothing, and so is a judgment from it.
            </p>
          </div>
          <div className="flex gap-10 text-[0.88rem]">
            <div>
              <p className="font-semibold text-ink mb-2">Court</p>
              <ul className="space-y-1.5 text-ink-3">
                <li><Link href="/file" className="hover:text-ink">File a case</Link></li>
                <li><Link href="/cases" className="hover:text-ink">Browse the docket</Link></li>
                <li><Link href="/verdicts" className="hover:text-ink">Verdicts</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink mb-2">Reference</p>
              <ul className="space-y-1.5 text-ink-3">
                <li><Link href="/docs" className="hover:text-ink">How it works</Link></li>
                <li>
                  <a href={addressUrl(COURT_ADDRESS)} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
                    Contract
                  </a>
                </li>
                <li>
                  <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="hover:text-ink inline-flex items-center gap-1.5">
                    <Code2 size={13} aria-hidden /> Source
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-5 border-t border-rule flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8rem] text-ink-3">
          <NetworkBadge />
          <span className="mono-addr">{COURT_ADDRESS}</span>
        </div>
      </Shell>
    </footer>
  );
}
