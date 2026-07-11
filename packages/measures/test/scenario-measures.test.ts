import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, rebuildClosure } from '@wfb/hierarchy';
import { createScenario, editEntity, rebuildScenarioClosure } from '@wfb/scenarios';
import { evaluate, measureContext, type Scope } from '@wfb/measures';

/**
 * The measure engine is scenario-aware. A measure evaluated in a scenario
 * reflects that scenario's structural deltas, while the same measure on the
 * baseline is unchanged. This is the invariant that stops the chart and the
 * numbers disagreeing (INV-6 over INV-5).
 *
 * Baseline: P1; P2 -> P1; P3 -> P1; P4 -> P2; P5 -> P2; P6 -> P3
 * Scenario: move P3 (and its child P6) under P2.
 */

let ctx: TenantContext;
let scenarioId: string;
const EFF = new Date('2020-01-01T00:00:00Z');

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('scnmeas')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: id,
        title: id,
        fte: 1.0,
        valid_from: EFF,
      });
    }
    await setReportingLine(client, 'P2', 'P1', EFF, ctx);
    await setReportingLine(client, 'P3', 'P1', EFF, ctx);
    await setReportingLine(client, 'P4', 'P2', EFF, ctx);
    await setReportingLine(client, 'P5', 'P2', EFF, ctx);
    await setReportingLine(client, 'P6', 'P3', EFF, ctx);
    await rebuildClosure(client);

    scenarioId = await createScenario(client, 'Consolidate under P2');
    await editEntity(client, scenarioId, 'reporting_lines', 'RL-P3', {
      parent_position_external_id: 'P2',
    });
    await rebuildScenarioClosure(client, scenarioId);
  });
});

afterAll(async () => {
  await closePools();
});

describe('scenario-aware measures', () => {
  it('span of P2 differs between baseline and scenario', async () => {
    const scope: Scope = { type: 'node', anchor: 'P2' };
    const baseline = await runInTenant(ctx, (c) =>
      evaluate(c, 'average_span', scope, measureContext()),
    );
    const scenario = await runInTenant(ctx, (c) =>
      evaluate(c, 'average_span', scope, measureContext({ scenarioId })),
    );
    // Baseline P2 has 2 direct reports (P4, P5); in the scenario it gains P3.
    expect(baseline).toBe(2);
    expect(scenario).toBe(3);
  });

  it('subtree headcount under P2 differs between baseline and scenario', async () => {
    const scope: Scope = { type: 'subtree', anchor: 'P2' };
    const baseline = await runInTenant(ctx, (c) => evaluate(c, 'headcount', scope, measureContext()));
    const scenario = await runInTenant(ctx, (c) =>
      evaluate(c, 'headcount', scope, measureContext({ scenarioId })),
    );
    expect(baseline).toBe(3); // P2, P4, P5
    expect(scenario).toBe(5); // P2, P4, P5, P3, P6
  });
});
