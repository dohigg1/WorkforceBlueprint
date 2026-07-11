import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Role } from '@wfb/tenancy';

/**
 * INV-7: field classification and masking. A user lacking permission for a
 * field receives a masked value, never an error, so that aggregates over
 * restricted data still resolve. Masking is applied at the point a field is
 * projected for a caller.
 */

export type Classification =
  | 'structural'
  | 'financial'
  | 'personal'
  | 'sensitive_personal'
  | 'special_category';

export type Masking = 'none' | 'redact' | 'hash' | 'aggregate_only' | 'suppress_small_group';

export interface FieldClassification {
  tableName: string;
  columnName: string;
  classification: Classification;
  defaultPermission: string;
  masking: Masking;
}

/** Load the whole classification registry. It is small, global reference data. */
export async function loadClassifications(
  client: pg.PoolClient,
): Promise<Map<string, FieldClassification>> {
  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    classification: Classification;
    default_permission: string;
    masking: Masking;
  }>('SELECT * FROM field_classifications');
  const map = new Map<string, FieldClassification>();
  for (const r of rows) {
    map.set(`${r.table_name}.${r.column_name}`, {
      tableName: r.table_name,
      columnName: r.column_name,
      classification: r.classification,
      defaultPermission: r.default_permission,
      masking: r.masking,
    });
  }
  return map;
}

// Which roles hold which field-level permissions. Structural reads ('read')
// are open to every role; personal and financial reads require a grant.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<string>> = {
  owner: new Set(['read', 'pii:read', 'finance:read']),
  administrator: new Set(['read', 'pii:read', 'finance:read']),
  designer: new Set(['read', 'finance:read']),
  analyst: new Set(['read', 'finance:read']),
  viewer: new Set(['read']),
};

export function roleHasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Apply the masking behaviour to a single value for a caller lacking access. */
export function maskValue(value: unknown, masking: Masking): unknown {
  if (value == null) return value;
  switch (masking) {
    case 'none':
      return value;
    case 'redact':
      return '••••';
    case 'hash':
      return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
    case 'aggregate_only':
    case 'suppress_small_group':
      return null;
    default:
      return null;
  }
}

/**
 * Project a row for a caller, masking any field the caller may not read. The
 * shape of the row is preserved; only restricted values are masked, so that
 * downstream aggregation of unrestricted fields is unaffected.
 */
export function maskRow(
  table: string,
  row: Record<string, unknown>,
  role: Role,
  registry: Map<string, FieldClassification>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const fc = registry.get(`${table}.${key}`);
    if (fc && fc.masking !== 'none' && !roleHasPermission(role, fc.defaultPermission)) {
      out[key] = maskValue(value, fc.masking);
    } else {
      out[key] = value;
    }
  }
  return out;
}
