import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion, supersede, readAsOf, readOpen, type Position } from '@wfb/data-model';

/**
 * INV-4: everything is effective-dated and every read is as-at a date. A read
 * without an explicit date defaults to today and never returns superseded rows;
 * a read as-at a past date returns the superseded state.
 */

let ctx: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  const seed = await seedTenant('chronos');
  ctx = seed.context;
});

afterAll(async () => {
  await closePools();
});

async function insertPosition(c: TenantContext, extId: string, title: string, from: string) {
  await runInTenant(c, (client) =>
    insertVersion(client, 'positions', {
      tenant_id: c.tenantId,
      workspace_id: c.workspaceId,
      external_id: extId,
      title,
      fte: 1.0,
      valid_from: from,
    }),
  );
}

describe('INV-4 effective dating', () => {
  it('supersedes rather than destructively updating, keeping one open version', async () => {
    await insertPosition(ctx, 'CHR-1', 'Analyst', '2020-01-01T00:00:00Z');
    await runInTenant(ctx, (client) =>
      supersede(client, 'positions', 'CHR-1', { title: 'Senior Analyst' }, new Date('2023-06-01T00:00:00Z')),
    );

    // Exactly one open version, and it is the superseding one.
    const open = await runInTenant(ctx, (client) => readOpen<Position>(client, 'positions', 'CHR-1'));
    expect(open).not.toBeNull();
    expect(open!.title).toBe('Senior Analyst');

    const allVersions = await runInTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT title, valid_from, valid_to FROM positions WHERE external_id='CHR-1' ORDER BY valid_from`,
      );
      return rows;
    });
    expect(allVersions.length).toBe(2);
    expect(allVersions.filter((r) => r.valid_to === null).length).toBe(1);
  });

  it('a read with no explicit date defaults to today and returns the current version', async () => {
    const rows = await runInTenant(
      { ...ctx, asAt: new Date().toISOString().slice(0, 10) },
      (client) => readAsOf<Position>(client, 'positions', { where: "external_id = 'CHR-1'" }),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.title).toBe('Senior Analyst');
  });

  it('a read as-at a past date returns the superseded state', async () => {
    const past = await runInTenant({ ...ctx, asAt: '2021-01-01' }, (client) =>
      readAsOf<Position>(client, 'positions', { where: "external_id = 'CHR-1'" }),
    );
    expect(past.length).toBe(1);
    expect(past[0]!.title).toBe('Analyst');
  });

  it('a read before the entity existed returns nothing', async () => {
    const before = await runInTenant({ ...ctx, asAt: '2019-01-01' }, (client) =>
      readAsOf<Position>(client, 'positions', { where: "external_id = 'CHR-1'" }),
    );
    expect(before.length).toBe(0);
  });
});
