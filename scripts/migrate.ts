import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate, defaultMigrationDirs, closePools } from '@wfb/tenancy';

// Applies all pending migrations as the administrative role.
async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const applied = await migrate(defaultMigrationDirs(repoRoot));
  if (applied.length === 0) {
    console.warn('No pending migrations.');
  } else {
    console.warn(`Applied: ${applied.join(', ')}`);
  }
  await closePools();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
