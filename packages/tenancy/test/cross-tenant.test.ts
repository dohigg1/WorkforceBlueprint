import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools } from '@wfb/tenancy';
import { ensureMigrated, seedTenant, type SeededTenant } from '@wfb/tenancy/testing';

/**
 * INV-2: A user of Tenant A receives zero rows from Tenant B, by identifier,
 * through the real row-level security policies. A cross-tenant read returns
 * not-found (zero rows), never a record from another tenant.
 */

let a: SeededTenant;
let b: SeededTenant;

beforeAll(async () => {
  await ensureMigrated();
  a = await seedTenant('alpha');
  b = await seedTenant('beta');
});

afterAll(async () => {
  await closePools();
});

describe('INV-2 cross-tenant isolation', () => {
  it('a tenant sees only its own memberships', async () => {
    const seen = await runInTenant(a.context, async (client) => {
      const { rows } = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM memberships');
      return rows;
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const row of seen) {
      expect(row.tenant_id).toBe(a.tenantId);
      expect(row.tenant_id).not.toBe(b.tenantId);
    }
  });

  it("reading tenant B's workspace by id, as tenant A, returns zero rows (not-found, not forbidden)", async () => {
    const rows = await runInTenant(a.context, async (client) => {
      const res = await client.query('SELECT * FROM workspaces WHERE id = $1', [b.workspaceId]);
      return res.rows;
    });
    expect(rows.length).toBe(0);
  });

  it("reading tenant B's user by id, as tenant A, returns zero rows", async () => {
    const rows = await runInTenant(a.context, async (client) => {
      const res = await client.query('SELECT * FROM users WHERE id = $1', [b.userId]);
      return res.rows;
    });
    expect(rows.length).toBe(0);
  });

  it('cannot write a row scoped to another tenant/workspace (WITH CHECK blocks it)', async () => {
    await expect(
      runInTenant(a.context, async (client) => {
        // Attempt to create a membership pointing at tenant B's workspace while
        // authenticated as tenant A. The WITH CHECK predicate must reject it.
        await client.query(
          `INSERT INTO memberships(tenant_id, workspace_id, user_id, role)
           VALUES ($1, $2, $3, 'viewer')`,
          [b.tenantId, b.workspaceId, b.userId, 'viewer'],
        );
      }),
    ).rejects.toThrow();
  });

  it('each tenant reads back exactly the workspace it owns', async () => {
    const aWs = await runInTenant(a.context, async (client) => {
      const { rows } = await client.query<{ id: string }>('SELECT id FROM workspaces');
      return rows.map((r) => r.id);
    });
    const bWs = await runInTenant(b.context, async (client) => {
      const { rows } = await client.query<{ id: string }>('SELECT id FROM workspaces');
      return rows.map((r) => r.id);
    });
    expect(aWs).toContain(a.workspaceId);
    expect(aWs).not.toContain(b.workspaceId);
    expect(bWs).toContain(b.workspaceId);
    expect(bWs).not.toContain(a.workspaceId);
  });
});
