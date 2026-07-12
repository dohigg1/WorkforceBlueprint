import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { evaluate, measureContext } from '@wfb/measures';
import {
  proposeRoles,
  applyRoleProposals,
  setPositionSkill,
  setPersonSkill,
  skillGap,
  type PositionForClustering,
} from '@wfb/skills';

/**
 * E11: role clustering (reviewable, never automatic), role architecture, and
 * skill gap. Role-based headcount is a measure via the new role scope.
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');

const POSITIONS: PositionForClustering[] = [
  { externalId: 'S1', title: 'Sales Alpha 1', grade: 'G5' },
  { externalId: 'S2', title: 'Sales Alpha 2', grade: 'G5' },
  { externalId: 'S3', title: 'Sales Alpha 3', grade: 'G5' },
  { externalId: 'SL', title: 'Sales Alpha Lead', grade: 'G4' },
  { externalId: 'D1', title: 'Data Core 1', grade: 'G5' },
  { externalId: 'D2', title: 'Data Core 2', grade: 'G5' },
];

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('skills')).context;
  await runInTenant(ctx, async (client) => {
    for (const p of POSITIONS) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
        external_id: p.externalId, title: p.title, grade: p.grade, fte: 1.0, valid_from: EFF,
      });
    }
  });
});

afterAll(async () => {
  await closePools();
});

describe('E11 role clustering and skills', () => {
  it('proposes candidate roles without applying anything (reviewable)', () => {
    const proposals = proposeRoles(POSITIONS);
    const sales = proposals.find((p) => p.suggestedName.toLowerCase().includes('sales'));
    expect(sales).toBeDefined();
    expect(sales!.memberExternalIds).toEqual(['S1', 'S2', 'S3']);
    expect(sales!.confidence).toBeGreaterThan(0.6);
    // The lone lead is not clustered into a role.
    expect(proposals.some((p) => p.memberExternalIds.includes('SL'))).toBe(false);
  });

  it('applies reviewed proposals and role headcount is a measure', async () => {
    const proposals = proposeRoles(POSITIONS);
    const sales = proposals.find((p) => p.memberExternalIds.includes('S1'))!;
    const result = await runInTenant(ctx, (c) => applyRoleProposals(c, [sales], ctx));
    expect(result.membershipsCreated).toBe(3);

    const headcount = await runInTenant(ctx, (c) =>
      evaluate(c, 'headcount', { type: 'role', anchor: sales.roleKey }, measureContext({}, ctx)),
    );
    expect(headcount).toBe(3);
  });

  it('computes a skill gap between required and held skills', async () => {
    await runInTenant(ctx, async (client) => {
      await setPositionSkill(client, 'S1', 'SKILL-negotiation', 3, ctx);
      await setPositionSkill(client, 'S1', 'SKILL-crm', 2, ctx);
      await setPersonSkill(client, 'PER-1', 'SKILL-negotiation', 2, ctx); // below requirement
      await setPersonSkill(client, 'PER-1', 'SKILL-crm', 3, ctx); // meets requirement
    });
    const gap = await runInTenant(ctx, (c) => skillGap(c, 'S1', 'PER-1', ctx));
    expect(gap.required).toHaveLength(2);
    expect(gap.matched.map((m) => m.skill)).toEqual(['SKILL-crm']);
    expect(gap.missing.map((m) => m.skill)).toEqual(['SKILL-negotiation']);
    expect(gap.missing[0]!.shortfall).toBe(1);
    expect(gap.coverage).toBeCloseTo(0.5, 5);
  });
});
