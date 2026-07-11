import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { rebuildClosure } from '@wfb/hierarchy';
import { signSession, verifySession } from '../src/auth/session.js';
import { ApiService } from '../src/api/api.service.js';

/**
 * API layer: the session is the only source of identity (INV-2), and the
 * service inherits tenant isolation from the engines it wraps.
 */

let a: TenantContext;
let b: TenantContext;
const svc = new ApiService();
const EFF = new Date('2020-01-01T00:00:00Z');

beforeAll(async () => {
  await ensureMigrated();
  a = (await seedTenant('apiA')).context;
  b = (await seedTenant('apiB')).context;
  for (const ctx of [a, b]) {
    await runInTenant(ctx, async (client) => {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
        external_id: 'ROOT', title: 'Root', fte: 1.0, valid_from: EFF,
      });
      await rebuildClosure(client);
    });
  }
});

afterAll(async () => {
  await closePools();
});

describe('session tokens', () => {
  it('round-trips claims and rejects a tampered token', () => {
    const token = signSession({ tenantId: a.tenantId, workspaceId: a.workspaceId, userId: a.userId!, role: 'owner' });
    const claims = verifySession(token);
    expect(claims?.tenantId).toBe(a.tenantId);
    expect(verifySession(token + 'x')).toBeNull();
  });
});

describe('api service tenant isolation', () => {
  it('each tenant sees only its own tree through the service', async () => {
    const treeA = await svc.getTree(a, {});
    const treeB = await svc.getTree(b, {});
    expect(treeA.nodes.length).toBe(1);
    expect(treeB.nodes.length).toBe(1);
    // Both have a 'ROOT' external id, but they are different tenants' rows; the
    // service never returns the other tenant's data.
    const measuresA = await svc.getMeasures(a, {});
    expect(measuresA.headcount).toBe(1);
  });
});

describe('ingestion analysis endpoint', () => {
  it('maps awkward headers and flags defects', async () => {
    const csv = [
      'Position ID,Position Title (Local),Emp Grp,MGR_PERNR,Cost Ctr,FTE%,Annual Base Sal (GBP)',
      'P100,Head of Sales,Active,P001,CC-01,100,95000',
      'P101,Sales Rep,Active,P100,CC-01,80,42000',
      'P102,Sales Rep,Active,P999,,0,-5',
    ].join('\n');
    const r = await svc.analyzeCsv(csv);
    const byField = new Map(r.mapping.map((m) => [m.sourceColumn, m.targetField]));
    expect(byField.get('MGR_PERNR')).toBe('manager_external_id');
    expect(byField.get('Cost Ctr')).toBe('cost_centre_external_id');
    expect(byField.get('FTE%')).toBe('fte');
    expect(byField.get('Annual Base Sal (GBP)')).toBe('base_salary');
    expect(r.validation.countsByCode.orphan_manager).toBeGreaterThan(0);
    expect(r.validation.countsByCode.non_positive_fte).toBeGreaterThan(0);
    expect(r.validation.score).toBeLessThan(100);
  });
});
