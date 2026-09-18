import "server-only";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { COURT_ADDRESS } from "./chain";
import type {
  CaseCard, CaseDetail, Config, Preview, Stats, Verification,
} from "./types";

/**
 * Every read of the court, in one place, on the server.
 *
 * Server-side rather than from the browser for two reasons that both matter:
 * Studio Dev meters 30 requests a minute PER IP, so a page that read from each
 * visitor's browser would rate-limit itself the moment two people opened it;
 * and a read that fails should degrade this page, not blank it.
 */

const client = () => createClient({ chain: studioDevnet });

/**
 * Retry an RPC call.
 *
 * Studio Dev meters 30 requests a minute and intermittently answers with an
 * HTML error page, which surfaces as `Unexpected token '<'`. Both are
 * infrastructure noise rather than an answer, and a page that treated them as
 * "no data" would tell a visitor the docket is empty when it is not.
 */
export async function retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      const transient =
        /Unexpected token '<'|not valid JSON|fetch failed|ECONNRESET|ETIMEDOUT|50\d|rate limit exceeded|-32029/i.test(msg);
      if (!transient || i === attempts) throw e;
      await new Promise((r) => setTimeout(r, /rate limit/i.test(msg) ? 4500 : 800 * i));
    }
  }
  throw last;
}

type Arg = string | number | boolean | bigint;

async function read<T>(fn: string, args: Arg[] = [], address = COURT_ADDRESS): Promise<T> {
  return (await retry(() =>
    client().readContract({ address, functionName: fn, args }),
  )) as T;
}

/** A read that is allowed to fail. Returns the fallback and says nothing —
 *  the caller decides what an absent answer means for its own page. */
async function soft<T>(fn: string, args: Arg[], fallback: T, address = COURT_ADDRESS): Promise<T> {
  try {
    return await read<T>(fn, args, address);
  } catch {
    return fallback;
  }
}

export const getConfig = (address?: `0x${string}`) =>
  read<Config>("get_config", [], address);

export const getStats = (address?: `0x${string}`) =>
  read<Stats>("get_stats", [], address);

export const getCase = (id: number, address?: `0x${string}`) =>
  read<CaseDetail>("get_case", [id], address);

export const verifyVerdict = (id: number, address?: `0x${string}`) =>
  read<Verification>("verify_verdict", [id], address);

export const getRecentVerdicts = (count: number, address?: `0x${string}`) =>
  read<{ count: number; total_settled: number; verdicts: CaseCard[] }>(
    "get_recent_verdicts", [count], address);

export const getOpenCases = (address?: `0x${string}`) =>
  read<{ count: number; scanned: number; docket_size: number; cases: CaseCard[] }>(
    "get_open_cases", [], address);

export const getCases = (offset: number, count: number, address?: `0x${string}`) =>
  read<{ offset: number; count: number; total: number; next_offset: number; cases: CaseCard[] }>(
    "get_cases", [offset, count], address);

export const getCasesByPlaintiff = (who: string, address?: `0x${string}`) =>
  read<{ address: string; role: string; count: number; cases: CaseCard[] }>(
    "get_cases_by_plaintiff", [who], address);

export const getCasesByDefendant = (who: string, address?: `0x${string}`) =>
  read<{ address: string; role: string; count: number; cases: CaseCard[] }>(
    "get_cases_by_defendant", [who], address);

export const previewCase = (
  claim: string, evidence: string, response: string, counter: string,
  address?: `0x${string}`,
) => read<Preview>("preview_case", [claim, evidence, response, counter], address);

export const payoutOf = (who: string, address?: `0x${string}`) =>
  read<{ address: string; owed_wei: string; owed_gen: string }>(
    "payout_of", [who], address);

/**
 * The whole docket, oldest first, for the browse page.
 *
 * Paged rather than read in one call because `get_cases` caps a page at 50 and
 * the docket is unbounded. It stops at `stop` pages so one enormous docket
 * cannot make this page hang.
 */
export async function getAllCases(limit = 200, address?: `0x${string}`): Promise<CaseCard[]> {
  const out: CaseCard[] = [];
  let offset = 0;
  for (let page = 0; page < 6 && out.length < limit; page++) {
    const chunk = await soft(
      "get_cases", [offset, 50],
      { offset, count: 0, total: 0, next_offset: offset, cases: [] as CaseCard[] },
      address ?? COURT_ADDRESS,
    );
    out.push(...chunk.cases);
    if (chunk.count === 0 || chunk.next_offset >= chunk.total) break;
    offset = chunk.next_offset;
  }
  return out;
}

/** Everything the landing page needs, with a shape it can always render.
 *  A court that cannot be reached says so; it does not render as an empty
 *  docket, because "no cases" and "we could not ask" are different claims. */
export async function getLanding() {
  try {
    const [stats, config, recent] = await Promise.all([
      getStats(),
      getConfig(),
      getRecentVerdicts(6),
    ]);
    return { ok: true as const, stats, config, verdicts: recent.verdicts };
  } catch {
    return { ok: false as const, stats: null, config: null, verdicts: [] };
  }
}
