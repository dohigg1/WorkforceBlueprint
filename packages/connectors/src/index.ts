// @wfb/connectors: the read-only connector framework and its connectors. A
// connector fetches an extract from an external source and hands the rows to
// @wfb/ingestion for mapping and validation. Nothing here writes back to a
// source, and nothing here loads into the canonical tables; loading is a
// separate, human-gated step. Write-back is explicitly out of scope.
//
// Importing this module registers the built-in connectors (file, workday) as a
// side effect, so callers only need to import runSync and createConnection.

import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { registerConnector } from './framework.js';
import { fileConnector } from './file-connector.js';
import { workdayConnector } from './workday-connector.js';

export {
  type Connector,
  type SyncOutcome,
  registerConnector,
  getConnector,
  runSync,
  buildCanonicalRows,
} from './framework.js';

export { fileConnector, type FileConnectorConfig } from './file-connector.js';
export { workdayConnector } from './workday-connector.js';

// Register the built-in connectors. The file connector is the working, secure
// file transfer connector for this build. The Workday connector is a registered
// stub marking the framework extension point.
registerConnector(fileConnector);
registerConnector(workdayConnector);

/**
 * Create a configured connection. Inserts a connections row scoped to the
 * caller's tenant and workspace; row-level security enforces the isolation and
 * the WITH CHECK clause rejects any row that does not match the active context.
 * The client must already carry tenant context (use runInTenant).
 */
export async function createConnection(
  client: pg.PoolClient,
  externalId: string,
  kind: string,
  name: string,
  config: Record<string, unknown>,
  ctx: TenantContext = requireContext(),
): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO connections (tenant_id, workspace_id, external_id, kind, name, config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [ctx.tenantId, ctx.workspaceId, externalId, kind, name, config],
  );
  return rows[0]!;
}
