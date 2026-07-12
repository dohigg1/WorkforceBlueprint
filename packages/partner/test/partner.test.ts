import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runInTenant,
  closePools,
  getAdminPool,
  today,
  type TenantContext,
} from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import {
  provisionClientWorkspace,
  saveTemplate,
  listTemplates,
  instantiateTemplates,
  archiveWorkspace,
  exportWorkspace,
  destroyWorkspace,
} from '@wfb/partner';

/**
 * E15-01/02/03: the consultancy partner console.
 *
 * A single consultancy tenant runs one workspace per client engagement. These
 * tests prove: provisioning a client workspace with an owner in one call; a
 * per-workspace template library that round-trips and is invisible to any other
 * tenant (row-level security); carrying a library into a fresh engagement; and
 * the archive / destroy lifecycle that ends with a certificate of destruction.
 */

let consultancyTenantId: string;

/** Build a tenant-scoped owner context for a client workspace. */
function ownerContext(
  tenantId: string,
  workspaceId: string,
  userId: string,
): TenantContext {
  return { tenantId, workspaceId, userId, role: 'owner', asAt: today() };
}

beforeAll(async () => {
  await ensureMigrated();
  // The consultancy itself is a tenant. Its client engagements are workspaces
  // beneath it, created through the partner console.
  consultancyTenantId = (await seedTenant('partnerco')).tenantId;
});

afterAll(async () => {
  await closePools();
});

describe('E15 partner console', () => {
  it('provisions a client workspace with an owner membership, resolvable by slug', async () => {
    const { workspaceId, userId } = await provisionClientWorkspace(
      consultancyTenantId,
      'Client A',
      'client-a',
      { logo: 'https://cdn.example/a.png', primaryColour: '#003087' },
      'lead@clienta.example',
    );

    const admin = getAdminPool();
    const ws = await admin.query<{ id: string; status: string; branding: { logo: string } }>(
      'SELECT id, status, branding FROM workspaces WHERE tenant_id = $1 AND slug = $2',
      [consultancyTenantId, 'client-a'],
    );
    expect(ws.rows).toHaveLength(1);
    expect(ws.rows[0]!.id).toBe(workspaceId);
    expect(ws.rows[0]!.status).toBe('active');
    expect(ws.rows[0]!.branding.logo).toBe('https://cdn.example/a.png');

    const mem = await admin.query<{ role: string }>(
      'SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId],
    );
    expect(mem.rows).toHaveLength(1);
    expect(mem.rows[0]!.role).toBe('owner');
  });

  it('saves and lists templates within a tenant, and hides them from another tenant', async () => {
    const { workspaceId, userId } = await provisionClientWorkspace(
      consultancyTenantId,
      'Client Library',
      'client-lib',
      {},
      'lead@lib.example',
    );
    const ctx = ownerContext(consultancyTenantId, workspaceId, userId);

    await runInTenant(ctx, async (c) => {
      await saveTemplate(c, 'measure', 'headcount', 'Headcount', { expr: 'count(positions)' }, ctx);
      await saveTemplate(c, 'board_pack', 'q-review', 'Quarterly Review', { slides: 12 }, ctx);
    });

    // Round-trip within the tenant.
    const all = await runInTenant(ctx, (c) => listTemplates(c, undefined, ctx));
    expect(all.map((t) => t.externalId).sort()).toEqual(['headcount', 'q-review']);
    const headcount = all.find((t) => t.externalId === 'headcount')!;
    expect(headcount.kind).toBe('measure');
    expect(headcount.definition).toEqual({ expr: 'count(positions)' });

    // Filter by kind.
    const measures = await runInTenant(ctx, (c) => listTemplates(c, 'measure', ctx));
    expect(measures.map((t) => t.externalId)).toEqual(['headcount']);

    // A DIFFERENT tenant sees none of them: row-level security isolates them.
    const otherTenant = await seedTenant('rivalco');
    const otherSeen = await runInTenant(otherTenant.context, (c) =>
      listTemplates(c, undefined, otherTenant.context),
    );
    expect(otherSeen).toHaveLength(0);
  });

  it('instantiates a source library into a fresh client workspace', async () => {
    // Source engagement with a two-template library.
    const source = await provisionClientWorkspace(
      consultancyTenantId,
      'Source Engagement',
      'source-eng',
      {},
      'lead@source.example',
    );
    const sourceCtx = ownerContext(consultancyTenantId, source.workspaceId, source.userId);
    await runInTenant(sourceCtx, async (c) => {
      await saveTemplate(c, 'mapping', 'hr-columns', 'HR Column Mapping', { cols: ['a', 'b'] }, sourceCtx);
      await saveTemplate(c, 'dashboard', 'exec', 'Executive Dashboard', { widgets: 4 }, sourceCtx);
    });

    // Fresh client engagement, initially empty.
    const target = await provisionClientWorkspace(
      consultancyTenantId,
      'New Client',
      'new-client',
      {},
      'lead@newclient.example',
    );
    const targetCtx = ownerContext(consultancyTenantId, target.workspaceId, target.userId);
    expect(await runInTenant(targetCtx, (c) => listTemplates(c, undefined, targetCtx))).toHaveLength(0);

    const copied = await runInTenant(targetCtx, (c) =>
      instantiateTemplates(c, source.workspaceId, targetCtx),
    );
    expect(copied).toBe(2);

    const targetLib = await runInTenant(targetCtx, (c) => listTemplates(c, undefined, targetCtx));
    expect(targetLib.map((t) => t.externalId).sort()).toEqual(['exec', 'hr-columns']);
    expect(targetLib.find((t) => t.externalId === 'exec')!.definition).toEqual({ widgets: 4 });
  });

  it('exports a manifest of workspace contents including the template library', async () => {
    const client = await provisionClientWorkspace(
      consultancyTenantId,
      'Export Client',
      'export-client',
      {},
      'lead@export.example',
    );
    const ctx = ownerContext(consultancyTenantId, client.workspaceId, client.userId);
    await runInTenant(ctx, (c) =>
      saveTemplate(c, 'measure', 'm1', 'One', { a: 1 }, ctx),
    );

    const manifest = await exportWorkspace(client.workspaceId);
    expect(manifest.workspaceId).toBe(client.workspaceId);
    expect(manifest.name).toBe('Export Client');
    expect(typeof manifest.exportedAt).toBe('string');
    // The manifest reports the template library for this workspace only.
    expect(manifest.tables.partner_templates).toBe(1);
  });

  it('archives then destroys a workspace, returning a certificate reflected on the row', async () => {
    const client = await provisionClientWorkspace(
      consultancyTenantId,
      'Ending Engagement',
      'ending-eng',
      {},
      'lead@ending.example',
    );
    const admin = getAdminPool();

    await archiveWorkspace(client.workspaceId);
    const archived = await admin.query<{ status: string; archived_at: string | null }>(
      'SELECT status, archived_at FROM workspaces WHERE id = $1',
      [client.workspaceId],
    );
    expect(archived.rows[0]!.status).toBe('archived');
    expect(archived.rows[0]!.archived_at).not.toBeNull();

    const certificate = await destroyWorkspace(client.workspaceId);
    expect(certificate).toMatch(/^[0-9a-f]{64}$/);

    const destroyed = await admin.query<{
      status: string;
      destroyed_at: string | null;
      destruction_certificate: string | null;
    }>(
      'SELECT status, destroyed_at, destruction_certificate FROM workspaces WHERE id = $1',
      [client.workspaceId],
    );
    expect(destroyed.rows[0]!.status).toBe('destroyed');
    expect(destroyed.rows[0]!.destroyed_at).not.toBeNull();
    expect(destroyed.rows[0]!.destruction_certificate).toBe(certificate);
  });
});
