/**
 * Creates test/.accounts.json — a stable, reusable pool of signing keys.
 *
 * A POOL rather than one key because CourtRoom's rules are RELATIONAL. "The
 * plaintiff cannot sue themselves" cannot even be STATED with a single address;
 * neither can "only the named defendant may answer", nor "anyone may summon the
 * jury", nor the per-wallet filing cooldown. Proving any of them needs at least
 * two wallets, and proving the five demo cases in one run needs one plaintiff
 * per case, because the cooldown is an hour.
 *
 * Keys are written by hand rather than read off `createAccount()`, because that
 * helper does NOT expose a `privateKey` field — it returns a viem account whose
 * key stays private to the closure. Persisting `account.privateKey` therefore
 * writes `undefined`, JSON.stringify drops the field entirely, and every later
 * `createAccount(undefined)` silently mints a brand-new random account. On a
 * faucet-funded network that failure is INVISIBLE: every run works, just from a
 * different address each time. It surfaces later, as cooldown tests that can
 * never trigger and an owner nobody holds the key to.
 *
 * Existing roles are PRESERVED across runs unless --force is passed, so a
 * funded address is never silently replaced.
 *
 * Usage: node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");

// `client` deploys and owns CourtRoom. The five plaintiff/defendant pairs drive
// the five demo cases — one pair each, because one wallet cannot file twice in
// an hour and the run would otherwise spend most of its time being throttled,
// with the throttled calls coming back REJECTED and reading exactly like a
// contract fault in a log. `bailiff` summons juries and triggers defaults,
// which proves those paths really are permissionless. `outsider` only ever
// probes access control and must never be granted a privilege by any test.
const ROLES = [
  "client",
  "plaintiff1", "defendant1",
  "plaintiff2", "defendant2",
  "plaintiff3", "defendant3",
  "plaintiff4", "defendant4",
  "plaintiff5", "defendant5",
  "bailiff", "integrator", "outsider",
  // The marketplace demo needs its own pair: the buyer files at CourtRoom in
  // their own name, so they must not be a wallet already spent on a case.
  "buyer", "seller",
];

const existing = existsSync(target) && !force ? JSON.parse(readFileSync(target, "utf8")) : {};
const out = {};
let created = 0;

for (const role of ROLES) {
  if (existing[role]?.key) {
    out[role] = existing[role];
    continue;
  }
  const key = `0x${randomBytes(32).toString("hex")}`;
  const account = createAccount(key);
  // Round-trip assertion: the stored address must be the one this key actually
  // derives. Without it a mismatch just sits in the file looking plausible.
  if (createAccount(key).address !== account.address) {
    throw new Error(`key for ${role} does not derive a stable address`);
  }
  out[role] = { key, address: account.address };
  created++;
}

writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote .accounts.json — ${created} new, ${ROLES.length - created} preserved`);
for (const role of ROLES) console.log(`  ${role.padEnd(12)} ${out[role].address}`);
