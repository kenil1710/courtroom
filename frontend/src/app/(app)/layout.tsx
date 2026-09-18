import Link from "next/link";
import { WalletProvider } from "@/lib/wallet";
import { WalletBadge } from "@/components/wallet-badge";
import { NetworkBadge, SiteFooter, Wordmark } from "@/components/chrome";
import { Shell } from "@/components/ui";

/**
 * The app shell.
 *
 * Separate from the marketing page for one reason: an identity only appears
 * once a visitor has reached a page where they might need one. The landing page
 * has no wallet on it at all.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <header className="border-b border-rule bg-paper/85 backdrop-blur-sm sticky top-0 z-30">
        <Shell className="flex h-14 items-center gap-4">
          <Wordmark />
          <nav className="hidden sm:flex items-center gap-0.5 text-[0.9rem] ml-2">
            <Link href="/file" className="btn btn-ghost !px-3">File</Link>
            <Link href="/cases" className="btn btn-ghost !px-3">Cases</Link>
            <Link href="/verdicts" className="btn btn-ghost !px-3">Verdicts</Link>
            <Link href="/docs" className="btn btn-ghost !px-3">Docs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden sm:inline-flex"><NetworkBadge /></span>
            <WalletBadge />
          </div>
        </Shell>
        <nav className="sm:hidden flex items-center gap-0.5 px-4 pb-2 text-[0.88rem] overflow-x-auto">
          <Link href="/file" className="btn btn-ghost !px-2.5 !py-1.5">File</Link>
          <Link href="/cases" className="btn btn-ghost !px-2.5 !py-1.5">Cases</Link>
          <Link href="/verdicts" className="btn btn-ghost !px-2.5 !py-1.5">Verdicts</Link>
          <Link href="/docs" className="btn btn-ghost !px-2.5 !py-1.5">Docs</Link>
          <span className="ml-auto shrink-0"><NetworkBadge /></span>
        </nav>
      </header>
      <main className="py-8 sm:py-12">{children}</main>
      <SiteFooter />
    </WalletProvider>
  );
}
