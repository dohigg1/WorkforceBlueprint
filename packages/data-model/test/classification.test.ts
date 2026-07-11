import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getAdminPool, closePools } from '@wfb/tenancy';
import { ensureMigrated } from '@wfb/tenancy/testing';
import { maskRow, roleHasPermission, type FieldClassification } from '@wfb/data-model';

/**
 * INV-7: every column of every customer-data table is classified, and a caller
 * lacking permission receives a masked value rather than an error.
 */

const CUSTOMER_TABLES = [
  'positions', 'people', 'occupancies', 'reporting_lines',
  'locations', 'cost_centres', 'org_units', 'job_families', 'jobs', 'roles',
  'skills', 'activities',
];

beforeAll(async () => {
  await ensureMigrated();
});

afterAll(async () => {
  await closePools();
});

describe('INV-7 classification completeness and masking', () => {
  it('every column of every customer-data table is classified', async () => {
    const admin = getAdminPool();
    const { rows: cols } = await admin.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name = ANY($1)`,
      [CUSTOMER_TABLES],
    );
    const { rows: classified } = await admin.query<{ table_name: string; column_name: string }>(
      'SELECT table_name, column_name FROM field_classifications',
    );
    const known = new Set(classified.map((r) => `${r.table_name}.${r.column_name}`));

    const unclassified = cols
      .map((c) => `${c.table_name}.${c.column_name}`)
      .filter((k) => !known.has(k));
    expect(unclassified, `unclassified columns: ${unclassified.join(', ')}`).toEqual([]);
  });

  it('masks a personal field for a role without permission, but not for one with it', () => {
    const registry = new Map<string, FieldClassification>([
      ['people.email', {
        tableName: 'people', columnName: 'email',
        classification: 'personal', defaultPermission: 'pii:read', masking: 'redact',
      }],
    ]);
    const row = { external_id: 'PPL-1', email: 'someone@example.com' };

    const forViewer = maskRow('people', row, 'viewer', registry);
    expect(forViewer.email).toBe('••••');
    expect(forViewer.external_id).toBe('PPL-1'); // structural field untouched

    const forOwner = maskRow('people', row, 'owner', registry);
    expect(forOwner.email).toBe('someone@example.com');
  });

  it('role permission grants are as declared', () => {
    expect(roleHasPermission('owner', 'pii:read')).toBe(true);
    expect(roleHasPermission('viewer', 'pii:read')).toBe(false);
    expect(roleHasPermission('viewer', 'read')).toBe(true);
  });
});
