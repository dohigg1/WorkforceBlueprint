/**
 * Sprint 0, Task A: the synthetic organisation data generator.
 *
 * Generates a realistically shaped, entirely SYNTHETIC organisation and bulk
 * loads it into the canonical tables through the administrative pool. Seeding is
 * a control-plane operation, so it uses the admin connection which bypasses
 * row-level security by design (exactly as migrations and tenant provisioning
 * do). Every row still carries an explicit tenant_id and workspace_id.
 *
 * ABSOLUTELY NO real names, real salaries or real personal data appears here.
 * Every value is produced by a deterministic synthetic generator seeded from a
 * fixed constant, so runs are reproducible and obviously artificial. People are
 * named "Person 000123"; salaries are drawn from a log-normal by grade with no
 * relation to any real pay scale.
 *
 * The shape follows the brief in docs/sprint-prompts.md, Sprint 0:
 *   - configurable position count (default 100000)
 *   - average span of control of about six, roughly nine layers
 *   - a long tail of managers with a single report
 *   - around eight per cent vacancies (a vacant position simply has no
 *     occupancy row; a filled position has exactly one)
 *   - salary distributed log-normally by grade, stored in positions.custom
 *   - positions spread across forty cost centres and twenty locations
 *   - deliberate defects: a handful of orphans, a few duplicate identifiers and
 *     exactly one cycle. Real client data always contains these, and the
 *     downstream ingestion and validation epic exists to catch them.
 *
 * Run with: tsx scripts/seed-synthetic.ts --size 100000
 */

import { getAdminPool, closePools } from '@wfb/tenancy';
import type pg from 'pg';

// ---------------------------------------------------------------------------
// Command-line arguments
// ---------------------------------------------------------------------------

interface Args {
  size: number;
  workspaceName: string | undefined;
  perfWorkspace: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let size = 100_000;
  let workspaceName: string | undefined;
  let perfWorkspace = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--size') {
      const raw = argv[i + 1];
      i += 1;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        throw new Error(`--size must be a positive integer, received "${raw ?? ''}"`);
      }
      size = parsed;
    } else if (arg === '--workspace-name') {
      workspaceName = argv[i + 1];
      i += 1;
    } else if (arg === '--perf-workspace') {
      perfWorkspace = true;
    } else if (arg !== undefined && arg.startsWith('--size=')) {
      const parsed = Number(arg.slice('--size='.length));
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        throw new Error(`--size must be a positive integer, received "${arg}"`);
      }
      size = parsed;
    }
  }

  return { size, workspaceName, perfWorkspace };
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness. mulberry32 is a small, fast, seedable
// generator. It is used ONLY to shape synthetic data; it never touches
// security-relevant code. Determinism is preferred so that seeds are
// reproducible and reviewers can reason about the output.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box-Muller, driven by the seeded generator. */
function gaussian(rng: () => number): number {
  // Guard against log(0).
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Small synthetic helpers
// ---------------------------------------------------------------------------

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function positionExtId(index: number): string {
  // index is zero-based; external ids are one-based, e.g. POS-000001.
  return `POS-${pad(index + 1, 6)}`;
}

function personExtId(seq: number): string {
  return `PER-${pad(seq, 6)}`;
}

// Synthetic titles by grade. G1 is the top of the structure.
const TITLE_BY_GRADE: readonly string[] = [
  'Chief Officer',
  'Director',
  'Senior Manager',
  'Manager',
  'Team Lead',
  'Senior Specialist',
  'Specialist',
  'Analyst',
  'Associate',
];

// Log-normal salary midpoints by grade (G1..G9), in whole pounds. Entirely
// synthetic and not derived from any real pay data.
const SALARY_MIDPOINT_BY_GRADE: readonly number[] = [
  280_000, 180_000, 130_000, 95_000, 72_000, 58_000, 46_000, 37_000, 30_000,
];

const SALARY_SIGMA = 0.22;

const COST_CENTRE_COUNT = 40;
const LOCATION_COUNT = 20;
const LOCATION_COUNTRIES: readonly string[] = ['GB', 'IE', 'US', 'DE', 'FR'];

// ---------------------------------------------------------------------------
// Bulk insert helper. Batches rows into multi-row INSERT statements so that a
// hundred thousand rows load in a handful of round trips rather than one per
// row. Table and column names are internal constants, never user input.
// ---------------------------------------------------------------------------

const MAX_PARAMS_PER_STATEMENT = 50_000;

async function bulkInsert(
  pool: pg.Pool,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<void> {
  if (rows.length === 0) return;
  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / perRow));
  const columnList = columns.join(', ');

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const tuples: string[] = [];
    let p = 1;
    for (const row of chunk) {
      const placeholders = row.map(() => `$${p++}`);
      tuples.push(`(${placeholders.join(', ')})`);
      for (const v of row) values.push(v);
    }
    const sql = `INSERT INTO ${table} (${columnList}) VALUES ${tuples.join(', ')}`;
    await pool.query(sql, values);
  }
}

// ---------------------------------------------------------------------------
// Tenant and workspace provisioning. Mirrors packages/tenancy/src/testing.ts:
// provisioning is done directly through the administrative connection.
// ---------------------------------------------------------------------------

interface Workspace {
  tenantId: string;
  workspaceId: string;
  tenantSlug: string;
  workspaceSlug: string;
  workspaceName: string;
}

/** Tables this generator writes into. Cleared for a workspace before reseeding. */
const CANONICAL_TABLES: readonly string[] = [
  'occupancies',
  'reporting_lines',
  'positions',
  'people',
  'cost_centres',
  'locations',
];

/**
 * For the perf workspace we use a fixed slug so scripts/perf.sh can find the
 * seeded data. Reseeding must therefore be idempotent: clear any existing rows
 * for the workspace, then drop and recreate the tenant so ids are fresh.
 */
async function resetPerfTenant(pool: pg.Pool, slug: string): Promise<void> {
  const { rows } = await pool.query<{ workspace_id: string }>(
    `SELECT w.id AS workspace_id
       FROM workspaces w
       JOIN tenants t ON t.id = w.tenant_id
      WHERE t.slug = $1`,
    [slug],
  );
  for (const table of CANONICAL_TABLES) {
    for (const { workspace_id } of rows) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspace_id]);
    }
  }
  // Deleting the tenant cascades to its workspaces (see 0001_tenancy.sql).
  await pool.query('DELETE FROM tenants WHERE slug = $1', [slug]);
}

async function provisionWorkspace(pool: pg.Pool, args: Args): Promise<Workspace> {
  let tenantSlug: string;
  let workspaceSlug: string;
  let tenantName: string;
  const workspaceName = args.workspaceName ?? 'Synthetic Organisation';

  if (args.perfWorkspace) {
    tenantSlug = 'perf';
    workspaceSlug = 'perf';
    tenantName = 'Perf Synthetic Ltd';
    await resetPerfTenant(pool, tenantSlug);
  } else {
    // A fresh, unique slug per run so repeated seeds never collide.
    const suffix = Date.now().toString(36);
    tenantSlug = `synthetic-${suffix}`;
    workspaceSlug = 'main';
    tenantName = 'Synthetic Ltd';
  }

  const tenant = await pool.query<{ id: string }>(
    'INSERT INTO tenants(name, slug) VALUES ($1, $2) RETURNING id',
    [tenantName, tenantSlug],
  );
  const tenantId = tenant.rows[0]!.id;

  const workspace = await pool.query<{ id: string }>(
    'INSERT INTO workspaces(tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, workspaceName, workspaceSlug],
  );
  const workspaceId = workspace.rows[0]!.id;

  return { tenantId, workspaceId, tenantSlug, workspaceSlug, workspaceName };
}

// ---------------------------------------------------------------------------
// Hierarchy generation. The hierarchy is a hierarchy of POSITIONS, never of
// people (CLAUDE.md section 4). It is built breadth-first: each manager is
// given a synthetic number of reports drawn from a distribution whose mean is
// about six, with a heavy weight on a single report to produce the long tail of
// managers with exactly one direct report that real organisations exhibit.
// ---------------------------------------------------------------------------

interface Structure {
  parentIndex: Int32Array; // -1 for the single root
  depth: Int32Array; // 0 for the root
  managerCount: number; // positions with at least one report
  maxDepth: number;
}

function childCount(rng: () => number): number {
  // Roughly 30 per cent of managers have a single report (the long tail). The
  // remainder have between four and twelve, mean eight. Overall mean is about
  // 0.3*1 + 0.7*8 = 5.9, i.e. an average span of control near six.
  if (rng() < 0.3) return 1;
  return 4 + Math.floor(rng() * 9); // 4..12 inclusive
}

function buildStructure(size: number, rng: () => number): Structure {
  const parentIndex = new Int32Array(size).fill(-1);
  const depth = new Int32Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  // The root.
  queue[tail++] = 0;
  depth[0] = 0;
  let next = 1;
  let managerCount = 0;
  let maxDepth = 0;

  while (next < size && head < tail) {
    const parent = queue[head++]!;
    const k = childCount(rng);
    let gaveChild = false;
    for (let c = 0; c < k && next < size; c += 1) {
      parentIndex[next] = parent;
      const d = depth[parent]! + 1;
      depth[next] = d;
      if (d > maxDepth) maxDepth = d;
      queue[tail++] = next;
      next += 1;
      gaveChild = true;
    }
    if (gaveChild) managerCount += 1;
  }

  return { parentIndex, depth, managerCount, maxDepth };
}

function gradeForDepth(depth: number): number {
  // G1 at the top; capped at G9 for anything deeper than eight layers.
  return Math.min(depth + 1, 9);
}

function salaryForGrade(grade: number, rng: () => number): number {
  const midpoint = SALARY_MIDPOINT_BY_GRADE[grade - 1]!;
  const mu = Math.log(midpoint);
  const value = Math.exp(mu + SALARY_SIGMA * gaussian(rng));
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface DefectReport {
  orphans: string[];
  duplicates: string[];
  cycle: string[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const size = args.size;

  if (size < 20) {
    throw new Error('--size must be at least 20 so the deliberate defects fit.');
  }

  const startedAt = process.hrtime.bigint();
  const pool = getAdminPool();

  // A fixed seed keeps output deterministic across runs.
  const rng = mulberry32(0x9e3779b9);

  console.warn(`Provisioning tenant and workspace (perf=${args.perfWorkspace})...`);
  const ws = await provisionWorkspace(pool, args);
  const scope = [ws.tenantId, ws.workspaceId] as const;

  // --- Reference entities -------------------------------------------------
  console.warn(`Generating ${COST_CENTRE_COUNT} cost centres and ${LOCATION_COUNT} locations...`);
  const costCentreRows: unknown[][] = [];
  for (let i = 0; i < COST_CENTRE_COUNT; i += 1) {
    const code = pad(i + 1, 2);
    costCentreRows.push([...scope, `CC-${code}`, `Cost Centre ${code}`, `CC${code}`, 'GBP']);
  }
  await bulkInsert(
    pool,
    'cost_centres',
    ['tenant_id', 'workspace_id', 'external_id', 'name', 'code', 'currency'],
    costCentreRows,
  );

  const locationRows: unknown[][] = [];
  for (let i = 0; i < LOCATION_COUNT; i += 1) {
    const code = pad(i + 1, 2);
    const country = LOCATION_COUNTRIES[i % LOCATION_COUNTRIES.length]!;
    locationRows.push([...scope, `LOC-${code}`, `Location ${code}`, country]);
  }
  await bulkInsert(
    pool,
    'locations',
    ['tenant_id', 'workspace_id', 'external_id', 'name', 'country'],
    locationRows,
  );

  // --- Structure ----------------------------------------------------------
  console.warn(`Building position hierarchy for ${size} positions...`);
  const structure = buildStructure(size, rng);

  // Select the positions used to inject deliberate defects. The last few
  // positions created are guaranteed leaves (they were never given children),
  // so re-pointing their reporting lines cannot disturb the rest of the tree.
  const cycleIndices = [size - 1, size - 2, size - 3];
  const orphanIndices = [size - 4, size - 5, size - 6, size - 7, size - 8];
  const cycleSet = new Set<number>(cycleIndices);
  const orphanSet = new Set<number>(orphanIndices);

  // --- Positions, people, occupancies ------------------------------------
  console.warn('Generating positions, people and occupancies...');
  const positionRows: unknown[][] = [];
  const personRows: unknown[][] = [];
  const occupancyRows: unknown[][] = [];

  let personSeq = 0;
  let vacantCount = 0;
  const spanBuckets = new Map<number, number>();

  for (let i = 0; i < size; i += 1) {
    const extId = positionExtId(i);
    const grade = gradeForDepth(structure.depth[i]!);
    const title = TITLE_BY_GRADE[grade - 1]!;
    const salary = salaryForGrade(grade, rng);
    const costCentre = `CC-${pad((i % COST_CENTRE_COUNT) + 1, 2)}`;
    const location = `LOC-${pad((i % LOCATION_COUNT) + 1, 2)}`;
    const custom = JSON.stringify({ salary });

    positionRows.push([
      ...scope,
      extId,
      title,
      `G${grade}`,
      'active',
      costCentre,
      location,
      custom,
    ]);

    // Around eight per cent of positions are vacant. A vacant position has NO
    // occupancy row; it still carries a grade, cost centre, location and cost.
    const vacant = rng() < 0.08;
    if (vacant) {
      vacantCount += 1;
    } else {
      personSeq += 1;
      const personId = personExtId(personSeq);
      personRows.push([...scope, personId, `Person ${pad(personSeq, 6)}`]);
      occupancyRows.push([...scope, `OCC-${pad(personSeq, 6)}`, personId, extId, 1.0]);
    }
  }

  // Duplicate identifier defect: a few extra position rows that reuse an
  // existing external_id. The canonical schema enforces a single OPEN version
  // per external_id (partial unique index WHERE valid_to IS NULL), so a true
  // duplicate cannot be two open rows. We therefore insert the duplicates with
  // a far-future valid_to: they slip past the open-version index yet a naive
  // "current" query filtering valid_to > now() would return both, which is
  // exactly the duplicate-identifier defect ingestion validation must catch.
  const duplicateSourceIndices = [10, 20, 30];
  const duplicatePositionRows: unknown[][] = [];
  const duplicateIds: string[] = [];
  for (const srcIndex of duplicateSourceIndices) {
    const extId = positionExtId(srcIndex);
    duplicateIds.push(extId);
    const grade = gradeForDepth(structure.depth[srcIndex]!);
    duplicatePositionRows.push([
      ...scope,
      extId,
      TITLE_BY_GRADE[grade - 1]!,
      `G${grade}`,
      'active',
      `CC-${pad((srcIndex % COST_CENTRE_COUNT) + 1, 2)}`,
      `LOC-${pad((srcIndex % LOCATION_COUNT) + 1, 2)}`,
      JSON.stringify({ salary: salaryForGrade(grade, rng), duplicate_of: extId }),
      '9999-12-31T00:00:00Z',
    ]);
  }

  await bulkInsert(
    pool,
    'positions',
    [
      'tenant_id',
      'workspace_id',
      'external_id',
      'title',
      'grade',
      'status',
      'cost_centre_external_id',
      'location_external_id',
      'custom',
    ],
    positionRows,
  );
  await bulkInsert(
    pool,
    'positions',
    [
      'tenant_id',
      'workspace_id',
      'external_id',
      'title',
      'grade',
      'status',
      'cost_centre_external_id',
      'location_external_id',
      'custom',
      'valid_to',
    ],
    duplicatePositionRows,
  );
  await bulkInsert(
    pool,
    'people',
    ['tenant_id', 'workspace_id', 'external_id', 'display_name'],
    personRows,
  );
  await bulkInsert(
    pool,
    'occupancies',
    ['tenant_id', 'workspace_id', 'external_id', 'person_external_id', 'position_external_id', 'fte'],
    occupancyRows,
  );

  // --- Reporting lines (with orphan and cycle defects) --------------------
  console.warn('Generating reporting lines...');
  const reportingRows: unknown[][] = [];
  const orphanIds: string[] = [];
  let rlSeq = 0;

  for (let i = 0; i < size; i += 1) {
    rlSeq += 1;
    const childExt = positionExtId(i);
    let parentExt: string | null;

    if (cycleSet.has(i)) {
      // Wire the three cycle positions into a ring: each points at the next.
      const ringPos = cycleIndices.indexOf(i);
      const nextInRing = cycleIndices[(ringPos + 1) % cycleIndices.length]!;
      parentExt = positionExtId(nextInRing);
    } else if (orphanSet.has(i)) {
      // Orphan defect: reports to a parent external_id that does not exist.
      const orphanNumber = orphanIndices.indexOf(i) + 1;
      parentExt = `POS-MISSING-${orphanNumber}`;
      orphanIds.push(childExt);
    } else if (structure.parentIndex[i]! < 0) {
      // The root: a NULL parent denotes a root (0012_relationships.sql).
      parentExt = null;
    } else {
      parentExt = positionExtId(structure.parentIndex[i]!);
    }

    reportingRows.push([...scope, `RL-${pad(rlSeq, 6)}`, childExt, parentExt]);

    // Track span-of-control distribution for the summary (defect-free lines).
    if (parentExt !== null && !orphanSet.has(i) && !cycleSet.has(i)) {
      const parent = structure.parentIndex[i]!;
      spanBuckets.set(parent, (spanBuckets.get(parent) ?? 0) + 1);
    }
  }

  await bulkInsert(
    pool,
    'reporting_lines',
    [
      'tenant_id',
      'workspace_id',
      'external_id',
      'child_position_external_id',
      'parent_position_external_id',
    ],
    reportingRows,
  );

  // --- Summary ------------------------------------------------------------
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  let spanTotal = 0;
  let singleReportManagers = 0;
  for (const span of spanBuckets.values()) {
    spanTotal += span;
    if (span === 1) singleReportManagers += 1;
  }
  const managerCount = spanBuckets.size;
  const avgSpan = managerCount > 0 ? spanTotal / managerCount : 0;

  const defects: DefectReport = {
    orphans: orphanIds,
    duplicates: duplicateIds,
    cycle: cycleIndices.map((i) => positionExtId(i)),
  };

  const vacancyPct = (vacantCount / size) * 100;

  console.warn('');
  console.warn('=== Deliberate defects injected ===');
  console.warn(
    `Orphans (report to a non-existent parent): ${defects.orphans.length} -> ${defects.orphans.join(', ')}`,
  );
  console.warn(
    `Duplicate external_ids (extra rows sharing an id): ${defects.duplicates.length} -> ${defects.duplicates.join(', ')}`,
  );
  console.warn(
    `Cycle (one ring of ${defects.cycle.length} positions): ${defects.cycle.join(' -> ')} -> ${defects.cycle[0]}`,
  );

  console.warn('');
  console.warn('=== Seed summary ===');
  console.warn(`Tenant:     ${ws.tenantId} (slug "${ws.tenantSlug}")`);
  console.warn(`Workspace:  ${ws.workspaceId} (slug "${ws.workspaceSlug}", name "${ws.workspaceName}")`);
  console.warn(`Positions:  ${positionRows.length} (+${duplicatePositionRows.length} duplicate rows)`);
  console.warn(`People:     ${personRows.length}`);
  console.warn(`Occupancies:${occupancyRows.length}`);
  console.warn(`Reporting lines: ${reportingRows.length}`);
  console.warn(`Cost centres: ${costCentreRows.length}`);
  console.warn(`Locations:  ${locationRows.length}`);
  console.warn(`Vacant:     ${vacantCount} (${vacancyPct.toFixed(2)}%)`);
  console.warn(`Managers:   ${managerCount}, single-report managers: ${singleReportManagers}`);
  console.warn(`Average span of control: ${avgSpan.toFixed(2)}`);
  console.warn(`Layers (max depth + 1): ${structure.maxDepth + 1}`);
  console.warn(`Elapsed:    ${(elapsedMs / 1000).toFixed(2)}s`);

  await closePools();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
