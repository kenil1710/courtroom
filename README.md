# CourtRoom

An on-chain small claims court, built as a GenLayer intelligent contract.

Two parties put their case on the record. Validators read both filings, judge
them independently, and have to agree before anything counts. The contract
divides the money the moment they do — no release step, no discretion, and
nobody to appeal to for a different answer.

**[courtroom-nine.vercel.app](https://courtroom-nine.vercel.app)** — live on
GenLayer Studio Dev. Testnet only: the GEN here is worth nothing and so is a
judgment from it.

| | |
|---|---|
| CourtRoom | [`0xB5380363256f78Bc1612b468513A989545d18898`](https://explorer-studio-dev.genlayer.com/address/0xB5380363256f78Bc1612b468513A989545d18898) |
| CourtRoom, 5-minute deadlines (demo) | [`0x727EDf834FAdD7aA5763cfBB526925535541370a`](https://explorer-studio-dev.genlayer.com/address/0x727EDf834FAdD7aA5763cfBB526925535541370a) |
| ArbitrationConsumer | [`0x04605aCDB814715E1c39FCdcee52FdDbc57F9027`](https://explorer-studio-dev.genlayer.com/address/0x04605aCDB814715E1c39FCdcee52FdDbc57F9027) |

---

## How a case runs

```
file_case ──48h──> respond ──> judge ──> SETTLED
    │                 │          │
    │                 │          └─ validators agree, or nothing is stored
    │                 └─ accept_claim ──> SETTLED (no jury needed)
    ├─ no answer in 48h ──> default_judgment ──> DEFAULTED
    └─ withdraw_case ──> WITHDRAWN
                       jury round stuck 48h ──> settle_stalled ──> STALLED
```

A plaintiff posts a 0.1 GEN filing fee, which is a **bond, not a charge**: it
comes back on every outcome except a defendant win, where it goes to them. The
contract keeps nothing — there is no withdraw method for the owner at all.

A defendant bonds the **full amount claimed** to answer. The brief asked only
for their counter-offer to be bonded; that is not enough, because a bond
covering only what the defendant already agrees to cannot pay a verdict they
disagree with. Anything the jury does not award comes straight back.

## What the validators actually agree on

The leader's entire freedom is **one integer**.

The court first scores both filings on how *checkable* they are — dates, figures,
documentary references, substance — which is pure arithmetic over text that is
already on chain. That score fixes a **window** of at most three rungs on a
nine-rung ladder. The jury is then handed a numbered list of the verdicts that
window permits and answers with a single digit.

```
deterministic, from the filings              the jury's one choice
─────────────────────────────────            ─────────────────────
signal vector (15 integers)
specificity gap                    ──────>   a window of ≤3 rungs
dismissibility                                        │
content hash                                 option index 0..8
facts hash                                            │
                                   <──────   award, outcome, evidence finding,
                                             reasoning, settlement, verdict key
```

So a leader cannot express an award the evidence does not permit — not "will be
caught trying", *cannot express it*, because all it returns is a list index and
the list was built from the evidence.

Validators compare the key the brief specifies,
`outcome|award_bps|evidence_quality`, **and twelve more fields**: the option
index behind it, the option count, the full signal vector, the bracket, the hash
of the filings each node read, the content hash, the settlement split down to
the wei, and the written judgment itself.

The written judgment is **composed from the agreed vector**, not written by the
model. Two nodes asked for prose produce two paragraphs, and a stored paragraph
nobody compared is a stored value the leader forged. `verify_verdict` re-derives
it character for character, years later, from storage alone.

## What it will not do

- The owner can pause new filings and change the fee for future cases. That is
  the whole list. No method touches a case, an escrow, a verdict, a payout, a
  deadline, or a defendant's right to answer.
- Deadlines are fixed at deploy and immutable. The audit walks the AST to prove
  no method assigns them.
- A decided case is frozen. No second jury, no late answer, no appeal.
- The fee on a case is snapshotted at filing, so raising it tomorrow cannot
  restate the price of a case filed today.
- A default judgment records a full win **on the merits** and zero enforced,
  because the defendant posted no bond and the court is holding nothing to pay
  from. The claim is recorded as unenforceable by name rather than dressed up as
  a payment.
- A dismissal is not a defendant win. "Neither side proved anything" is a
  different statement, and the win-rate statistics exclude it.

## Verify any verdict yourself

`verify_verdict(case_id)` recomputes the outcome, the percentage, the evidence
finding, the settlement split, the content hash and the written judgment from
the filings as stored, and reports each check. Everything but the jury's single
choice is pure arithmetic over immutable on-chain text; the choice itself is
checked the only way it can be — that it was inside the window the evidence
permitted.

There is a button for it on every decided case.

## Repository

```
contracts/CourtRoom.py             the court           (nine rules at the top)
contracts/ArbitrationConsumer.py   a marketplace that defers to it
contracts/NOTES.md                 why it is built this way, and what bit us
test/test_logic.py                 644 offline tests — no chain, network or model
test/seed.mjs                      creates the demo docket on Studio Dev
test/audit_chain.mjs               35 assertions against the LIVE contracts
tools/audit.sh                     47 checks, one per past rejection
tools/custody_scan.py              follows gl.message.value into storage
frontend/                          Next.js 16, six pages
docs/EVIDENCE.md                   what the live run actually produced
```

## Running it

```bash
python3 test/test_logic.py         # 644 tests, stdlib only, ~1s
./tools/audit.sh                   # static + offline
./tools/audit.sh --chain           # also asserts the live deploy

cd test && npm install
node accounts.mjs                  # a pool of signing keys
node deploy.mjs                    # deploy CourtRoom
node deploy.mjs --consumer --at=0x…
node seed.mjs --all                # file, answer, judge, settle, record

cd frontend && npm install && npm run dev
```

## Things that cost a day each

The long list is in `contracts/NOTES.md`. The three worth knowing before you
write any GenLayer contract:

1. **The runner header is exactly two lines.** A stray comment between line 1
   and the imports makes the contract undeployable and reports only
   `invalid_contract`. Lint does not catch it.
2. **A payable method that raises keeps the caller's money.** A revert rolls
   back storage, not the incoming value. Here *no* public write raises — the
   rule is generalised past payable methods because the version nobody looks for
   is value arriving at a method that was never meant to receive any.
3. **`Proxy.emit(value=…)` posts no message at all.** It returns a method
   getter, so the call constructs an object and drops it. Every payout looks
   perfect and not one wei moves. Only comparing real balances catches it.

And one that is not a contract bug at all: **Studio Dev queues
`on="finalized"` value transfers and never executes them.** Measured three ways
on a probe contract. `get_stats` publishes the contract's real chain balance
beside its own books and names the gap `undelivered_wei`, rather than leaving
someone to find it by subtracting.
