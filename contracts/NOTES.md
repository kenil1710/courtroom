# Design notes and hazards

Why CourtRoom is built the way it is. The short version is at the top of
`CourtRoom.py` as nine numbered rules; this is the reasoning behind them, plus
the things that are easy to get wrong and expensive to discover.

§2 is the heart of the design. §3b is the newest and was the most surprising:
a bug that every test passed through because it was in the *shape* of the value
accounting rather than in any one path.

Live state: `docs/evidence.json`. Executable form of all of this:
`tools/audit.sh`.

---

## 1. What the court is holding, and why it can always give it back

The ledger identity, asserted after every single operation in the offline suite
and read live on chain by `get_stats`:

```
balance_wei == escrowed_wei + payable_wei
```

Everything this contract holds is either **escrow attached to a live case** or a
**payout somebody can claim**. There is no third bucket, and there is no
protocol revenue at all: the filing fee is a bond that always ends with one of
the two parties, so the owner has no withdraw method — not a gated one, none.

`tools/custody_scan.py` proves the static half by following `gl.message.value`
into storage and asking which fields an ungated public write actually pays out
of. It reports `balance_wei`, `escrowed_wei`, `payable_wei` and `payout_wei`,
and `payout_wei` — the only per-party balance — is drained by `claim_payout`,
which anybody may call and `paused` does not gate.

### The value accounting, and the bug that was in its shape

Value becomes the sender's in exactly one place (`_bank`) and stops being theirs
in exactly one place (`_take`). That is not stylistic. The first version banked
the deposit in `_bank` and credited a refund in `_refuse`, which reads correctly
line by line and **double-credits any value attached to a method that refuses**.
A stranger sending 1 GEN to a `set_paused` call that refuses them came away owed
2. The offline suite caught it; no individual method looked wrong.

The fix was not another check. It was that there is now one place value arrives
and one place it leaves, so a double credit is not expressible:

```
_bank()                 → the whole deposit is the sender's, immediately
_take(sender, fee)      → the fee moves into escrow
_refuse(...)            → credits NOTHING; refusing just means never calling _take
```

Overpayment then needs no code at all. It stays the sender's because it was
never taken.

## 2. What consensus binds

**Every stored value**, because a field the validators did not compare is a
field the leader can forge.

The mechanism is narrower than "compare more fields". The leader's entire
freedom is **one integer**: an index into a list of verdicts the contract itself
built. Everything else is a pure function of that index and of text that was
already on chain before the round opened.

```
  deterministic, from the filings          the jury's one choice
  ───────────────────────────────          ─────────────────────
  signal vector  (15 integers)
  specificity gap                     →    a WINDOW of ≤3 rungs
  dismissibility                                  ↓
  content hash                             option index 0..8
  facts hash                                      ↓
                                      →    award, outcome, quality, reasoning,
                                           settlement split, verdict key
```

So a leader cannot express an award the evidence does not permit. Not "will be
caught if it tries" — cannot express it, because the only thing it returns is a
list index and the list was built from the evidence.

`_coherent` re-derives the whole verdict from that index and demands every other
field in the payload match, **before** a validator spends its own model call.
`_agrees` then compares the key the brief specifies —
`outcome|award_bps|evidence_quality` — plus the option index behind it, the
option count, the full signal vector, the bracket, the hash of the filings each
node read, the content hash, the settlement down to the wei, and the written
reasoning.

`TestCoherence.test_every_payload_field_has_a_forgery_test` enumerates the
payload and fails if a key is not covered by a forgery test. Twenty-odd tests
build a tampered payload each and require it refused.

### Why the reasoning is composed, not written

Two nodes asked for prose produce two paragraphs. A stored paragraph the
validators never compared is a stored value the leader forged — the exact
rejection this design exists to prevent. So `_reason` composes the judgment from
the agreed vector.

It is not a template with numbers swapped. Every clause states the measured
reason this case came out as it did, and because it is a pure function,
`verify_verdict` re-derives it years later and compares character for character.

### Why the tolerance is in the ladder, never in the comparison

An award is one of nine rungs, each a multiple of 500 bps. Two jurors who feel
differently by a few percent return the same rung. A tolerance in the comparison
instead would mean two accepted verdicts for one case could differ — and then
which one is the judgment?

### What the deterministic half actually measures

Substantiation, not truth. A filing citing dates, figures and documents can be
checked; one citing nothing is an assertion. That difference bounds how far the
jury may move the money. It is not itself the verdict, and the contract does not
pretend it is.

`"may"` is deliberately absent from `MONTHS`. It is a month and the commonest
modal verb in English, and counting it as a cited date would hand a wider
bracket to whoever wrote the more hedging filing.

## 3. Money

**Rule: no public write ever raises.** Not the payable ones, not the owner ones.
A revert rolls back storage but not the value that came with the call, which
then sits in the contract unaccounted for. Generalising the rule from "payable
methods" to "all of them" costs nothing and removes the version nobody looks
for: value arriving at a method that was never supposed to receive any. Two AST
tests and two audit checks keep it true, including for the private helpers a
write calls.

**Rule: no counter moves before a path that can still refuse.**
`TestNoCounterMovesBeforeARefusal` snapshots eight counters and asserts that six
kinds of filing refusal, a pause, a cooldown, and refusals in `respond`, `judge`
and `accept_claim` move **none** of them. `total_rejected` is the one exception,
because it is a statistic about refusals.

**Rule: the fee is snapshotted at filing.** An owner who raises the bond
tomorrow cannot restate the price of a case already on the docket.

**Rule: every exit conserves.** `to_plaintiff + to_defendant == escrow + fee`,
exactly, on every terminal path, proved over the whole cross product of ladder
rung, outcome and a spread of awkward amounts. Where a wei cannot be split
evenly it goes to the party the court is **not** finding against.

**Rule: the owner cannot freeze user money.** `claim_payout`, `settle_stalled`,
`judge`, `respond` and `default_judgment` are all ungated on `paused`. Pause
stops new filings and does nothing else. An owner who could strand an escrow
could extort a party, which is worse than forging a verdict because it needs no
jury at all.

### 3a. The bond is the full claim, not the counter-offer

The brief asked for the defendant to bond at least their counter-offer. That is
not enough, and the contract does more.

A bond covering only what the defendant already agrees to is a bond that cannot
pay a verdict they disagree with. A court whose judgments are enforceable only
when the loser consented is not a court. So `respond` requires the full amount
claimed — which satisfies the brief's requirement a fortiori, since the
counter-offer is capped at the claim — and `counter_amount_wei` is recorded as
the defendant's position and put in front of the jury instead.

Anything the jury does not award comes straight back, so bonding costs an honest
defendant nothing.

### 3b. A default judgment is a ruling, not a payment

The defendant never posted a bond, so the court is holding nothing to pay the
award from. It would have been easy to record a 100% award and let a reader
assume money moved.

Instead: the merits are recorded in full (`award_bps == 10000`), the enforceable
amount is `0`, and the claim is recorded in `unenforced_wei` by name. The
interface says the same thing in words. Issuing a receipt for money that never
existed would be the dishonest option, and it is the one that looks better.

### 3c. Payouts are pulled, and on this network they are queued

`_settle` assigns the money with no discretion and no delay. `claim_payout` is
the withdrawal — one message, one recipient, which is the shape that has been
proved to work. A settlement that pushed to both parties inside a transaction
that had just run a consensus round would post two internal messages, and a fee
allocation that does not name the right recipient fails *inside* the transaction
with `fee no_matching_allocation`, which reads like a contract fault and is not
one.

**Studio Dev queues an `on="finalized"` value transfer and never executes it.**
Measured three ways on a purpose-built probe contract —
`gl.chain.Account(...).emit_transfer`, `gl.contract.get_at(...).emit_transfer`,
and the same again with `on="decided"`. All three post a correctly-formed
message with the right recipient and the right value, the parent transaction
reaches FINALIZED, and no balance moves. `waitForFinalization` and a long wait
change nothing. A previous project measured the same thing independently.

It is a property of the network, not of the contract, and it is reported rather
than hidden: `get_stats` publishes the contract's real chain balance beside its
own books and names the gap `undelivered_wei`. On a network that delivers, that
number stays at zero.

`on="finalized"` is kept because it is also correct: a payout applied at
acceptance would already have happened if the authorising transaction were later
appealed away.

**Hazard: the payout spelling is silent when wrong.** `Proxy.emit()` returns a
method *getter*, so `x.emit(value=…)` with nothing after it constructs an object
and drops it, posting no message. On an earlier project every refund looked
perfect — ACCEPTED, ledger zeroed, `{"status": "OK"}` — and not one wei moved.
Only a balance comparison catches it. `gl.chain.Account` is the wrapper the SDK
documents for any account including an EOA, and it is what `_pay` uses; the
audit asserts there is exactly one `emit_transfer` call and that only
`claim_payout` reaches it.

## 4. Deadlines: fixed at deploy, immutable afterwards

`response_window_s` and `stall_ttl_s` are constructor arguments with no setter,
and the audit walks the AST to prove no method assigns them.

They are arguments rather than module constants for one reason:
`default_judgment` and `settle_stalled` cannot be **demonstrated** on a 48-hour
deadline, only asserted offline, and a payment path nobody has watched execute
is a payment path nobody has tested. A second instance with five-minute windows
makes the default path observable, and it was: `docs/evidence.json` records a
real default judgment entered on chain after a real wait.

The thing worth guarding against was never the value — it was an owner who could
**retune** it, timing an expiry onto a defendant they disliked. A value fixed
before any case exists, unchangeable for ever, and published by `get_config` to
anyone who asks cannot do that.

## 5. The stuck round that cannot be staged

`settle_stalled` clears an in-flight marker that outlived its round and refunds
both sides in full. It is permissionless and works while paused, because an
owner who could keep an escrow locked by declining to unstick it would be an
owner who can extort a party.

It **cannot be demonstrated on demand**, and that is a property worth stating
rather than working around. The marker is only set inside `judge`, and a
consensus round that never settles rolls back the whole transaction including
the marker. The only way to leave one set deliberately would be a method that
sets it — which is an owner who can freeze a case, which is rule 6 exactly.

So the refund path is proved in the offline suite by setting the marker through
the storage stub, and the refusal path is exercised on chain. A recovery method
you can only test by breaking a node is still worth having.

## 6. Immutability of the record

A filing is written once. `file_case` writes the plaintiff's two texts,
`respond` writes the defendant's two, and an AST test proves nothing else
assigns any of them — which is what makes `content_hash` a commitment rather
than a hash of whatever a document happens to say today. There is no later
version to disagree about, which is the difference between hashing on-chain text
and hashing a URL.

A case at a terminal status is frozen by one gate, `_open_case`. No second jury,
no late answer, no owner. `TestCaseIsFrozenAfterATerminalStatus` builds one
court per terminal status and fires every mutating method at each, asserting the
case comes back byte-identical and the ledger still balances.

## 7. ArbitrationConsumer holds nothing, deliberately

The obvious design has `request_arbitration` take the filing fee, forward it,
and file in the marketplace's name. Two things go wrong.

First, a cross-contract write posts an internal message applied on finalisation
and **returns nothing** — so the marketplace would file a case and have no way
to learn the case id it had just created.

Second, and worse: a case filed in the marketplace's name pays out to the
marketplace. The buyer's award lands in a contract that then needs its own
custody ledger and its own correctness. That is the shape that shipped broken
before.

So the buyer files in their own name and is paid directly, and what is left is
strictly stronger than fire-and-forget: `request_arbitration` **pins the
allegation** by hashing the claim and evidence, and `link_case` is
permissionless and refuses unless four facts read back out of the court match
the order — plaintiff is the buyer, defendant is the seller, the amount matches,
and the stored filing hashes to the pinned digest. A stranger can link a genuine
case; nobody can link a fake one.

A dismissal produces **no automatic action**. "Neither side proved anything" is
not "the seller is in the right", and treating them the same would use an
absence of evidence as evidence against whoever happened to be the defendant.

## 8. Smaller hazards, in one place

- **The runner header is exactly two lines.** GenVM parses the contiguous
  leading `#` block as the header; a stray comment between line 1 and the
  imports makes the contract undeployable, reporting only `invalid_contract`.
  Lint does not catch it. Two projects lost a deploy to it.
- **`str.replace()` is rejected by the runner.** Slice around `find()`.
- **Addresses must be read with `.as_hex`.** `str()` on an `Address` is not
  guaranteed to give the hex, and a mis-rendered address in a hash is a
  commitment to the wrong thing.
- **A `float` in a nondet return is not calldata encodable**, and a float
  anywhere near money puts a platform's rounding on the consensus axis. `_gen`
  formats wei by integer arithmetic only.
- **`bool` is an `int` in Python.** `_as_int` excludes it explicitly, and
  `_coherent` rejects an option that arrived as a boolean — otherwise `True`
  would silently be option 1.
- **A TreeMap with a scalar value type answers a missing key with that type's
  zero, not `None`.** A presence check written `is not None` therefore matches
  everything. Struct-valued maps *do* answer `None`. The offline stub reproduces
  both, because a stub that returned `None` for everything could not.
- **`DynArray.append_new_get()` returns a reference**, not a copy — or every
  case written on chain would stay zero while the tests passed.
- **A storage reference carried into a nondet closure kills the leader
  mid-round.** `_facts` copies everything to plain `str`/`int` in one named
  place so no future caller can forget.
- **There is no `block.timestamp`.** The only clock is
  `gl.message.raw["datetime"]`, which is part of the transaction and therefore
  identical on every validator. A wall-clock read per node would make a 48-hour
  window expire at a different instant for each of them.
- **A transaction can settle ACCEPTED with its return value unreadable.** That
  is the transport, not the contract: the case really was filed. The frontend
  and the seed both fall back to reading the contract's own state, and the seed
  reports `UNREADABLE` rather than `OK` so a refusal is never recorded as a
  success.
- **`.btn` beats Tailwind's `hidden`.** Both are class selectors, and `.btn`'s
  `display: inline-flex` is defined later, so `hidden` on a `.btn` silently does
  nothing. Responsive display goes on a wrapper. Invisible to tsc and eslint;
  caught only by measuring the page width at 390px.
- **An audit that greps its own documentation cries wolf.** Three checks failed
  against a clean file because the contract header documents `str.replace()` and
  the bad `.emit()` spelling in order to warn about them. Those checks walk the
  AST now.
- **Contract size.** 121 KB deploys to Studio Dev (measured; transaction in
  `deployments.json`). A previous project measured a far tighter ceiling on a
  different network — 53,000 bytes deploys, 53,700 does not — so this file would
  need splitting before it could go there. Recorded rather than guarded against,
  because guarding a Studio Dev contract against another network's limit is a
  number nobody could justify.
