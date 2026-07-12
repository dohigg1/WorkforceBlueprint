import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getAdminPool } from './pool.js';
import { migrate, defaultMigrationDirs } from './migrator.js';
import { today, type TenantContext } from './context.js';
import type { Role } from './roles.js';

/**
 * Test and tooling helpers. Tenant, workspace and user provisioning is a
 * control-plane operation performed through the administrative connection,
 * exactly as it is in production. Feature-level data access in tests still
 * goes through the application role and real row-level security policies.
 *
 * This module is exported under @wfb/tenancy/testing and must not be imported
 * by feature code.
 */

export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/ -> tenancy -> packages -> repo root
  return resolve(here, '..', '..', '..');
}

let migrated = false;

/** Ensure the schema is migrated. Idempotent across a test run. */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await migrate(defaultMigrationDirs(repoRoot()));
  migrated = true;
}

export async function provisionTenant(name: string, slug: string): Promise<string> {
  const pool = getAdminPool();
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO tenants(name, slug) VALUES ($1, $2) RETURNING id',
    [name, slug],
  );
  return rows[0]!.id;
}

export async function provisionWorkspace(
  tenantId: string,
  name: string,
  slug: string,
): Promise<string> {
  const pool = getAdminPool();
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO workspaces(tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, name, slug],
  );
  return rows[0]!.id;
}

export async function provisionUser(
  tenantId: string,
  email: string,
  displayName: string,
): Promise<string> {
  const pool = getAdminPool();
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users(tenant_id, email, display_name) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, email, displayName],
  );
  return rows[0]!.id;
}

export async function provisionMembership(
  tenantId: string,
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const pool = getAdminPool();
  await pool.query(
    'INSERT INTO memberships(tenant_id, workspace_id, user_id, role) VALUES ($1, $2, $3, $4)',
    [tenantId, workspaceId, userId, role],
  );
}

export interface SeededTenant {
  tenantId: string;
  workspaceId: string;
  userId: string;
  context: TenantContext;
}

/** Provision a complete tenant + workspace + owner user, returning a context. */
export async function seedTenant(prefix: string, role: Role = 'owner'): Promise<SeededTenant> {
  const suffix = Math.abs(hashString(prefix + role)).toString(36);
  const tenantId = await provisionTenant(`${prefix} Ltd`, `${prefix}-${suffix}`.toLowerCase());
  const workspaceId = await provisionWorkspace(tenantId, `${prefix} Workspace`, 'main');
  const userId = await provisionUser(tenantId, `owner@${prefix}.example`, `${prefix} Owner`);
  await provisionMembership(tenantId, workspaceId, userId, role);
  return {
    tenantId,
    workspaceId,
    userId,
    context: { tenantId, workspaceId, userId, role, asAt: today() },
  };
}

export function contextFor(
  seed: Pick<SeededTenant, 'tenantId' | 'workspaceId' | 'userId'>,
  role: Role = 'owner',
  asAt: string = today(),
): TenantContext {
  return {
    tenantId: seed.tenantId,
    workspaceId: seed.workspaceId,
    userId: seed.userId,
    role,
    asAt,
  };
}

// Deterministic string hash so slugs are stable without Math.random.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
