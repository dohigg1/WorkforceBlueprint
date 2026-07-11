#!/usr/bin/env bash
# Performance suite. Seeds the synthetic 100k dataset and runs the performance
# assertions from docs/invariants.md (INV-9) against it. Numbers are printed so
# they can be recorded in the handoff report. A regression against target is a
# build failure.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SIZE="${PERF_SIZE:-100000}"
echo "Seeding synthetic dataset of ${SIZE} positions..."
pnpm -s seed -- --size "${SIZE}" --perf-workspace

echo "Running performance assertions..."
WFB_PERF=1 pnpm -s exec vitest run --dir packages --testNamePattern "performance"
