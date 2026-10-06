#!/usr/bin/env bash
# songs_gate — HARD. v3 authored direction (docs/v3/DESIGN.md §4).
#  1. plan_gate and critic_gate self-checks: their trap corpora must fail (proves the judges are not blind).
#  2. every app/src/songs/<slug>/plan.json with "status": "final": re-resolve the edit from its run
#     (render.ts timeline), then plan_gate and critic_gate --final must pass.
# macOS bash 3.2 safe, fail-closed.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
RC=0
fail() { RC=1; printf 'FAIL[songs]: %s\n' "$1" >&2; }

python3 "$ROOT/src/plan_gate.py" --selfcheck >/dev/null 2>&1 || fail "plan_gate selfcheck"
python3 "$ROOT/src/critic_gate.py" --selfcheck >/dev/null 2>&1 || fail "critic_gate selfcheck"

n=0
for plan in "$ROOT"/app/src/songs/*/plan.json; do
  [ -e "$plan" ] || continue
  song="$(dirname "$plan")"
  status=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("status",""))' "$plan" 2>/dev/null) \
    || { fail "$(basename "$song"): unreadable plan.json"; continue; }
  [ "$status" = "final" ] || continue
  n=$((n + 1))
  run=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("run",""))' "$plan")
  [ -n "$run" ] && [ -d "$ROOT/$run" ] || { fail "$(basename "$song"): plan.json run '$run' missing"; continue; }
  (cd "$ROOT/app" && ATF_RUN="$ROOT/$run" bun scripts/render.ts timeline --out "$ROOT/$run/timeline.json") >/dev/null 2>&1 \
    || { fail "$(basename "$song"): timeline did not resolve (scene/anchor error)"; continue; }
  python3 "$ROOT/src/plan_gate.py" "$song" "$ROOT/$run" >&2 || fail "$(basename "$song"): plan_gate"
  python3 "$ROOT/src/critic_gate.py" "$song" --final >&2 || fail "$(basename "$song"): critic_gate"
done

[ "$RC" -eq 0 ] && printf 'PASS[songs]: judges calibrated, %s final song(s) pass plan + critic gates\n' "$n"
exit "$RC"
