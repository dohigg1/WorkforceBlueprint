import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { BASELINE_SCENARIO } from '@wfb/hierarchy';
import { evaluate, type Scope } from '@wfb/measures';

/**
 * Benchmarking (Sprint 26, intelligence). Compare structural measures against
 * healthy reference bands. Every figure is a measure from the one engine; this
 * is moat, not entry ticket, and it required no new calculation infrastructure.
 */

export type BenchmarkStatus = 'healthy' | 'high' | 'low';

export interface BenchmarkRow {
  measure: string;
  value: number;
  band: [number, number];
  status: BenchmarkStatus;
  note: string;
}

// Reference bands drawn from common organisation-design guidance. Configurable
// in a real deployment; fixed here for a defensible default.
const BANDS: { measure: string; band: [number, number]; note: string }[] = [
  { measure: 'average_span', band: [4, 8], note: 'Healthy span of control is typically four to eight.' },
  { measure: 'layers', band: [1, 8], note: 'Flat organisations keep layers below eight.' },
  { measure: 'management_ratio', band: [0, 0.2], note: 'Manager-heavy above one in five.' },
];

export async function benchmark(
  client: pg.PoolClient,
  scope: Scope,
  scenarioId: string = BASELINE_SCENARIO,
  ctx: TenantContext = requireContext(),
): Promise<BenchmarkRow[]> {
  const out: BenchmarkRow[] = [];
  for (const b of BANDS) {
    const value = await evaluate(client, b.measure, scope, { scenarioId, asAt: ctx.asAt });
    const status: BenchmarkStatus = value < b.band[0] ? 'low' : value > b.band[1] ? 'high' : 'healthy';
    out.push({ measure: b.measure, value, band: b.band, status, note: b.note });
  }
  return out;
}
