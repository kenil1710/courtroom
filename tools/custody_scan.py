#!/usr/bin/env python3
"""Follow `gl.message.value` into storage and report anything nobody can drain.

RULE 7: value a contract accepts must be value somebody can get back out.

This exists because of a specific failure in an earlier project in this series,
and because of how that failure hid. A consumer contract there refunded
perfectly on every REFUSAL path and had no exit at all for value it ACCEPTED:

    deposit(value) ──refused──> self.balances[who] += value ──> withdraw() ✓
                   ──accepted─> pos.amount_wei     += value ──> nothing

Every refusal test passed, because every refusal really did refund. Nothing
looked at the other half. SUCCEEDING WAS THE WAY TO LOSE YOUR MONEY.

The lesson is that the check has to FOLLOW THE VALUE rather than count the
methods. "Is there a withdraw?" answered yes the entire time.

So: taint `gl.message.value`, propagate it through local names and through the
private helpers a payable method hands it to, and report every `self.<field>`
it lands in. Then ask which of those fields a public write that ANYONE may call
— no owner gate — actually reads and pays out from. The difference is trapped
money.

    python3 tools/custody_scan.py contracts/CourtRoom.py
    python3 tools/custody_scan.py --self-test

Imported by the offline suite and run by tools/audit.sh, so the tests and the
audit cannot drift apart on what "trapped" means.
"""

import ast
import sys
from pathlib import Path


class _Scan:
    """One pass over one contract."""

    def __init__(self, tree: ast.Module):
        self.tree = tree
        self.funcs = {}
        self.cls = None
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # The contract class is the one that subclasses gl.contract.Contract.
                for base in node.bases:
                    if "Contract" in ast.unparse(base):
                        self.cls = node
        if self.cls is not None:
            for node in self.cls.body:
                if isinstance(node, ast.FunctionDef):
                    self.funcs[node.name] = node

    # --- helpers ----------------------------------------------------------

    @staticmethod
    def _is_public(fn: ast.FunctionDef) -> bool:
        return any("gl.public" in ast.unparse(d) for d in fn.decorator_list)

    @staticmethod
    def _is_write(fn: ast.FunctionDef) -> bool:
        return any("write" in ast.unparse(d) for d in fn.decorator_list)

    @staticmethod
    def _is_owner_gated(fn: ast.FunctionDef) -> bool:
        body = ast.unparse(fn)
        return "_only_owner" in body or "_is_owner" in body

    # --- the taint --------------------------------------------------------

    def _tainted_locals(self, fn: ast.FunctionDef, seeds: set) -> set:
        """Local names carrying value, to a fixed point."""
        names = set(seeds)
        for _ in range(6):
            grew = False
            for node in ast.walk(fn):
                if isinstance(node, ast.Assign) and len(node.targets) == 1:
                    target = node.targets[0]
                    if not isinstance(target, ast.Name):
                        continue
                    src = ast.unparse(node.value)
                    if "gl.message.value" in src or any(
                        n in {x.id for x in ast.walk(node.value)
                              if isinstance(x, ast.Name)} for n in names
                    ):
                        if target.id not in names:
                            names.add(target.id)
                            grew = True
            if not grew:
                break
        return names

    def value_lands_in(self) -> dict:
        """`self.<field>` -> the methods that write value into it."""
        landed = {}
        for name, fn in self.funcs.items():
            seeds = {"value"} if "gl.message.value" in ast.unparse(fn) else set()
            # A helper that is HANDED the value counts too: `_credit(who, amount)`
            # is where value lands even though `gl.message.value` is not in it.
            #
            # Only the VALUE-DENOMINATED parameters are seeded, not every
            # parameter. Seeding them all made `_settle(…, outcome, …)` taint
            # `outcome`, which then appeared on the right-hand side of
            # `self.outcome_counts[outcome] = …` and reported a counter of
            # verdicts as trapped money. A scanner that cries wolf about a
            # tally is a scanner whose next real finding gets waved through.
            if name in ("_credit", "_take", "_bank", "_settle"):
                seeds |= {
                    a.arg for a in fn.args.args
                    if a.arg != "self" and (
                        a.arg in ("amount", "value")
                        or a.arg.endswith("_wei")
                        or a.arg.startswith("to_")
                    )
                }
            if not seeds:
                continue
            tainted = self._tainted_locals(fn, seeds)
            for node in ast.walk(fn):
                if not isinstance(node, (ast.Assign, ast.AugAssign)):
                    continue
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                # The taint has to reach the VALUE being stored, not the key it
                # is stored under. `m[tainted] = 1` puts nothing in `m`.
                src_names = {x.id for x in ast.walk(node.value) if isinstance(x, ast.Name)}
                if not (src_names & tainted or "gl.message.value" in ast.unparse(node.value)):
                    continue
                for t in targets:
                    field = self._field_of(t)
                    if field:
                        landed.setdefault(field, set()).add(name)
        return {k: sorted(v) for k, v in landed.items()}

    @staticmethod
    def _field_of(node) -> str:
        """`self.x`, `self.x[k]` and `self.x[k].y` all name field `x`.

        A write to a local struct reference — `case.escrow_wei = …` — names
        nothing, and that is correct rather than a gap: a Case is a RECORD of
        what a case holds, not a balance anyone withdraws from. The pool a party
        is actually paid out of is `payout_wei`, and that is the field this has
        to prove is drainable."""
        cur = node
        while isinstance(cur, (ast.Subscript, ast.Attribute)):
            if isinstance(cur, ast.Attribute) and isinstance(cur.value, ast.Name) \
                    and cur.value.id == "self":
                return cur.attr
            cur = cur.value
        return ""

    def drainable_fields(self) -> dict:
        """`self.<field>` -> the ungated public writes that pay out of it."""
        out = {}
        payers = []
        for name, fn in self.funcs.items():
            if not (self._is_public(fn) and self._is_write(fn)):
                continue
            if self._is_owner_gated(fn):
                continue
            if "_pay(" not in ast.unparse(fn):
                continue
            payers.append((name, fn))

        for name, fn in payers:
            for node in ast.walk(fn):
                field = self._field_of(node)
                if field:
                    out.setdefault(field, set()).add(name)
        return {k: sorted(v) for k, v in out.items()}

    def trapped(self) -> list:
        """Fields value reaches that no ungated public write pays out of."""
        landed = self.value_lands_in()
        drainable = self.drainable_fields()
        # Bookkeeping totals are not custody: they are counters denominated in
        # value, not places value sits. A field is only trapped if it is a
        # PER-PARTY balance nobody can withdraw.
        counters = {"balance_wei", "escrowed_wei", "payable_wei",
                    "claimed_total_wei", "total_claimed_wei",
                    "total_awarded_wei", "total_fees_wei", "sum_award_bps"}
        bad = []
        for field in sorted(landed):
            if field in counters:
                continue
            if field not in drainable:
                bad.append((field, landed[field]))
        return bad


def scan(path: Path) -> dict:
    tree = ast.parse(path.read_text(encoding="utf8"))
    s = _Scan(tree)
    if s.cls is None:
        return {"contract": None, "value_lands_in": {}, "drainable": {}, "trapped": []}
    return {
        "contract": s.cls.name,
        "value_lands_in": s.value_lands_in(),
        "drainable": s.drainable_fields(),
        "trapped": s.trapped(),
        "takes_value": "gl.message.value" in path.read_text(encoding="utf8"),
    }


REJECTED_SHAPE = '''
import genlayer as gl
from genlayer import *
import typing

class Bad(gl.contract.Contract):
    balances: gl.storage.TreeMap[Address, u256]
    positions: gl.storage.TreeMap[Address, u256]

    @gl.public.write.payable
    def deposit(self, ok: bool) -> typing.Any:
        value = int(gl.message.value)
        if not ok:
            self.balances[gl.message.sender_address] = u256(value)
            return {"status": "REJECTED"}
        self.positions[gl.message.sender_address] = u256(value)
        return {"status": "OK"}

    @gl.public.write
    def withdraw(self) -> typing.Any:
        who = gl.message.sender_address
        amount = int(self.balances.get(who) or 0)
        self.balances[who] = u256(0)
        _pay(who, amount)
        return {"status": "OK"}
'''


def self_test() -> int:
    """A guard that has only ever seen code it passes is a guard nobody tested.

    So the scanner is run against the EXACT SHAPE that shipped broken once, and
    has to flag it."""
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(REJECTED_SHAPE)
        tmp = Path(fh.name)
    result = scan(tmp)
    tmp.unlink()
    trapped = [f for f, _ in result["trapped"]]
    if "positions" not in trapped:
        print("SELF-TEST FAILED: the scanner did not flag the rejected shape")
        print(f"  trapped: {trapped}")
        return 1
    if "balances" in trapped:
        print("SELF-TEST FAILED: the scanner flagged a field that IS drainable")
        return 1
    print(f"self-test ok — flags the rejected shape ({', '.join(trapped)}) "
          f"and not the drainable one")
    return 0


def main(argv: list) -> int:
    if "--self-test" in argv:
        return self_test()
    if len(argv) < 2:
        print(__doc__)
        return 2
    failures = 0
    for arg in argv[1:]:
        path = Path(arg)
        result = scan(path)
        print(f"\n{path.name} — {result['contract'] or 'no contract class'}")
        if not result.get("takes_value"):
            print("  takes no value at all; nothing to trap")
            continue
        print(f"  value lands in : {', '.join(result['value_lands_in']) or '(nothing)'}")
        print(f"  drainable by   : {', '.join(result['drainable']) or '(nothing)'}")
        if result["trapped"]:
            failures += 1
            print("  TRAPPED:")
            for field, writers in result["trapped"]:
                print(f"    ✗ self.{field} — written by {', '.join(writers)}, "
                      f"paid out by nothing ungated")
        else:
            print("  ✔ every field value reaches is drainable by an ungated "
                  "public write")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
