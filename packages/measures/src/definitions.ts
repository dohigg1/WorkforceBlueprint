/**
 * The standard measure library (E06-02). Every analytic in the product is a
 * declarative measure defined here; there are no bespoke aggregation queries in
 * feature code (INV-6). Aggregate SQL is permitted ONLY in this package.
 *
 * Convention for every fragment: $1 is the scenario id, $2 is the as-at date,
 * and the fragment reads from a CTE `scope_ids(external_id)` that the engine
 * prepends. Each scalar fragment must project a single column named `value`.
 */

export type ScopeType = 'node' | 'subtree' | 'org_unit' | 'organisation';

export interface ScalarMeasure {
  key: string;
  title: string;
  unit: 'count' | 'fte' | 'ratio' | 'layers';
  /** Aggregate SQL projecting a single `value`, over `scope_ids`. */
  valueSql: string;
}

// A per-node span sub-expression reused by several aggregate measures.
const SPAN_SUBQUERY = `(
  SELECT count(*) FROM position_closure c
  WHERE c.scenario_id = $1 AND c.ancestor_external_id = s.external_id AND c.depth = 1
)`;

export const SCALAR_MEASURES: Record<string, ScalarMeasure> = {
  headcount: {
    key: 'headcount',
    title: 'Headcount',
    unit: 'count',
    valueSql: `SELECT count(*)::float8 AS value FROM scope_ids`,
  },
  fte: {
    key: 'fte',
    title: 'Full-time equivalent',
    unit: 'fte',
    valueSql: `
      SELECT coalesce(sum((rp.doc->>'fte')::numeric), 0)::float8 AS value
      FROM scope_ids s
      JOIN wfb_resolve_entity($1, 'positions', $2::timestamptz) rp
        ON rp.external_id = s.external_id`,
  },
  vacancies: {
    key: 'vacancies',
    title: 'Vacancies',
    unit: 'count',
    valueSql: `
      SELECT count(*)::float8 AS value
      FROM scope_ids s
      WHERE NOT EXISTS (
        SELECT 1 FROM wfb_resolve_entity($1, 'occupancies', $2::timestamptz) o
        WHERE o.doc->>'position_external_id' = s.external_id
      )`,
  },
  filled_headcount: {
    key: 'filled_headcount',
    title: 'Filled positions',
    unit: 'count',
    valueSql: `
      SELECT count(*)::float8 AS value
      FROM scope_ids s
      WHERE EXISTS (
        SELECT 1 FROM wfb_resolve_entity($1, 'occupancies', $2::timestamptz) o
        WHERE o.doc->>'position_external_id' = s.external_id
      )`,
  },
  average_span: {
    key: 'average_span',
    title: 'Average span of control',
    unit: 'ratio',
    valueSql: `
      SELECT coalesce(avg(span), 0)::float8 AS value
      FROM (SELECT ${SPAN_SUBQUERY} AS span FROM scope_ids s) t
      WHERE span > 0`,
  },
  management_ratio: {
    key: 'management_ratio',
    title: 'Management ratio',
    unit: 'ratio',
    valueSql: `
      SELECT (count(*) FILTER (WHERE span > 0))::float8
             / NULLIF(count(*), 0)::float8 AS value
      FROM (SELECT ${SPAN_SUBQUERY} AS span FROM scope_ids s) t`,
  },
  layers: {
    key: 'layers',
    title: 'Layers',
    unit: 'layers',
    valueSql: `
      SELECT (coalesce(max(c.depth), 0) + 1)::float8 AS value
      FROM position_closure c
      JOIN scope_ids s ON s.external_id = c.descendant_external_id
      WHERE c.scenario_id = $1`,
  },
};

export interface PerNodeMeasure {
  key: string;
  title: string;
  /** Scalar SQL expression per node, referencing `s.external_id` and $1. */
  expr: string;
}

export const PER_NODE_MEASURES: Record<string, PerNodeMeasure> = {
  span_of_control: {
    key: 'span_of_control',
    title: 'Span of control',
    expr: `${SPAN_SUBQUERY}::int`,
  },
  direct_reports: {
    key: 'direct_reports',
    title: 'Direct reports',
    expr: `${SPAN_SUBQUERY}::int`,
  },
  total_descendants: {
    key: 'total_descendants',
    title: 'Total descendants',
    expr: `(SELECT count(*) FROM position_closure c
            WHERE c.scenario_id = $1 AND c.ancestor_external_id = s.external_id AND c.depth >= 1)::int`,
  },
  depth: {
    key: 'depth',
    title: 'Layer index',
    expr: `(SELECT coalesce(max(c.depth), 0) FROM position_closure c
            WHERE c.scenario_id = $1 AND c.descendant_external_id = s.external_id)::int`,
  },
  height: {
    key: 'height',
    title: 'Height',
    expr: `(SELECT coalesce(max(c.depth), 0) FROM position_closure c
            WHERE c.scenario_id = $1 AND c.ancestor_external_id = s.external_id)::int`,
  },
};

export function isScalarMeasure(key: string): boolean {
  return key in SCALAR_MEASURES;
}
export function isPerNodeMeasure(key: string): boolean {
  return key in PER_NODE_MEASURES;
}
