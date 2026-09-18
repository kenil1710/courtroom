/**
 * Summon the jury again for any case that is answered but undecided.
 *
 * A `judge` transaction that does not settle is the contract working as
 * designed: it applies no state, stores no verdict, moves no money, and leaves
 * the case RESPONDED so that anybody can call again. This is "anybody calling
 * again", and it exists as a script because the alternative — a case sitting
 * answered for ever because one transaction had a bad minute — is the failure
 * the permissionless design was built to avoid.
 *
 *   node rejudge.mjs            # the canonical court
 *   node rejudge.mjs --fast     # the demo docket
 */
import { readFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { CHAINS, argOf, accounts, connect, retry } from "./harness.mjs";

const which = process.argv.includes("--fast") ? "CourtRoomFast" : "CourtRoom";
const d = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8")).deployments.studiodev;
const ADDR = d[which].address;
const read = createClient({ chain: CHAINS.studiodev });
const view = (fn, args = []) => retry(() => read.readContract({ address: ADDR, functionName: fn, args }), { label: fn });

console.log(`\n${which} ${ADDR}`);
const page = await view("get_cases", [0, 50]);
const pending = page.cases.filter((c) => c.status === "RESPONDED");
if (!pending.length) {
  console.log("  nothing is waiting on the jury");
  process.exit(0);
}

const c = connect({ address: ADDR, role: "bailiff" });
for (const row of pending) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`  case ${row.case_id}: summoning the jury (attempt ${attempt})…`);
    const out = await c.send("judge", [row.case_id]);
    const after = await view("get_case", [row.case_id]);
    if (after.status !== "RESPONDED") {
      console.log(`    → ${after.status} ${after.outcome} at ${after.award_pct}% `
        + `(verify: ${(await view("verify_verdict", [row.case_id])).matches})`);
      break;
    }
    console.log(`    → still RESPONDED (${out.status}${out.failure ? ": " + out.failure.slice(0, 70) : ""});`
      + (attempt < 3 ? " nothing changed, trying again" : " giving up for now"));
  }
}
