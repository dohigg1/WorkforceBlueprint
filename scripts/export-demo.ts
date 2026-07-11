/**
 * Export a validation bundle produced by the REAL engines. Seeds a legible
 * demo organisation, rebuilds the closure, evaluates measures, runs a scenario
 * restructure, detects data-quality defects, and precomputes a server-side tree
 * layout. The output JSON is embedded into the validation page so that every
 * number and node shown there is genuine engine output, not a mock.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runInTenant,
  getAdminPool,
  closePools,
  today,
  type TenantContext,
} from '@wfb/tenancy';
import { migrate, defaultMigrationDirs } from '@wfb/tenancy';
import { insertVersion } from '@wfb/data-model';
import {
  rebuildClosure,
  setReportingLine,
  CycleError,
  BASELINE_SCENARIO,
} from '@wfb/hierarchy';
import {
  createScenario,
  editEntity,
  deleteEntity,
  rebuildScenarioClosure,
} from '@wfb/scenarios';
import { evaluate, evaluatePerNode, type Scope } from '@wfb/measures';

// Deterministic PRNG so the demo is stable across runs.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260711);
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;

const EFF = new Date('2020-01-01T00:00:00Z');

interface Node {
  id: string;
  title: string;
  division: string;
  grade: string;
  depth: number;
  parent: string | null;
  vacant: boolean;
  fte: number;
}

const DIVISIONS = [
  'Technology',
  'Commercial',
  'Operations',
  'Finance',
  'People',
  'Product',
];
const DEPTS: Record<string, string[]> = {
  Technology: ['Platform', 'Data', 'Security'],
  Commercial: ['Sales', 'Marketing'],
  Operations: ['Delivery', 'Support', 'Facilities'],
  Finance: ['Accounting', 'Treasury'],
  People: ['Talent', 'Reward'],
  Product: ['Design', 'Research'],
};
const TEAM_WORDS = ['Alpha', 'Bravo', 'Core', 'Edge', 'North', 'South'];

function buildOrg(): Node[] {
  const nodes: Node[] = [];
  let seq = 0;
  const mk = (title: string, division: string, grade: string, depth: number, parent: string | null): string => {
    const id = `POS-${String(++seq).padStart(4, '0')}`;
    const vacant = depth >= 3 && rnd() < 0.09;
    const fte = rnd() < 0.12 ? pick([0.5, 0.6, 0.8]) : 1.0;
    nodes.push({ id, title, division, grade, depth, parent, vacant, fte });
    return id;
  };

  const ceo = mk('Chief Executive', 'Executive', 'G1', 0, null);
  for (const div of DIVISIONS) {
    const divHead = mk(`${div} Director`, div, 'G2', 1, ceo);
    for (const dept of DEPTS[div]!) {
      const deptHead = mk(`Head of ${dept}`, div, 'G3', 2, divHead);
      const teamCount = 2 + Math.floor(rnd() * 2);
      for (let t = 0; t < teamCount; t += 1) {
        const lead = mk(`${dept} ${TEAM_WORDS[t]!} Lead`, div, 'G4', 3, deptHead);
        const members = 3 + Math.floor(rnd() * 4);
        for (let m = 0; m < members; m += 1) {
          mk(`${dept} ${TEAM_WORDS[t]!} ${m + 1}`, div, 'G5', 4, lead);
        }
      }
    }
  }
  return nodes;
}

// Simple tidy-tree layout: leaves get sequential x, parents centre over children.
function layout(nodes: Node[]): Record<string, { x: number; y: number }> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent) {
      const arr = children.get(n.parent) ?? [];
      arr.push(n.id);
      children.set(n.parent, arr);
    }
  }
  const x = new Map<string, number>();
  const depth = new Map(nodes.map((n) => [n.id, n.depth]));
  let cursor = 0;
  const walk = (id: string): void => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      x.set(id, cursor);
      cursor += 1;
      return;
    }
    for (const k of kids) walk(k);
    const first = x.get(kids[0]!)!;
    const last = x.get(kids[kids.length - 1]!)!;
    x.set(id, (first + last) / 2);
  };
  for (const root of nodes.filter((n) => !n.parent)) walk(root.id);

  const X_STEP = 26;
  const Y_STEP = 120;
  const coords: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    coords[n.id] = { x: x.get(n.id)! * X_STEP, y: (depth.get(n.id) ?? 0) * Y_STEP };
  }
  return coords;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, '..');
  await migrate(defaultMigrationDirs(repoRoot));

  const admin = getAdminPool();
  // Fresh demo tenant each run.
  await admin.query("DELETE FROM tenants WHERE slug = 'demo'");
  const { rows: tRows } = await admin.query<{ id: string }>(
    "INSERT INTO tenants(name, slug) VALUES ('Demo Group', 'demo') RETURNING id",
  );
  const tenantId = tRows[0]!.id;
  const { rows: wRows } = await admin.query<{ id: string }>(
    "INSERT INTO workspaces(tenant_id, name, slug) VALUES ($1, 'Acme Holdings', 'demo') RETURNING id",
    [tenantId],
  );
  const workspaceId = wRows[0]!.id;
  const ctx: TenantContext = { tenantId, workspaceId, userId: null, role: 'owner', asAt: today() };

  const nodes = buildOrg();

  let cycleBlocked = 0;
  await runInTenant(ctx, async (client) => {
    for (const n of nodes) {
      await insertVersion(client, 'positions', {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        external_id: n.id,
        title: n.title,
        grade: n.grade,
        fte: n.fte,
        valid_from: EFF,
        custom: { division: n.division },
      });
      if (n.parent) {
        await insertVersion(client, 'reporting_lines', {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          external_id: `RL-${n.id}`,
          child_position_external_id: n.id,
          parent_position_external_id: n.parent,
          valid_from: EFF,
        });
      }
      if (!n.vacant) {
        await insertVersion(client, 'occupancies', {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          external_id: `O-${n.id}`,
          person_external_id: `PER-${n.id}`,
          position_external_id: n.id,
          fte: 1.0,
          valid_from: EFF,
        });
      }
    }
    await rebuildClosure(client);

    // Demonstrate write-time cycle detection: try to make the CEO report to a leaf.
    const leaf = nodes[nodes.length - 1]!;
    try {
      await setReportingLine(client, nodes[0]!.id, leaf.id, EFF, ctx);
    } catch (err) {
      if (err instanceof CycleError) cycleBlocked += 1;
      else throw err;
    }
  });

  const org: Scope = { type: 'organisation' };
  const M = { scenarioId: BASELINE_SCENARIO, asAt: ctx.asAt };

  const baseline = await runInTenant(ctx, async (client) => ({
    headcount: await evaluate(client, 'headcount', org, M),
    filled: await evaluate(client, 'filled_headcount', org, M),
    vacancies: await evaluate(client, 'vacancies', org, M),
    fte: await evaluate(client, 'fte', org, M),
    averageSpan: await evaluate(client, 'average_span', org, M),
    managementRatio: await evaluate(client, 'management_ratio', org, M),
    layers: await evaluate(client, 'layers', org, M),
  }));

  const [spanMap, depthMap, descMap] = await runInTenant(ctx, async (client) => [
    await evaluatePerNode(client, 'span_of_control', org, M),
    await evaluatePerNode(client, 'depth', org, M),
    await evaluatePerNode(client, 'total_descendants', org, M),
  ]);

  // Per-division headcount via subtree scope on each division head.
  const divisionHeads = nodes.filter((n) => n.depth === 1);
  const divisionStats = await runInTenant(ctx, async (client) => {
    const out: { division: string; headcount: number; averageSpan: number }[] = [];
    for (const d of divisionHeads) {
      const sub: Scope = { type: 'subtree', anchor: d.id };
      out.push({
        division: d.division,
        headcount: await evaluate(client, 'headcount', sub, M),
        averageSpan: await evaluate(client, 'average_span', sub, M),
      });
    }
    return out;
  });

  // Scenario: consolidate a small division under another, remove two vacant roles.
  const consolidatee = divisionHeads.find((d) => d.division === 'People')!;
  const acquirer = divisionHeads.find((d) => d.division === 'Operations')!;
  const vacantRoles = nodes.filter((n) => n.vacant).slice(0, 2);

  const { scenarioId, scenarioKpis, changes } = await runInTenant(ctx, async (client) => {
    const sid = await createScenario(client, 'Consolidate People into Operations');
    await editEntity(client, sid, 'reporting_lines', `RL-${consolidatee.id}`, {
      parent_position_external_id: acquirer.id,
    });
    for (const v of vacantRoles) await deleteEntity(client, sid, 'positions', v.id);
    await rebuildScenarioClosure(client, sid);

    const SM = { scenarioId: sid, asAt: ctx.asAt };
    const kpis = {
      headcount: await evaluate(client, 'headcount', org, SM),
      vacancies: await evaluate(client, 'vacancies', org, SM),
      averageSpan: await evaluate(client, 'average_span', org, SM),
      layers: await evaluate(client, 'layers', org, SM),
      operationsHeadcount: await evaluate(client, 'headcount', { type: 'subtree', anchor: acquirer.id }, SM),
    };
    const chg = [
      { kind: 'move', detail: `People division (${consolidatee.title}) now reports to ${acquirer.title}` },
      ...vacantRoles.map((v) => ({ kind: 'delete', detail: `Removed vacant role ${v.title} (${v.id})` })),
    ];
    return { scenarioId: sid, scenarioKpis: kpis, changes: chg };
  });

  const coords = layout(nodes);
  const outNodes = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    division: n.division,
    grade: n.grade,
    depth: n.depth,
    parent: n.parent,
    vacant: n.vacant,
    fte: n.fte,
    span: spanMap.get(n.id) ?? 0,
    layer: depthMap.get(n.id) ?? 0,
    descendants: descMap.get(n.id) ?? 0,
    x: coords[n.id]!.x,
    y: coords[n.id]!.y,
  }));

  const bundle = {
    generatedFor: 'Acme Holdings (synthetic)',
    baseline,
    divisionStats,
    scenario: {
      name: 'Consolidate People into Operations',
      id: scenarioId,
      kpis: scenarioKpis,
      changes,
    },
    dataQuality: {
      total: nodes.length,
      vacancies: nodes.filter((n) => n.vacant).length,
      vacancyPct: Number(((nodes.filter((n) => n.vacant).length / nodes.length) * 100).toFixed(1)),
      cycleAttemptsBlocked: cycleBlocked,
      divisions: DIVISIONS.length,
    },
    nodes: outNodes,
  };

  const outPath =
    process.env.DEMO_OUT ??
    resolve(import.meta.dirname, '..', 'scratchpad-demo-bundle.json');
  writeFileSync(outPath, JSON.stringify(bundle));
  // eslint-disable-next-line no-console
  console.warn(
    `Exported ${outNodes.length} nodes. baseline headcount=${baseline.headcount}, ` +
      `avgSpan=${baseline.averageSpan.toFixed(2)}, layers=${baseline.layers}. ` +
      `scenario headcount=${scenarioKpis.headcount}. cycleBlocked=${cycleBlocked}. -> ${outPath}`,
  );
  await closePools();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
