import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { insertVersion, readOpen } from '@wfb/data-model';
import type { RoleProposal } from './clustering.js';

/**
 * Apply reviewed role proposals to the role architecture. This runs only after a
 * human has reviewed and selected proposals; nothing here is automatic. It is a
 * modelling/setup operation that establishes the baseline role architecture,
 * analogous to the initial data load.
 */
export async function applyRoleProposals(
  client: pg.PoolClient,
  proposals: RoleProposal[],
  ctx: TenantContext = requireContext(),
): Promise<{ rolesCreated: number; membershipsCreated: number }> {
  let rolesCreated = 0;
  let membershipsCreated = 0;
  for (const p of proposals) {
    const existingRole = await readOpen(client, 'roles', p.roleKey);
    if (!existingRole) {
      await insertVersion(client, 'roles', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
        external_id: p.roleKey, name: p.suggestedName,
      });
      rolesCreated += 1;
    }
    for (const member of p.memberExternalIds) {
      const rpKey = `RP-${p.roleKey}-${member}`;
      const existing = await readOpen(client, 'role_positions', rpKey);
      if (existing) continue;
      await insertVersion(client, 'role_positions', {
        tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
        external_id: rpKey, role_external_id: p.roleKey, position_external_id: member,
      });
      membershipsCreated += 1;
    }
  }
  return { rolesCreated, membershipsCreated };
}
