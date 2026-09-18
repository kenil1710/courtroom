"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { CaseCard } from "@/lib/types";
import { CaseRow, Empty } from "@/components/ui";
import { isTerminal } from "@/lib/format";

type Filter = "all" | "open" | "responded" | "settled";
type Sort = "newest" | "amount" | "recent-verdict";

const FILTERS: Array<{ id: Filter; label: string; match: (c: CaseCard) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "open", label: "Awaiting answer", match: (c) => c.status === "FILED" },
  { id: "responded", label: "Ready for the jury", match: (c) => c.status === "RESPONDED" },
  { id: "settled", label: "Decided", match: (c) => isTerminal(c.status) },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "amount", label: "Largest claim" },
  { id: "recent-verdict", label: "Recently decided" },
];

export function CasesBrowser({ cases }: { cases: CaseCard[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.id] = cases.filter(f.match).length;
    return out;
  }, [cases]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const active = FILTERS.find((f) => f.id === filter)!;
    let out = cases.filter(active.match);

    if (needle) {
      // Search by case number, by either party's address, or by words in the
      // claim. A docket is searched by "who" and "which one" far more often
      // than by full-text, so the id and the addresses match first.
      const asId = needle.replace(/^#/, "");
      out = out.filter(
        (c) =>
          String(c.case_id) === asId ||
          c.plaintiff.toLowerCase().includes(needle) ||
          c.defendant.toLowerCase().includes(needle) ||
          c.summary.toLowerCase().includes(needle),
      );
    }

    const sorted = [...out];
    if (sort === "newest") sorted.sort((a, b) => b.filed_at - a.filed_at || b.case_id - a.case_id);
    if (sort === "amount") {
      sorted.sort((a, b) => {
        const d = BigInt(b.amount_claimed_wei) - BigInt(a.amount_claimed_wei);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      });
    }
    if (sort === "recent-verdict") {
      sorted.sort((a, b) => (b.settled_at || 0) - (a.settled_at || 0) || b.case_id - a.case_id);
    }
    return sorted;
  }, [cases, filter, sort, q]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter the docket">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`btn !py-1.5 !px-3 text-[0.86rem] ${
                filter === f.id ? "btn-primary" : "btn-secondary"
              }`}
            >
              {f.label}
              <span className={`tnum text-[0.78rem] ${filter === f.id ? "opacity-80" : "text-ivory-3"}`}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full sm:w-auto sm:min-w-[16rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-3" aria-hidden />
          <input
            className="field pl-9 pr-8 !py-2 text-[0.88rem]"
            placeholder="Case number, address, or words"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the docket"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ivory-3 hover:text-ivory"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-[0.85rem] text-ivory-3">
          Sort
          <select
            className="field !py-1.5 !px-2 text-[0.85rem] w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty
          title={q ? "Nothing matches that" : "No cases here yet"}
          body={
            q
              ? "Try a case number, a wallet address, or a word from the claim."
              : "When a case reaches this stage it will appear here."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {shown.map((c) => <CaseRow key={c.case_id} c={c} />)}
        </div>
      )}

      <p className="mt-5 text-[0.82rem] text-ivory-3">
        Showing {shown.length} of {cases.length} cases on the docket.
      </p>
    </>
  );
}
