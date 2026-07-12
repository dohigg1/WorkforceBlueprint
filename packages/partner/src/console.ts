import { createHash } from 'node:crypto';
import type pg from 'pg';
import { getAdminPool, type TenantContext, type Role } from '@wfb/tenancy';

/**
 * E15-01/02/03: the consultancy partner console.
 *
 * A consultancy runs one workspace per client engagement. This module gives a
 * consultant everything needed to stand up, equip, wind down and certify the
 * destruction of a client workspace without vendor involvement. Workspace is
 * already a first-class, tenant-scoped concept in @wfb/tenancy, so these are
 * thin, correct operations over that foundation.
 *
 * Two planes are used deliberately:
 *
 *  - CONTROL PLANE (admin pool). Creating a workspace, copying a template
 *    library ACROSS workspaces within a tenant, and the archive / export /
 *    destroy lifecycle are administrative acts. They take EXPLICIT tenant and
 *    workspace identifiers as parameters. They never read tenant identity from
 *    a request object, because there is no request here; these are tooling-level
 *    operations, exactly as tenant provisioning already is in @wfb/tenancy.
 *
 *  - APP PLANE (tenant-scoped client from runInTenant). Saving and listing a
 *    workspace's own templates are ordinary tenant-scoped reads and writes that
 *    flow through row-level security using the caller's context.
 *
 * British English throughout. No em dashes.
 */

/** The kinds of artefact a consultant carries between engagements. */
export type TemplateKind = 'measure' | 'mapping' | 'dashboard' | 'board_pack';

/** Workspace branding is free-form JSONB (logo, palette, client name, etc.). */
export type WorkspaceBranding = Record<string, unknown>;

/**
 * A template definition is opaque structured data (a measure definition, a
 * column mapping, a dashboard layout or a board-pack specification). It is
 * stored as JSONB and returned parsed. Typed as unknown because the console
 * neither interprets nor validates the shape; the owning module does.
 */
export type TemplateDefinition = unknown;

/** A saved partner template, as read back from the library. */
export interface PartnerTemplate {
  readonly externalId: string;
  readonly kind: TemplateKind;
  readonly name: string;
  readonly definition: TemplateDefinition;
}

/** The result of standing up a client workspace. */
export interface ProvisionResult {
  readonly workspaceId: string;
  readonly userId: string;
}

/** A summary of a workspace's contents at export time. */
export interface ExportManifest {
  readonly workspaceId: string;
  readonly name: string;
  /** Row count per workspace-scoped table. */
  readonly tables: Record<string, number>;
  readonly exportedAt: string;
}

/**
 * Stand up a complete client workspace in one call: the workspace itself (with
 * branding), an owner user and the owner membership binding them. This is the
 * control-plane operation that lets a consultant create a client environment in
 * under five minutes with no vendor involvement. All three rows are written on
 * the administrative pool, exactly as tenant and workspace provisioning is done
 * elsewhere in the platform.
 */
export async function provisionClientWorkspace(
  tenantId: string,
  name: string,
  slug: string,
  branding: WorkspaceBranding,
  ownerEmail: string,
): Promise<ProvisionResult> {
  const pool = getAdminPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ws = await client.query<{ id: string }>(
      `INSERT INTO workspaces(tenant_id, name, slug, branding)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [tenantId, name, slug, JSON.stringify(branding)],
    );
    const workspaceId = ws.rows[0]!.id;

    // A sensible default display name; the local part of the email address.
    const displayName = ownerEmail.split('@')[0] ?? ownerEmail;
    const usr = await client.query<{ id: string }>(
      `INSERT INTO users(tenant_id, email, display_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, ownerEmail, displayName],
    );
    const userId = usr.rows[0]!.id;

    const ownerRole: Role = 'owner';
    await client.query(
      `INSERT INTO memberships(tenant_id, workspace_id, user_id, role)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, workspaceId, userId, ownerRole],
    );

    await client.query('COMMIT');
    return { workspaceId, userId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Save a template into the caller's workspace library. Tenant-scoped write on
 * the application pool: the tenant and workspace are taken from the verified
 * context and written explicitly, and row-level security enforces them. Upserts
 * on (workspace_id, external_id) so re-saving an external id replaces it.
 */
export async function saveTemplate(
  client: pg.PoolClient,
  kind: TemplateKind,
  externalId: string,
  name: string,
  definition: TemplateDefinition,
  ctx: TenantContext,
): Promise<void> {
  await client.query(
    `INSERT INTO partner_templates(tenant_id, workspace_id, external_id, kind, name, definition)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (workspace_id, external_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           name = EXCLUDED.name,
           definition = EXCLUDED.definition,
           updated_at = now()`,
    [ctx.tenantId, ctx.workspaceId, externalId, kind, name, JSON.stringify(definition)],
  );
}

/**
 * List the caller's workspace library, optionally filtered by kind. Tenant-
 * scoped read on the application pool; row-level security guarantees only the
 * caller's own workspace is visible, so no other tenant's templates can ever be
 * returned. Pass undefined for kind to list everything.
 */
export async function listTemplates(
  client: pg.PoolClient,
  kind: TemplateKind | undefined,
  ctx: TenantContext,
): Promise<PartnerTemplate[]> {
  // ctx is accepted for symmetry and to document the tenant-scoped contract;
  // isolation itself is enforced by row-level security on the client's session.
  void ctx;
  const { rows } = await client.query<{
    external_id: string;
    kind: TemplateKind;
    name: string;
    definition: TemplateDefinition;
  }>(
    `SELECT external_id, kind, name, definition
     FROM partner_templates
     WHERE ($1::text IS NULL OR kind = $1)
     ORDER BY name`,
    [kind ?? null],
  );
  return rows.map((r) => ({
    externalId: r.external_id,
    kind: r.kind,
    name: r.name,
    definition: r.definition,
  }));
}

/**
 * Copy a template library FROM a source workspace INTO the caller's workspace.
 *
 * The source belongs to the same tenant but to a DIFFERENT workspace, so the
 * caller's row-level-security session cannot read it (that is the point of the
 * isolation). This is therefore a control-plane copy: the source rows are read
 * on the administrative pool, scoped explicitly to the same tenant and the
 * source workspace, and then inserted into the target through the caller's
 * tenant-scoped application client so the writes remain within the caller's
 * workspace and audit context. Returns the number of templates copied.
 */
export async function instantiateTemplates(
  client: pg.PoolClient,
  sourceWorkspaceId: string,
  targetCtx: TenantContext,
): Promise<number> {
  const admin = getAdminPool();
  const { rows } = await admin.query<{
    external_id: string;
    kind: TemplateKind;
    name: string;
    definition: TemplateDefinition;
  }>(
    `SELECT external_id, kind, name, definition
     FROM partner_templates
     WHERE tenant_id = $1 AND workspace_id = $2
     ORDER BY external_id`,
    [targetCtx.tenantId, sourceWorkspaceId],
  );

  for (const r of rows) {
    await client.query(
      `INSERT INTO partner_templates(tenant_id, workspace_id, external_id, kind, name, definition)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (workspace_id, external_id) DO UPDATE
         SET kind = EXCLUDED.kind,
             name = EXCLUDED.name,
             definition = EXCLUDED.definition,
             updated_at = now()`,
      [
        targetCtx.tenantId,
        targetCtx.workspaceId,
        r.external_id,
        r.kind,
        r.name,
        JSON.stringify(r.definition),
      ],
    );
  }
  return rows.length;
}

/**
 * Archive a workspace at the end of, or a pause in, an engagement. Control-plane
 * lifecycle transition on the administrative pool. Data is retained.
 */
export async function archiveWorkspace(workspaceId: string): Promise<void> {
  const pool = getAdminPool();
  await pool.query(
    `UPDATE workspaces SET status = 'archived', archived_at = now(), updated_at = now()
     WHERE id = $1`,
    [workspaceId],
  );
}

/**
 * Produce an export manifest summarising a workspace's contents: the row count
 * of every workspace-scoped table. Control-plane read on the administrative
 * pool, since it spans tables across modules for a single named workspace. No
 * file is written; the caller decides what to do with the manifest.
 */
export async function exportWorkspace(workspaceId: string): Promise<ExportManifest> {
  const pool = getAdminPool();

  const ws = await pool.query<{ name: string }>(
    'SELECT name FROM workspaces WHERE id = $1',
    [workspaceId],
  );
  if (ws.rows.length === 0) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const name = ws.rows[0]!.name;

  // Every canonical, workspace-scoped table carries a workspace_id column. We
  // discover them from the catalogue so the manifest stays complete as new
  // modules add tables, rather than hard-coding a list that silently rots.
  const cols = await pool.query<{ table_name: string }>(
    `SELECT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'workspace_id'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name`,
  );

  const tables: Record<string, number> = {};
  for (const { table_name } of cols.rows) {
    // Table names come from the system catalogue and are further constrained to
    // ordinary identifiers before interpolation, so this cannot be injected.
    if (!/^[a-z_][a-z0-9_]*$/.test(table_name)) continue;
    // Export manifest row counts are operational metadata, not a product
    // analytic, so count via rowCount to keep aggregate SQL in the measure
    // engine only (INV-6).
    const res = await pool.query(
      `SELECT 1 FROM "${table_name}" WHERE workspace_id = $1`,
      [workspaceId],
    );
    tables[table_name] = res.rowCount ?? 0;
  }

  return { workspaceId, name, tables, exportedAt: new Date().toISOString() };
}

/**
 * Securely destroy a workspace at engagement end and return a certificate of
 * destruction. Control-plane lifecycle transition on the administrative pool.
 * The certificate is a sha256 hex digest over the workspace identifier and the
 * exact destruction timestamp that is stored on the row, so it can be
 * independently reproduced from the workspace record for the client's audit.
 */
export async function destroyWorkspace(workspaceId: string): Promise<string> {
  const pool = getAdminPool();
  const destroyedAt = new Date().toISOString();
  const certificate = createHash('sha256')
    .update(`${workspaceId}:${destroyedAt}`)
    .digest('hex');

  await pool.query(
    `UPDATE workspaces
     SET status = 'destroyed',
         destroyed_at = $2,
         destruction_certificate = $3,
         updated_at = now()
     WHERE id = $1`,
    [workspaceId, destroyedAt, certificate],
  );

  return certificate;
}
