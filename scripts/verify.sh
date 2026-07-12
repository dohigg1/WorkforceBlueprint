#!/usr/bin/env bash
# The verification gate. Runs every architectural check in order. A failure at
# any gate is a build failure. Gates whose code does not yet exist pass
# trivially and visibly, so that they cannot be forgotten later.
#
# Order mirrors docs/invariants.md "The verification gate".
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAIL=0
gate() { printf '\n\033[1m== Gate %s ==\033[0m\n' "$*"; }
run()  { echo "+ $*"; "$@" || FAIL=1; }

# Ensure the database role and test database exist before any DB-backed gate.
if command -v psql >/dev/null 2>&1; then
  bash scripts/setup-db.sh >/dev/null 2>&1 || true
fi

gate "1/10 Strict type check"
run pnpm -s typecheck

gate "2/10 Lint (including architectural rules)"
run pnpm -s lint

gate "3-8/10 Tests: schema invariants, unit/integration, cross-tenant, scenario, measure, adversarial"
# A single Vitest run executes every suite that exists (schema-invariant,
# cross-tenant, effective-dating, audit, scenario-isolation, measure-consistency,
# adversarial-ai). Each is annotated in its own file with the invariant it
# proves. Suites not yet written are simply absent and reported here.
run pnpm -s test

gate "9/10 Performance suite (synthetic 100k dataset)"
if [ "${RUN_PERF:-0}" = "1" ]; then
  run bash scripts/perf.sh
else
  echo "skipped (set RUN_PERF=1 to run against the synthetic dataset)"
fi

gate "10/10 Secret and personal-data scan"
run bash scripts/pii-scan.sh

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[1;32mverify.sh: PASS\033[0m\n'
else
  printf '\033[1;31mverify.sh: FAIL\033[0m\n'
fi
exit "$FAIL"
