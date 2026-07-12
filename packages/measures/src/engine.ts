import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { BASELINE_SCENARIO } from '@wfb/hierarchy';
import {
  SCALAR_MEASURES,
  PER_NODE_MEASURES,
  type ScopeType,
} from './definitions.js';

/**
 * The measure engine (E06-01). It evaluates any registered measure against any
 * scope, in any scenario, at any date, with no bespoke code. Spans, layers,
 * headcount, full-time equivalent and every other number the product shows are
 * evaluated here.
 */

export interface Scope {
  type: ScopeType;
  /** Required for node, subtree and org_unit scopes. */
  anchor?: string;
}

export interface MeasureContext {
  scenarioId: string;
  asAt: string;
}

export function measureContext(
  overrides: Partial<MeasureContext> = {},
  ctx: TenantContext = requireContext(),
): MeasureContext {
  return {
    scenarioId: overrides.scenarioId ?? BASELINE_SCENARIO,
    asAt: overrides.asAt ?? ctx.asAt,
  };
}

// Build the scope CTE. Scenario is always $1, as-at always $2. An anchor, when
// present, is $3.
function scopeSql(scope: Scope, params: unknown[]): string {
  // Every scope references $1 (scenario) and $2 (as-at), and $3 (anchor) when
  // present, so that no passed parameter is left untyped by the planner.
  switch (scope.type) {
    case 'organisation':
      return `SELECT external_id FROM wfb_resolve_entity($1, 'positions', $2::timestamptz)`;
    case 'node':
      params.push(requireAnchor(scope));
      return `SELECT $3::text AS external_id
              WHERE $1::uuid IS NOT NULL AND $2::timestamptz IS NOT NULL`;
    case 'subtree':
      params.push(requireAnchor(scope));
      return `SELECT descendant_external_id AS external_id FROM position_closure
              WHERE scenario_id = $1 AND ancestor_external_id = $3
                AND $2::timestamptz IS NOT NULL`;
    case 'org_unit':
      params.push(requireAnchor(scope));
      return `SELECT external_id FROM wfb_resolve_entity($1, 'positions', $2::timestamptz)
              WHERE doc->>'org_unit_external_id' = $3`;
    case 'role':
      params.push(requireAnchor(scope));
      // Positions belonging to a role, as-at the date. Role membership is a
      // first-class effective-dated relationship (E11).
      return `SELECT position_external_id AS external_id FROM role_positions
              WHERE role_external_id = $3
                AND valid_from <= $2::timestamptz
                AND (valid_to IS NULL OR valid_to > $2::timestamptz)
                AND $1::uuid IS NOT NULL`;
    default: {
      const exhaustive: never = scope.type;
      throw new Error(`Unknown scope type: ${String(exhaustive)}`);
    }
  }
}

function requireAnchor(scope: Scope): string {
  if (!scope.anchor) throw new Error(`Scope ${scope.type} requires an anchor`);
  return scope.anchor;
}

/**
 * Evaluate a scalar (scope-aggregate) measure. Cached by scenario, measure,
 * scope and date; the cache is invalidated per subtree on edits.
 */
export async function evaluate(
  client: pg.PoolClient,
  measureKey: string,
  scope: Scope,
  mctx: MeasureContext,
): Promise<number> {
  const def = SCALAR_MEASURES[measureKey];
  if (!def) throw new Error(`Unknown scalar measure: ${measureKey}`);

  const cached = await readCache(client, measureKey, scope, mctx);
  if (cached !== null) return cached;

  const params: unknown[] = [mctx.scenarioId, mctx.asAt];
  const scope_ids = scopeSql(scope, params);
  const sql = `WITH scope_ids AS (${scope_ids}) ${def.valueSql}`;
  const { rows } = await client.query<{ value: number }>(sql, params);
  const value = Number(rows[0]?.value ?? 0);

  await writeCache(client, measureKey, scope, mctx, value);
  return value;
}

/** Evaluate a per-node measure for every node in the scope. */
export async function evaluatePerNode(
  client: pg.PoolClient,
  measureKey: string,
  scope: Scope,
  mctx: MeasureContext,
): Promise<Map<string, number>> {
  const def = PER_NODE_MEASURES[measureKey];
  if (!def) throw new Error(`Unknown per-node measure: ${measureKey}`);

  const params: unknown[] = [mctx.scenarioId, mctx.asAt];
  const scope_ids = scopeSql(scope, params);
  const sql = `WITH scope_ids AS (${scope_ids})
               SELECT s.external_id AS id, ${def.expr} AS value FROM scope_ids s`;
  const { rows } = await client.query<{ id: string; value: number }>(sql, params);
  return new Map(rows.map((r) => [r.id, Number(r.value)]));
}

/**
 * Invalidate cached measures affected by an edit at a node: the node's own
 * scopes, every ancestor subtree, and any organisation-wide scope. This is the
 * subtree-level invalidation that keeps recompute bounded.
 */
export async function invalidateSubtree(
  client: pg.PoolClient,
  editedNode: string,
  scenarioId: string = BASELINE_SCENARIO,
): Promise<void> {
  await client.query(
    `DELETE FROM measure_cache mc
     WHERE mc.scenario_id = $1
       AND (
         mc.scope_type = 'organisation'
         OR mc.scope_anchor = $2
         OR mc.scope_anchor IN (
           SELECT ancestor_external_id FROM position_closure
           WHERE scenario_id = $1 AND descendant_external_id = $2
         )
       )`,
    [scenarioId, editedNode],
  );
}

async function readCache(
  client: pg.PoolClient,
  measureKey: string,
  scope: Scope,
  mctx: MeasureContext,
): Promise<number | null> {
  const { rows } = await client.query<{ value: number }>(
    `SELECT value FROM measure_cache
     WHERE scenario_id = $1 AND measure_key = $2 AND scope_type = $3
       AND scope_anchor = $4 AND as_at = $5::date`,
    [mctx.scenarioId, measureKey, scope.type, scope.anchor ?? '', mctx.asAt],
  );
  return rows[0] ? Number(rows[0].value) : null;
}

async function writeCache(
  client: pg.PoolClient,
  measureKey: string,
  scope: Scope,
  mctx: MeasureContext,
  value: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO measure_cache
       (tenant_id, workspace_id, scenario_id, measure_key, scope_type, scope_anchor, as_at, value)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
     ON CONFLICT (workspace_id, scenario_id, measure_key, scope_type, scope_anchor, as_at)
     DO UPDATE SET value = EXCLUDED.value, computed_at = now()`,
    [
      ctx.tenantId,
      ctx.workspaceId,
      mctx.scenarioId,
      measureKey,
      scope.type,
      scope.anchor ?? '',
      mctx.asAt,
      value,
    ],
  );
}
