import type pg from 'pg';
import { requireContext, type TenantContext, type Role } from '@wfb/tenancy';
import { roleHasPermission } from '@wfb/data-model';

/**
 * Transparent cost decomposition for a single position (E08-01): the fully
 * loaded cost broken into its components, so a finance director can decompose
 * any number. Individual financial values are masked for a caller without the
 * finance permission (INV-7); the aggregate cost measures remain correct because
 * they are computed server-side over real values, never over masked ones.
 */

const BASELINE = '00000000-0000-0000-0000-000000000000';

export interface CostBreakdown {
  externalId: string;
  currency: string;
  base: number | null;
  onCosts: number | null;
  benefits: number | null;
  bonus: number | null;
  overhead: number | null;
  loaded: number | null;
  isVacant: boolean;
  /** True when financial values are masked because the caller lacks permission. */
  masked: boolean;
}

export async function decomposeCost(
  client: pg.PoolClient,
  externalId: string,
  opts: { scenarioId?: string; asAt?: string } = {},
  ctx: TenantContext = requireContext(),
): Promise<CostBreakdown | null> {
  const scenarioId = opts.scenarioId ?? BASELINE;
  const asAt = opts.asAt ?? ctx.asAt;

  const base = await client.query<{ base_reporting: string; is_vacant: boolean }>(
    'SELECT base_reporting, is_vacant FROM wfb_position_base($1, $2::timestamptz) WHERE external_id = $3',
    [scenarioId, asAt, externalId],
  );
  if (base.rows.length === 0) return null;
  const row = base.rows[0]!;

  const cfg = await client.query<{
    oncost_pct: string; benefits_pct: string; bonus_pct: string;
    overhead_pct: string; vacant_factor: string; reporting_currency: string;
  }>('SELECT * FROM cost_config LIMIT 1');
  const c = cfg.rows[0];
  if (!c) throw new Error('No cost configuration for this workspace');

  const factor = row.is_vacant ? Number(c.vacant_factor) : 1;
  const effectiveBase = Number(row.base_reporting) * factor;
  const onCosts = effectiveBase * Number(c.oncost_pct);
  const benefits = effectiveBase * Number(c.benefits_pct);
  const bonus = effectiveBase * Number(c.bonus_pct);
  const overhead = effectiveBase * Number(c.overhead_pct);
  const loaded = effectiveBase + onCosts + benefits + bonus + overhead;

  const permitted = roleHasPermission(ctx.role as Role, 'finance:read');
  if (!permitted) {
    return {
      externalId, currency: c.reporting_currency, isVacant: row.is_vacant, masked: true,
      base: null, onCosts: null, benefits: null, bonus: null, overhead: null, loaded: null,
    };
  }
  return {
    externalId, currency: c.reporting_currency, isVacant: row.is_vacant, masked: false,
    base: round(effectiveBase), onCosts: round(onCosts), benefits: round(benefits),
    bonus: round(bonus), overhead: round(overhead), loaded: round(loaded),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
