-- E03-01: Append-only audit log (INV-3).
--
-- INV-3: every insert, update and delete of customer data writes an entry to
-- the append-only audit log WITHIN THE SAME database transaction as the change
-- itself. This is implemented as a database trigger, not as application code,
-- so that it cannot be bypassed by a direct query or a future code path that
-- forgets to call it. Because a trigger runs inside the statement's own
-- transaction, the audit entry commits or rolls back atomically with the
-- change: this is the same-transaction guarantee.

-- ---------------------------------------------------------------------------
-- The audit log. Full tenancy (INV-1): tenant_id and workspace_id, row-level
-- security enabled and forced, failing closed. Append-only: an immutability
-- trigger (below) rejects UPDATE and DELETE regardless of grants.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL,
  actor_user_id   uuid,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  table_name      text NOT NULL,
  operation       text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  row_external_id text,
  before          jsonb,
  after           jsonb
);
SELECT wfb_apply_tenancy('audit_log');
CREATE INDEX audit_log_scope_idx
  ON audit_log (tenant_id, workspace_id, table_name, occurred_at);

-- ---------------------------------------------------------------------------
-- The generic audit trigger function. It captures one audit_log row per
-- affected row. Tenant, workspace and external id are read generically through
-- to_jsonb(...)->>'col' so that the function never references a column name
-- that a given table might not have (memberships and invitations, for example,
-- carry no external_id, which yields NULL here rather than a compile error).
-- actor_user_id is taken from the session context; on a direct administrative
-- connection with no session context it is NULL, which is expected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wfb_audit() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_row     jsonb;
  v_before  jsonb;
  v_after   jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after  := NULL;
    v_row    := v_before;
  ELSIF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after  := to_jsonb(NEW);
    v_row    := v_after;
  ELSE
    -- UPDATE
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_row    := v_after;
  END IF;

  INSERT INTO audit_log (
    tenant_id, workspace_id, actor_user_id, table_name, operation,
    row_external_id, before, after
  ) VALUES (
    (v_row->>'tenant_id')::uuid,
    (v_row->>'workspace_id')::uuid,
    wfb_current_user(),
    TG_TABLE_NAME,
    TG_OP,
    v_row->>'external_id',
    v_before,
    v_after
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- Immutability. The audit log is append-only: any attempt to update or delete
-- an existing entry raises an exception. This holds regardless of table grants
-- and regardless of which connection attempts the change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wfb_audit_immutable() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION wfb_audit_immutable();

-- ---------------------------------------------------------------------------
-- Attach the audit trigger to every customer-data table. The list is explicit
-- so that a new table is a deliberate addition here, not an accident. The
-- audit_log table itself is intentionally NOT audited.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  audited text[] := ARRAY[
    'positions',
    'people',
    'occupancies',
    'reporting_lines',
    'locations',
    'cost_centres',
    'org_units',
    'job_families',
    'jobs',
    'roles',
    'skills',
    'activities',
    'memberships',
    'invitations'
  ];
BEGIN
  FOREACH t IN ARRAY audited LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION wfb_audit()', t);
  END LOOP;
END
$$;
