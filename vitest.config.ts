import { defineConfig } from 'vitest/config';

// Tests exercise the built package outputs (dist), resolved through pnpm
// workspace links by package name, so verify.sh builds before it tests. Tests
// run in a single fork with no parallelism: they share one PostgreSQL cluster
// and must not interleave tenant contexts.
export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    reporters: ['default'],
  },
});
