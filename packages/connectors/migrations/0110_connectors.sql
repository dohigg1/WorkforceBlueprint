-- E19 to E21: connector framework and the secure file transfer connector.
-- A connector is a READ-ONLY source of rows. It fetches an extract from an
-- external system (an in-memory or SFTP-delivered file today; a vendor API in
-- future) and hands the headers and rows to @wfb/ingestion for mapping and
-- validation. Write-back is deliberately OUT OF SCOPE: a connector never
-- mutates the source system, and loading the fetched rows into the canonical
-- tables is a separate, human-gated step handled elsewhere.
--
-- INV-1: both tables carry non-null tenant_id and workspace_id, with row-level
-- security enabled, forced and failing closed through wfb_apply_tenancy.

-- ---------------------------------------------------------------------------
-- connections: a configured, named source belonging to a workspace. `kind`
-- selects the connector (file, sftp, workday). `config` holds connector-specific
-- settings as JSONB (for the file connector, the CSV payload; for SFTP, host and
-- path; never a secret in cleartext in production, but this build uses synthetic
-- in-memory configuration only).
-- ---------------------------------------------------------------------------
CREATE TABLE connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  workspace_id uuid NOT NULL,
  external_id  text NOT NULL,
  kind         text NOT NULL,               -- file | sftp | workday
  name         text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, external_id)
);
SELECT wfb_apply_tenancy('connections');

-- ---------------------------------------------------------------------------
-- sync_runs: one row per fetch-and-preview. A sync reads rows and produces an
-- advisory quality report; it does NOT load into the canonical tables. Status
-- moves running -> succeeded | failed. `report` holds the proposed mapping and
-- validation counts so a consultant can inspect the outcome without re-running.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  workspace_id           uuid NOT NULL,
  connection_external_id text NOT NULL,
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  status                 text NOT NULL DEFAULT 'running',  -- running | succeeded | failed
  rows_read              integer NOT NULL DEFAULT 0,
  quality_score          integer,
  report                 jsonb
);
SELECT wfb_apply_tenancy('sync_runs');
CREATE INDEX sync_runs_connection_idx
  ON sync_runs (workspace_id, connection_external_id, started_at);
