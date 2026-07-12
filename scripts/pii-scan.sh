#!/usr/bin/env bash
# INV-10 / INV-11: no real personal data anywhere in the repository. Scans
# tracked, non-documentation source for patterns that resemble real personal
# data. A finding is an incident, not a warning: this exits non-zero.
#
# The synthetic generator uses obviously-fake, deterministic values, which do
# not match these patterns.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Patterns that resemble real personal identifiers.
#  - UK National Insurance number: two letters, six digits, one letter
#  - US Social Security number: 3-2-4 digits
#  - IBAN-like bank strings
#  - Payment card numbers (16 consecutive digits)
PATTERNS=(
  '\b[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]\b'
  '\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b'
  '\bGB[0-9]{2}[A-Z]{4}[0-9]{14}\b'
  '\b[0-9]{16}\b'
)

# Only scan source and data files; documentation may legitimately discuss these
# formats. node_modules and build output excluded.
FILES=$(git ls-files -- \
  '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' '*.json' '*.sql' '*.csv' \
  ':(exclude)docs/**' ':(exclude)**/dist/**' ':(exclude)pnpm-lock.yaml' 2>/dev/null)

if [ -z "$FILES" ]; then
  echo "no source files to scan yet"
  exit 0
fi

HITS=0
for pat in "${PATTERNS[@]}"; do
  if echo "$FILES" | xargs grep -EnI "$pat" 2>/dev/null; then
    HITS=1
  fi
done

if [ "$HITS" -eq 1 ]; then
  echo "PII scan: potential real personal data found. This is an incident. Stop and report." >&2
  exit 1
fi
echo "PII scan: clean"
exit 0
