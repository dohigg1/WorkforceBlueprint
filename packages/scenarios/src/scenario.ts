import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { rebuildClosure } from '@wfb/hierarchy';

/**
 * The scenario overlay engine (E07-01, INV-5). A scenario is a copy-on-write
 * delta from its parent, resolved at read time. Every user edit writes a delta
 * into the active scenario through these functions; nothing here writes to a
 * baseline table.
 */

export interface Scenario {
  id: string;
  name: string;
  parent_scenario_id: string | null;
  status: string;
}

export type DeltaOp = 'upsert' | 'delete';

/** Create a scenario. A single insert: instantaneous, negligible storage. */
export async function createScenario(
  client: pg.PoolClient,
  name: string,
  parentScenarioId: string | null = null,
  ctx: TenantContext = requireContext(),
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO scenarios (tenant_id, workspace_id, name, parent_scenario_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ctx.tenantId, ctx.workspaceId, name, parentScenarioId],
  );
  return rows[0]!.id;
}

/** Resolve all effective rows of a table for a scenario, as-at the context date. */
export async function resolveEntities(
  client: pg.PoolClient,
  scenarioId: string,
  table: string,
  ctx: TenantContext = requireContext(),
): Promise<Record<string, unknown>[]> {
  const { rows } = await client.query<{ doc: Record<string, unknown> }>(
    'SELECT doc FROM wfb_resolve_entity($1, $2, $3)',
    [scenarioId, table, ctx.asAt],
  );
  return rows.map((r) => r.doc);
}

/** Resolve one effective row of a table for a scenario, or null. */
export async function resolveOne(
  client: pg.PoolClient,
  scenarioId: string,
  table: string,
  externalId: string,
  ctx: TenantContext = requireContext(),
): Promise<Record<string, unknown> | null> {
  const { rows } = await client.query<{ doc: Record<string, unknown> }>(
    'SELECT doc FROM wfb_resolve_entity($1, $2, $3) WHERE external_id = $4',
    [scenarioId, table, ctx.asAt, externalId],
  );
  return rows[0]?.doc ?? null;
}

/**
 * Edit an entity within a scenario: copy-on-write. Resolves the current
 * effective row (inheriting from the scenario chain and the baseline), applies
 * the overrides, and stores the merged row as an upsert delta. The baseline is
 * never touched.
 */
export async function editEntity(
  client: pg.PoolClient,
  scenarioId: string,
  table: string,
  externalId: string,
  overrides: Record<string, unknown>,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  const current = await resolveOne(client, scenarioId, table, externalId, ctx);
  const payload = { ...(current ?? { external_id: externalId }), ...overrides };
  await upsertDelta(client, scenarioId, table, externalId, 'upsert', payload, ctx);
}

/** Tombstone an entity within a scenario. The baseline is never touched. */
export async function deleteEntity(
  client: pg.PoolClient,
  scenarioId: string,
  table: string,
  externalId: string,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await upsertDelta(client, scenarioId, table, externalId, 'delete', null, ctx);
}

async function upsertDelta(
  client: pg.PoolClient,
  scenarioId: string,
  table: string,
  externalId: string,
  op: DeltaOp,
  payload: Record<string, unknown> | null,
  ctx: TenantContext,
): Promise<void> {
  // Overwriting an existing delta is copy-on-write on the overlay store, not a
  // destructive entity mutation; scenario_deltas is not an effective-dated
  // entity table.
  await client.query(
    `INSERT INTO scenario_deltas
       (tenant_id, workspace_id, scenario_id, table_name, external_id, op, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (scenario_id, table_name, external_id)
     DO UPDATE SET op = EXCLUDED.op, payload = EXCLUDED.payload, updated_at = now()`,
    [ctx.tenantId, ctx.workspaceId, scenarioId, table, externalId, op, payload],
  );
}

/** Rebuild the closure for a scenario, reflecting its structural deltas. */
export function rebuildScenarioClosure(
  client: pg.PoolClient,
  scenarioId: string,
  ctx: TenantContext = requireContext(),
): Promise<number> {
  return rebuildClosure(client, scenarioId, ctx);
}
