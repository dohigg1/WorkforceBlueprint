-- Performance fix for the scenario-aware closure rebuild.
--
-- Routing the recursive closure walk through wfb_resolve_entity (a set-returning
-- plpgsql function that rebuilds full JSONB rows) caused the resolver to be
-- re-executed on every recursion step, and to materialise documents the closure
-- does not need. This restores performance while keeping scenario-awareness:
--   * lightweight resolvers return only the ids and edges the closure needs;
--   * the baseline takes a direct-column fast path with no overlay machinery;
--   * a scenario overlays deltas through the existing resolver;
--   * the rebuild marks the edge and node CTEs MATERIALIZED so they compute once.

CREATE OR REPLACE FUNCTION wfb_effective_reporting_edges(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(child text, parent text) LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF p_scenario = '00000000-0000-0000-0000-000000000000' THEN
    RETURN QUERY
      SELECT rl.child_position_external_id, rl.parent_position_external_id
      FROM reporting_lines rl
      WHERE rl.parent_position_external_id IS NOT NULL
        AND rl.valid_from <= p_as_at
        AND (rl.valid_to IS NULL OR rl.valid_to > p_as_at);
  ELSE
    RETURN QUERY
      SELECT r.doc->>'child_position_external_id', r.doc->>'parent_position_external_id'
      FROM wfb_resolve_entity(p_scenario, 'reporting_lines', p_as_at) r
      WHERE r.doc->>'parent_position_external_id' IS NOT NULL;
  END IF;
END
$$;

-- The effective set of position ids for a scenario, as-at a date. Baseline reads
-- the column directly; a scenario overlays deltas.
CREATE OR REPLACE FUNCTION wfb_effective_position_ids(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(external_id text) LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF p_scenario = '00000000-0000-0000-0000-000000000000' THEN
    RETURN QUERY
      SELECT p.external_id FROM positions p
      WHERE p.valid_from <= p_as_at
        AND (p.valid_to IS NULL OR p.valid_to > p_as_at);
  ELSE
    RETURN QUERY
      SELECT r.external_id FROM wfb_resolve_entity(p_scenario, 'positions', p_as_at) r;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION wfb_rebuild_closure(p_scenario uuid, p_as_at timestamptz)
  RETURNS integer LANGUAGE plpgsql AS
$$
DECLARE
  n integer;
BEGIN
  DELETE FROM position_closure WHERE scenario_id = p_scenario;

  WITH RECURSIVE
  edges AS MATERIALIZED (
    SELECT child, parent FROM wfb_effective_reporting_edges(p_scenario, p_as_at)
  ),
  nodes AS MATERIALIZED (
    SELECT external_id FROM wfb_effective_position_ids(p_scenario, p_as_at)
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
