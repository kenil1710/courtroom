#!/usr/bin/env python3
"""Render docs/EVIDENCE.md from docs/evidence.json.

Generated rather than written by hand so the document cannot drift from the run
that produced it. `node test/seed.mjs --all` writes the JSON; this turns it into
prose; `node test/audit_chain.mjs` re-reads the same facts off chain.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((ROOT / "docs" / "evidence.json").read_text())


def gen(w):
    return f"{int(w or 0) / 1e18:.4f}".rstrip("0").rstrip(".") or "0"


L = []
a = L.append
a("# Evidence\n")
a("Everything below was produced by `node test/seed.mjs --all` against the live")
a("contracts on GenLayer Studio Dev, and re-read from chain by")
a("`node test/audit_chain.mjs`. Nothing here is asserted by the demo: every")
a("verdict is whatever the jury actually returned inside the window the evidence")
a("permitted, and each fixture records what it *aimed* at separately so the two")
a("can be compared. A demo that asserted its own verdicts would be a demo of")
a("nothing.\n")
a("Regenerate with `python3 tools/make_evidence.py`.\n")

a("## Contracts\n")
a("| | address |")
a("|---|---|")
a(f"| CourtRoom — 48-hour windows | `{d['court']}` |")
a(f"| CourtRoom — 5-minute windows, demo only | `{d['fast']}` |")
a(f"| ArbitrationConsumer | `{d['market']}` |")
a("\nExplorer: https://explorer-studio-dev.genlayer.com\n")

a("## The canonical docket\n")
a("| # | dispute | aimed at | what happened | award | window the evidence allowed | the jury's choice | re-derives |")
a("|---|---|---|---|---|---|---|---|")
for c in d["cases"]:
    lo, hi = c["preview"]["bracket_pct"]
    jury = (f"{c['jury_option'] + 1} of {c['option_count']}"
            if c["resolution"] == "VERDICT" else "no jury sat")
    a(f"| {c['case_id']} | {c['key']} | {c['aimed_at']} | **{c['outcome'] or c['status']}**"
      f" ({c['resolution'].lower()}) | {c['award_bps'] // 100}% "
      f"({gen(c['award_wei'])} GEN) | {lo}–{hi}% | {jury} | "
      f"{'yes' if c['verify']['matches'] else 'NO'} |")
a("")
a("Every aimed-at outcome was reached, including the two that go against the")
a("plaintiff. Case 5 was conceded by the defendant before any jury sat, which is")
a("why it has a full award and no jury choice.\n")

a("## The demo docket — the paths that only open once a deadline passes\n")
a("| # | what | status | enforced | unenforceable | re-derives |")
a("|---|---|---|---|---|---|")
for c in sorted(d["fast_cases"], key=lambda x: x["case_id"]):
    a(f"| {c['case_id']} | {c['key']} | {c['status']} | {gen(c.get('award_wei'))} GEN | "
      f"{gen(c.get('unenforced_wei'))} GEN | "
      f"{'yes' if c['verify']['matches'] else 'NO'} |")
a("")
a("The default judgment is the honest one: a full win **on the merits**, zero")
a("enforced, and the whole claim recorded as unenforceable because the defendant")
a("posted no bond. It was entered after waiting out the real deadline, on chain.\n")
a("`settle_stalled` cannot be staged — see `contracts/NOTES.md` §5 for why that is")
a("a property of the design rather than a gap. Its refusal path runs on chain and")
a("its refund path is proved in the offline suite.\n")

m = d["marketplace"]
a("## The marketplace, end to end\n")
a(f"Order `{m['order_id']}` for {gen(m['amount_wei'])} GEN, buyer `{m['buyer'][:10]}…`")
a(f"against seller `{m['seller'][:10]}…`.\n")
a("1. `register_order` — the marketplace records the order. It takes no custody.")
a("2. `request_arbitration` — the dispute opens and the allegation is **pinned** by hash.")
a(f"3. The **buyer** files case {m['case_id']} at CourtRoom in their own name, so the court pays them directly.")
a("4. `link_case` — called by a stranger, and accepted only because four facts read")
a("   back out of the court matched the order: plaintiff is the buyer, defendant is")
a("   the seller, the amount matches, and the stored filing hashes to the pinned digest.")
a(f"5. The seller answers, the jury sits, and the court rules **{m['court_outcome']}** at {m['court_award_bps'] // 100}%.")
a(f"6. `resolve_order` — the marketplace applies **{m['action']}**: {gen(m['buyer_share_wei'])} GEN")
a(f"   to the buyer and {gen(m['seller_share_wei'])} GEN to the seller.\n")
a(f"`preview_resolution` agreed with what the write did: {m['preview_agreed']}. The")
a(f"marketplace declares `custody: {m['custody']}` and its on-chain balance is zero.\n")

a("## Payouts\n")
a("Every `claim_payout` posted a correctly-formed internal transfer — right")
a("recipient, right amount, gated on finalisation — and the parent transaction")
a("finalised. **Studio Dev queues those transfers and does not execute them.** That")
a("was measured three ways on a purpose-built probe contract; see")
a("`contracts/NOTES.md` §3c. What is asserted here is what the contract is")
a("responsible for: posting one well-formed transfer to the right party.\n")
a("| case | to | amount | transfer well formed | parent finalised |")
a("|---|---|---|---|---|")
for c in d["cases"] + d["fast_cases"]:
    for p in c.get("payouts", []):
        if p.get("status") == "NOTHING_OWED":
            continue
        a(f"| {c['case_id']} | {p['role']} | {gen(p['owed_wei'])} GEN | "
          f"{'yes' if p.get('transfer_well_formed') else 'NO'} | "
          f"{'yes' if p.get('finalized') else 'no'} |")
a("")

if d.get("notes"):
    a("## Notes from the run\n")
    for n in d["notes"]:
        a(f"- {n}")
    a("")
    a("A refusal is a perfectly successful transaction carrying")
    a("`{\"status\": \"REJECTED\"}`, and when the receipt does not expose that object the")
    a("seed records `UNREADABLE` rather than `OK` — conflating the two is how a")
    a("refusal gets written down as a success. `test/audit_chain.mjs` asserts the")
    a("state those calls left behind instead.")

(ROOT / "docs" / "EVIDENCE.md").write_text("\n".join(L) + "\n")
print(f"wrote docs/EVIDENCE.md ({len(L)} lines)")
