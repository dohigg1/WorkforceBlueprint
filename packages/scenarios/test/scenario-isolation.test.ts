import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { setReportingLine, rebuildClosure, descendants } from '@wfb/hierarchy';
import {
  createScenario,
  editEntity,
  deleteEntity,
  resolveOne,
  resolveEntities,
  rebuildScenarioClosure,
} from '@wfb/scenarios';

/**
 * INV-5: every user mutation goes through the scenario engine. A scenario is a
 * copy-on-write delta resolved at read time. This suite performs every category
 * of edit inside a scenario and proves that the baseline is byte-for-byte
 * unchanged, while the scenario resolves to the expected new state.
 *
 * Baseline structure:  P1 (root); P2 -> P1; P3 -> P1; P4 -> P1
 */

let ctx: TenantContext;
const EFF = new Date('2020-01-01T00:00:00Z');

async function baselineSnapshot(c: TenantContext): Promise<{ positions: string; lines: string }> {
  return runInTenant(c, async (client) => {
    const p = await client.query(
      `SELECT to_jsonb(positions) AS r FROM positions ORDER BY external_id, valid_from`,
    );
    const l = await client.query(
      `SELECT to_jsonb(reporting_lines) AS r FROM reporting_lines ORDER BY external_id, valid_from`,
    );
    return {
      positions: JSON.stringify(p.rows.map((x) => x.r)),
      lines: JSON.stringify(l.rows.map((x) => x.r)),
    };
  });
}

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('scn')).context;
  await runInTenant(ctx, async (client) => {
    for (const id of ['P1', 'P2', 'P3', 'P4']) {
      await insertVersion(client, 'positions', {
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        external_id: id,
        title: `Position ${id}`,
        grade: 'G1',
        fte: 1.0,
        valid_from: EFF,
      });
    }
    await setReportingLine(client, 'P2', 'P1', EFF, ctx);
    await setReportingLine(client, 'P3', 'P1', EFF, ctx);
    await setReportingLine(client, 'P4', 'P1', EFF, ctx);
  });
});

afterAll(async () => {
  await closePools();
});

describe('INV-5 scenario overlay isolation', () => {
  it('edits in a scenario leave the baseline byte-for-byte unchanged', async () => {
    const before = await baselineSnapshot(ctx);

    const scenarioId = await runInTenant(ctx, async (client) => {
      const s = await createScenario(client, 'Restructure');
      // Change a grade, move a position, and delete a position, all in-scenario.
      await editEntity(client, s, 'positions', 'P2', { grade: 'G7' });
      await editEntity(client, s, 'reporting_lines', 'RL-P3', {
        parent_position_external_id: 'P2',
      });
      await deleteEntity(client, s, 'positions', 'P4');
      return s;
    });

    const after = await baselineSnapshot(ctx);
    expect(after.positions).toEqual(before.positions);
    expect(after.lines).toEqual(before.lines);

    // And the scenario resolves to the new state.
    const [p2, resolvedPositions, rl3] = await runInTenant(ctx, async (client) => [
      await resolveOne(client, scenarioId, 'positions', 'P2'),
      await resolveEntities(client, scenarioId, 'positions'),
      await resolveOne(client, scenarioId, 'reporting_lines', 'RL-P3'),
    ]);
    expect(p2?.grade).toBe('G7');
    expect(resolvedPositions.map((r) => r.external_id)).not.toContain('P4'); // deleted
    expect(resolvedPositions.map((r) => r.external_id)).toContain('P2');
    expect(rl3?.parent_position_external_id).toBe('P2'); // moved
  });

  it('the scenario closure reflects the move while the baseline closure does not', async () => {
    const scenarioId = await runInTenant(ctx, async (client) => {
      const s = await createScenario(client, 'Move P3 under P2');
      await editEntity(client, s, 'reporting_lines', 'RL-P3', {
        parent_position_external_id: 'P2',
      });
      await rebuildScenarioClosure(client, s);
      await rebuildClosure(client); // ensure baseline closure is current
      return s;
    });

    const [scenarioKids, baselineKids] = await runInTenant(ctx, async (client) => [
      await descendants(client, 'P2', { scenarioId }),
      await descendants(client, 'P2'),
    ]);
    expect(scenarioKids.map((r) => r.descendant_external_id)).toContain('P3');
    expect(baselineKids.map((r) => r.descendant_external_id)).not.toContain('P3');
  });

  it('creating a scenario is a single insert (negligible storage)', async () => {
    const rowsBefore = await runInTenant(ctx, async (client) => {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM scenario_deltas');
      return rows[0] as { n: number };
    });
    const scenarioId = await runInTenant(ctx, (client) => createScenario(client, 'Empty'));
    const rowsAfter = await runInTenant(ctx, async (client) => {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM scenario_deltas');
      return rows[0] as { n: number };
    });
    expect(scenarioId).toBeTruthy();
    // No deltas materialised for a fresh scenario: it is not a copy of the data.
    expect(rowsAfter.n).toBe(rowsBefore.n);
  });
});
