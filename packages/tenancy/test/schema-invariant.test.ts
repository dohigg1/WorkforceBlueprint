import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getAdminPool, getAppPool, closePools } from '@wfb/tenancy';

/**
 * INV-1: Tenant and workspace isolation exists in the schema.
 *
 * This test enumerates every table in the public schema and asserts the
 * isolation guarantees. It runs for ever and fails the moment anyone adds a
 * table without tenancy. That is its whole purpose.
 */

// Truly global reference tables: no customer data, justified exemption.
const GLOBAL_ALLOWLIST = new Set(['schema_migrations', 'field_classifications']);

// Tenant-scoped system tables: isolated by tenant but without a separate
// workspace_id column, because their own primary key or tenant_id is the
// scope. They must still have row-level security and fail closed.
const TENANT_SYSTEM = new Set(['tenants', 'workspaces', 'users']);

interface TableRow {
  table_name: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

let tables: TableRow[] = [];

beforeAll(async () => {
  const admin = getAdminPool();
  const { rows } = await admin.query<TableRow>(`
    SELECT c.relname AS table_name,
           c.relrowsecurity,
           c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  tables = rows;
});

afterAll(async () => {
  await closePools();
});

describe('INV-1 schema isolation', () => {
  it('has tables to check (guards against an empty, vacuously-passing run)', () => {
    expect(tables.length).toBeGreaterThan(0);
    // The core tenancy tables must exist.
    const names = new Set(tables.map((t) => t.table_name));
    for (const required of ['tenants', 'workspaces', 'users', 'memberships', 'sessions']) {
      expect(names, `missing table ${required}`).toContain(required);
    }
  });

  it('every non-global table has row-level security enabled and forced, with a policy', async () => {
    const admin = getAdminPool();
    for (const t of tables) {
      if (GLOBAL_ALLOWLIST.has(t.table_name)) continue;
      expect(t.relrowsecurity, `${t.table_name}: RLS not enabled`).toBe(true);
      expect(t.relforcerowsecurity, `${t.table_name}: RLS not forced`).toBe(true);
      const { rows } = await admin.query(
        `SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1`,
        [t.table_name],
      );
      expect(rows.length, `${t.table_name}: no policy`).toBeGreaterThan(0);
    }
  });

  it('every full-tenancy table has non-null tenant_id and workspace_id', async () => {
    const admin = getAdminPool();
    for (const t of tables) {
      if (GLOBAL_ALLOWLIST.has(t.table_name) || TENANT_SYSTEM.has(t.table_name)) continue;
      const { rows } = await admin.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
           AND column_name IN ('tenant_id','workspace_id')`,
        [t.table_name],
      );
      const byName = new Map(rows.map((r) => [r.column_name, r.is_nullable]));
      expect(byName.get('tenant_id'), `${t.table_name}: missing tenant_id`).toBeDefined();
      expect(byName.get('workspace_id'), `${t.table_name}: missing workspace_id`).toBeDefined();
      expect(byName.get('tenant_id'), `${t.table_name}: tenant_id nullable`).toBe('NO');
      expect(byName.get('workspace_id'), `${t.table_name}: workspace_id nullable`).toBe('NO');
    }
  });

  it('fails closed: with no tenant context set, the application role sees zero rows', async () => {
    // Insert a real row via the admin plane so the query is not vacuous.
    const admin = getAdminPool();
    const { rows: tRows } = await admin.query<{ id: string }>(
      `INSERT INTO tenants(name, slug) VALUES ('FailClosed Co', 'failclosed-co') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;
    await admin.query(
      `INSERT INTO workspaces(tenant_id, name, slug) VALUES ($1, 'w', 'main')`,
      [tenantId],
    );

    // The application pool with NO context set. current_setting returns NULL,
    // so the policy predicate is NULL and no rows are returned.
    const app = getAppPool();
    const tenants = await app.query('SELECT * FROM tenants');
    const workspaces = await app.query('SELECT * FROM workspaces');
    expect(tenants.rows.length, 'tenants leaked without context').toBe(0);
    expect(workspaces.rows.length, 'workspaces leaked without context').toBe(0);
  });
});
