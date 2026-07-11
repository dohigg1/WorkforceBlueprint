-- E15-01, E15-02, E15-03: consultancy partner console.
--
-- A consultancy runs one workspace per client engagement. This migration adds
-- the engagement lifecycle to workspaces (active -> archived -> destroyed, with
-- a certificate of secure destruction at engagement end) and a per-workspace
-- partner template library that lets a consultant carry measures, mappings,
-- dashboards and board packs from one engagement into the next.
--
-- Workspace is already a first-class, tenant-scoped concept (see
-- 0001_tenancy.sql), so this is high value at low effort: the new columns are
-- covered by the existing tenant-scope row-level security policy on workspaces
-- and MUST NOT have tenancy re-applied. partner_templates is a full-tenancy
-- table and applies wfb_apply_tenancy so INV-1 cannot be forgotten.

-- ---------------------------------------------------------------------------
-- Workspace engagement lifecycle. The status is a small closed vocabulary:
--   active     the engagement is live
--   archived   the engagement is paused or complete but retained
--   destroyed  the data has been securely destroyed at engagement end, with a
--              certificate recorded for the client's records
-- The workspaces table already carries a tenant-scope RLS policy; these columns
-- inherit it. Do NOT call wfb_apply_tenancy or wfb_apply_tenant_scope here.
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN archived_at timestamptz;
ALTER TABLE workspaces ADD COLUMN destroyed_at timestamptz;
ALTER TABLE workspaces ADD COLUMN destruction_certificate text;

-- ---------------------------------------------------------------------------
-- Partner template library. A consultant saves a measure, mapping, dashboard or
-- board pack definition into a workspace and later instantiates it into a fresh
-- client workspace. Full tenancy (tenant_id and workspace_id). The external_id
-- is the caller-facing stable identifier, unique within a workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE partner_templates (
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  kind          text NOT NULL, -- measure | mapping | dashboard | board_pack
  name          text NOT NULL,
  definition    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, external_id)
);
SELECT wfb_apply_tenancy('partner_templates');
