import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, rebuildClosure, descendants } from '@wfb/hierarchy';
import { createScenario, rebuildScenarioClosure } from '@wfb/scenarios';
import { benchmark, proposeDelayering, applyDelayering } from '@wfb/intelligence';

/**
 * Sprint 26 intelligence: benchmarking and structural optimisation, both built
 * entirely on the measure engine and hierarchy.
 *
 * Structure with a redundant layer:  P1 -> P2 -> P3 (P2 has a single report)
 *                                    P1 -> P4
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');
const org = { type: 'organisation' as const };

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('intel')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['P1', 'P2', 'P3', 'P4']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId, external_id: id, title: id, fte: 1.0, valid_from: EFF,
      });
    }
    await setReportingLine(client, 'P2', 'P1', EFF, ctx);
    await setReportingLine(client, 'P3', 'P2', EFF, ctx); // P2 is a single-report manager
    await setReportingLine(client, 'P4', 'P1', EFF, ctx);
    await rebuildClosure(client);
  });
});

afterAll(async () => {
  await closePools();
});

describe('Sprint 26 intelligence', () => {
  it('benchmarks structural measures against reference bands', async () => {
    const rows = await runInTenant(ctx, (c) => benchmark(c, org, undefined, ctx));
    const span = rows.find((r) => r.measure === 'average_span')!;
    expect(span.band).toEqual([4, 8]);
    expect(['healthy', 'high', 'low']).toContain(span.status);
    const layers = rows.find((r) => r.measure === 'layers')!;
    expect(layers.value).toBe(3); // depths 0,1,2
  });

  it('proposes delayering a single-report manager, reviewably', async () => {
    const proposals = await runInTenant(ctx, (c) => proposeDelayering(c, org, undefined, ctx));
    const p2 = proposals.find((p) => p.redundantManager === 'P2');
    expect(p2).toBeDefined();
    expect(p2!.report).toBe('P3');
    expect(p2!.newParent).toBe('P1');
    // Nothing is applied by proposing.
  });

  it('applies a reviewed proposal inside a scenario, leaving the baseline intact', async () => {
    const proposals = await runInTenant(ctx, (c) => proposeDelayering(c, org, undefined, ctx));
    const p2 = proposals.find((p) => p.redundantManager === 'P2')!;
    const scenarioId = await runInTenant(ctx, async (c) => {
      const sid = await createScenario(c, 'Delayer P2');
      await applyDelayering(c, sid, p2, ctx);
      await rebuildScenarioClosure(c, sid);
      return sid;
    });

    const [scenarioKids, baselineKids] = await runInTenant(ctx, async (c) => [
      await descendants(c, 'P1', { maxDepth: 1, scenarioId }),
      await descendants(c, 'P1', { maxDepth: 1 }),
    ]);
    // In the scenario P3 now reports directly to P1; in the baseline it does not.
    expect(scenarioKids.map((k) => k.descendant_external_id).sort()).toEqual(['P2', 'P3', 'P4']);
    expect(baselineKids.map((k) => k.descendant_external_id).sort()).toEqual(['P2', 'P4']);
  });
});
