import type pg from 'pg';
import type { AuditEntry } from './types.js';

export type { AuditEntry, AuditOperation } from './types.js';

export interface ReadAuditOptions {
  /** Restrict to a single audited table, for example 'positions'. */
  tableName?: string;
  /** Maximum number of entries to return. Defaults to 100. */
  limit?: number;
}

/**
 * Read audit entries for the caller's tenant and workspace, most recent first.
 * Row-level security scopes the result to the active tenant context, so a
 * caller never sees another tenant's log. This is a plain effective read of the
 * append-only log, not an analytic, so it does not belong in the measure engine
 * (INV-6). The client must already carry tenant context (use runInTenant).
 */
export async function readAuditLog(
  client: pg.PoolClient,
  options: ReadAuditOptions = {},
): Promise<AuditEntry[]> {
  const limit = options.limit ?? 100;
  const params: unknown[] = [];
  let where = '';
  if (options.tableName !== undefined) {
    params.push(options.tableName);
    where = `WHERE table_name = $${params.length}`;
  }
  params.push(limit);
  const { rows } = await client.query<AuditEntry>(
    `SELECT id, tenant_id, workspace_id, actor_user_id, occurred_at,
            table_name, operation, row_external_id, before, after
       FROM audit_log
       ${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${params.length}`,
    params,
  );
  return rows;
}
