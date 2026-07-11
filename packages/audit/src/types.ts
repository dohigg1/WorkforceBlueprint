/**
 * Audit log types (INV-3). One entry is written per mutation of customer data,
 * by a database trigger, inside the same transaction as the change.
 */

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/** A single append-only audit log entry, as read back from the database. */
export interface AuditEntry {
  id: string;
  tenant_id: string;
  workspace_id: string;
  /** The acting user from the session context, or null on a system path. */
  actor_user_id: string | null;
  occurred_at: Date;
  table_name: string;
  operation: AuditOperation;
  /** The stable client key of the affected row, or null when it has none. */
  row_external_id: string | null;
  /** Row state before the change, for UPDATE and DELETE; null for INSERT. */
  before: Record<string, unknown> | null;
  /** Row state after the change, for INSERT and UPDATE; null for DELETE. */
  after: Record<string, unknown> | null;
}
