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
