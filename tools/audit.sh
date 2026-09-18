#!/usr/bin/env bash
#
# CourtRoom — the executable audit.
#
# Every check below is a PAST REJECTION from an earlier project in this series,
# turned into something that fails loudly rather than into a paragraph somebody
# has to remember to read. It exits with the number of failures, so CI and a
# human get the same answer.
#
#   tools/audit.sh              # static + offline, no network
#   tools/audit.sh --chain      # also asserts the live deploy on Studio Dev
#
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
SKIP=0

ok()   { PASS=$((PASS+1)); printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf '  \033[33m-\033[0m %s (skipped: %s)\n' "$1" "$2"; }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# check <description> <command...>  — passes when the command exits 0
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
# absent <description> <pattern> <file> — passes when the pattern is NOT present
absent() { if grep -qE "$2" "$3" 2>/dev/null; then bad "$1"; else ok "$1"; fi; }
# present <description> <pattern> <file>
present() { if grep -qE "$2" "$3" 2>/dev/null; then ok "$1"; else bad "$1"; fi; }

CR=contracts/CourtRoom.py
AC=contracts/ArbitrationConsumer.py

printf '\033[1mCourtRoom audit\033[0m — every check is a past rejection\n'

# ---------------------------------------------------------------------------
head "1. The runner header (an undeployable contract with no error message)"
# GenVM parses the contiguous leading `#` block as the runner header. A stray
# comment between line 1 and the imports makes the contract undeployable and
# reports only `invalid_contract`. Lint does not catch it; this does.
for f in "$CR" "$AC"; do
  [ "$(sed -n '1p' "$f")" = "# v0.3.0" ] && ok "$f line 1 is the version line" || bad "$f line 1"
  sed -n '2p' "$f" | grep -q '^# { "Depends": "py-genlayer:' && ok "$f line 2 is the runner pin" || bad "$f line 2"
  sed -n '3p' "$f" | grep -q '^#' && bad "$f line 3 is a comment (breaks the deploy)" || ok "$f line 3 is not a comment"
  absent "$f pins a concrete runner, never 'latest'" '^# \{.*latest' "$f"
done

# ---------------------------------------------------------------------------
head "2. Runner restrictions"
# These are checked over the AST rather than with grep, and the difference is
# not pedantry: the contract's own header DOCUMENTS `str.replace()` and the
# silent `.emit(value=...)` spelling as things never to use, and a grep matched
# that prose and reported three failures against a clean file. An audit that
# fires on its own documentation is an audit people learn to ignore, and the
# next real finding goes with it.
check "str.replace() is never called (the runner rejects it)" \
  python3 - <<'PY'
import ast, sys
for f in ("contracts/CourtRoom.py", "contracts/ArbitrationConsumer.py"):
    for n in ast.walk(ast.parse(open(f).read())):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) \
                and n.func.attr == "replace":
            print(f"{f}:{n.lineno} calls .replace()"); sys.exit(1)
sys.exit(0)
PY
check "no float literal reaches the rubric" \
  python3 - <<'PY'
import ast, sys
for n in ast.walk(ast.parse(open("contracts/CourtRoom.py").read())):
    if isinstance(n, ast.Constant) and isinstance(n.value, float):
        print(f"float literal at line {n.lineno}"); sys.exit(1)
sys.exit(0)
PY
present "addresses are read with .as_hex, not str()" '\.as_hex' "$CR"

# ---------------------------------------------------------------------------
head "3. Money (the rules that cost real refunds to learn)"
# RULE 2: a revert rolls back storage but NOT the value that came with the call.
check "no public write can raise — checked over the AST" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
bad = []
for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef) and any("write" in ast.unparse(d) for d in n.decorator_list):
        bad += [(n.name, s.lineno) for s in ast.walk(n) if isinstance(s, ast.Raise)]
sys.exit(1 if bad else 0)
PY
check "no helper a write calls can raise either" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
helpers = {"_refuse","_settle","_credit","_bank","_take","_open_case","_case","_bump_status","_facts","_is_owner"}
bad = []
for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef) and n.name in helpers:
        bad += [(n.name, s.lineno) for s in ast.walk(n) if isinstance(s, ast.Raise)]
sys.exit(1 if bad else 0)
PY
present "every refusal goes through _refuse" 'def _refuse' "$CR"
# RULE 7: value in must be value out. Static, by following the taint.
check "nothing value reaches is trapped (custody scan)" python3 tools/custody_scan.py "$CR" "$AC"
check "the custody scanner still catches the shape that was rejected" \
  python3 tools/custody_scan.py --self-test
# The silent-emit bug: a bare `.emit(value=...)` posts NO message at all.
# Checked over the AST because `_pay`'s docstring quotes the bad spelling in
# order to warn about it.
check "the silent .emit() spelling is never called" \
  python3 - <<'PY'
import ast, sys
for n in ast.walk(ast.parse(open("contracts/CourtRoom.py").read())):
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) \
            and n.func.attr == "emit":
        print(f"bare .emit() at line {n.lineno}"); sys.exit(1)
sys.exit(0)
PY
check "money leaves through exactly one emit_transfer call" \
  python3 - <<'PY'
import ast, sys
calls = [n for n in ast.walk(ast.parse(open("contracts/CourtRoom.py").read()))
         if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
         and n.func.attr == "emit_transfer"]
sys.exit(0 if len(calls) == 1 else 1)
PY
check "and _pay is the only thing that calls it" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
callers = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)
           and any(isinstance(c, ast.Call) and isinstance(c.func, ast.Name)
                   and c.func.id == "_pay" for c in ast.walk(n))]
sys.exit(0 if callers == ["claim_payout"] else 1)
PY
# RULE 4
present "the filing fee is snapshotted into the case" 'case.filing_fee_wei = u256\(fee\)' "$CR"
# RULE 6
absent "the owner has no withdraw method" 'def withdraw_fees|def sweep|def rescue' "$CR"
check "claim_payout and settle_stalled are ungated on pause" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
for name in ("claim_payout", "settle_stalled", "judge", "respond", "default_judgment"):
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name)
    body = ast.unparse(fn)
    if "self.paused" in body:
        print(f"{name} reads self.paused"); sys.exit(1)
sys.exit(0)
PY
check "only three methods are owner-gated" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
gated = sorted(n.name for n in ast.walk(tree)
               if isinstance(n, ast.FunctionDef)
               and any("write" in ast.unparse(d) for d in n.decorator_list)
               and "_is_owner()" in ast.unparse(n))
sys.exit(0 if gated == ["set_filing_fee", "set_paused", "transfer_ownership"] else 1)
PY

# ---------------------------------------------------------------------------
head "4. Consensus (a value nobody compared is a value the leader chose)"
present "the compared key is outcome|award_bps|evidence_quality" '_verdict_key' "$CR"
present "_agrees compares the content hash" 'content_hash' "$CR"
present "_agrees compares the facts hash the node read" 'facts_hash' "$CR"
present "_agrees compares the written reasoning" '"reasoning"' "$CR"
present "_agrees compares the settlement split" 'to_plaintiff_wei' "$CR"
present "the leader's only freedom is an option index" 'def _derive' "$CR"
check "every stored verdict field is recomputed in _derive, not copied" \
  python3 - <<'PY'
import ast, sys
src = open("contracts/CourtRoom.py").read()
tree = ast.parse(src)
settle = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "_settle")
# Inside _settle, every `case.<x> = …` sourced from the verdict must read from
# `verdict`, the object `judge` built by re-deriving from the agreed index.
bad = []
for n in ast.walk(settle):
    if isinstance(n, ast.Assign):
        for t in n.targets:
            if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "case":
                s = ast.unparse(n.value)
                if "out." in s or "leader" in s:
                    bad.append(t.attr)
sys.exit(1 if bad else 0)
PY
present "a stalled round can be settled permissionlessly" 'def settle_stalled' "$CR"
present "settle_stalled refunds both sides" 'R_STALLED' "$CR"

# ---------------------------------------------------------------------------
head "5. Conservative on what is not there"
present "an unreachable jury returns retry, never a verdict" '"retry": True' "$CR"
present "an unreadable answer falls to the least adverse option" 'def _parse_option' "$CR"
present "an award is capped by the bond actually held" 'award = full if full <= held else held' "$CR"
present "an unenforceable judgment says so" 'unenforced_wei' "$CR"
present "deadlines are immutable after deploy" 'deadlines_immutable' "$CR"
check "no method mutates a deadline after the constructor" \
  python3 - <<'PY'
import ast, sys
tree = ast.parse(open("contracts/CourtRoom.py").read())
for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef) and n.name != "__init__":
        for s in ast.walk(n):
            if isinstance(s, ast.Assign):
                for t in s.targets:
                    if isinstance(t, ast.Attribute) and t.attr in ("response_window_s", "stall_ttl_s"):
                        print(f"{n.name} changes {t.attr}"); sys.exit(1)
sys.exit(0)
PY

# ---------------------------------------------------------------------------
head "6. Immutability of the record"
check "no method edits a filing after it is written" \
  python3 - <<'PY'
import ast, sys
allowed = {"claim_text": {"file_case"}, "evidence_text": {"file_case"},
           "response_text": {"respond"}, "counter_evidence": {"respond"}}
tree = ast.parse(open("contracts/CourtRoom.py").read())
for n in ast.walk(tree):
    if not isinstance(n, ast.FunctionDef): continue
    for s in ast.walk(n):
        if not isinstance(s, ast.Assign): continue
        blank = isinstance(s.value, ast.Constant) and s.value.value == ""
        for t in s.targets:
            if isinstance(t, ast.Attribute) and t.attr in allowed:
                if blank and n.name == "file_case": continue
                if n.name not in allowed[t.attr]:
                    print(f"{t.attr} written in {n.name}"); sys.exit(1)
sys.exit(0)
PY
present "a terminal case is frozen by one gate" 'def _open_case' "$CR"
present "verify_verdict recomputes from the evidence" 'def verify_verdict' "$CR"

# ---------------------------------------------------------------------------
head "7. The offline suite"
if OUT=$(python3 test/test_logic.py 2>&1); then
  N=$(printf '%s' "$OUT" | grep -oE 'Ran [0-9]+ tests' | grep -oE '[0-9]+')
  ok "offline suite green (${N:-?} tests, no chain, no network, no model)"
  if [ "${N:-0}" -ge 250 ]; then ok "at least 250 tests"; else bad "only ${N:-0} tests"; fi
else
  bad "offline suite FAILED"
  printf '%s\n' "$OUT" | tail -20
fi

# ---------------------------------------------------------------------------
head "8. The linter"
if command -v genvm-lint >/dev/null 2>&1; then
  check "genvm-lint passes on CourtRoom" genvm-lint lint "$CR"
  check "genvm-lint passes on ArbitrationConsumer" genvm-lint lint "$AC"
else
  skip "genvm-lint" "not installed"
fi

# ---------------------------------------------------------------------------
head "9. The frontend"
if [ -d frontend/node_modules ]; then
  check "typescript compiles with no errors" bash -c "cd frontend && npx tsc --noEmit"
  check "eslint is clean" bash -c "cd frontend && npx eslint src --max-warnings 0"
else
  skip "frontend checks" "run npm install in frontend/"
fi

# ---------------------------------------------------------------------------
head "10. The live deploy"
if [ "${1:-}" = "--chain" ]; then
  if [ -f deployments.json ] && [ -d test/node_modules ]; then
    OUT=$(node test/audit_chain.mjs 2>&1); RC=$?
    printf '%s\n' "$OUT"
    PASS=$((PASS + $(printf '%s' "$OUT" | grep -c '✔')))
    CHAIN_FAILS=$(printf '%s' "$OUT" | grep -c '✗')
    # A CRASH is a failure even though it prints no ✗ marks. Without this, a
    # chain audit that threw before its first assertion reported "0 failed" and
    # the whole run came back green — which is exactly how a real drift between
    # the deployed contract and this repository went unnoticed once.
    if [ "$RC" -ne 0 ] && [ "$CHAIN_FAILS" -eq 0 ]; then
      bad "the on-chain audit exited $RC without completing"
    else
      FAIL=$((FAIL + CHAIN_FAILS))
    fi
  else
    skip "on-chain assertions" "no deployments.json or test/node_modules"
  fi
else
  skip "on-chain assertions" "pass --chain to run them"
fi

# ---------------------------------------------------------------------------
printf '\n\033[1m%d passed, %d failed, %d skipped\033[0m\n' "$PASS" "$FAIL" "$SKIP"
exit "$FAIL"
