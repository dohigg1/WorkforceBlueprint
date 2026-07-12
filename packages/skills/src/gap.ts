import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { insertVersion, readAsOf } from '@wfb/data-model';

/**
 * Skills assignment and gap analysis (E11-03). Planning happens by role cluster
 * and by skill; the gap between the skills a position requires and the skills
 * the occupying person holds is the atom of a capability view.
 */

export async function setPositionSkill(
  client: pg.PoolClient,
  positionExternalId: string,
  skillExternalId: string,
  importance: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await insertVersion(client, 'position_skills', {
    tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
    external_id: `PS-${positionExternalId}-${skillExternalId}`,
    position_external_id: positionExternalId, skill_external_id: skillExternalId, importance,
  });
}

export async function setPersonSkill(
  client: pg.PoolClient,
  personExternalId: string,
  skillExternalId: string,
  proficiency: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await insertVersion(client, 'person_skills', {
    tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
    external_id: `KS-${personExternalId}-${skillExternalId}`,
    person_external_id: personExternalId, skill_external_id: skillExternalId, proficiency,
  });
}

export interface SkillGap {
  required: { skill: string; importance: number }[];
  matched: { skill: string; importance: number; proficiency: number }[];
  missing: { skill: string; importance: number; proficiency: number; shortfall: number }[];
  coverage: number;
}

/**
 * The skill gap between a position's requirements and a person's proficiencies,
 * as-at a date. A required skill is matched when the person's proficiency meets
 * the required importance; otherwise it is a gap with a shortfall.
 */
export async function skillGap(
  client: pg.PoolClient,
  positionExternalId: string,
  personExternalId: string,
  ctx: TenantContext = requireContext(),
): Promise<SkillGap> {
  const required = await readAsOf<{ skill_external_id: string; importance: string }>(
    client, 'position_skills', { where: 'position_external_id = ' + quote(positionExternalId) }, ctx,
  );
  const have = await readAsOf<{ skill_external_id: string; proficiency: string }>(
    client, 'person_skills', { where: 'person_external_id = ' + quote(personExternalId) }, ctx,
  );
  const prof = new Map(have.map((h) => [h.skill_external_id, Number(h.proficiency)]));

  const matched: SkillGap['matched'] = [];
  const missing: SkillGap['missing'] = [];
  for (const r of required) {
    const importance = Number(r.importance);
    const proficiency = prof.get(r.skill_external_id) ?? 0;
    if (proficiency >= importance) {
      matched.push({ skill: r.skill_external_id, importance, proficiency });
    } else {
      missing.push({ skill: r.skill_external_id, importance, proficiency, shortfall: importance - proficiency });
    }
  }
  const coverage = required.length === 0 ? 1 : matched.length / required.length;
  return {
    required: required.map((r) => ({ skill: r.skill_external_id, importance: Number(r.importance) })),
    matched, missing, coverage,
  };
}

// The value is an external id we control (never user free text in these helpers);
// still, quote defensively for the literal used in the read filter.
function quote(v: string): string {
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) throw new Error(`Unsafe external id: ${v}`);
  return `'${v}'`;
}
