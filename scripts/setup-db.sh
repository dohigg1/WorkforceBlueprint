#!/usr/bin/env bash
# Creates the non-superuser application role and the test database.
# Idempotent. Safe to run repeatedly. Uses the local PostgreSQL 16 cluster.
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
ADMIN_USER="${PGADMIN_USER:-postgres}"
ADMIN_DB="${PGADMIN_DB:-postgres}"
APP_DB="${APP_DB:-wfb_test}"
APP_ROLE="${APP_ROLE:-wfb_app}"
APP_PASSWORD="${APP_PASSWORD:-wfb_app}"

# Self-heal a local cluster if none is reachable (no-op in CI).
bash "$(dirname "${BASH_SOURCE[0]}")/ensure-postgres.sh"

psql_admin() { psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }

echo "Ensuring database ${APP_DB} exists..."
if ! psql_admin "$ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='${APP_DB}'" | grep -q 1; then
  psql_admin "$ADMIN_DB" -c "CREATE DATABASE ${APP_DB}"
fi

echo "Ensuring application role ${APP_ROLE} exists (NON-superuser, no BYPASSRLS)..."
psql_admin "$ADMIN_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
    CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS;
  END IF;
END
\$\$;
SQL

echo "Granting connect and schema usage to ${APP_ROLE}..."
psql_admin "$APP_DB" <<SQL
GRANT CONNECT ON DATABASE ${APP_DB} TO ${APP_ROLE};
GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
-- Default privileges so that tables created by migrations are usable by the
-- app role. The app role remains subject to row-level security.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE};
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "Database setup complete: db=${APP_DB} role=${APP_ROLE}"
