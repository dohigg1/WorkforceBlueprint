import pg from 'pg';
import { loadDbConfig, type DbConfig } from './config.js';

const { Pool } = pg;

let appPool: pg.Pool | undefined;
let adminPool: pg.Pool | undefined;

/**
 * The application connection pool. The role is subject to row-level security.
 * Never issue a query on this pool without first establishing tenant context
 * via runInTenant; a query with no context returns zero rows by design.
 */
export function getAppPool(config: DbConfig = loadDbConfig()): pg.Pool {
  if (!appPool) {
    appPool = new Pool({ connectionString: config.appUrl, max: 10 });
  }
  return appPool;
}

/**
 * The administrative pool. Migrations and schema introspection only. Feature
 * code must never import this; a lint rule forbids its use outside tooling and
 * tests.
 */
export function getAdminPool(config: DbConfig = loadDbConfig()): pg.Pool {
  if (!adminPool) {
    adminPool = new Pool({ connectionString: config.adminUrl, max: 4 });
  }
  return adminPool;
}

export async function closePools(): Promise<void> {
  await Promise.all([appPool?.end(), adminPool?.end()]);
  appPool = undefined;
  adminPool = undefined;
}
