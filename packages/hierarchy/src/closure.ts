import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';

/** The baseline scenario sentinel. Every non-scenario query uses this. */
export const BASELINE_SCENARIO = '00000000-0000-0000-0000-000000000000';

export interface ClosureRow {
  ancestor_external_id: string;
  descendant_external_id: string;
  depth: number;
}

function scenarioOf(ctxScenario?: string): string {
  return ctxScenario ?? BASELINE_SCENARIO;
}

/**
 * Rebuild the closure for a scenario as-at the caller's date. Maintenance path;
 * uses the recursive CTE inside wfb_rebuild_closure. Returns the row count.
 */
export async function rebuildClosure(
  client: pg.PoolClient,
  scenarioId: string = BASELINE_SCENARIO,
  ctx: TenantContext = requireContext(),
): Promise<number> {
  const { rows } = await client.query<{ wfb_rebuild_closure: number }>(
    'SELECT wfb_rebuild_closure($1, $2) AS wfb_rebuild_closure',
    [scenarioId, ctx.asAt],
  );
  // Refresh planner statistics so ancestor and descendant lookups use the right
  // index immediately, rather than waiting for autoanalyze.
  await client.query('SELECT wfb_analyze_closure()');
  return rows[0]?.wfb_rebuild_closure ?? 0;
}

/**
 * Descendants of a position (its whole subtree, excluding itself by default).
 * Indexed lookup against the materialised closure: the hot read path.
 */
export async function descendants(
  client: pg.PoolClient,
  positionExternalId: string,
  opts: { includeSelf?: boolean; maxDepth?: number; scenarioId?: string } = {},
): Promise<ClosureRow[]> {
  const minDepth = opts.includeSelf ? 0 : 1;
  const params: unknown[] = [scenarioOf(opts.scenarioId), positionExternalId, minDepth];
  let sql = `SELECT ancestor_external_id, descendant_external_id, depth
             FROM position_closure
             WHERE scenario_id = $1 AND ancestor_external_id = $2 AND depth >= $3`;
  if (opts.maxDepth != null) {
    params.push(opts.maxDepth);
    sql += ` AND depth <= $${params.length}`;
  }
  sql += ' ORDER BY depth, descendant_external_id';
  const { rows } = await client.query<ClosureRow>(sql, params);
  return rows;
}

/** Ancestors of a position, from nearest to furthest. */
export async function ancestors(
  client: pg.PoolClient,
  positionExternalId: string,
  opts: { includeSelf?: boolean; scenarioId?: string } = {},
): Promise<ClosureRow[]> {
  const minDepth = opts.includeSelf ? 0 : 1;
  const { rows } = await client.query<ClosureRow>(
    `SELECT ancestor_external_id, descendant_external_id, depth
     FROM position_closure
     WHERE scenario_id = $1 AND descendant_external_id = $2 AND depth >= $3
     ORDER BY depth`,
    [scenarioOf(opts.scenarioId), positionExternalId, minDepth],
  );
  return rows;
}

/** The subtree of a position including itself. */
export function subtree(
  client: pg.PoolClient,
  positionExternalId: string,
  opts: { maxDepth?: number; scenarioId?: string } = {},
): Promise<ClosureRow[]> {
  return descendants(client, positionExternalId, { ...opts, includeSelf: true });
}

/**
 * Depth of a position from its root (0 for a root), read as the furthest
 * ancestor distance. This is a scalar structural read, not an aggregate; span
 * of control, layer index and headcount are measures and live in the measure
 * engine, never here (INV-6).
 */
export async function depthOf(
  client: pg.PoolClient,
  positionExternalId: string,
  opts: { scenarioId?: string } = {},
): Promise<number> {
  const { rows } = await client.query<{ depth: number }>(
    `SELECT depth FROM position_closure
     WHERE scenario_id = $1 AND descendant_external_id = $2
     ORDER BY depth DESC LIMIT 1`,
    [scenarioOf(opts.scenarioId), positionExternalId],
  );
  return rows[0]?.depth ?? 0;
}
