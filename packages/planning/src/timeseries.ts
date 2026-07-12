import type pg from 'pg';
import { BASELINE_SCENARIO } from '@wfb/hierarchy';
import { evaluate, type Scope, type ScopeType } from '@wfb/measures';

/**
 * Supply, demand and gap over time. This is the whole point of the epic, and it
 * carries NO new calculation engine: supply is a measure (headcount or FTE)
 * evaluated at a series of dates over a plan scenario. If this file had to
 * invent arithmetic, the Sprint 6 measure engine would have been wrong. It does
 * not; it just calls evaluate at each date.
 */

export interface SupplyPoint {
  date: string;
  supply: number;
}
export interface DemandPoint {
  date: string;
  demand: number;
}
export interface GapPoint {
  date: string;
  supply: number;
  demand: number;
  gap: number;
}

/** Supply at each date: the chosen measure evaluated as-at that date. */
export async function supplyOverTime(
  client: pg.PoolClient,
  scenarioId: string,
  scope: Scope,
  measure: 'headcount' | 'fte',
  dates: string[],
): Promise<SupplyPoint[]> {
  const out: SupplyPoint[] = [];
  for (const date of dates) {
    const supply = await evaluate(client, measure, scope, { scenarioId, asAt: date });
    out.push({ date, supply });
  }
  return out;
}

/** Demand at each date: the latest target for the scope at or before the date. */
export async function demandOverTime(
  client: pg.PoolClient,
  scopeType: ScopeType,
  scopeAnchor: string,
  dates: string[],
): Promise<DemandPoint[]> {
  const out: DemandPoint[] = [];
  for (const date of dates) {
    const { rows } = await client.query<{ target_headcount: string }>(
      `SELECT target_headcount FROM demand_targets
       WHERE scope_type = $1 AND scope_anchor = $2 AND target_date <= $3::date
       ORDER BY target_date DESC LIMIT 1`,
      [scopeType, scopeAnchor, date],
    );
    out.push({ date, demand: rows[0] ? Number(rows[0].target_headcount) : 0 });
  }
  return out;
}

/** Gap over time: demand minus supply at each date. */
export async function gapOverTime(
  client: pg.PoolClient,
  scenarioId: string,
  scope: Scope,
  measure: 'headcount' | 'fte',
  dates: string[],
): Promise<GapPoint[]> {
  const supply = await supplyOverTime(client, scenarioId, scope, measure, dates);
  const anchor = scope.anchor ?? '';
  const demand = await demandOverTime(client, scope.type, anchor, dates);
  return dates.map((date, i) => {
    const s = supply[i]!.supply;
    const d = demand[i]!.demand;
    return { date, supply: s, demand: d, gap: d - s };
  });
}

export { BASELINE_SCENARIO };
