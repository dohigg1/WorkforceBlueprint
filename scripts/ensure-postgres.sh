#!/usr/bin/env bash
# Ensure a local PostgreSQL 16 cluster is running on localhost:5432. Used for
# local and web sessions where no managed database service is present. In CI a
# postgres service container is provided instead, so this is skipped when CI is
# set. Idempotent and self-healing across container restarts.
set -uo pipefail

# In CI, a service container provides PostgreSQL; do not start a local cluster.
if [ -n "${CI:-}" ]; then
  exit 0
fi

PGBIN=/usr/lib/postgresql/16/bin
PGDATA="${WFB_PGDATA:-/var/lib/postgresql/wfbdata}"

# Already up?
if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
  exit 0
fi

if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "PostgreSQL server binaries not found at $PGBIN" >&2
  exit 1
fi

# Ensure a non-root postgres OS user owns the data directory.
id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1 || true

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  sudo -u postgres mkdir -p "$PGDATA"
  sudo -u postgres "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/tmp/wfb-initdb.log 2>&1
fi

sudo -u postgres "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/wfb-pg.log -o "-p 5432" -w start >/tmp/wfb-pgstart.log 2>&1

# Wait for readiness.
for _ in $(seq 1 20); do
  if PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
    exit 0
  fi
  sleep 0.5
done
echo "PostgreSQL did not become ready" >&2
tail -5 /tmp/wfb-pg.log >&2 2>/dev/null || true
exit 1
