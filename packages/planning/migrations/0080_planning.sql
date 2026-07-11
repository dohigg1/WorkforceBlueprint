-- E12: strategic workforce planning. The key architectural claim: supply,
-- demand and gap are time-series MEASURES over the same graph. If the measure
-- engine is right, this epic needs no new calculation infrastructure. It does
-- not: supply is the headcount (or full-time-equivalent) measure evaluated at a
-- series of future dates over a planning scenario; demand is a target curve;
-- gap is their difference. This migration adds only the demand curve and makes
-- scenario deltas themselves effective-dated so that planned joiners
-- (requisitions) and leavers resolve correctly over time.

-- Make scenario overlay resolution respect the effective dates carried in an
-- upsert delta's payload. A requisition (a delta upserting a position with a
-- future valid_from) appears only from that date; a planned leaver (a delta
-- upserting a position with a future valid_to) disappears after it. When a
-- delta exists for an entity the baseline row is suppressed, so a leaver does
-- not leak back in from the baseline after their leaving date.
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
      AND (
        dd.op IS NULL
        OR (dd.op = 'upsert'
            AND (dd.payload->>'valid_from')::timestamptz <= %L::timestamptz
            AND ((dd.payload->>'valid_to') IS NULL OR (dd.payload->>'valid_to')::timestamptz > %L::timestamptz))
      )
  $q$, p_scenario, p_table, p_table, p_as_at, p_as_at, p_as_at, p_as_at);
END
$$;

-- The demand curve: a target headcount for a scope at a horizon date. Tenant
-- scoped configuration. The latest target at or before a horizon applies.
CREATE TABLE demand_targets (
  tenant_id         uuid NOT NULL,
  workspace_id      uuid NOT NULL,
  external_id       text NOT NULL,
  scope_type        text NOT NULL,
  scope_anchor      text NOT NULL DEFAULT '',
  target_date       date NOT NULL,
  target_headcount  numeric(12,2) NOT NULL,
  PRIMARY KEY (workspace_id, external_id)
);
CREATE INDEX demand_targets_scope_idx ON demand_targets (workspace_id, scope_type, scope_anchor, target_date);
SELECT wfb_apply_tenancy('demand_targets');
