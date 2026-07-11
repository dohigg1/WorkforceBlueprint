import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, BASELINE_SCENARIO } from '@wfb/hierarchy';
import {
  evaluate,
  evaluatePerNode,
  invalidateSubtree,
  measureContext,
  type Scope,
} from '@wfb/measures';

/**
 * E06-02: the standard measure library, and E06-01 caching with subtree
 * invalidation. Tree:
 *
 *   P1                filled
 *   |- P2             filled
 *   |  |- P4 (fte .5) filled
 *   |  \- P5          VACANT
 *   \- P3             filled
 *      \- P6          VACANT
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');
const org: Scope = { type: 'organisation' };

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('meas')).context;
  await runInTenant(ctx, async (client) => {
    const grades: Record<string, number> = { P1: 1, P2: 1, P3: 1, P4: 0.5, P5: 1, P6: 1 };
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: id,
        title: `Position ${id}`,
        fte: grades[id],
        valid_from: EFF,
      });
    }
    await setReportingLine(client, 'P2', 'P1', EFF, ctx);
    await setReportingLine(client, 'P3', 'P1', EFF, ctx);
    await setReportingLine(client, 'P4', 'P2', EFF, ctx);
    await setReportingLine(client, 'P5', 'P2', EFF, ctx);
    await setReportingLine(client, 'P6', 'P3', EFF, ctx);
    // Fill everyone except P5 and P6.
    for (const id of ['P1', 'P2', 'P3', 'P4']) {
      await insertVersion(client, 'occupancies', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: `O-${id}`,
        person_external_id: `PER-${id}`,
        position_external_id: id,
        fte: 1.0,
        valid_from: EFF,
      });
    }
  });
});

afterAll(async () => {
  await closePools();
});

const M = () => measureContext();

describe('standard measure library', () => {
  it('headcount counts seats in scope', async () => {
    const all = await runInTenant(ctx, (c) => evaluate(c, 'headcount', org, M()));
    const sub2 = await runInTenant(ctx, (c) => evaluate(c, 'headcount', { type: 'subtree', anchor: 'P2' }, M()));
    expect(all).toBe(6);
    expect(sub2).toBe(3); // P2, P4, P5
  });

  it('full-time equivalent sums position FTE', async () => {
    const fte = await runInTenant(ctx, (c) => evaluate(c, 'fte', org, M()));
    expect(fte).toBeCloseTo(5.5, 5); // five at 1.0 plus P4 at 0.5
  });

  it('vacancies and filled headcount partition the scope', async () => {
    const [vac, filled] = await runInTenant(ctx, async (c) => [
      await evaluate(c, 'vacancies', org, M()),
      await evaluate(c, 'filled_headcount', org, M()),
    ]);
    expect(vac).toBe(2); // P5, P6
    expect(filled).toBe(4);
  });

  it('average span and management ratio derive from the same graph', async () => {
    const [avgSpan, ratio, layers] = await runInTenant(ctx, async (c) => [
      await evaluate(c, 'average_span', org, M()),
      await evaluate(c, 'management_ratio', org, M()),
      await evaluate(c, 'layers', org, M()),
    ]);
    expect(avgSpan).toBeCloseTo((2 + 2 + 1) / 3, 5); // managers P1, P2, P3
    expect(ratio).toBeCloseTo(3 / 6, 5);
    expect(layers).toBe(3); // depths 0, 1, 2
  });

  it('per-node measures compute for every node in scope', async () => {
    const spans = await runInTenant(ctx, (c) => evaluatePerNode(c, 'span_of_control', org, M()));
    expect(spans.get('P1')).toBe(2);
    expect(spans.get('P2')).toBe(2);
    expect(spans.get('P3')).toBe(1);
    expect(spans.get('P4')).toBe(0);

    const depth = await runInTenant(ctx, (c) => evaluatePerNode(c, 'depth', org, M()));
    expect(depth.get('P1')).toBe(0);
    expect(depth.get('P4')).toBe(2);

    const desc = await runInTenant(ctx, (c) => evaluatePerNode(c, 'total_descendants', org, M()));
    expect(desc.get('P1')).toBe(5);
  });
});

describe('caching and subtree invalidation', () => {
  it('serves from cache and recomputes after invalidation', async () => {
    const scope: Scope = { type: 'subtree', anchor: 'P1' };
    // Prime the cache.
    const first = await runInTenant(ctx, (c) => evaluate(c, 'headcount', scope, M()));
    expect(first).toBe(6);

    // Poison the cached value directly; a cached read must return it.
    await runInTenant(ctx, (c) =>
      c.query(
        `UPDATE measure_cache SET value = 999 WHERE measure_key='headcount'
         AND scope_type='subtree' AND scope_anchor='P1' AND scenario_id=$1`,
        [BASELINE_SCENARIO],
      ),
    );
    const poisoned = await runInTenant(ctx, (c) => evaluate(c, 'headcount', scope, M()));
    expect(poisoned).toBe(999); // proves the cache is consulted

    // Invalidate the subtree containing P1 and recompute the true value.
    await runInTenant(ctx, (c) => invalidateSubtree(c, 'P1', BASELINE_SCENARIO));
    const fresh = await runInTenant(ctx, (c) => evaluate(c, 'headcount', scope, M()));
    expect(fresh).toBe(6);
  });
});
