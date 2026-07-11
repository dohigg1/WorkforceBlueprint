import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, getAdminPool, closePools, today, type TenantContext } from '@wfb/tenancy';
import { rebuildClosure, descendants, ancestors, BASELINE_SCENARIO } from '@wfb/hierarchy';

/**
 * INV-9: performance measured against the synthetic 100k dataset, never a toy
 * fixture. Target: an ancestor or descendant subtree query under 100 ms at
 * 100,000 nodes.
 *
 * Gated behind WFB_PERF because it depends on the perf dataset seeded by
 * scripts/perf.sh; a normal test run resets the schema and would wipe it.
 */

const RUN = process.env.WFB_PERF === '1';

let ctx: TenantContext;
let bigSubtreeRoot: string;
let deepLeaf: string;

describe.skipIf(!RUN)('INV-9 hierarchy performance (100k)', () => {
  beforeAll(async () => {
    const admin = getAdminPool();
    const t = await admin.query<{ id: string }>("SELECT id FROM tenants WHERE slug = 'perf'");
    const w = await admin.query<{ id: string }>("SELECT id FROM workspaces WHERE slug = 'perf'");
    if (t.rows.length === 0 || w.rows.length === 0) {
      throw new Error('perf dataset not seeded; run scripts/perf.sh');
    }
    ctx = {
      tenantId: t.rows[0]!.id,
      workspaceId: w.rows[0]!.id,
      userId: null,
      role: 'owner',
      asAt: today(),
    };

    // Build the closure for the 100k dataset (maintenance path, cycle-safe).
    const start = performance.now();
    const rows = await runInTenant(ctx, (c) => rebuildClosure(c));
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`Closure rebuild at 100k: ${rows} rows in ${elapsed.toFixed(0)} ms`);

    // Choose a mid-sized subtree root and a deep leaf using raw aggregate SQL,
    // which is permitted in tests. These pick realistic query targets.
    const pick = await runInTenant(ctx, async (c) => {
      const big = await c.query<{ a: string }>(
        `SELECT ancestor_external_id AS a, count(*) AS n
         FROM position_closure WHERE scenario_id = $1
         GROUP BY ancestor_external_id HAVING count(*) BETWEEN 1000 AND 8000
         ORDER BY count(*) DESC LIMIT 1`,
        [BASELINE_SCENARIO],
      );
      const leaf = await c.query<{ d: string }>(
        `SELECT descendant_external_id AS d, max(depth) AS depth
         FROM position_closure WHERE scenario_id = $1
         GROUP BY descendant_external_id ORDER BY max(depth) DESC LIMIT 1`,
        [BASELINE_SCENARIO],
      );
      return { big: big.rows[0]?.a, leaf: leaf.rows[0]?.d };
    });
    bigSubtreeRoot = pick.big ?? '';
    deepLeaf = pick.leaf ?? '';
  });

  afterAll(async () => {
    await closePools();
  });

  async function bestOf(times: number, fn: () => Promise<unknown>): Promise<number> {
    let best = Infinity;
    for (let i = 0; i < times; i += 1) {
      const s = performance.now();
      await fn();
      best = Math.min(best, performance.now() - s);
    }
    return best;
  }

  it('descendant subtree query is under 100 ms', async () => {
    const ms = await runInTenant(ctx, (c) =>
      bestOf(3, () => descendants(c, bigSubtreeRoot)),
    );
    // eslint-disable-next-line no-console
    console.log(`Descendant subtree query for ${bigSubtreeRoot}: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(100);
  });

  it('ancestor query is under 100 ms', async () => {
    const ms = await runInTenant(ctx, (c) => bestOf(5, () => ancestors(c, deepLeaf)));
    // eslint-disable-next-line no-console
    console.log(`Ancestor query for ${deepLeaf}: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
