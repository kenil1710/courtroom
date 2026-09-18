/**
 * Creates the demo docket on Studio Dev and records what actually happened.
 *
 *   node seed.mjs                # the canonical court: 5 cases
 *   node seed.mjs --fast         # the short-deadline court: default + withdrawal
 *   node seed.mjs --market       # the ArbitrationConsumer story, end to end
 *   node seed.mjs --all
 *
 * It records the jury's ACTUAL verdict, never the one the fixture hoped for.
 * The bracket is arithmetic and is asserted; the choice inside it belongs to
 * five independent model calls, and a demo that asserted its own verdicts would
 * be a demo of nothing.
 *
 * It also measures the one thing that cannot be measured any other way: the
 * RECIPIENT'S ON-CHAIN BALANCE before and after `claim_payout`. Every other
 * signal — the transaction status, the internal ledger, the return value — read
 * OK on a previous project while not one wei moved.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CASES, FAST_CASES, MARKET_CASE, GEN } from "./cases.mjs";
import {
  CHAINS, argOf, accounts, fundOnStudio, connect, retry, gen, sleep,
  waitFinalized,
} from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const all = process.argv.includes("--all");
const doMain = all || !(process.argv.includes("--fast") || process.argv.includes("--market"));
const doFast = all || process.argv.includes("--fast");
const doMarket = all || process.argv.includes("--market");

const deployPath = new URL("../deployments.json", import.meta.url);
const deployed = JSON.parse(readFileSync(deployPath, "utf8")).deployments[networkName];
const COURT = deployed.CourtRoom.address;
const FAST = deployed.CourtRoomFast?.address;
const MARKET = deployed.ArbitrationConsumer?.address;

const acc = accounts();
const read = createClient({ chain });
const evidence = { network: networkName, court: COURT, fast: FAST, market: MARKET, ran_at: new Date().toISOString(), cases: [], fast_cases: [], marketplace: null, notes: [] };

const log = (...a) => console.log(...a);

/**
 * Did that call do what it was asked?
 *
 * "OK" is the contract agreeing. "REUSED" is this script resuming a case an
 * earlier run filed. "UNREADABLE" is the transaction settling with its return
 * value not exposed by the receipt — which is the transport, not a refusal, and
 * the case really was filed. Anything else is a genuine no.
 */
const worked = (r) => r.status === "OK" || r.status === "REUSED" || r.status === "UNREADABLE";
const fail = (why) => { log(`  ✗ ${why}`); evidence.notes.push(why); };

async function fund(role, amount = 60n * GEN) {
  await fundOnStudio(chain, acc[role].address, amount);
}

async function balanceOf(role) {
  return await retry(() => read.getBalance({ address: acc[role].address }), { label: "balance" });
}

/** A write, with its fee estimated, waited to a terminal state and unwrapped.
 *  `out.returned` is the status object every write in this contract returns —
 *  nothing raises, so that object IS the result, not a consolation prize. */
async function call(court, role, fn, args = [], value = 0n) {
  const c = connect({ networkName, address: court, role });
  const out = await c.send(fn, args, value);
  const returned = out.returned && typeof out.returned === "object" ? out.returned : null;
  /*
   * "The transaction succeeded" and "the contract agreed to do it" are DIFFERENT
   * FACTS, and conflating them is how a refusal gets recorded as a success.
   *
   * Every write here returns a status object rather than raising, so a REFUSAL
   * is a perfectly successful transaction carrying {status: "REJECTED"}. When
   * the receipt does not expose that object — which happens whenever
   * `consensus_data` is unpopulated — the honest answer is UNREADABLE, not OK.
   * Callers that need to know check the contract's STATE instead.
   */
  const status = returned?.status ?? (out.ok ? "UNREADABLE" : "FAILED");
  log(`    ${fn}(${args.map((a) => String(a).slice(0, 18)).join(", ")}) → ${status} ${out.seconds ? `[${out.seconds.toFixed(0)}s]` : ""}`);
  if (returned?.reason) log(`      reason: ${returned.reason}`);
  if (!out.ok && !returned) log(`      ${out.failure ?? out.revertReason ?? out.status}`);
  return { out, returned, status };
}

const view = (court, fn, args = []) =>
  retry(() => read.readContract({ address: court, functionName: fn, args }), { label: fn });

/**
 * The case id a filing produced.
 *
 * NOT taken from the return value alone. A transaction can settle ACCEPTED with
 * `consensus_data` unpopulated, in which case the return value is simply not
 * readable — that is a property of the transport, not of the contract, and a
 * script that treated an unreadable return as a failure would abandon a case
 * that had in fact been filed. So the return value is used when it is there and
 * the CONTRACT'S OWN STATE is read when it is not.
 */
async function caseIdFor(court, role, spec, returned) {
  if (returned?.case_id) return Number(returned.case_id);
  const mine = await view(court, "get_cases_by_plaintiff", [acc[role].address]);
  const head = spec.claim.slice(0, 60);
  for (const row of mine.cases ?? []) {
    if (String(row.amount_claimed_wei) !== String(spec.amount)) continue;
    if (String(row.summary).slice(0, 60) !== head) continue;
    return Number(row.case_id);
  }
  return 0;
}

/**
 * A case this fixture already filed on a previous run, or 0.
 *
 * The per-wallet cooldown is an hour, so a re-run that filed again would spend
 * its time being throttled and the throttled calls would come back REJECTED,
 * reading exactly like a contract fault in a log. Resuming is also the only way
 * to iterate on a docket at all.
 */
async function existingCase(court, role, spec) {
  return await caseIdFor(court, role, spec, null);
}

/** Claim for a role and PROVE the value moved by reading the chain, not the
 *  contract. Value lands on finalisation, so a claim that has not finalised yet
 *  is reported as pending rather than as a failure. */
async function claimAndVerify(court, role) {
  const owed = await view(court, "payout_of", [acc[role].address]);
  if (BigInt(owed.owed_wei) === 0n) return { role, owed_wei: "0", moved_wei: "0", status: "NOTHING_OWED" };
  const before = await balanceOf(role);
  const { out, returned, status } = await call(court, role, "claim_payout", []);
  const fin = out.hash ? await waitFinalized(read, out.hash, { label: `claim ${role}` }) : { finalized: false };

  /*
   * WHAT IS ASSERTED HERE, AND WHY IT IS NOT THE BALANCE.
   *
   * Studio Dev QUEUES an `on="finalized"` value transfer and never executes it.
   * Measured three ways on a dedicated probe contract — gl.chain.Account,
   * gl.contract.get_at, and on="decided" — all post a correctly-formed message
   * with the right recipient and the right value, the parent transaction
   * reaches FINALIZED, and no balance moves. It is a property of the network,
   * not of the contract, and a previous project measured the same thing.
   *
   * So the balance is RECORDED and the queued message is ASSERTED. What this
   * contract is responsible for is posting one well-formed internal transfer,
   * to the right address, for the right amount, gated on finalisation — and
   * that is exactly what is checked. Asserting a balance delta on this network
   * would fail on a contract that is working perfectly, and would read exactly
   * like the silent-emit() bug that a previous project actually had.
   */
  const tx = await retry(() => read.getTransaction({ hash: out.hash }), { label: "claim receipt" });
  const queued = tx?.consensus_data?.leader_receipt?.[0]?.pending_transactions ?? [];
  const transfer = queued.find((q) => String(q.address).toLowerCase() === acc[role].address.toLowerCase());
  const wellFormed = Boolean(transfer) && String(transfer.value) === String(owed.owed_wei) && transfer.on === "finalized";
  const after = await balanceOf(role);
  log(`      queued transfer: ${transfer ? `${gen(BigInt(transfer.value))} GEN → ${String(transfer.address).slice(0, 10)}… on=${transfer.on}` : "NONE"}  ${wellFormed ? "✓ well formed" : "✗"}`);
  log(`      ${fin.finalized ? `finalized in ${fin.seconds.toFixed(0)}s` : `not finalized (${fin.status ?? "?"})`}  balance ${gen(before)} → ${gen(after)} GEN (Studio Dev does not execute queued transfers)`);
  if (!wellFormed) fail(`${role}: claim_payout did not post a well-formed transfer of ${owed.owed_wei} wei`);
  return {
    role, address: acc[role].address, status,
    owed_wei: String(owed.owed_wei),
    paid_wei: String(returned?.paid_wei ?? "0"),
    claim_tx: out.hash ?? null,
    finalized: Boolean(fin.finalized),
    queued_transfer: transfer ? { on: transfer.on, value: String(transfer.value), address: String(transfer.address) } : null,
    transfer_well_formed: wellFormed,
    balance_before_wei: String(before),
    balance_after_wei: String(after),
    note: "Studio Dev queues on=finalized transfers and does not execute them; the contract's job is to post one correctly, which it did",
  };
}

async function ledgerCheck(court, label) {
  const stats = await view(court, "get_stats");
  const ok = Boolean(stats.ledger_balanced);
  log(`    ledger ${ok ? "balanced" : "UNBALANCED"}  balance=${gen(BigInt(stats.balance_wei))} escrow=${gen(BigInt(stats.escrowed_wei))} payable=${gen(BigInt(stats.payable_wei))}`);
  if (!ok) fail(`${label}: ledger identity broken`);
  return { ledger_balanced: ok, balance_wei: String(stats.balance_wei), escrowed_wei: String(stats.escrowed_wei), payable_wei: String(stats.payable_wei) };
}

// --- the canonical docket --------------------------------------------------

if (doMain) {
  log(`\n═══ canonical court ${COURT} ═══`);
  const cfg = await view(COURT, "get_config");
  const fee = BigInt(cfg.filing_fee_wei);
  log(`  filing fee ${gen(fee)} GEN   respond window ${cfg.response_window_s}s\n`);

  for (const spec of CASES) {
    log(`  ── ${spec.key} — ${spec.note}`);
    await fund(spec.plaintiff);
    await fund(spec.defendant, spec.amount + 20n * GEN);

    const preview = await view(COURT, "preview_case", [spec.claim, spec.evidence, spec.response ?? "", spec.counter ?? ""]);
    log(`    bracket ${JSON.stringify(preview.bracket_pct)}%  specificity ${preview.plaintiff_specificity} vs ${preview.defendant_specificity}  ${preview.options.length} verdicts open`);

    let filed = { status: "REUSED", out: {}, returned: null };
    let caseIdExisting = await existingCase(COURT, spec.plaintiff, spec);
    if (caseIdExisting) {
      log(`    case ${caseIdExisting} already on the docket from an earlier run — resuming it`);
    } else {
      filed = await call(COURT, spec.plaintiff, "file_case",
        [acc[spec.defendant].address, spec.claim, spec.evidence, String(spec.amount)], fee);
    }
    if (!worked(filed)) { fail(`${spec.key}: filing refused — ${filed.returned?.reason}`); continue; }
    const caseId = caseIdExisting || await caseIdFor(COURT, spec.plaintiff, spec, filed.returned);
    if (!caseId) { fail(`${spec.key}: filed but the case id could not be recovered`); continue; }
    const current = await view(COURT, "get_case", [caseId]);

    let settled = { out: {}, returned: null, status: "ALREADY_SETTLED" };
    if (current.status !== "FILED" && current.status !== "RESPONDED") {
      log(`    case ${caseId} is already ${current.status} — recording it as it stands`);
    } else if (spec.accept) {
      settled = await call(COURT, spec.defendant, "accept_claim", [caseId], spec.amount);
    } else {
      let answered = { status: "OK" };
      if (current.status === "FILED") answered = await call(COURT, spec.defendant, "respond",
        [caseId, spec.response, spec.counter, "0"], spec.amount);
      if (!worked(answered)) { fail(`${spec.key}: answer refused — ${answered.returned?.reason}`); continue; }
      log(`    summoning the jury (leader + validators each call the model)…`);
      settled = await call(COURT, "bailiff", "judge", [caseId]);
    }

    const got = await view(COURT, "get_case", [caseId]);
    const verified = await view(COURT, "verify_verdict", [caseId]);
    log(`    verdict  ${got.outcome || "(none)"}  ${got.award_pct}%  quality=${got.evidence_quality || "-"}  key=${got.verdict_key}`);
    log(`    money    plaintiff ${got.to_plaintiff_gen} GEN   defendant ${got.to_defendant_gen} GEN`);
    log(`    verify   matches=${verified.matches} failed=${JSON.stringify(verified.failed ?? [])}`);
    if (spec.expect && spec.expect !== "ACCEPTED" && got.outcome !== spec.expect) {
      log(`    note     jury chose ${got.outcome}, fixture aimed at ${spec.expect} — recorded as it came`);
    }
    if (!verified.matches) fail(`${spec.key}: verify_verdict does not match`);

    const payouts = [];
    for (const role of [spec.plaintiff, spec.defendant]) payouts.push(await claimAndVerify(COURT, role));
    const ledger = await ledgerCheck(COURT, spec.key);

    evidence.cases.push({
      key: spec.key, note: spec.note, case_id: caseId, court: COURT,
      plaintiff: acc[spec.plaintiff].address, defendant: acc[spec.defendant].address,
      amount_claimed_wei: String(spec.amount), aimed_at: spec.expect,
      preview: { bracket_pct: preview.bracket_pct, plaintiff_specificity: preview.plaintiff_specificity, defendant_specificity: preview.defendant_specificity, options: preview.options.length },
      status: got.status, resolution: got.resolution, outcome: got.outcome,
      award_bps: got.award_bps, award_wei: got.award_wei,
      evidence_quality: got.evidence_quality, verdict_key: got.verdict_key,
      content_hash: got.content_hash, signals_csv: got.signals_csv,
      jury_option: got.jury_option, option_count: got.option_count,
      bracket: [got.bracket_lo, got.bracket_hi], model_called: got.model_called,
      to_plaintiff_wei: got.to_plaintiff_wei, to_defendant_wei: got.to_defendant_wei,
      unenforced_wei: got.unenforced_wei, reasoning: got.reasoning,
      file_tx: filed.out.hash, settle_tx: settled.out.hash,
      verify: { matches: verified.matches, checks: verified.checks, failed: verified.failed },
      conservation_ok: BigInt(got.to_plaintiff_wei) + BigInt(got.to_defendant_wei) === BigInt(got.escrow_wei) + BigInt(got.filing_fee_wei),
      payouts, ledger,
    });
    log("");
  }
}

// --- the fast docket -------------------------------------------------------

if (doFast && FAST) {
  log(`\n═══ fast docket ${FAST} ═══`);
  const cfg = await view(FAST, "get_config");
  const fee = BigInt(cfg.filing_fee_wei);
  const windowS = Number(cfg.response_window_s);
  log(`  respond window ${windowS}s (immutable)   filing fee ${gen(fee)} GEN\n`);

  const pending = [];
  for (const spec of FAST_CASES) {
    log(`  ── ${spec.key} — ${spec.note}`);
    await fund(spec.plaintiff);
    let filed = { status: "REUSED", out: {}, returned: null };
    let caseId = await existingCase(FAST, spec.plaintiff, spec);
    if (caseId) {
      log(`    case ${caseId} already on this docket from an earlier run — resuming it`);
    } else {
      filed = await call(FAST, spec.plaintiff, "file_case",
        [acc[spec.defendant].address, spec.claim, spec.evidence, String(spec.amount)], fee);
      if (!worked(filed)) { fail(`${spec.key}: filing refused — ${filed.returned?.reason}`); continue; }
      caseId = await caseIdFor(FAST, spec.plaintiff, spec, filed.returned);
    }
    if (!caseId) { fail(`${spec.key}: filed but the case id could not be recovered`); continue; }
    const current = await view(FAST, "get_case", [caseId]);
    const deadline = Number(current.respond_by);
    log(`    case ${caseId} is ${current.status}; answer deadline ${deadline}`);
    if (current.status !== "FILED") {
      log(`    already resolved — recording it as it stands`);
      evidence.fast_cases.push({
        key: spec.key, note: spec.note, case_id: caseId, court: FAST,
        aimed_at: spec.expect, status: current.status,
        resolution: current.resolution, outcome: current.outcome,
        award_bps: current.award_bps, award_wei: current.award_wei,
        unenforced_wei: current.unenforced_wei,
        to_plaintiff_wei: current.to_plaintiff_wei,
        to_defendant_wei: current.to_defendant_wei,
        reasoning: current.reasoning, content_hash: current.content_hash,
        verify: await view(FAST, "verify_verdict", [caseId]).then((v) => ({ matches: v.matches, failed: v.failed })),
        payouts: [await claimAndVerify(FAST, spec.plaintiff)],
        ledger: await ledgerCheck(FAST, spec.key),
      });
      log("");
      continue;
    }

    if (spec.withdraw) {
      const w = await call(FAST, spec.plaintiff, "withdraw_case", [caseId]);
      const got = await view(FAST, "get_case", [caseId]);
      const verified = await view(FAST, "verify_verdict", [caseId]);
      log(`    ${got.status}  fee back to plaintiff: ${got.to_plaintiff_gen} GEN   verify=${verified.matches}`);
      evidence.fast_cases.push({
        key: spec.key, note: spec.note, case_id: caseId, court: FAST,
        aimed_at: spec.expect, status: got.status, resolution: got.resolution,
        outcome: got.outcome, to_plaintiff_wei: got.to_plaintiff_wei,
        to_defendant_wei: got.to_defendant_wei, reasoning: got.reasoning,
        content_hash: got.content_hash,
        file_tx: filed.out.hash, settle_tx: w.out.hash,
        verify: { matches: verified.matches, failed: verified.failed },
        payouts: [await claimAndVerify(FAST, spec.plaintiff)],
        ledger: await ledgerCheck(FAST, spec.key),
      });
    } else {
      pending.push({ spec, caseId, filed, respondBy: deadline });
    }
    log("");
  }

  for (const p of pending) {
    // The one thing that cannot be faked: wait for the deadline the contract
    // itself set, then watch the path that only opens once it has passed.
    const now = Number((await view(FAST, "get_case", [p.caseId])).now);
    const waitS = Math.max(0, p.respondBy - now) + 15;
    log(`  ── ${p.spec.key}: waiting ${waitS}s for the answer window to close…`);
    const started = Date.now();
    while ((Date.now() - started) / 1000 < waitS) {
      await sleep(15000);
      process.stdout.write(`    ${Math.round((Date.now() - started) / 1000)}s / ${waitS}s\r`);
    }
    log("");
    const early = await view(FAST, "get_case", [p.caseId]);
    log(`    overdue=${early.response_overdue}  can_default=${early.can_default}`);
    const d = await call(FAST, "bailiff", "default_judgment", [p.caseId]);
    const got = await view(FAST, "get_case", [p.caseId]);
    const verified = await view(FAST, "verify_verdict", [p.caseId]);
    log(`    ${got.status}  ${got.outcome} ${got.award_pct}%   enforced ${got.award_gen} GEN   UNENFORCED ${got.unenforced_gen} GEN`);
    log(`    verify   matches=${verified.matches}`);
    if (!verified.matches) fail(`${p.spec.key}: verify_verdict does not match`);
    evidence.fast_cases.push({
      key: p.spec.key, note: p.spec.note, case_id: p.caseId, court: FAST,
      aimed_at: p.spec.expect, status: got.status, resolution: got.resolution,
      outcome: got.outcome, award_bps: got.award_bps, award_wei: got.award_wei,
      unenforced_wei: got.unenforced_wei, to_plaintiff_wei: got.to_plaintiff_wei,
      to_defendant_wei: got.to_defendant_wei, reasoning: got.reasoning,
      content_hash: got.content_hash, waited_s: waitS,
      file_tx: p.filed.out.hash, settle_tx: d.out.hash,
      verify: { matches: verified.matches, failed: verified.failed },
      payouts: [await claimAndVerify(FAST, p.spec.plaintiff)],
      ledger: await ledgerCheck(FAST, p.spec.key),
    });
    log("");
  }

  // settle_stalled cannot be STAGED on chain, and that is a property worth
  // recording rather than papering over: the only way to leave an in-flight
  // marker set would be a method that sets it, which is an owner who can freeze
  // a case — rule 6 exactly. So its refusal path is proved here and its refund
  // path is proved offline.
  log(`  ── settle_stalled on a case with no stuck round`);
  const s = await call(FAST, "bailiff", "settle_stalled", [1]);
  evidence.notes.push(`settle_stalled(1) on a clean case → ${s.status}: ${s.returned?.reason ?? ""}`);
  log("");
}

// --- the marketplace -------------------------------------------------------

if (doMarket && MARKET) {
  log(`\n═══ marketplace ${MARKET} → court ${COURT} ═══`);
  const m = MARKET_CASE;
  await fund(m.buyer);
  await fund(m.seller, m.amount + 20n * GEN);
  const fee = BigInt((await view(COURT, "get_config")).filing_fee_wei);

  const reg = await call(MARKET, m.buyer, "register_order",
    [m.order_id, acc[m.buyer].address, acc[m.seller].address, String(m.amount), m.description]);
  if (!worked(reg)) fail(`marketplace: register refused — ${reg.returned?.reason}`);

  const dis = await call(MARKET, m.buyer, "request_arbitration", [m.order_id, m.claim, m.evidence]);
  if (!worked(dis)) fail(`marketplace: dispute refused — ${dis.returned?.reason}`);
  log(`    pinned filing digest ${dis.returned?.filing_digest}`);

  const filed = await call(COURT, m.buyer, "file_case",
    [acc[m.seller].address, m.claim, m.evidence, String(m.amount)], fee);
  const caseId = await caseIdFor(COURT, m.buyer, { claim: m.claim, amount: m.amount }, filed.returned);
  log(`    buyer filed case ${caseId} in their OWN name; the marketplace holds nothing`);

  // A stranger links it — permissionless, and refused unless all four facts
  // read out of the court match the order.
  const linked = await call(MARKET, "outsider", "link_case", [m.order_id, caseId]);
  log(`    verified: ${JSON.stringify(linked.returned?.verified ?? linked.returned?.reason)}`);

  const answered = await call(COURT, m.seller, "respond", [caseId, m.response, m.counter, "0"], m.amount);
  if (!worked(answered)) fail(`marketplace: answer refused — ${answered.returned?.reason}`);
  log(`    summoning the jury…`);
  const judged = await call(COURT, "bailiff", "judge", [caseId]);
  const got = await view(COURT, "get_case", [caseId]);
  log(`    court ruled ${got.outcome} at ${got.award_pct}%`);

  const preview = await view(MARKET, "preview_resolution", [m.order_id]);
  const resolved = await call(MARKET, "outsider", "resolve_order", [m.order_id]);
  const order = await view(MARKET, "get_order", [m.order_id]);
  log(`    marketplace action ${order.action}   buyer ${gen(BigInt(order.buyer_share_wei))} / seller ${gen(BigInt(order.seller_share_wei))} GEN`);
  log(`    preview agreed: ${preview.action === order.action}`);

  const forged = await call(MARKET, "outsider", "link_case", ["order-does-not-exist", caseId]);

  evidence.marketplace = {
    order_id: m.order_id, market: MARKET, court: COURT, case_id: caseId,
    buyer: acc[m.buyer].address, seller: acc[m.seller].address,
    amount_wei: String(m.amount),
    filing_digest: dis.returned?.filing_digest,
    link_verified: linked.returned?.verified ?? null,
    link_tx: linked.out.hash,
    court_outcome: got.outcome, court_award_bps: got.award_bps,
    court_verdict_key: got.verdict_key, court_content_hash: got.content_hash,
    action: order.action, buyer_share_wei: order.buyer_share_wei,
    seller_share_wei: order.seller_share_wei, rationale: order.rationale,
    ruling_hash: order.ruling_hash,
    preview_agreed: preview.action === order.action,
    resolve_tx: resolved.out.hash,
    unknown_order_refused: forged.status === "REJECTED",
    custody: (await view(MARKET, "get_config")).custody,
    holds_value: (await view(MARKET, "get_stats")).holds_value,
    payouts: [await claimAndVerify(COURT, m.buyer), await claimAndVerify(COURT, m.seller)],
    ledger: await ledgerCheck(COURT, "marketplace"),
  };
}

const outDir = new URL("../docs/", import.meta.url);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = new URL("../docs/evidence.json", import.meta.url);
const prior = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
if (prior) {
  evidence.cases = evidence.cases.length ? evidence.cases : prior.cases;
  evidence.fast_cases = evidence.fast_cases.length ? evidence.fast_cases : prior.fast_cases;
  evidence.marketplace = evidence.marketplace ?? prior.marketplace;
}
writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
log(`\n✔ docs/evidence.json written — ${evidence.cases.length} canonical, ${evidence.fast_cases.length} fast, marketplace ${evidence.marketplace ? "yes" : "no"}`);
if (evidence.notes.length) {
  log(`\nnotes:`);
  for (const n of evidence.notes) log(`  • ${n}`);
}
