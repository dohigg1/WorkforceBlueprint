-- E02-01: Reference entities of the canonical model.
-- Every entity is effective-dated (INV-4): valid_from is inclusive, valid_to is
-- exclusive, and NULL valid_to means the currently-open version. Nothing is
-- destructively updated; a change supersedes. Every entity carries a mandatory
-- client-supplied external_id and a system-generated internal id, plus a JSONB
-- column for schemaless client-specific properties.
--
-- Convention (ADR 0003): one open version per logical entity, enforced by a
-- partial unique index on (workspace_id, external_id) WHERE valid_to IS NULL.

-- Reusable shape: apply after creating a table with the standard temporal and
-- tenancy columns. Enforces the effective-dating check and the single-open-row
-- rule, then applies full row-level security.
CREATE OR REPLACE FUNCTION wfb_apply_entity(tbl regclass, ext_scope boolean DEFAULT true)
  RETURNS void LANGUAGE plpgsql AS
$$
DECLARE
  tname text := tbl::text;
BEGIN
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I CHECK (valid_to IS NULL OR valid_to > valid_from)',
    tbl, tname || '_valid_range');
  IF ext_scope THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON %s (workspace_id, external_id) WHERE valid_to IS NULL',
      tname || '_open_ext_uq', tbl);
    EXECUTE format(
      'CREATE INDEX %I ON %s (workspace_id, external_id)',
      tname || '_ext_idx', tbl);
  END IF;
  PERFORM wfb_apply_tenancy(tbl);
END
$$;

CREATE TABLE locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  country       text NOT NULL,
  region        text,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('locations');

CREATE TABLE cost_centres (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  code          text NOT NULL,
  currency      text NOT NULL DEFAULT 'GBP',
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('cost_centres');

-- OrgUnit is a structural container. It is NOT the reporting hierarchy and must
-- never be conflated with it. An org unit may nest within a parent org unit.
CREATE TABLE org_units (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  workspace_id       uuid NOT NULL,
  external_id        text NOT NULL,
  name               text NOT NULL,
  parent_external_id text,
  custom             jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from         timestamptz NOT NULL DEFAULT current_date,
  valid_to           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('org_units');

CREATE TABLE job_families (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('job_families');

-- A Job is the generic description. A Role is a cluster of similar Positions.
CREATE TABLE jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  title         text NOT NULL,
  job_family_external_id text,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('jobs');

CREATE TABLE roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  job_family_external_id text,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('roles');

CREATE TABLE skills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  taxonomy      text,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('skills');

CREATE TABLE activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  name          text NOT NULL,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('activities');
