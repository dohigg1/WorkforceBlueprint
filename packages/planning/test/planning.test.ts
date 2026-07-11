import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { createScenario } from '@wfb/scenarios';
import { evaluate, measureContext, type Scope } from '@wfb/measures';
import {
  addRequisition,
  planLeaver,
  setDemandTarget,
  supplyOverTime,
  gapOverTime,
} from '@wfb/planning';

/**
 * E12: supply, demand and gap over time. The central architectural claim is that
 * this needs NO new calculation engine. This suite proves it: supply is the
 * headcount measure evaluated at future dates over a plan scenario, and the same
 * number comes out whether obtained through the planning helper or a direct call
 * to the measure engine.
 *
 * Baseline: P1..P4. Plan: P4 leaves on 2026-01-01; a requisition REQ1 starts on
 * 2027-01-01. Demand target: 5 from 2025, 6 from 2027.
 *
 * Expected supply over [2025, 2026-06, 2027-06]: [4, 3, 4]
 * Expected demand:                                [5, 5, 6]
 * Expected gap (demand - supply):                 [1, 2, 2]
 */

let ctx: TenantContext;
let planId: string;
const EFF = new Date('2020-01-01T00:00:00Z');
const org: Scope = { type: 'organisation' };
const DATES = ['2025-01-01', '2026-06-01', '2027-06-01'];

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('plan')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['P1', 'P2', 'P3', 'P4']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
        external_id: id, title: id, fte: 1.0, valid_from: EFF,
      });
    }
    planId = await createScenario(client, 'Three-year plan');
    await planLeaver(client, planId, 'P4', '2026-01-01', ctx);
    await addRequisition(client, planId, 'REQ1', { title: 'New Analyst' }, '2027-01-01', ctx);
    await setDemandTarget(client, 'D-2025', 'organisation', '', '2025-01-01', 5, ctx);
    await setDemandTarget(client, 'D-2027', 'organisation', '', '2027-01-01', 6, ctx);
  });
});

afterAll(async () => {
  await closePools();
});

describe('E12 supply, demand and gap over time', () => {
  it('supply reflects planned leavers and requisitions across the horizon', async () => {
    const supply = await runInTenant(ctx, (c) => supplyOverTime(c, planId, org, 'headcount', DATES));
    expect(supply.map((p) => p.supply)).toEqual([4, 3, 4]);
  });

  it('gap is demand minus supply at each date', async () => {
    const gap = await runInTenant(ctx, (c) => gapOverTime(c, planId, org, 'headcount', DATES));
    expect(gap.map((g) => g.demand)).toEqual([5, 5, 6]);
    expect(gap.map((g) => g.supply)).toEqual([4, 3, 4]);
    expect(gap.map((g) => g.gap)).toEqual([1, 2, 2]);
  });

  it('supply IS the measure engine: no new calculation infrastructure', async () => {
    // The planning helper and a direct measure evaluation return the identical
    // number at every date. Supply is not a bespoke calculation; it is the
    // existing headcount measure evaluated as-at each date.
    for (const date of DATES) {
      const viaPlanning = (await runInTenant(ctx, (c) => supplyOverTime(c, planId, org, 'headcount', [date])))[0]!.supply;
      const viaMeasure = await runInTenant(ctx, (c) =>
        evaluate(c, 'headcount', org, measureContext({ scenarioId: planId, asAt: date }, ctx)),
      );
      expect(viaPlanning).toBe(viaMeasure);
    }
  });

  it('the baseline is untouched by the plan (supply today is unchanged)', async () => {
    const baselineToday = await runInTenant(ctx, (c) =>
      evaluate(c, 'headcount', org, measureContext({}, ctx)),
    );
    expect(baselineToday).toBe(4); // all four positions still current in the baseline
  });
});
