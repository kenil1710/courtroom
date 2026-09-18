import { WalletProvider } from "@/lib/wallet";
import { WalletBadge } from "@/components/wallet-badge";
import { AppNav, AppNavMobile, NetworkBadge, SiteFooter, Wordmark } from "@/components/chrome";
import { Motion, PageTransition } from "@/components/motion";
import { ScalesDefs } from "@/components/scales";
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
    <Motion>
      <WalletProvider>
        <ScalesDefs />
        <header
          className="sticky top-0 z-30 border-b backdrop-blur-md"
          style={{ borderColor: "var(--rule)", background: "rgba(26, 26, 46, 0.86)" }}
        >
          <Shell className="flex h-16 items-center gap-4">
            <Wordmark />
            <AppNav />
            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden sm:inline-flex"><NetworkBadge /></span>
              <WalletBadge />
            </div>
          </Shell>
          <AppNavMobile />
        </header>
        <main className="py-8 sm:py-12">
          <PageTransition>{children}</PageTransition>
        </main>
        <SiteFooter />
      </WalletProvider>
    </Motion>
  );
}
