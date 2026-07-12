import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setSeveranceConfig, computeSeverance, costOut } from '@wfb/costing';

/**
 * E13: severance and cost-out. Individual amounts are masked by default even for
 * administrators; a reveal is deliberate and logged. Every access is recorded in
 * the audit log with operation READ (INV-3 additional rule). Aggregate cost-out
 * is not masked because it exposes no individual figure.
 *
 * P1: salary 52000 -> weekly 1000, capped at 700. Service 2016-01-01 to
 * 2026-01-01 = 10 years. weeks/year 1, enhancement 1.5 -> 1 * 10 * 700 * 1.5 = 10500.
 */

let ctx: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  const seed = await seedTenant('sev');
  ctx = { ...seed.context, asAt: '2026-01-01' };
  await runInTenant(ctx, async (client) => {
    await setSeveranceConfig(client, {
      weeksPerYear: 1, weeklyPayCap: 700, minServiceYears: 2, enhancementMultiplier: 1.5,
    });
    await insertVersion(client, 'positions', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'P1', title: 'Analyst', fte: 1.0, base_salary: 52000, salary_currency: 'GBP',
      valid_from: new Date('2016-01-01T00:00:00Z'),
    });
    await insertVersion(client, 'occupancies', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'O-P1', person_external_id: 'PER-1', position_external_id: 'P1', fte: 1.0,
      valid_from: new Date('2016-01-01T00:00:00Z'),
    });
  });
});

afterAll(async () => {
  await closePools();
});

async function severanceReadCount(c: TenantContext): Promise<number> {
  return runInTenant(c, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM audit_log WHERE table_name='severance' AND operation='READ'",
    );
    return Number(rows[0]!.n);
  });
}

describe('E13 severance and cost-out', () => {
  it('masks the individual amount by default, even for an owner, but logs the access', async () => {
    const before = await severanceReadCount(ctx);
    const masked = await runInTenant(ctx, (c) => computeSeverance(c, 'P1', { reveal: false }, ctx));
    expect(masked.masked).toBe(true);
    expect(masked.amount).toBeNull();
    const after = await severanceReadCount(ctx);
    expect(after).toBe(before + 1); // access was logged despite masking
  });

  it('reveals the amount only on a deliberate reveal by a permitted role, logging it', async () => {
    const revealed = await runInTenant(ctx, (c) => computeSeverance(c, 'P1', { reveal: true }, ctx));
    expect(revealed.masked).toBe(false);
    expect(revealed.serviceYears).toBeCloseTo(10, 1);
    expect(revealed.amount).toBeCloseTo(10500, -1); // ~10501 with leap-day service
  });

  it('does not reveal for a role without permission, even with reveal set', async () => {
    const viewerCtx: TenantContext = { ...ctx, role: 'viewer' };
    const result = await runInTenant(viewerCtx, (c) => computeSeverance(c, 'P1', { reveal: true }, viewerCtx));
    expect(result.masked).toBe(true);
    expect(result.amount).toBeNull();
  });

  it('cost-out is an aggregate over real amounts, with a payback', async () => {
    const result = await runInTenant(ctx, (c) => costOut(c, ['P1'], 50000, ctx));
    expect(result.severanceTotal).toBeCloseTo(10500, -1);
    expect(result.paybackMonths).toBeCloseTo(2.5, 1);
  });
});
