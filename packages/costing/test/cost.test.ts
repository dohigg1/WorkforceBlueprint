import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, rebuildClosure } from '@wfb/hierarchy';
import { createScenario, deleteEntity, rebuildScenarioClosure } from '@wfb/scenarios';
import { evaluate, measureContext, type Scope } from '@wfb/measures';
import { setCostConfig, setGradeMidpoint, setFxRate, decomposeCost } from '@wfb/costing';

/**
 * E08-01/03/04: fully-loaded cost as a measure, grade-based costing, multi-
 * currency, vacant costing, and salary masking that preserves aggregates.
 *
 * Loading factor = 1 + 0.20 + 0.10 + 0.08 + 0.15 = 1.53.
 * P1 G1 salary 120000 GBP filled        -> base 120000, loaded 183600
 * P2 G2 no salary -> midpoint 60000 GBP  -> base  60000, loaded  91800
 * P3 G2 salary 50000 USD (fx 0.8)        -> base  40000, loaded  61200
 * P4 G1 no salary -> midpoint 100000, VACANT (factor 0.5) -> base 50000, loaded 76500
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');
const org: Scope = { type: 'organisation' };

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('cost')).context;
  await runInTenant(ctx, async (client) => {
    await setCostConfig(client, {
      oncostPct: 0.2, benefitsPct: 0.1, bonusPct: 0.08, overheadPct: 0.15,
      vacantFactor: 0.5, reportingCurrency: 'GBP',
    });
    await setGradeMidpoint(client, 'G1', 'GBP', 100000);
    await setGradeMidpoint(client, 'G2', 'GBP', 60000);
    await setFxRate(client, 'USD', 'GBP', 0.8);

    const defs: [string, string, number | null, string | null][] = [
      ['P1', 'G1', 120000, 'GBP'],
      ['P2', 'G2', null, null],
      ['P3', 'G2', 50000, 'USD'],
      ['P4', 'G1', null, null],
    ];
    for (const [id, grade, salary, ccy] of defs) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId, external_id: id,
        title: id, grade, fte: 1.0, base_salary: salary, salary_currency: ccy, valid_from: EFF,
      });
    }
    for (const id of ['P2', 'P3', 'P4']) await setReportingLine(client, id, 'P1', EFF, ctx);
    // Fill everyone except P4.
    for (const id of ['P1', 'P2', 'P3']) {
      await insertVersion(client, 'occupancies', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId, external_id: `O-${id}`,
        person_external_id: `PER-${id}`, position_external_id: id, fte: 1.0, valid_from: EFF,
      });
    }
    await rebuildClosure(client);
  });
});

afterAll(async () => {
  await closePools();
});

describe('E08 cost model', () => {
  it('fully loaded cost is a measure summing the build-up, with grade fallback, FX and vacancy', async () => {
    const cost = await runInTenant(ctx, (c) => evaluate(c, 'cost', org, measureContext({}, ctx)));
    expect(cost).toBeCloseTo(413100, 2);
  });

  it('base cost sums the vacancy-adjusted base before loading', async () => {
    const base = await runInTenant(ctx, (c) => evaluate(c, 'base_cost', org, measureContext({}, ctx)));
    expect(base).toBeCloseTo(270000, 2);
  });

  it('decomposes a position transparently for a permitted role', async () => {
    const d = await runInTenant(ctx, (c) => decomposeCost(c, 'P1', {}, ctx));
    expect(d).not.toBeNull();
    expect(d!.masked).toBe(false);
    expect(d!.base).toBeCloseTo(120000, 2);
    expect(d!.onCosts).toBeCloseTo(24000, 2);
    expect(d!.loaded).toBeCloseTo(183600, 2);
  });

  it('masks individual salary for a role without finance permission, but the aggregate is still correct', async () => {
    const viewerCtx: TenantContext = { ...ctx, role: 'viewer' };
    const masked = await runInTenant(viewerCtx, (c) => decomposeCost(c, 'P1', {}, viewerCtx));
    expect(masked!.masked).toBe(true);
    expect(masked!.base).toBeNull();
    // Aggregate cost is unaffected by the caller's masking.
    const cost = await runInTenant(viewerCtx, (c) => evaluate(c, 'cost', org, measureContext({}, viewerCtx)));
    expect(cost).toBeCloseTo(413100, 2);
  });

  it('scenario cost differs from baseline when a position is removed', async () => {
    const { scenarioId } = await runInTenant(ctx, async (client) => {
      const sid = await createScenario(client, 'Remove P3');
      await deleteEntity(client, sid, 'positions', 'P3');
      await rebuildScenarioClosure(client, sid);
      return { scenarioId: sid };
    });
    const baseline = await runInTenant(ctx, (c) => evaluate(c, 'cost', org, measureContext({}, ctx)));
    const scenario = await runInTenant(ctx, (c) => evaluate(c, 'cost', org, measureContext({ scenarioId }, ctx)));
    expect(baseline).toBeCloseTo(413100, 2);
    expect(scenario).toBeCloseTo(413100 - 61200, 2); // P3 removed
  });
});
