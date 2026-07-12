import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, BASELINE_SCENARIO } from '@wfb/hierarchy';
import { evaluate, evaluatePerNode, measureContext, type Scope } from '@wfb/measures';

/**
 * INV-6: the same measure evaluated through two different surfaces returns
 * identical values. Here we prove that headcount from the scalar engine equals
 * headcount derived from the per-node surface and from the closure directly.
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('consist')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['C1', 'C2', 'C3', 'C4']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: id,
        title: id,
        fte: 1.0,
        valid_from: EFF,
      });
    }
    await setReportingLine(client, 'C2', 'C1', EFF, ctx);
    await setReportingLine(client, 'C3', 'C1', EFF, ctx);
    await setReportingLine(client, 'C4', 'C2', EFF, ctx);
  });
});

afterAll(async () => {
  await closePools();
});

describe('INV-6 measure consistency', () => {
  it('headcount agrees across the scalar engine, the per-node surface and the closure', async () => {
    const scope: Scope = { type: 'subtree', anchor: 'C1' };
    const mctx = measureContext({}, ctx);

    const scalar = await runInTenant(ctx, (c) => evaluate(c, 'headcount', scope, mctx));
    const perNode = await runInTenant(ctx, (c) => evaluatePerNode(c, 'span_of_control', scope, mctx));
    const rawClosure = await runInTenant(ctx, async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM position_closure
         WHERE scenario_id = $1 AND ancestor_external_id = 'C1'`,
        [BASELINE_SCENARIO],
      );
      return Number(rows[0]!.n);
    });

    expect(scalar).toBe(4);
    expect(perNode.size).toBe(scalar);
    expect(rawClosure).toBe(scalar);
  });

  it('is deterministic: repeated evaluation returns the identical value', async () => {
    const scope: Scope = { type: 'organisation' };
    const mctx = measureContext({}, ctx);
    const a = await runInTenant(ctx, (c) => evaluate(c, 'fte', scope, mctx));
    const b = await runInTenant(ctx, (c) => evaluate(c, 'fte', scope, mctx));
    expect(a).toBe(b);
  });
});
