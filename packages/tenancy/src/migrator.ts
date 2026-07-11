import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { getAdminPool } from './pool.js';
import { loadDbConfig } from './config.js';

export interface MigrationFile {
  name: string;
  path: string;
  sql: string;
}

/**
 * Collect migration files from a set of directories. Files are named with a
 * zero-padded global sequence prefix (for example 0001_tenancy.sql) and are
 * applied in lexical order of that prefix, regardless of which package owns
 * them. This gives a single global ordering across the modular monolith.
 */
export async function collectMigrations(dirs: string[]): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.sql')) continue;
      const path = join(dir, entry);
      files.push({ name: entry, path, sql: await readFile(path, 'utf8') });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

/**
 * Drop and recreate the public schema, giving a deterministic clean slate.
 * Used by the test harness so that every run starts from an empty database and
 * results do not depend on prior runs. Administrative operation.
 */
export async function resetPublicSchema(): Promise<void> {
  const config = loadDbConfig();
  const pool = getAdminPool(config);
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${config.appRole}`);
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Apply all unapplied migrations, each in its own transaction, as the
 * administrative role. After applying, run a grant sweep so that the
 * application role can reach every table (it remains subject to row-level
 * security). Returns the names of the migrations that were applied.
 */
export async function migrate(dirs: string[]): Promise<string[]> {
  const config = loadDbConfig();
  const pool = getAdminPool(config);
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    const done = new Set(rows.map((r) => r.name));
    const migrations = await collectMigrations(dirs);
    for (const m of migrations) {
      if (done.has(m.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
        applied.push(m.name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
    // Grant sweep: the application role must reach every table and sequence.
    // It stays subject to row-level security regardless of these grants.
    await client.query(`GRANT USAGE ON SCHEMA public TO ${config.appRole}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${config.appRole}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${config.appRole}`,
    );
    return applied;
  } finally {
    client.release();
  }
}

/** The default set of migration directories: every package's migrations. */
export function defaultMigrationDirs(repoRoot: string): string[] {
  const packages = [
    'tenancy',
    'data-model',
    'audit',
    'hierarchy',
    'scenarios',
    'measures',
    'costing',
    'planning',
    'skills',
  ];
  return packages.map((p) => join(repoRoot, 'packages', p, 'migrations'));
}
