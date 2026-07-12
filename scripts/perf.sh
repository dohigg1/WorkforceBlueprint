#!/usr/bin/env bash
# Performance suite. Seeds the synthetic 100k dataset then runs the INV-9
# performance assertions against it. Numbers are printed so they can be recorded
# in the handoff report. A regression against target is a build failure.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SIZE="${PERF_SIZE:-100000}"

echo "Ensuring database and schema..."
bash scripts/setup-db.sh >/dev/null
pnpm -s exec tsx scripts/migrate.ts

echo "Seeding synthetic dataset of ${SIZE} positions into the perf workspace..."
pnpm -s exec tsx scripts/seed-synthetic.ts --size "${SIZE}" --perf-workspace

echo "Running performance assertions (WFB_PERF=1 preserves the seed)..."
WFB_PERF=1 pnpm -s exec vitest run -t performance
