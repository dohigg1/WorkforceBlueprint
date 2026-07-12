import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import {
  rebuildClosure,
  descendants,
  ancestors,
  subtree,
  depthOf,
  setReportingLine,
  wouldCreateCycle,
  CycleError,
} from '@wfb/hierarchy';

/**
 * E02-03, E02-04: closure traversal, write-time cycle detection, scenario
 * keying. The tree built here is:
 *
 *   P1
 *   |- P2
 *   |  |- P4
 *   |  \- P5
 *   \- P3
 *      \- P6
 */

let ctx: TenantContext;
const EFFECTIVE = new Date('2020-01-01T00:00:00Z');

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('tree')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: id,
        title: `Position ${id}`,
        fte: 1.0,
        valid_from: EFFECTIVE,
      });
    }
    await setReportingLine(client, 'P2', 'P1', EFFECTIVE, ctx);
    await setReportingLine(client, 'P3', 'P1', EFFECTIVE, ctx);
    await setReportingLine(client, 'P4', 'P2', EFFECTIVE, ctx);
    await setReportingLine(client, 'P5', 'P2', EFFECTIVE, ctx);
    await setReportingLine(client, 'P6', 'P3', EFFECTIVE, ctx);
  });
});

afterAll(async () => {
  await closePools();
});

describe('closure traversal', () => {
  it('descendants of the root are the whole tree below it', async () => {
    const d = await runInTenant(ctx, (c) => descendants(c, 'P1'));
    expect(d.map((r) => r.descendant_external_id).sort()).toEqual(['P2', 'P3', 'P4', 'P5', 'P6']);
  });

  it('subtree includes self', async () => {
    const s = await runInTenant(ctx, (c) => subtree(c, 'P1'));
    expect(s.map((r) => r.descendant_external_id)).toContain('P1');
    expect(s.length).toBe(6);
  });

  it('descendants can be depth-limited (direct reports)', async () => {
    const d = await runInTenant(ctx, (c) => descendants(c, 'P2', { maxDepth: 1 }));
    expect(d.map((r) => r.descendant_external_id).sort()).toEqual(['P4', 'P5']);
  });

  it('ancestors run from nearest to furthest', async () => {
    const a = await runInTenant(ctx, (c) => ancestors(c, 'P4'));
    expect(a.map((r) => r.ancestor_external_id)).toEqual(['P2', 'P1']);
    expect(a.map((r) => r.depth)).toEqual([1, 2]);
  });

  it('depth is measured from the root', async () => {
    const [d1, d4] = await runInTenant(ctx, async (c) => [
      await depthOf(c, 'P1'),
      await depthOf(c, 'P4'),
    ]);
    expect(d1).toBe(0);
    expect(d4).toBe(2);
  });
});

describe('write-time cycle detection', () => {
  it('rejects a change that would create a loop', async () => {
    const wouldLoop = await runInTenant(ctx, (c) => wouldCreateCycle(c, 'P1', 'P4'));
    expect(wouldLoop).toBe(true);
    await expect(
      runInTenant(ctx, (c) => setReportingLine(c, 'P1', 'P4', EFFECTIVE, ctx)),
    ).rejects.toBeInstanceOf(CycleError);
  });

  it('permits re-parenting that does not create a loop', async () => {
    // Move P6 from P3 to P2 at a later effective date. Superseding is only valid
    // strictly after the current version's start; a same-day change is a
    // correction, not a supersession.
    await runInTenant(ctx, (c) => setReportingLine(c, 'P6', 'P2', new Date('2021-06-01T00:00:00Z'), ctx));
    const underP2 = await runInTenant(ctx, (c) => descendants(c, 'P2'));
    expect(underP2.map((r) => r.descendant_external_id).sort()).toEqual(['P4', 'P5', 'P6']);
    // restore
    await runInTenant(ctx, (c) => setReportingLine(c, 'P6', 'P3', new Date('2021-07-01T00:00:00Z'), ctx));
  });
});

describe('scenario keying', () => {
  it('the baseline closure is not visible under a different scenario id', async () => {
    const other = '11111111-1111-1111-1111-111111111111';
    const d = await runInTenant(ctx, (c) => descendants(c, 'P1', { scenarioId: other }));
    expect(d.length).toBe(0);
  });

  it('rebuild returns a positive row count for the baseline', async () => {
    const n = await runInTenant(ctx, (c) => rebuildClosure(c));
    expect(n).toBeGreaterThan(0);
  });
});
