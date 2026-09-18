# Evidence

Everything below was produced by `node test/seed.mjs --all` against the live
contracts on GenLayer Studio Dev, and re-read from chain by
`node test/audit_chain.mjs`. Nothing here is asserted by the demo: every
verdict is whatever the jury actually returned inside the window the evidence
permitted, and each fixture records what it *aimed* at separately so the two
can be compared. A demo that asserted its own verdicts would be a demo of
nothing.

Regenerate with `python3 tools/make_evidence.py`.

## Contracts

| | address |
|---|---|
| CourtRoom — 48-hour windows | `0xB5380363256f78Bc1612b468513A989545d18898` |
| CourtRoom — 5-minute windows, demo only | `0x727EDf834FAdD7aA5763cfBB526925535541370a` |
| ArbitrationConsumer | `0x04605aCDB814715E1c39FCdcee52FdDbc57F9027` |

Explorer: https://explorer-studio-dev.genlayer.com

## The canonical docket

| # | dispute | aimed at | what happened | award | window the evidence allowed | the jury's choice | re-derives |
|---|---|---|---|---|---|---|---|
| 1 | unfinished-website | PLAINTIFF_WINS | **PLAINTIFF_WINS** (verdict) | 100% (2.5 GEN) | 75–100% | 3 of 3 | yes |
| 2 | laptop-delivered | DEFENDANT_WINS | **DEFENDANT_WINS** (verdict) | 0% (0 GEN) | 0–10% | 1 of 4 | yes |
| 3 | kitchen-fitting | PARTIAL | **PARTIAL** (verdict) | 35% (1.4 GEN) | 25–50% | 3 of 8 | yes |
| 4 | verbal-loan | DISMISSED | **DISMISSED** (verdict) | 0% (0 GEN) | 0–0% | 1 of 2 | yes |
| 5 | conceded-deposit | ACCEPTED | **PLAINTIFF_WINS** (accepted) | 100% (0.6 GEN) | 75–100% | no jury sat | yes |

Every aimed-at outcome was reached, including the two that go against the
plaintiff. Case 5 was conceded by the defendant before any jury sat, which is
why it has a full award and no jury choice.

## The demo docket — the paths that only open once a deadline passes

| # | what | status | enforced | unenforceable | re-derives |
|---|---|---|---|---|---|
| 1 | silent-defendant | DEFAULTED | 0 GEN | 1.5 GEN | yes |
| 2 | withdrawn-claim | WITHDRAWN | 0 GEN | 0 GEN | yes |

The default judgment is the honest one: a full win **on the merits**, zero
enforced, and the whole claim recorded as unenforceable because the defendant
posted no bond. It was entered after waiting out the real deadline, on chain.

`settle_stalled` cannot be staged — see `contracts/NOTES.md` §5 for why that is
a property of the design rather than a gap. Its refusal path runs on chain and
its refund path is proved in the offline suite.

## The marketplace, end to end

Order `order-2026-0914` for 1.8 GEN, buyer `0x7C36b556…`
against seller `0xCA9c7e30…`.

1. `register_order` — the marketplace records the order. It takes no custody.
2. `request_arbitration` — the dispute opens and the allegation is **pinned** by hash.
3. The **buyer** files case 6 at CourtRoom in their own name, so the court pays them directly.
4. `link_case` — called by a stranger, and accepted only because four facts read
   back out of the court matched the order: plaintiff is the buyer, defendant is
   the seller, the amount matches, and the stored filing hashes to the pinned digest.
5. The seller answers, the jury sits, and the court rules **PLAINTIFF_WINS** at 100%.
6. `resolve_order` — the marketplace applies **REFUND_BUYER**: 1.8 GEN
   to the buyer and 0 GEN to the seller.

`preview_resolution` agreed with what the write did: True. The
marketplace declares `custody: False` and its on-chain balance is zero.

## Payouts

Every `claim_payout` posted a correctly-formed internal transfer — right
recipient, right amount, gated on finalisation — and the parent transaction
finalised. **Studio Dev queues those transfers and does not execute them.** That
was measured three ways on a purpose-built probe contract; see
`contracts/NOTES.md` §3c. What is asserted here is what the contract is
responsible for: posting one well-formed transfer to the right party.

| case | to | amount | transfer well formed | parent finalised |
|---|---|---|---|---|
| 1 | plaintiff1 | 2.6 GEN | yes | yes |
| 2 | defendant2 | 1.3 GEN | yes | yes |
| 3 | plaintiff3 | 1.5 GEN | yes | yes |
| 3 | defendant3 | 2.6 GEN | yes | yes |
| 4 | plaintiff4 | 0.1 GEN | yes | yes |
| 4 | defendant4 | 0.8 GEN | yes | yes |
| 5 | plaintiff5 | 0.7 GEN | yes | yes |
| 2 | plaintiff2 | 0.1 GEN | yes | yes |
| 1 | plaintiff1 | 0.1 GEN | yes | yes |

## Notes from the run

- settle_stalled(1) on a clean case → OK: 

A refusal is a perfectly successful transaction carrying
`{"status": "REJECTED"}`, and when the receipt does not expose that object the
seed records `UNREADABLE` rather than `OK` — conflating the two is how a
refusal gets written down as a success. `test/audit_chain.mjs` asserts the
state those calls left behind instead.
