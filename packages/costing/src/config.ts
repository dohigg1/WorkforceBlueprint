import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';

/**
 * Cost configuration writers. The cost build-up is configurable and transparent
 * (E08-01). All values are workspace-scoped through row-level security.
 */

export interface CostConfig {
  oncostPct: number;
  benefitsPct: number;
  bonusPct: number;
  overheadPct: number;
  vacantFactor: number;
  reportingCurrency: string;
}

export async function setCostConfig(
  client: pg.PoolClient,
  config: CostConfig,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO cost_config
       (tenant_id, workspace_id, oncost_pct, benefits_pct, bonus_pct, overhead_pct, vacant_factor, reporting_currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workspace_id) DO UPDATE SET
       oncost_pct = EXCLUDED.oncost_pct, benefits_pct = EXCLUDED.benefits_pct,
       bonus_pct = EXCLUDED.bonus_pct, overhead_pct = EXCLUDED.overhead_pct,
       vacant_factor = EXCLUDED.vacant_factor, reporting_currency = EXCLUDED.reporting_currency`,
    [
      ctx.tenantId,
      ctx.workspaceId,
      config.oncostPct,
      config.benefitsPct,
      config.bonusPct,
      config.overheadPct,
      config.vacantFactor,
      config.reportingCurrency,
    ],
  );
}

export async function setGradeMidpoint(
  client: pg.PoolClient,
  grade: string,
  currency: string,
  midpoint: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO grade_midpoints (tenant_id, workspace_id, grade, currency, midpoint)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, grade) DO UPDATE SET currency = EXCLUDED.currency, midpoint = EXCLUDED.midpoint`,
    [ctx.tenantId, ctx.workspaceId, grade, currency, midpoint],
  );
}

export async function setFxRate(
  client: pg.PoolClient,
  from: string,
  to: string,
  rate: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO fx_rates (tenant_id, workspace_id, from_ccy, to_ccy, rate)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, from_ccy, to_ccy) DO UPDATE SET rate = EXCLUDED.rate`,
    [ctx.tenantId, ctx.workspaceId, from, to, rate],
  );
}
