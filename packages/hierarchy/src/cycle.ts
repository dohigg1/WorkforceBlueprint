import type pg from 'pg';
import { insertVersion, supersede, readOpen } from '@wfb/data-model';
import { BASELINE_SCENARIO } from './closure.js';
import { rebuildClosure } from './closure.js';

/** Raised when a reporting-line change would create a cycle. */
export class CycleError extends Error {
  constructor(
    readonly child: string,
    readonly parent: string,
  ) {
    super(`Setting ${child} to report to ${parent} would create a cycle`);
    this.name = 'CycleError';
  }
}

/**
 * Whether making `child` report to `newParent` would create a cycle. A cycle
 * arises exactly when `newParent` is already a descendant of `child`, i.e. when
 * `child` is an ancestor of `newParent` in the current closure. Read against the
 * materialised closure. This is a WRITE-time check used before the change lands.
 */
export async function wouldCreateCycle(
  client: pg.PoolClient,
  child: string,
  newParent: string,
  scenarioId: string = BASELINE_SCENARIO,
): Promise<boolean> {
  if (child === newParent) return true;
  const { rows } = await client.query(
    `SELECT 1 FROM position_closure
     WHERE scenario_id = $1 AND ancestor_external_id = $2 AND descendant_external_id = $3
     LIMIT 1`,
    [scenarioId, child, newParent],
  );
  return rows.length > 0;
}

/**
 * The sanctioned write path for the reporting line of a position. Rejects a
 * change that would create a cycle (INV: cycle detection is a write-time
 * constraint). Orphans and multiple roots are permitted; a NULL newParent makes
 * the position a root. After a valid change the closure is rebuilt.
 *
 * Effective from the supplied instant, day-granular through supersession.
 */
export async function setReportingLine(
  client: pg.PoolClient,
  child: string,
  newParent: string | null,
  effectiveAt: Date,
  ctx: { tenantId: string; workspaceId: string },
): Promise<void> {
  if (newParent !== null && (await wouldCreateCycle(client, child, newParent))) {
    throw new CycleError(child, newParent);
  }

  const externalId = `RL-${child}`;
  const existing = await readOpen(client, 'reporting_lines', externalId);
  if (existing) {
    await supersede(
      client,
      'reporting_lines',
      externalId,
      { parent_position_external_id: newParent },
      effectiveAt,
    );
  } else {
    await insertVersion(client, 'reporting_lines', {
      tenant_id: ctx.tenantId,
      workspace_id: ctx.workspaceId,
      external_id: externalId,
      child_position_external_id: child,
      parent_position_external_id: newParent,
      valid_from: effectiveAt,
    });
  }

  await rebuildClosure(client);
}
