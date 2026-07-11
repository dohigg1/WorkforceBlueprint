import { Injectable } from '@nestjs/common';
import { runInTenant, type TenantContext } from '@wfb/tenancy';
import { BASELINE_SCENARIO, descendants } from '@wfb/hierarchy';
import {
  createScenario as createScenarioFn,
  editEntity,
  deleteEntity,
  rebuildScenarioClosure,
  resolveEntities,
} from '@wfb/scenarios';
import {
  evaluate,
  evaluatePerNode,
  SCALAR_MEASURES,
  type Scope,
  type ScopeType,
} from '@wfb/measures';
import { decomposeCost } from '@wfb/costing';
import { Readable } from 'node:stream';
import {
  parseCsvStream,
  proposeMapping,
  validate,
  type CanonicalRow,
  type TargetField,
  type MappingProposal,
  type ValidationReport,
} from '@wfb/ingestion';

export interface TreeNode {
  id: string;
  title: string;
  grade: string | null;
  division: string | null;
  parent: string | null;
  vacant: boolean;
  fte: number;
  span: number;
  layer: number;
  descendants: number;
  x: number;
  y: number;
}

const NODE_CAP = 4000;

@Injectable()
export class ApiService {
  private scope(scopeType: ScopeType, anchor?: string): Scope {
    return anchor ? { type: scopeType, anchor } : { type: scopeType };
  }

  async getTree(
    ctx: TenantContext,
    opts: { scenarioId?: string; rootId?: string },
  ): Promise<{ nodes: TreeNode[]; truncated: boolean }> {
    const scenarioId = opts.scenarioId ?? BASELINE_SCENARIO;
    return runInTenant(ctx, async (client) => {
      const positions = await resolveEntities(client, scenarioId, 'positions', ctx);
      const occupancies = await resolveEntities(client, scenarioId, 'occupancies', ctx);
      const occupied = new Set(occupancies.map((o) => String(o['position_external_id'])));

      // Node set: a subtree if a root is given, else the whole organisation.
      let ids: string[];
      const scope: Scope = opts.rootId
        ? { type: 'subtree', anchor: opts.rootId }
        : { type: 'organisation' };
      if (opts.rootId) {
        const sub = await descendants(client, opts.rootId, { includeSelf: true, scenarioId });
        ids = sub.map((r) => r.descendant_external_id);
      } else {
        ids = positions.map((p) => String(p['external_id']));
      }
      const truncated = ids.length > NODE_CAP;
      const idSet = new Set(truncated ? ids.slice(0, NODE_CAP) : ids);

      // Parent map from the closure (depth 1 edges).
      const { rows: edges } = await client.query<{ parent: string; child: string }>(
        `SELECT ancestor_external_id AS parent, descendant_external_id AS child
         FROM position_closure WHERE scenario_id = $1 AND depth = 1`,
        [scenarioId],
      );
      const parentOf = new Map<string, string>();
      for (const e of edges) if (idSet.has(e.child)) parentOf.set(e.child, e.parent);

      const span = await evaluatePerNode(client, 'span_of_control', scope, { scenarioId, asAt: ctx.asAt });
      const depth = await evaluatePerNode(client, 'depth', scope, { scenarioId, asAt: ctx.asAt });
      const desc = await evaluatePerNode(client, 'total_descendants', scope, { scenarioId, asAt: ctx.asAt });

      const attr = new Map(positions.map((p) => [String(p['external_id']), p]));
      const nodes: Omit<TreeNode, 'x' | 'y'>[] = [];
      for (const id of idSet) {
        const p = attr.get(id) ?? {};
        const custom = (p['custom'] as Record<string, unknown> | undefined) ?? {};
        nodes.push({
          id,
          title: String(p['title'] ?? id),
          grade: (p['grade'] as string | null) ?? null,
          division: (custom['division'] as string | null) ?? null,
          parent: parentOf.get(id) ?? null,
          vacant: !occupied.has(id),
          fte: Number(p['fte'] ?? 1),
          span: span.get(id) ?? 0,
          layer: depth.get(id) ?? 0,
          descendants: desc.get(id) ?? 0,
        });
      }
      return { nodes: layout(nodes), truncated };
    });
  }

  async getMeasures(
    ctx: TenantContext,
    opts: { scenarioId?: string; scopeType?: ScopeType; anchor?: string },
  ): Promise<Record<string, number>> {
    const scenarioId = opts.scenarioId ?? BASELINE_SCENARIO;
    const scope = this.scope(opts.scopeType ?? 'organisation', opts.anchor);
    return runInTenant(ctx, async (client) => {
      const out: Record<string, number> = {};
      for (const key of Object.keys(SCALAR_MEASURES)) {
        out[key] = await evaluate(client, key, scope, { scenarioId, asAt: ctx.asAt });
      }
      return out;
    });
  }

  listScenarios(ctx: TenantContext): Promise<{ id: string; name: string; parent_scenario_id: string | null }[]> {
    return runInTenant(ctx, async (client) => {
      const { rows } = await client.query<{ id: string; name: string; parent_scenario_id: string | null }>(
        'SELECT id, name, parent_scenario_id FROM scenarios ORDER BY created_at',
      );
      return rows;
    });
  }

  createScenario(ctx: TenantContext, name: string, parent?: string): Promise<{ id: string }> {
    return runInTenant(ctx, async (client) => {
      const id = await createScenarioFn(client, name, parent ?? null, ctx);
      await rebuildScenarioClosure(client, id, ctx);
      return { id };
    });
  }

  applyEdits(
    ctx: TenantContext,
    scenarioId: string,
    edits: { table: string; externalId: string; op: 'upsert' | 'delete'; overrides?: Record<string, unknown> }[],
  ): Promise<{ ok: true; rebuilt: number }> {
    return runInTenant(ctx, async (client) => {
      for (const e of edits) {
        if (e.op === 'delete') await deleteEntity(client, scenarioId, e.table, e.externalId, ctx);
        else await editEntity(client, scenarioId, e.table, e.externalId, e.overrides ?? {}, ctx);
      }
      const rebuilt = await rebuildScenarioClosure(client, scenarioId, ctx);
      return { ok: true, rebuilt };
    });
  }

  async compare(
    ctx: TenantContext,
    scenarioId: string,
    opts: { scopeType?: ScopeType; anchor?: string } = {},
  ): Promise<{ baseline: Record<string, number>; scenario: Record<string, number> }> {
    const scope = this.scope(opts.scopeType ?? 'organisation', opts.anchor);
    return runInTenant(ctx, async (client) => {
      const baseline: Record<string, number> = {};
      const scenario: Record<string, number> = {};
      for (const key of Object.keys(SCALAR_MEASURES)) {
        baseline[key] = await evaluate(client, key, scope, { scenarioId: BASELINE_SCENARIO, asAt: ctx.asAt });
        scenario[key] = await evaluate(client, key, scope, { scenarioId, asAt: ctx.asAt });
      }
      return { baseline, scenario };
    });
  }

  decompose(ctx: TenantContext, externalId: string, scenarioId?: string) {
    return runInTenant(ctx, (client) =>
      decomposeCost(client, externalId, { scenarioId: scenarioId ?? BASELINE_SCENARIO }, ctx),
    );
  }

  /**
   * Analyse an uploaded extract: parse headers and a sample, propose a canonical
   * mapping with confidence and explanation, apply it and run advisory
   * validation. Pure and stateless; the loading step is separate.
   */
  async analyzeCsv(
    csv: string,
  ): Promise<{
    headers: string[];
    sampleRows: string[][];
    mapping: MappingProposal[];
    validation: ValidationReport;
  }> {
    const rows: string[][] = [];
    await parseCsvStream(Readable.from([csv]), (row) => {
      if (rows.length < 400) rows.push(row);
    });
    const headers = rows[0] ?? [];
    const dataRows = rows.slice(1);
    const sample: Record<string, string[]> = {};
    headers.forEach((h, i) => {
      sample[h] = dataRows.slice(0, 20).map((r) => r[i] ?? '');
    });
    const mapping = proposeMapping(headers, sample);

    const canonical: CanonicalRow[] = dataRows.map((r, idx) => {
      const rec: Record<string, unknown> = {};
      mapping.forEach((m, i) => {
        if (!m.targetField) return;
        const raw = r[i] ?? '';
        rec[m.targetField] = coerce(m.targetField, raw);
      });
      if (rec['external_id'] == null || rec['external_id'] === '') rec['external_id'] = `ROW-${idx + 1}`;
      return rec as unknown as CanonicalRow;
    });

    return { headers, sampleRows: dataRows.slice(0, 100), mapping, validation: validate(canonical) };
  }
}

function coerce(field: TargetField, raw: string): unknown {
  if (field === 'fte') {
    const cleaned = raw.replace('%', '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? (raw.includes('%') ? n / 100 : n) : null;
  }
  if (field === 'base_salary') {
    const n = Number(raw.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

// Server-side tidy-tree layout (the architecture precomputes layout server side).
function layout(nodes: Omit<TreeNode, 'x' | 'y'>[]): TreeNode[] {
  const children = new Map<string, string[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.parent && byId.has(n.parent)) {
      const a = children.get(n.parent) ?? [];
      a.push(n.id);
      children.set(n.parent, a);
    }
  }
  const x = new Map<string, number>();
  let cursor = 0;
  const walk = (id: string): void => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      x.set(id, cursor);
      cursor += 1;
      return;
    }
    for (const k of kids) walk(k);
    x.set(id, (x.get(kids[0]!)! + x.get(kids[kids.length - 1]!)!) / 2);
  };
  for (const r of nodes.filter((n) => !n.parent || !byId.has(n.parent))) walk(r.id);
  return nodes.map((n) => ({ ...n, x: (x.get(n.id) ?? 0) * 26, y: n.layer * 120 }));
}
