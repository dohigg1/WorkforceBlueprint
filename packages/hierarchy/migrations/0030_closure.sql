-- E02-03, E02-04: the position hierarchy as a materialised closure table.
-- The closure is the hot read path (INV-9: subtree query < 100ms at 100k). It is
-- maintained by recursive CTE (permitted for maintenance, forbidden on hot
-- reads), is cycle-safe, and is keyed by scenario so it is scenario-ready from
-- the first migration (ADR 0004). The baseline scenario is the all-zero sentinel.

CREATE TABLE position_closure (
  tenant_id              uuid NOT NULL,
  workspace_id           uuid NOT NULL,
  scenario_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ancestor_external_id   text NOT NULL,
  descendant_external_id text NOT NULL,
  depth                  integer NOT NULL,
  PRIMARY KEY (workspace_id, scenario_id, ancestor_external_id, descendant_external_id)
);
CREATE INDEX position_closure_desc_idx
  ON position_closure (workspace_id, scenario_id, descendant_external_id) INCLUDE (depth);
CREATE INDEX position_closure_anc_idx
  ON position_closure (workspace_id, scenario_id, ancestor_external_id) INCLUDE (depth);
SELECT wfb_apply_tenancy('position_closure');

-- The seam through which the effective reporting graph of a scenario is
-- resolved, as-at a date. For the baseline it is the reporting lines live at the
-- date. The scenarios package extends this to overlay a scenario's deltas.
CREATE OR REPLACE FUNCTION wfb_effective_reporting_edges(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(child text, parent text) LANGUAGE sql STABLE AS
$$
  SELECT child_position_external_id, parent_position_external_id
  FROM reporting_lines
  WHERE parent_position_external_id IS NOT NULL
    AND valid_from <= p_as_at
    AND (valid_to IS NULL OR valid_to > p_as_at)
$$;

-- Rebuild the closure for a scenario as-at a date, scoped by row-level security
-- to the caller's workspace. Cycle-safe via a depth cap; duplicate ancestor and
-- descendant pairs (from cycles or multiple paths) collapse to their minimum
-- depth. Returns the number of closure rows written.
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
    SELECT external_id FROM positions
    WHERE valid_from <= p_as_at AND (valid_to IS NULL OR valid_to > p_as_at)
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

-- Refresh planner statistics on the closure after a bulk rebuild, so that
-- ancestor and descendant lookups choose the correct index and meet the 100ms
-- target. ANALYZE requires table ownership, which the application role does not
-- have, so this is SECURITY DEFINER and scoped to this one table (ANALYZE moves
-- no data and cannot leak across tenants). Functions are executable by PUBLIC by
-- default, so the application role may call it.
CREATE OR REPLACE FUNCTION wfb_analyze_closure() RETURNS void
  SECURITY DEFINER LANGUAGE plpgsql AS
$$
BEGIN
  EXECUTE 'ANALYZE position_closure';
END
$$;
