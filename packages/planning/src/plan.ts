import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { editEntity } from '@wfb/scenarios';

/**
 * Planning actions (E12). A plan is a scenario; planned changes are effective-
 * dated deltas within it. A requisition is a joiner with a future start; a
 * planned leaver is an existing position given a future end. Because scenario
 * deltas are now effective-dated, these resolve correctly over the horizon with
 * no special handling in the measure layer.
 */

export interface RequisitionAttrs {
  title: string;
  grade?: string | null;
  fte?: number;
  costCentre?: string | null;
  orgUnit?: string | null;
}

/** Add a planned joiner to a plan scenario, effective from a future date. */
export async function addRequisition(
  client: pg.PoolClient,
  scenarioId: string,
  externalId: string,
  attrs: RequisitionAttrs,
  effectiveFrom: string,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await editEntity(client, scenarioId, 'positions', externalId, {
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    external_id: externalId,
    title: attrs.title,
    grade: attrs.grade ?? null,
    fte: attrs.fte ?? 1.0,
    status: 'planned',
    cost_centre_external_id: attrs.costCentre ?? null,
    org_unit_external_id: attrs.orgUnit ?? null,
    valid_from: iso(effectiveFrom),
    valid_to: null,
    custom: {},
  }, ctx);
}

/** Mark a position as leaving on a future date within a plan scenario. */
export async function planLeaver(
  client: pg.PoolClient,
  scenarioId: string,
  positionExternalId: string,
  leavesOn: string,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await editEntity(client, scenarioId, 'positions', positionExternalId, {
    valid_to: iso(leavesOn),
  }, ctx);
}

/** Set a demand target: a headcount for a scope at a horizon date. */
export async function setDemandTarget(
  client: pg.PoolClient,
  externalId: string,
  scopeType: string,
  scopeAnchor: string,
  targetDate: string,
  targetHeadcount: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO demand_targets
       (tenant_id, workspace_id, external_id, scope_type, scope_anchor, target_date, target_headcount)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7)
     ON CONFLICT (workspace_id, external_id)
     DO UPDATE SET scope_type=EXCLUDED.scope_type, scope_anchor=EXCLUDED.scope_anchor,
       target_date=EXCLUDED.target_date, target_headcount=EXCLUDED.target_headcount`,
    [ctx.tenantId, ctx.workspaceId, externalId, scopeType, scopeAnchor, targetDate, targetHeadcount],
  );
}

function iso(date: string): string {
  return date.includes('T') ? date : `${date}T00:00:00Z`;
}
