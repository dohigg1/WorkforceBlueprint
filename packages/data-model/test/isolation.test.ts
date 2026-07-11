import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion, readAsOf, type Position } from '@wfb/data-model';

/**
 * INV-1/INV-2 for the canonical model: a position created by Tenant A is never
 * visible to Tenant B through the entity read path.
 */

let a: TenantContext;
let b: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  a = (await seedTenant('isoA')).context;
  b = (await seedTenant('isoB')).context;
  await runInTenant(a, (client) =>
    insertVersion(client, 'positions', {
      tenant_id: a.tenantId,
      workspace_id: a.workspaceId,
      external_id: 'ISO-P1',
      title: "A's secret position",
      fte: 1.0,
    }),
  );
});

afterAll(async () => {
  await closePools();
});

describe('canonical model isolation', () => {
  it('Tenant B sees zero of Tenant A positions', async () => {
    const seenByB = await runInTenant(b, (client) => readAsOf<Position>(client, 'positions'));
    expect(seenByB.length).toBe(0);
  });

  it('Tenant A sees its own position', async () => {
    const seenByA = await runInTenant(a, (client) => readAsOf<Position>(client, 'positions'));
    expect(seenByA.map((p) => p.external_id)).toContain('ISO-P1');
  });
});
