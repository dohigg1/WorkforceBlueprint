import type pg from 'pg';
import { isTemporalTable, type TemporalTable } from './types.js';

/**
 * The supersession helper. This is the ONLY place a temporal entity table is
 * updated in place, and the only sanctioned raw UPDATE in the domain packages
 * (enforced by the lint rule wfb/no-raw-update-outside-supersession). A change
 * never mutates history: it closes the open version and inserts a new one.
 *
 * INV-4: nothing is destructively updated; a change supersedes.
 */

const MANAGED_COLUMNS = new Set(['id', 'created_at', 'valid_from', 'valid_to']);

function assertTable(table: string): asserts table is TemporalTable {
  if (!isTemporalTable(table)) {
    throw new Error(`Not a temporal table: ${table}`);
  }
}

/**
 * Insert a brand-new logical entity as an open version. Use supersede to change
 * an existing one.
 */
export async function insertVersion(
  client: pg.PoolClient,
  table: string,
  values: Record<string, unknown>,
): Promise<{ id: string }> {
  assertTable(table);
  const cols = Object.keys(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${cols.map(quoteIdent).join(', ')})
     VALUES (${placeholders.join(', ')}) RETURNING id`,
    cols.map((c) => values[c]),
  );
  return rows[0]!;
}

/**
 * Supersede the currently-open version of a logical entity. Closes the open row
 * at the effective instant and inserts a new open version carrying the
 * overrides. Row-level security scopes both statements to the caller's tenant
 * and workspace, so external_id need only be unique within the workspace.
 */
export async function supersede(
  client: pg.PoolClient,
  table: string,
  externalId: string,
  overrides: Record<string, unknown>,
  effectiveAt: Date,
): Promise<{ closedId: string; newId: string }> {
  assertTable(table);
  // Effective dates are calendar-day granular (ADR 0003). Normalise the
  // effective instant to UTC midnight so version boundaries align with as-at
  // date reads.
  const effectiveDay = new Date(
    Date.UTC(
      effectiveAt.getUTCFullYear(),
      effectiveAt.getUTCMonth(),
      effectiveAt.getUTCDate(),
    ),
  );
  const current = await client.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE external_id = $1 AND valid_to IS NULL`,
    [externalId],
  );
  const row = current.rows[0];
  if (!row) {
    throw new Error(`No open version of ${table} with external_id '${externalId}'`);
  }

  // Close the open version. This raw UPDATE is sanctioned here and only here.
  await client.query(`UPDATE ${table} SET valid_to = $1 WHERE id = $2`, [
    effectiveDay,
    row['id'],
  ]);

  // Build the new open version from the old, applying overrides, resetting the
  // system-managed columns.
  const next: Record<string, unknown> = { ...row, ...overrides };
  for (const c of MANAGED_COLUMNS) delete next[c];
  next['valid_from'] = effectiveDay;

  const inserted = await insertVersion(client, table, next);
  return { closedId: String(row['id']), newId: inserted.id };
}

function quoteIdent(ident: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(ident)) {
    throw new Error(`Unsafe identifier: ${ident}`);
  }
  return `"${ident}"`;
}
