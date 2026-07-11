import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { BASELINE_SCENARIO, descendants, ancestors } from '@wfb/hierarchy';
import { evaluatePerNode, type Scope } from '@wfb/measures';
import { editEntity } from '@wfb/scenarios';

/**
 * AI structural optimisation (Sprint 26). It PROPOSES and never applies, exactly
 * as role clustering does; a reorganisation is a judgement a consultant owns.
 * The first heuristic attacks the long tail of single-report managers: a
 * manager with exactly one report is a redundant layer, and moving the report up
 * removes it. Every candidate is found through the measure engine.
 */

export interface DelayerProposal {
  type: 'delayer';
  redundantManager: string;
  report: string;
  newParent: string;
  rationale: string;
}

export async function proposeDelayering(
  client: pg.PoolClient,
  scope: Scope,
  scenarioId: string = BASELINE_SCENARIO,
  ctx: TenantContext = requireContext(),
): Promise<DelayerProposal[]> {
  const spans = await evaluatePerNode(client, 'span_of_control', scope, { scenarioId, asAt: ctx.asAt });
  const proposals: DelayerProposal[] = [];
  for (const [manager, span] of spans) {
    if (span !== 1) continue;
    const kids = await descendants(client, manager, { maxDepth: 1, scenarioId });
    const parents = await ancestors(client, manager, { scenarioId });
    const report = kids[0]?.descendant_external_id;
    const newParent = parents[0]?.ancestor_external_id; // nearest ancestor
    if (!report || !newParent) continue; // a single-report root has nowhere to lift to
    proposals.push({
      type: 'delayer',
      redundantManager: manager,
      report,
      newParent,
      rationale: `${manager} manages a single report; moving ${report} to ${newParent} removes a redundant layer.`,
    });
  }
  return proposals;
}

/**
 * Apply a reviewed delayering proposal inside a scenario. Only runs after human
 * review; the edit goes through the scenario engine, never the baseline.
 */
export async function applyDelayering(
  client: pg.PoolClient,
  scenarioId: string,
  proposal: DelayerProposal,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await editEntity(client, scenarioId, 'reporting_lines', `RL-${proposal.report}`, {
    parent_position_external_id: proposal.newParent,
  }, ctx);
}

export type { Scope };
