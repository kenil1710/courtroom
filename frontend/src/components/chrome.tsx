import Link from "next/link";
import { BookOpen, Code2, FileText, Gavel, Scale } from "lucide-react";
import { GITHUB, CHAIN, COURT_ADDRESS, addressUrl } from "@/lib/chain";
import { ScalesMark } from "./scales";
import { Shell } from "./ui";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 shrink-0 group">
      <ScalesMark size={24} />
      <span className="serif text-[1.18rem] tracking-[-0.012em] text-ivory group-hover:text-gold transition-colors">
        CourtRoom
      </span>
    </Link>
  );
}

/** Every route the nav offers, with the icon it is known by throughout. */
const NAV = [
  { href: "/file", label: "File", Icon: FileText },
  { href: "/cases", label: "Cases", Icon: Scale },
  { href: "/verdicts", label: "Verdicts", Icon: Gavel },
  { href: "/docs", label: "Docs", Icon: BookOpen },
] as const;

/** The marketing header. NO WALLET — a visitor reading about a court should not
 *  be asked for an identity before they have decided they want one. */
export function MarketingHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{ borderColor: "var(--rule)", background: "rgba(26, 26, 46, 0.82)" }}
    >
      <Shell className="flex h-16 items-center justify-between gap-3">
        <Wordmark />
        {/*
          * The responsive display goes on a WRAPPER, never on the link itself.
          * `.btn` sets `display: inline-flex` and is a class selector of the
          * same specificity as Tailwind's `.hidden`, defined later in the
          * stylesheet — so `hidden` on a `.btn` silently does nothing, the link
          * stays visible, and the header overflows a phone. Invisible to both
          * tsc and eslint; caught only by measuring the page at 390px.
          */}
        <nav className="flex items-center gap-0.5 sm:gap-1.5 min-w-0">
          <span className="hidden min-[430px]:block">
            <Link href="/verdicts" className="btn btn-ghost !px-2.5 sm:!px-3 text-[0.88rem]">
              <Gavel size={14} aria-hidden />Verdicts
            </Link>
          </span>
          <span className="hidden sm:block">
            <Link href="/cases" className="btn btn-ghost !px-3 text-[0.88rem]">
              <Scale size={14} aria-hidden />Cases
            </Link>
          </span>
          <span className="hidden md:block">
            <Link href="/docs" className="btn btn-ghost !px-3 text-[0.88rem]">
              <BookOpen size={14} aria-hidden />How it works
            </Link>
          </span>
          <Link href="/file" className="btn btn-primary !px-3.5 sm:!px-4 whitespace-nowrap">
            File a case
          </Link>
        </nav>
      </Shell>
    </header>
  );
}

export function AppNav() {
  return (
    <nav className="hidden sm:flex items-center gap-0.5 ml-1">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="btn btn-ghost !px-3 text-[0.88rem]">
          <Icon size={14} aria-hidden />{label}
        </Link>
      ))}
    </nav>
  );
}

export function AppNavMobile() {
  return (
    <nav className="sm:hidden flex items-center gap-0.5 px-4 pb-2 overflow-x-auto">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="btn btn-ghost !px-2.5 !py-1.5 text-[0.85rem] shrink-0">
          <Icon size={13} aria-hidden />{label}
        </Link>
      ))}
      <span className="ml-auto shrink-0 pl-2"><NetworkBadge /></span>
    </nav>
  );
}

export function NetworkBadge() {
  return (
    <a
      href={addressUrl(COURT_ADDRESS)}
      target="_blank"
      rel="noreferrer noopener"
      className="badge text-ivory-3 hover:text-gold transition-colors"
      style={{ borderColor: "var(--rule-strong)" }}
      title={`CourtRoom at ${COURT_ADDRESS} on ${CHAIN.name}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--gold)", boxShadow: "0 0 8px var(--gold)" }}
        aria-hidden
      />
      Studio Dev
    </a>
  );
}

/**
 * The footer.
 *
 * `network` is false on the landing page. The network badge is APP CHROME — it
 * tells somebody who is about to sign something which chain they are on — and a
 * visitor who has not decided they want an identity yet does not need it. The
 * contract address stays either way, because that is provenance rather than
 * chrome: it is how a reader checks that anything on the page is real.
 */
export function SiteFooter({ network = true }: { network?: boolean }) {
  return (
    <footer
      className="border-t mt-20 py-10"
      style={{ borderColor: "var(--rule)", background: "var(--bg-deep)" }}
    >
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-[34ch]">
            <Wordmark />
            <p className="mt-3 text-[0.86rem] text-ivory-3 leading-relaxed">
              A small claims court that runs as a contract. Testnet only — the
              GEN here is worth nothing, and so is a judgment from it.
            </p>
          </div>
          <div className="flex gap-10 text-[0.88rem]">
            <div>
              <p className="font-semibold text-ivory mb-2.5">Court</p>
              <ul className="space-y-2 text-ivory-3">
                <li><Link href="/file" className="hover:text-gold transition-colors">File a case</Link></li>
                <li><Link href="/cases" className="hover:text-gold transition-colors">Browse the docket</Link></li>
                <li><Link href="/verdicts" className="hover:text-gold transition-colors">Verdicts</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ivory mb-2.5">Reference</p>
              <ul className="space-y-2 text-ivory-3">
                <li><Link href="/docs" className="hover:text-gold transition-colors">How it works</Link></li>
                <li>
                  <a href={addressUrl(COURT_ADDRESS)} target="_blank" rel="noreferrer noopener"
                     className="hover:text-gold transition-colors">Contract</a>
                </li>
                <li>
                  <a href={GITHUB} target="_blank" rel="noreferrer noopener"
                     className="hover:text-gold transition-colors inline-flex items-center gap-1.5">
                    <Code2 size={13} aria-hidden /> Source
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div
          className="mt-8 pt-5 border-t flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8rem] text-ivory-3"
          style={{ borderColor: "var(--rule)" }}
        >
          {network ? <NetworkBadge /> : <span>{CHAIN.name}</span>}
          <a
            href={addressUrl(COURT_ADDRESS)}
            target="_blank"
            rel="noreferrer noopener"
            className="mono-addr break-all link-quiet"
          >
            {COURT_ADDRESS}
          </a>
        </div>
      </Shell>
    </footer>
  );
}
