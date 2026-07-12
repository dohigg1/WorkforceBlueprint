import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate, defaultMigrationDirs, resetPublicSchema, closePools } from '@wfb/tenancy';

// Runs once before the whole test suite: ensure the application role and test
// database exist, then apply all migrations. Feature tests then run against
// real row-level security policies as the application role.
export async function setup(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..');
  execFileSync('bash', [resolve(repoRoot, 'scripts', 'setup-db.sh')], {
    stdio: 'inherit',
  });
  // Deterministic clean slate so tests never depend on prior runs. The
  // performance suite is the exception: it seeds the 100k dataset before Vitest
  // starts and must not have it wiped, so the reset is skipped under WFB_PERF.
  if (process.env.WFB_PERF !== '1') {
    await resetPublicSchema();
  }
  const applied = await migrate(defaultMigrationDirs(repoRoot));
  if (applied.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`Applied migrations: ${applied.join(', ')}`);
  }
  await closePools();
}

export async function teardown(): Promise<void> {
  await closePools();
}
