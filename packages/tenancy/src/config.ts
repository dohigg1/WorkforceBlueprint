/**
 * Connection configuration. Two connections exist and they are not
 * interchangeable.
 *
 * - The application connection uses a NON-superuser role that is subject to
 *   row-level security. All feature code uses this.
 * - The administrative connection is used ONLY for migrations and for schema
 *   introspection in the invariant tests. It is never used by feature code.
 */

export interface DbConfig {
  /** Application connection string. Role is subject to row-level security. */
  appUrl: string;
  /** Administrative connection string. Used only for migrations and tooling. */
  adminUrl: string;
  /** Role name of the application role, used by the migrator grant sweep. */
  appRole: string;
}

export function loadDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const appUrl =
    env.DATABASE_URL ?? 'postgresql://wfb_app:wfb_app@localhost:5432/wfb_test';
  const adminUrl =
    env.DATABASE_ADMIN_URL ??
    'postgresql://postgres:postgres@localhost:5432/wfb_test';
  const appRole = env.APP_ROLE ?? 'wfb_app';
  return { appUrl, adminUrl, appRole };
}
