/**
 * Deploys CourtRoom (and optionally ArbitrationConsumer) to Studio Dev.
 *
 *   node deploy.mjs                      # CourtRoom only
 *   node deploy.mjs --consumer           # CourtRoom, then a marketplace on it
 *   node deploy.mjs --consumer --at=0x…  # a marketplace against an existing court
 *
 * Every deploy and every write estimates its fee first. Studio Dev prices
 * transactions and REFUSES one whose attached feeValue is below the floor;
 * estimating per-call rather than hardcoding a number is the difference between
 * a script that keeps working when the fee policy moves and one that starts
 * failing everywhere for a reason that looks like a contract bug.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, accounts, fundOnStudio, deploy, retry, gen } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
if (!chain) throw new Error(`unknown network ${networkName}`);

const withConsumer = process.argv.includes("--consumer");
const existingCourt = argOf("at", null);
const feeWei = BigInt(argOf("fee", String(10n ** 17n)));
// The deadlines are fixed at deploy and immutable afterwards. The canonical
// court runs the 48 hours the brief specifies; a second instance with short
// windows exists so `default_judgment` can be WATCHED on chain rather than only
// asserted offline. See contracts/NOTES.md.
const windowS = Number(argOf("window", String(48 * 3600)));
const stallS = Number(argOf("stall", String(48 * 3600)));
const label = argOf("label", "CourtRoom");

const acc = accounts();
const signerRole = argOf("as", "client");
const account = createAccount(acc[signerRole].key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

console.log(`\nCourtRoom deploy → ${networkName}`);
console.log(`  signer     ${account.address} (${signerRole})`);

await fundOnStudio(chain, account.address, 500n * 10n ** 18n);
console.log(`  balance    ${gen(await read.getBalance({ address: account.address }))} GEN`);

const path = new URL("../deployments.json", import.meta.url);
const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
doc.deployments = doc.deployments || {};
const record = doc.deployments[networkName] || { network: networkName, chain_id: chain.id };

/**
 * Persist AFTER EACH CONTRACT, not once at the end.
 *
 * A previous project's deploy script put one contract on chain, then exited on
 * the second one's failure before writing anything — so a live contract existed
 * nowhere on disk and the next run happily deployed a duplicate. A deploy record
 * that only survives a fully clean run is a deploy record that loses exactly the
 * addresses you most need after a partial failure.
 */
function persist() {
  record.explorer = "https://explorer-studio-dev.genlayer.com/";
  doc.deployments[networkName] = record;
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

let court = existingCourt;

if (!existingCourt) {
  const code = readFileSync(new URL("../contracts/CourtRoom.py", import.meta.url));
  console.log(`\n  CourtRoom  contracts/CourtRoom.py (${code.length.toLocaleString()} bytes)`);
  console.log(`  filing fee ${gen(feeWei)} GEN`);
  console.log(`  deadlines  respond ${windowS}s   stall ${stallS}s (immutable)`);
  const res = await deploy({ chain, wallet, read, code, args: [Number(feeWei), windowS, stallS], label: `${label} deploy` });
  if (!res.ok) {
    console.error(`\nCourtRoom deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  court = res.address;
  console.log(`  address    ${court}`);

  // Prove it ANSWERS before recording it. A deploy that lands but cannot be read
  // is not a deploy anyone can use, and recording it would publish a dead link
  // for the frontend to fail against.
  const cfg = await retry(() => read.readContract({ address: court, functionName: "get_config", args: [] }), { label: "get_config" });
  const stats = await retry(() => read.readContract({ address: court, functionName: "get_stats", args: [] }), { label: "get_stats" });
  console.log(`  owner      ${cfg.owner}`);
  console.log(`  rubric     v${cfg.rubric_version}   ladder ${cfg.award_ladder_bps.join("/")}`);
  console.log(`  consensus  ${cfg.consensus_key}`);
  console.log(`  windows    respond ${cfg.response_window_s}s   stall ${cfg.stall_ttl_s}s   cooldown ${cfg.file_cooldown_s}s`);
  console.log(`  ledger     balanced=${stats.ledger_balanced} revenue=${stats.holds_protocol_revenue}`);

  record[label] = {
    address: court,
    deploy_tx: res.hash,
    source_bytes: code.length,
    owner: cfg.owner,
    rubric_version: cfg.rubric_version,
    filing_fee_wei: String(cfg.filing_fee_wei),
    response_window_s: Number(cfg.response_window_s),
    stall_ttl_s: Number(cfg.stall_ttl_s),
    deployed_at: new Date().toISOString(),
  };
  persist();
  console.log(`  recorded   deployments.json`);
} else {
  console.log(`\n  CourtRoom  ${court} (reused)`);
  if (!record[label]?.address) {
    record[label] = { ...(record[label] || {}), address: court, note: "adopted via --at" };
    persist();
  }
}

if (withConsumer) {
  const code = readFileSync(new URL("../contracts/ArbitrationConsumer.py", import.meta.url));
  console.log(`\n  Consumer   contracts/ArbitrationConsumer.py (${code.length.toLocaleString()} bytes)`);
  console.log(`  court      ${court}`);
  const conAccount = createAccount(acc.integrator.key);
  await fundOnStudio(chain, conAccount.address, 200n * 10n ** 18n);
  const conWallet = createClient({ chain, account: conAccount });
  const res = await deploy({ chain, wallet: conWallet, read, code, args: [court], label: "ArbitrationConsumer deploy" });
  if (!res.ok) {
    console.error(`\nConsumer deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  console.log(`  address    ${res.address}`);
  const cfg = await retry(() => read.readContract({ address: res.address, functionName: "get_config", args: [] }), { label: "consumer get_config" });
  console.log(`  wired to   ${cfg.court}`);
  console.log(`  custody    ${cfg.custody}   payable methods ${JSON.stringify(cfg.payable_methods)}`);
  if (String(cfg.court).toLowerCase() !== String(court).toLowerCase()) {
    console.error(`\nConsumer points at ${cfg.court}, not ${court} — refusing to record it`);
    process.exit(1);
  }
  record.ArbitrationConsumer = {
    address: res.address,
    deploy_tx: res.hash,
    source_bytes: code.length,
    court,
    owner: cfg.owner,
    custody: cfg.custody,
    deployed_at: new Date().toISOString(),
  };
  persist();
}

persist();
console.log(`\n✔ recorded in deployments.json`);
console.log(`  explorer   https://explorer-studio-dev.genlayer.com/\n`);
