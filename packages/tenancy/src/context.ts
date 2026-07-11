import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';
import { getAppPool } from './pool.js';
import type { Role } from './roles.js';

/**
 * The tenant context. Every value here is derived from the verified session
 * and NEVER from a request parameter, header, body or query string (INV-2).
 * The lint rule wfb/no-tenant-from-request enforces that this object is
 * constructed only inside authentication middleware.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string | null;
  readonly role: Role;
  /** As-at date for effective-dated reads (INV-4). ISO yyyy-mm-dd. */
  readonly asAt: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** The current context, or undefined if none is established. */
export function currentContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('No tenant context established. Wrap the call in withTenantContext.');
  }
  return ctx;
}

/** Today, in ISO yyyy-mm-dd, used as the default as-at date. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Run a function with the given tenant context bound to async local storage. */
export function withTenantContext<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/**
 * Run a unit of database work bound to a tenant context. Opens a transaction on
 * the application pool and applies the tenant, workspace, user and as-at date
 * as LOCAL session settings, from which the row-level security policies derive
 * isolation. The settings are parameterised through set_config, so record
 * content can never alter them. On error the transaction is rolled back.
 *
 * This is the ONLY sanctioned way for feature code to obtain a database client.
 */
export async function runInTenant<T>(
  ctxOrFn: TenantContext | ((client: pg.PoolClient) => Promise<T>),
  maybeFn?: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const ctx = typeof ctxOrFn === 'function' ? requireContext() : ctxOrFn;
  const fn = (typeof ctxOrFn === 'function' ? ctxOrFn : maybeFn) as (
    client: pg.PoolClient,
  ) => Promise<T>;

  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.current_tenant', $1, true),
              set_config('app.current_workspace', $2, true),
              set_config('app.current_user', $3, true),
              set_config('app.as_at', $4, true)`,
      [ctx.tenantId, ctx.workspaceId, ctx.userId ?? '', ctx.asAt],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
