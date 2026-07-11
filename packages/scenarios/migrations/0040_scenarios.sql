-- E07-01: the scenario overlay engine (INV-5).
--
-- A scenario is a copy-on-write delta from its parent, resolved at READ time. It
-- is never a copy of the data. Creating a scenario is a single row insert:
-- instantaneous, negligible storage. Scenarios form a tree: a scenario branches
-- from the baseline or from another scenario. Every user edit writes a delta
-- into the active scenario; there is no write path to a baseline table from a
-- user action.

CREATE TABLE scenarios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  workspace_id        uuid NOT NULL,
  name                text NOT NULL,
  parent_scenario_id  uuid REFERENCES scenarios(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'open',
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenarios_parent_idx ON scenarios (workspace_id, parent_scenario_id);
SELECT wfb_apply_tenancy('scenarios');

-- The deltas. One current delta per (scenario, table, external_id). An upsert
-- carries the full effective row as JSONB; a delete tombstones the entity within
-- the scenario. Editing again overwrites the delta (copy-on-write).
CREATE TABLE scenario_deltas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  scenario_id   uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  table_name    text NOT NULL,
  external_id   text NOT NULL,
  op            text NOT NULL CHECK (op IN ('upsert', 'delete')),
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, table_name, external_id)
);
CREATE INDEX scenario_deltas_lookup_idx
  ON scenario_deltas (workspace_id, scenario_id, table_name, external_id);
SELECT wfb_apply_tenancy('scenario_deltas');

-- The ancestor chain of a scenario, nearest first (rnk 0 is the scenario
-- itself). The baseline sentinel is not a row here, so it yields the empty set
-- and resolution falls through to the baseline tables.
CREATE OR REPLACE FUNCTION wfb_scenario_chain(p_scenario uuid)
  RETURNS TABLE(scenario_id uuid, rnk integer) LANGUAGE sql STABLE AS
$$
  WITH RECURSIVE c AS (
    SELECT s.id AS scenario_id, s.parent_scenario_id, 0 AS rnk
    FROM scenarios s WHERE s.id = p_scenario
    UNION ALL
    SELECT s.id, s.parent_scenario_id, c.rnk + 1
    FROM scenarios s JOIN c ON s.id = c.parent_scenario_id
  )
  SELECT scenario_id, rnk FROM c
$$;

-- Resolve the effective rows of a table for a scenario as-at a date: the
-- baseline rows overlaid by the nearest delta in the scenario chain, with
-- tombstoned entities removed and upserted entities added. Row-level security
-- scopes both the baseline table and the deltas to the caller's workspace, so
-- scenarios are isolated exactly as tenants are. The table name is validated
-- against a whitelist before it reaches dynamic SQL.
CREATE OR REPLACE FUNCTION wfb_resolve_entity(p_scenario uuid, p_table text, p_as_at timestamptz)
  RETURNS TABLE(external_id text, doc jsonb) LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF p_table NOT IN (
    'positions','people','occupancies','reporting_lines',
    'locations','cost_centres','org_units','job_families','jobs','roles',
    'skills','activities'
  ) THEN
    RAISE EXCEPTION 'Table % is not scenario-resolvable', p_table;
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH chain AS (
      SELECT scenario_id, rnk FROM wfb_scenario_chain(%L::uuid)
    ),
    d AS (
      SELECT DISTINCT ON (sd.external_id) sd.external_id, sd.op, sd.payload
      FROM scenario_deltas sd
      JOIN chain c ON c.scenario_id = sd.scenario_id
      WHERE sd.table_name = %L
      ORDER BY sd.external_id, c.rnk ASC
    ),
    base AS (
      SELECT t.external_id, to_jsonb(t) AS doc
      FROM %I t
      WHERE t.valid_from <= %L::timestamptz
        AND (t.valid_to IS NULL OR t.valid_to > %L::timestamptz)
    ),
    keys AS (
      SELECT external_id FROM base
      UNION
      SELECT external_id FROM d WHERE op = 'upsert'
    )
    SELECT k.external_id,
           CASE WHEN dd.op = 'upsert' THEN dd.payload ELSE b.doc END AS doc
    FROM keys k
    LEFT JOIN d dd ON dd.external_id = k.external_id
    LEFT JOIN base b ON b.external_id = k.external_id
    WHERE dd.op IS DISTINCT FROM 'delete'
  $q$, p_scenario, p_table, p_table, p_as_at, p_as_at);
END
$$;

-- Upgrade the closure seams to be scenario-aware. The reporting edges and the
-- node set are now resolved through the overlay, so the closure of any scenario
-- reflects that scenario's deltas over the baseline (ADR 0004).
CREATE OR REPLACE FUNCTION wfb_effective_reporting_edges(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(child text, parent text) LANGUAGE sql STABLE AS
$$
  SELECT r.doc->>'child_position_external_id', r.doc->>'parent_position_external_id'
  FROM wfb_resolve_entity(p_scenario, 'reporting_lines', p_as_at) r
  WHERE r.doc->>'parent_position_external_id' IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION wfb_rebuild_closure(p_scenario uuid, p_as_at timestamptz)
  RETURNS integer LANGUAGE plpgsql AS
$$
DECLARE
  n integer;
BEGIN
  DELETE FROM position_closure WHERE scenario_id = p_scenario;

  WITH RECURSIVE edges AS (
    SELECT child, parent FROM wfb_effective_reporting_edges(p_scenario, p_as_at)
  ),
  nodes AS (
    SELECT external_id FROM wfb_resolve_entity(p_scenario, 'positions', p_as_at)
  ),
  walk(ancestor, descendant, depth) AS (
    SELECT external_id, external_id, 0 FROM nodes
    UNION ALL
    SELECT w.ancestor, e.child, w.depth + 1
    FROM walk w
    JOIN edges e ON e.parent = w.descendant
    WHERE w.depth < 64
  )
  INSERT INTO position_closure
    (tenant_id, workspace_id, scenario_id, ancestor_external_id, descendant_external_id, depth)
  SELECT wfb_current_tenant(), wfb_current_workspace(), p_scenario, ancestor, descendant, MIN(depth)
  FROM walk
  GROUP BY ancestor, descendant;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
