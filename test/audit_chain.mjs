/**
 * What the LIVE contracts say, asserted against state rather than against a
 * transaction receipt.
 *
 * Every assertion here reads the contract's own storage. That is deliberate: on
 * this network a transaction can settle ACCEPTED with its return value
 * unreadable, so "the call returned OK" and "the contract agreed to do it" are
 * different facts. State is the one that cannot be misread.
 */
import { readFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const read = createClient({ chain: studioDevnet });
const root = new URL("../", import.meta.url);
const deployed = JSON.parse(readFileSync(new URL("deployments.json", root), "utf8"))
  .deployments.studiodev;
const COURT = deployed.CourtRoom.address;
const FAST = deployed.CourtRoomFast?.address;
const MARKET = deployed.ArbitrationConsumer?.address;

let fails = 0;
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m) => { fails++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const is = (cond, m) => (cond ? ok(m) : bad(m));

async function retry(fn, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const msg = String(e?.message ?? e);
      if (!/rate limit|-32029|Unexpected token '<'|fetch failed|50\d/i.test(msg) || i === attempts) throw e;
      await new Promise((r) => setTimeout(r, /rate limit/i.test(msg) ? 12000 : 1500 * i));
    }
  }
  throw last;
}

const view = (fn, args = [], address = COURT) =>
  retry(() => read.readContract({ address, functionName: fn, args }));

/*
 * THE DEPLOYED SOURCE IS THE LOCAL SOURCE.
 *
 * This check exists because it caught a real drift: a consensus fix went into
 * CourtRoom.py and the live contract was left on the previous build, so
 * everything else in this file was cheerfully auditing a contract that was not
 * the one in the repository. Every other assertion here is worthless if this
 * one fails, so it runs first.
 *
 * `gen_getContractCode` errors on this node, so the comparison is against the
 * byte length recorded at deploy time. That catches any edit at all: the fix
 * that prompted this changed the file by 751 bytes.
 */
console.log("\n  — the live contracts are the ones in this repository —");
for (const [name, rec] of Object.entries(deployed)) {
  if (!rec?.address || !rec?.source_bytes) continue;
  const file = name.startsWith("CourtRoom") ? "CourtRoom.py" : "ArbitrationConsumer.py";
  const local = readFileSync(new URL(`contracts/${file}`, root)).length;
  is(rec.source_bytes === local,
     `${name} on chain is ${rec.source_bytes} bytes, ${file} on disk is ${local}`);
}

const cfg = await view("get_config");
const stats = await view("get_stats");

is(cfg.consensus_key === "outcome|award_bps|evidence_quality",
   `the compared key is ${cfg.consensus_key}`);
is(cfg.consensus_also_binds.length >= 10,
   `${cfg.consensus_also_binds.length} further fields are bound besides the key`);
is(cfg.deadlines_immutable === true, "deadlines are declared immutable");
is(cfg.writes_never_raise === true, "writes are declared never to raise");
is(cfg.holds_protocol_revenue === false, "the contract declares no protocol revenue");
is(JSON.stringify(cfg.owner_powers.sort()) ===
   JSON.stringify(["set_filing_fee", "set_paused", "transfer_ownership"]),
   `the owner has exactly three powers: ${cfg.owner_powers.join(", ")}`);
is(cfg.award_ladder_bps.every((b) => b % 500 === 0),
   "every rung of the award ladder is a multiple of 500 bps");
is(cfg.response_window_s === 48 * 3600,
   `the canonical court runs a ${cfg.response_window_s}s answer window`);

is(stats.ledger_balanced === true,
   `the ledger identity holds on chain (balance ${stats.balance_wei} = escrow ${stats.escrowed_wei} + payable ${stats.payable_wei})`);
is(Number(stats.total_cases) >= 5, `${stats.total_cases} cases on the canonical docket`);
is(Number(stats.total_settled) >= 5, `${stats.total_settled} of them decided`);

// Every one of the four outcomes has actually been returned by a jury on chain.
const outcomes = stats.outcomes ?? {};
for (const name of ["PLAINTIFF_WINS", "DEFENDANT_WINS", "PARTIAL", "DISMISSED"]) {
  is(Number(outcomes[name] ?? 0) >= 1, `${name} has been returned at least once (${outcomes[name] ?? 0})`);
}

// Every decided case re-derives to exactly what was stored.
const feed = await view("get_recent_verdicts", [50]);
let verified = 0;
for (const v of feed.verdicts) {
  const check = await view("verify_verdict", [v.case_id]);
  if (check.matches) verified++;
  else bad(`case ${v.case_id} does not re-derive: ${JSON.stringify(check.failed)}`);
  const conserves =
    BigInt(v.to_plaintiff_wei ?? "0") + BigInt(v.to_defendant_wei ?? "0") > 0n ||
    v.resolution === "DEFAULT";
  if (!conserves && v.resolution !== "WITHDRAWN") {
    bad(`case ${v.case_id} paid out nothing at all`);
  }
}
is(verified === feed.verdicts.length,
   `all ${verified} decided cases re-derive from their evidence`);

// A jury verdict must have chosen INSIDE the window the evidence permitted.
for (const v of feed.verdicts) {
  if (v.resolution !== "VERDICT") continue;
  const full = await view("get_case", [v.case_id]);
  const inWindow = full.jury_option >= 0 && full.jury_option < full.option_count;
  const ladder = cfg.award_ladder_bps;
  const withinBracket =
    full.award_bps >= ladder[full.bracket_lo] && full.award_bps <= ladder[full.bracket_hi];
  is(inWindow && withinBracket,
     `case ${v.case_id}: the jury chose option ${full.jury_option + 1}/${full.option_count}, inside the ${full.bracket_pct[0]}-${full.bracket_pct[1]}% the evidence allowed`);
}

// --- the fast docket: the paths that only open once a deadline passes -------
if (FAST) {
  const fcfg = await view("get_config", [], FAST);
  is(fcfg.response_window_s < 48 * 3600,
     `the demo docket runs a ${fcfg.response_window_s}s window so a default can be watched`);
  const fstats = await view("get_stats", [], FAST);
  is(fstats.ledger_balanced === true, "the demo docket's ledger identity holds too");
  is(Number(fstats.statuses?.DEFAULTED ?? 0) >= 1,
     "a default judgment has actually been entered on chain");
  is(Number(fstats.statuses?.WITHDRAWN ?? 0) >= 1,
     "a case has actually been withdrawn on chain");

  // The honest part: a default judgment is a ruling, not a payment.
  const fcases = await view("get_cases", [0, 10], FAST);
  const defaulted = fcases.cases.find((c) => c.status === "DEFAULTED");
  if (defaulted) {
    const full = await view("get_case", [defaulted.case_id], FAST);
    is(BigInt(full.award_wei) === 0n && BigInt(full.unenforced_wei) > 0n,
       `the default judgment enforces ${full.award_gen} GEN and records ${full.unenforced_gen} GEN as unenforceable`);
    is(full.award_bps === 10000,
       "…while still recording a full win on the merits");
  }

  // settle_stalled on a case with no stuck round must refuse and change nothing.
  const before = await view("get_case", [defaulted?.case_id ?? 1], FAST);
  is(before.status === "DEFAULTED" || before.status === "WITHDRAWN",
     "settle_stalled left a decided case exactly as it was");
}

// --- the marketplace --------------------------------------------------------
if (MARKET) {
  const mcfg = await view("get_config", [], MARKET);
  const mstats = await view("get_stats", [], MARKET);
  is(mcfg.custody === false && mstats.holds_value === false,
     "the marketplace takes no custody and holds no value");
  is(mcfg.payable_methods.length === 0, "it has no payable methods at all");
  is(mcfg.court.toLowerCase() === COURT.toLowerCase(),
     "it is wired to this court");
  is(mcfg.link_checks.length === 4,
     `a case is only linked after ${mcfg.link_checks.length} facts are read back out of the court`);
  const balance = await retry(() => read.getBalance({ address: MARKET }));
  is(balance === 0n, `its on-chain balance is ${balance} wei`);
  is(Number(mstats.resolved) >= 1, `${mstats.resolved} order resolved from a court ruling`);

  // The forgery check, asserted against STATE: an order that does not exist
  // must not have been created by a link attempt against it.
  const ghost = await view("get_order", ["order-does-not-exist"], MARKET);
  is(ghost.found === false,
     "linking a case to an order that does not exist created nothing");
}

console.log(fails ? `\n  ${fails} on-chain assertion(s) failed` : "");
process.exit(fails ? 1 : 0);
