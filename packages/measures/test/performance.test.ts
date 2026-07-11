import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, getAdminPool, closePools, today, type TenantContext } from '@wfb/tenancy';
import { rebuildClosure, BASELINE_SCENARIO } from '@wfb/hierarchy';
import { evaluate, invalidateSubtree, measureContext, type Scope } from '@wfb/measures';

/**
 * INV-9: measure recompute after a structural edit under two seconds on the
 * 100k dataset, by invalidating and recomputing only the affected subtree.
 * Gated behind WFB_PERF; depends on the perf dataset seeded by scripts/perf.sh.
 */

const RUN = process.env.WFB_PERF === '1';

let ctx: TenantContext;
let subtreeRoot: string;
let editedNode: string;

describe.skipIf(!RUN)('INV-9 measure performance (100k)', () => {
  beforeAll(async () => {
    const admin = getAdminPool();
    const t = await admin.query<{ id: string }>("SELECT id FROM tenants WHERE slug='perf'");
    const w = await admin.query<{ id: string }>("SELECT id FROM workspaces WHERE slug='perf'");
    if (t.rows.length === 0) throw new Error('perf dataset not seeded; run scripts/perf.sh');
    ctx = {
      tenantId: t.rows[0]!.id,
      workspaceId: w.rows[0]!.id,
      userId: null,
      role: 'owner',
      asAt: today(),
    };

    await runInTenant(ctx, async (c) => {
      const has = await c.query('SELECT 1 FROM position_closure WHERE scenario_id=$1 LIMIT 1', [
        BASELINE_SCENARIO,
      ]);
      if (has.rows.length === 0) await rebuildClosure(c);

      const big = await c.query<{ a: string }>(
        `SELECT ancestor_external_id AS a FROM position_closure WHERE scenario_id=$1
         GROUP BY ancestor_external_id HAVING count(*) BETWEEN 1000 AND 8000
         ORDER BY count(*) DESC LIMIT 1`,
        [BASELINE_SCENARIO],
      );
      subtreeRoot = big.rows[0]!.a;
      const leaf = await c.query<{ d: string }>(
        `SELECT descendant_external_id AS d FROM position_closure
         WHERE scenario_id=$1 AND ancestor_external_id=$2 AND depth>=1 LIMIT 1`,
        [BASELINE_SCENARIO, subtreeRoot],
      );
      editedNode = leaf.rows[0]!.d;
    });
  });

  afterAll(async () => {
    await closePools();
  });

  it('recomputes a subtree of measures after an edit in under two seconds', async () => {
    const scope: Scope = { type: 'subtree', anchor: subtreeRoot };
    const mctx = measureContext({}, ctx);

    // Warm the cache.
    await runInTenant(ctx, async (c) => {
      await evaluate(c, 'headcount', scope, mctx);
      await evaluate(c, 'fte', scope, mctx);
      await evaluate(c, 'average_span', scope, mctx);
    });

    const elapsed = await runInTenant(ctx, async (c) => {
      const start = performance.now();
      await invalidateSubtree(c, editedNode, BASELINE_SCENARIO);
      await evaluate(c, 'headcount', scope, mctx);
      await evaluate(c, 'fte', scope, mctx);
      await evaluate(c, 'average_span', scope, mctx);
      return performance.now() - start;
    });

    // eslint-disable-next-line no-console
    console.log(`Measure recompute for subtree ${subtreeRoot} after edit: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
