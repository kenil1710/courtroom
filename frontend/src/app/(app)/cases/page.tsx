import type { Metadata } from "next";
import Link from "next/link";
import { getAllCases, getStats } from "@/lib/court";
import { CasesBrowser } from "@/components/cases-browser";
import { Notice, Shell } from "@/components/ui";

export const metadata: Metadata = {
  title: "The docket",
  description: "Every case filed at CourtRoom, open and decided.",
};

export const revalidate = 20;

export default async function CasesPage() {
  let cases = null;
  let stats = null;
  try {
    [cases, stats] = await Promise.all([getAllCases(), getStats()]);
  } catch {
    cases = null;
  }

  return (
    <Shell>
      <header className="mb-6">
        <h1 className="display h2">The docket</h1>
        <p className="lede mt-2">
          Every case this court has heard, including the ones the plaintiff lost.
          {stats ? ` ${stats.total_cases} filed, ${stats.total_settled} decided.` : ""}
        </p>
      </header>

      {cases === null ? (
        <Notice tone="bad" title="The court is not answering">
          We could not read the docket. This is usually the testnet RPC being
          busy rather than anything wrong with the contract — reload in a moment.
        </Notice>
      ) : cases.length === 0 ? (
        <Notice title="Nothing on the docket yet">
          No case has been filed against this court instance.{" "}
          <Link href="/file" className="link-quiet">File the first one</Link>.
        </Notice>
      ) : (
        <CasesBrowser cases={cases} />
      )}
    </Shell>
  );
}
