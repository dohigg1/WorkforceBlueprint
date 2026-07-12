-- E01-01, E01-02, E01-06: Tenancy foundation.
-- INV-1: every customer-data table carries non-null tenant_id and workspace_id,
-- with row-level security ENABLED and FORCED, failing closed.
-- INV-2: tenant context is derived from the session only, applied here as
-- database session settings (app.current_tenant / app.current_workspace) that
-- feature code sets exclusively from the verified session, never from input.

-- gen_random_uuid() is built in from PostgreSQL 13 onwards (pgcrypto in core).

-- ---------------------------------------------------------------------------
-- Reusable tenancy application. Every customer-data table calls exactly one of
-- these so that INV-1 cannot be applied inconsistently or forgotten. The policy
-- reads the tenant and workspace from session settings using the missing_ok
-- form of current_setting, so that when no context is set the comparison is
-- NULL and ZERO rows are returned. This is the fail-closed guarantee.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wfb_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_tenant', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION wfb_current_workspace() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_workspace', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION wfb_current_user() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $$;

-- Full tenancy: table has both tenant_id and workspace_id. Rows are visible
-- only when both match the session context. Fails closed when unset.
CREATE OR REPLACE FUNCTION wfb_apply_tenancy(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS
$$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (' ||
    'tenant_id = wfb_current_tenant() AND workspace_id = wfb_current_workspace()' ||
    ') WITH CHECK (' ||
    'tenant_id = wfb_current_tenant() AND workspace_id = wfb_current_workspace())',
    tbl);
END
$$;

-- Tenant-scoped system tables (tenants, workspaces, users) do not carry a
-- separate workspace_id, but must still be isolated by tenant and fail closed.
CREATE OR REPLACE FUNCTION wfb_apply_tenant_scope(tbl regclass, tenant_col text)
  RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (%I = wfb_current_tenant()) ' ||
    'WITH CHECK (%I = wfb_current_tenant())',
    tbl, tenant_col, tenant_col);
END
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wfb_role') THEN
    CREATE TYPE wfb_role AS ENUM ('owner', 'administrator', 'designer', 'analyst', 'viewer');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tenants: a paying customer. Its id IS the tenant identifier.
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_tenant_scope('tenants', 'id');

-- ---------------------------------------------------------------------------
-- Workspaces: an isolated data environment beneath a tenant. One for an
-- ordinary customer; one per client engagement for a consultancy.
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  branding    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX workspaces_tenant_idx ON workspaces(tenant_id);
SELECT wfb_apply_tenant_scope('workspaces', 'tenant_id');

-- ---------------------------------------------------------------------------
-- Users: an identity belonging to a tenant. Membership of workspaces, with a
-- role per workspace, is a separate relationship.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL,
  display_name   text NOT NULL,
  password_hash  text,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX users_tenant_idx ON users(tenant_id);
SELECT wfb_apply_tenant_scope('users', 'tenant_id');

-- ---------------------------------------------------------------------------
-- Memberships: a user's role within a workspace. Full tenancy (tenant_id and
-- workspace_id). This is the RBAC binding, enforced server side.
-- ---------------------------------------------------------------------------
CREATE TABLE memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          wfb_role NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships(tenant_id, user_id);
SELECT wfb_apply_tenancy('memberships');

-- ---------------------------------------------------------------------------
-- Invitations: pending workspace access. Full tenancy.
-- ---------------------------------------------------------------------------
CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL,
  role          wfb_role NOT NULL,
  token_hash    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz
);
CREATE INDEX invitations_workspace_idx ON invitations(tenant_id, workspace_id);
SELECT wfb_apply_tenancy('invitations');

-- ---------------------------------------------------------------------------
-- Sessions: short-lived access with refresh rotation. Full tenancy.
-- Revoked on role change. Only hashed tokens are stored.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash  text NOT NULL,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  rotated_at          timestamptz,
  revoked_at          timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(tenant_id, user_id);
SELECT wfb_apply_tenancy('sessions');
