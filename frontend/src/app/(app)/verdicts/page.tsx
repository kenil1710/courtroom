import type { Metadata } from "next";
import { getRecentVerdicts, getStats } from "@/lib/court";
import { VerdictsBrowser } from "@/components/verdicts-browser";
import { Notice, Shell } from "@/components/ui";
import { gen } from "@/lib/format";

export const metadata: Metadata = {
  title: "Verdicts",
  description: "Every decided case, with the written judgment and the settlement.",
};

export const revalidate = 20;

export default async function VerdictsPage() {
  let verdicts = null;
  let stats = null;
  try {
    const [feed, s] = await Promise.all([getRecentVerdicts(50), getStats()]);
    verdicts = feed.verdicts;
    stats = s;
  } catch {
    verdicts = null;
  }

  return (
    <Shell>
      <header className="mb-6">
        <h1 className="display h2">Verdicts</h1>
        <p className="lede mt-2">
          Every case this court has decided, with the judgment it wrote and the
          money it moved. Nothing is filtered out for looking bad.
        </p>
      </header>

      {stats && stats.verdicts_returned > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-6 mb-8 pb-7 border-b border-[var(--rule)]">
          <Stat value={String(stats.total_settled)} label="Cases decided" />
          <Stat value={`${stats.average_award_pct}%`} label="Average award" />
          <Stat value={`${gen(stats.total_awarded_wei)} GEN`} label="Moved to plaintiffs" />
          <Stat
            value={`${stats.plaintiff_win_rate_pct}% / ${stats.defendant_win_rate_pct}%`}
            label="Plaintiff / defendant wins"
          />
        </div>
      ) : null}

      {verdicts === null ? (
        <Notice tone="bad" title="The court is not answering">
          We could not read the verdict feed. This is usually the testnet RPC
          being busy — reload in a moment.
        </Notice>
      ) : (
        <VerdictsBrowser verdicts={verdicts} />
      )}
    </Shell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum serif text-[1.7rem] leading-none">{value}</p>
      <p className="mt-1.5 text-[0.84rem] text-ivory-3">{label}</p>
    </div>
  );
}
