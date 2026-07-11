import type pg from 'pg';
import { requireContext, type TenantContext, type Role } from '@wfb/tenancy';
import { readOpen, readAsOf } from '@wfb/data-model';

/**
 * Severance calculation and cost-out (E13). Severance and selection data is the
 * most sensitive the platform holds. Every access to an individual amount is
 * logged (INV-3 additional rule), and individual amounts are masked by default
 * even for administrators. Aggregate cost-out is computed server-side over real
 * values, so a masked individual view never breaks the aggregate.
 */

export interface SeveranceConfig {
  weeksPerYear: number;
  weeklyPayCap: number;
  minServiceYears: number;
  enhancementMultiplier: number;
}

export async function setSeveranceConfig(
  client: pg.PoolClient,
  cfg: SeveranceConfig,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO severance_config
       (tenant_id, workspace_id, weeks_per_year, weekly_pay_cap, min_service_years, enhancement_multiplier)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id) DO UPDATE SET
       weeks_per_year=EXCLUDED.weeks_per_year, weekly_pay_cap=EXCLUDED.weekly_pay_cap,
       min_service_years=EXCLUDED.min_service_years, enhancement_multiplier=EXCLUDED.enhancement_multiplier`,
    [ctx.tenantId, ctx.workspaceId, cfg.weeksPerYear, cfg.weeklyPayCap, cfg.minServiceYears, cfg.enhancementMultiplier],
  );
}

// Only an explicit, deliberate reveal by an owner or administrator returns an
// individual amount, and even then the access is logged. There is no role whose
// default view includes individual severance.
function mayReveal(role: Role): boolean {
  return role === 'owner' || role === 'administrator';
}

async function logSeveranceAccess(
  client: pg.PoolClient,
  positionExternalId: string,
  ctx: TenantContext,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (tenant_id, workspace_id, actor_user_id, table_name, operation, row_external_id)
     VALUES ($1, $2, $3, 'severance', 'READ', $4)`,
    [ctx.tenantId, ctx.workspaceId, ctx.userId, positionExternalId],
  );
}

export interface SeveranceResult {
  positionExternalId: string;
  masked: boolean;
  serviceYears: number | null;
  amount: number | null;
}

async function rawSeverance(
  client: pg.PoolClient,
  positionExternalId: string,
  ctx: TenantContext,
): Promise<{ serviceYears: number; amount: number } | null> {
  const asAt = ctx.asAt;
  const cfgRes = await client.query<{
    weeks_per_year: string; weekly_pay_cap: string; min_service_years: string; enhancement_multiplier: string;
  }>('SELECT * FROM severance_config LIMIT 1');
  const cfg = cfgRes.rows[0];
  if (!cfg) throw new Error('No severance configuration for this workspace');

  const pos = await readOpen<{ base_salary: string | null }>(client, 'positions', positionExternalId);
  if (!pos) return null;
  const baseSalary = pos.base_salary != null ? Number(pos.base_salary) : 0;

  // Tenure from the current occupancy's start date.
  const occ = await readAsOf<{ valid_from: Date }>(
    client, 'occupancies',
    { where: 'position_external_id = ' + literal(positionExternalId), orderBy: 'valid_from', limit: 1, asAt },
    ctx,
  );
  if (occ.length === 0) return { serviceYears: 0, amount: 0 }; // vacant: no severance

  const start = new Date(occ[0]!.valid_from).getTime();
  const at = new Date(`${asAt}T00:00:00Z`).getTime();
  const serviceYears = Math.max(0, (at - start) / (365.25 * 24 * 3600 * 1000));

  const qualifying = serviceYears >= Number(cfg.min_service_years) ? serviceYears : 0;
  const weeklyPay = Math.min(baseSalary / 52, Number(cfg.weekly_pay_cap));
  const statutory = Number(cfg.weeks_per_year) * qualifying * weeklyPay;
  const amount = statutory * Number(cfg.enhancement_multiplier);
  return { serviceYears, amount: Math.round(amount * 100) / 100 };
}

/**
 * Compute an individual's severance. The access is logged regardless of whether
 * the amount is revealed. The amount is returned only on a deliberate reveal by
 * a permitted role; otherwise it is masked.
 */
export async function computeSeverance(
  client: pg.PoolClient,
  positionExternalId: string,
  opts: { reveal?: boolean } = {},
  ctx: TenantContext = requireContext(),
): Promise<SeveranceResult> {
  await logSeveranceAccess(client, positionExternalId, ctx);
  const raw = await rawSeverance(client, positionExternalId, ctx);
  const reveal = opts.reveal === true && mayReveal(ctx.role);
  if (!raw || !reveal) {
    return { positionExternalId, masked: !reveal, serviceYears: null, amount: null };
  }
  return { positionExternalId, masked: false, serviceYears: Math.round(raw.serviceYears * 100) / 100, amount: raw.amount };
}

export interface CostOutResult {
  positionCount: number;
  severanceTotal: number;
  annualSaving: number;
  paybackMonths: number | null;
}

/**
 * Cost-out over a set of positions: the total severance cost and the ongoing
 * annual saving. This is an aggregate computed server-side over real amounts; it
 * never exposes an individual figure, so it is not masked. The access is logged.
 */
export async function costOut(
  client: pg.PoolClient,
  positionExternalIds: string[],
  annualSavingFromRemoval: number,
  ctx: TenantContext = requireContext(),
): Promise<CostOutResult> {
  let severanceTotal = 0;
  for (const id of positionExternalIds) {
    await logSeveranceAccess(client, id, ctx);
    const raw = await rawSeverance(client, id, ctx);
    if (raw) severanceTotal += raw.amount;
  }
  severanceTotal = Math.round(severanceTotal * 100) / 100;
  const paybackMonths = annualSavingFromRemoval > 0
    ? Math.round((severanceTotal / annualSavingFromRemoval) * 12 * 10) / 10
    : null;
  return { positionCount: positionExternalIds.length, severanceTotal, annualSaving: annualSavingFromRemoval, paybackMonths };
}

function literal(v: string): string {
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) throw new Error(`Unsafe external id: ${v}`);
  return `'${v}'`;
}
