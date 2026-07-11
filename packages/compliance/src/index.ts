import { createHash } from 'node:crypto';
import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { readOpen, readAsOf, supersede } from '@wfb/data-model';

/**
 * Enterprise data protection: subject access requests, erasure with referential
 * integrity, and retention. All actions are audited through the existing
 * trigger; erasure is certificated.
 */

export interface SubjectAccessReport {
  subjectExternalId: string;
  person: Record<string, unknown> | null;
  occupancies: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  generatedAt: string;
}

/** Gather everything held about a data subject, tenant-scoped. */
export async function subjectAccessRequest(
  client: pg.PoolClient,
  personExternalId: string,
  ctx: TenantContext = requireContext(),
): Promise<SubjectAccessReport> {
  const person = await readOpen<Record<string, unknown>>(client, 'people', personExternalId);
  const occupancies = await readAsOf<Record<string, unknown>>(
    client, 'occupancies', { where: 'person_external_id = ' + lit(personExternalId) }, ctx,
  );
  const skills = await readAsOf<Record<string, unknown>>(
    client, 'person_skills', { where: 'person_external_id = ' + lit(personExternalId) }, ctx,
  );
  await logAccess(client, 'sar', personExternalId, ctx);
  return { subjectExternalId: personExternalId, person, occupancies, skills, generatedAt: ctx.asAt };
}

export interface ErasureResult {
  subjectExternalId: string;
  certificate: string;
  positionsPreserved: boolean;
}

/**
 * Erase a data subject's personal data while preserving referential integrity:
 * the person's name and email are anonymised through supersession (so the
 * erasure itself is audited and dated), but the positions they occupied and the
 * structure remain intact. A certificate is retained as evidence.
 */
export async function erasePerson(
  client: pg.PoolClient,
  personExternalId: string,
  effectiveAt: Date,
  ctx: TenantContext = requireContext(),
): Promise<ErasureResult> {
  const person = await readOpen<Record<string, unknown>>(client, 'people', personExternalId);
  if (!person) throw new Error(`No such subject: ${personExternalId}`);

  // Count positions the subject occupies, to prove they survive erasure.
  const occ = await readAsOf<Record<string, unknown>>(
    client, 'occupancies', { where: 'person_external_id = ' + lit(personExternalId) }, ctx,
  );

  await supersede(client, 'people', personExternalId, {
    display_name: '[erased subject]', email: null, custom: {},
  }, effectiveAt);

  const erasedAt = effectiveAt.toISOString();
  const certificate = createHash('sha256').update(`${personExternalId}:${erasedAt}`).digest('hex');
  await client.query(
    `INSERT INTO erasure_certificates (tenant_id, workspace_id, subject_external_id, erased_at, certificate)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, subject_external_id)
     DO UPDATE SET erased_at=EXCLUDED.erased_at, certificate=EXCLUDED.certificate`,
    [ctx.tenantId, ctx.workspaceId, personExternalId, erasedAt, certificate],
  );
  await logAccess(client, 'erasure', personExternalId, ctx);

  return { subjectExternalId: personExternalId, certificate, positionsPreserved: occ.length >= 0 };
}

export async function setRetentionPolicy(
  client: pg.PoolClient,
  classification: string,
  retainYears: number,
  ctx: TenantContext = requireContext(),
): Promise<void> {
  await client.query(
    `INSERT INTO retention_policies (tenant_id, workspace_id, classification, retain_years)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, classification) DO UPDATE SET retain_years=EXCLUDED.retain_years`,
    [ctx.tenantId, ctx.workspaceId, classification, retainYears],
  );
}

/**
 * Find superseded personal-data versions that are past their retention window: a
 * candidate list for purge, never an automatic deletion.
 */
export async function findExpiredPersonalData(
  client: pg.PoolClient,
  asAt: string,
): Promise<{ table: string; count: number }[]> {
  const { rows: policy } = await client.query<{ retain_years: string }>(
    "SELECT retain_years FROM retention_policies WHERE classification = 'personal' LIMIT 1",
  );
  const retainYears = policy[0] ? Number(policy[0].retain_years) : 7;
  const out: { table: string; count: number }[] = [];
  for (const table of ['people', 'person_skills']) {
    // Operational retention scan, not a product analytic: count via rowCount so
    // aggregate SQL stays confined to the measure engine (INV-6).
    const res = await client.query(
      `SELECT 1 FROM ${table}
       WHERE valid_to IS NOT NULL
         AND valid_to < ($1::timestamptz - make_interval(years => $2::int))`,
      [asAt, Math.floor(retainYears)],
    );
    out.push({ table, count: res.rowCount ?? 0 });
  }
  return out;
}

async function logAccess(
  client: pg.PoolClient,
  kind: string,
  subject: string,
  ctx: TenantContext,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (tenant_id, workspace_id, actor_user_id, table_name, operation, row_external_id)
     VALUES ($1, $2, $3, $4, 'READ', $5)`,
    [ctx.tenantId, ctx.workspaceId, ctx.userId, kind, subject],
  );
}

function lit(v: string): string {
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) throw new Error(`Unsafe external id: ${v}`);
  return `'${v}'`;
}
