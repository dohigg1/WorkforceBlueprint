-- Performance: a lightweight projection of resolved position attributes for the
-- measure engine. Numeric aggregates such as full-time equivalent are hot; going
-- through wfb_resolve_entity (which rebuilds full JSONB rows) makes them scan and
-- serialise the whole workspace on every evaluation. This resolver returns only
-- the attributes measures aggregate, and takes a direct-column fast path for the
-- baseline while overlaying deltas for a scenario.

CREATE OR REPLACE FUNCTION wfb_effective_positions(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(external_id text, fte numeric, cost_centre_external_id text, org_unit_external_id text)
  LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF p_scenario = '00000000-0000-0000-0000-000000000000' THEN
    RETURN QUERY
      SELECT p.external_id, p.fte, p.cost_centre_external_id, p.org_unit_external_id
      FROM positions p
      WHERE p.valid_from <= p_as_at
        AND (p.valid_to IS NULL OR p.valid_to > p_as_at);
  ELSE
    RETURN QUERY
      SELECT r.external_id,
             (r.doc->>'fte')::numeric,
             r.doc->>'cost_centre_external_id',
             r.doc->>'org_unit_external_id'
      FROM wfb_resolve_entity(p_scenario, 'positions', p_as_at) r;
  END IF;
END
$$;
