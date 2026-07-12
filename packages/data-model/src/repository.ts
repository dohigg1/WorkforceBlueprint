import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import { isTemporalTable } from './types.js';

/**
 * As-at read helpers. Every read is scoped to a date (INV-4). The date defaults
 * to the as-at date on the tenant context, which itself defaults to today.
 * Row-level security scopes to tenant and workspace; these helpers add the
 * temporal predicate.
 */

/** SQL predicate selecting the version live at the given as-at parameter. */
export function asOfPredicate(alias: string, paramIndex: number): string {
  const a = alias ? `${alias}.` : '';
  return `${a}valid_from <= $${paramIndex} AND (${a}valid_to IS NULL OR ${a}valid_to > $${paramIndex})`;
}

export interface ReadOptions {
  /** Extra SQL appended after the temporal predicate, for example a filter. */
  where?: string;
  /** Parameters for the extra where clause. They follow the as-at parameter. */
  params?: unknown[];
  asAt?: string;
  orderBy?: string;
  limit?: number;
}

/**
 * Read the rows of a temporal table live as at a date. The as-at value is
 * always parameter $1; any caller params begin at $2.
 */
export async function readAsOf<T extends Record<string, unknown>>(
  client: pg.PoolClient,
  table: string,
  options: ReadOptions = {},
  ctx: TenantContext = requireContext(),
): Promise<T[]> {
  if (!isTemporalTable(table)) throw new Error(`Not a temporal table: ${table}`);
  const asAt = options.asAt ?? ctx.asAt;
  const params: unknown[] = [asAt, ...(options.params ?? [])];
  let sql = `SELECT * FROM ${table} WHERE ${asOfPredicate('', 1)}`;
  if (options.where) sql += ` AND (${options.where})`;
  if (options.orderBy) sql += ` ORDER BY ${options.orderBy}`;
  if (options.limit != null) sql += ` LIMIT ${Number(options.limit)}`;
  const { rows } = await client.query<T>(sql, params);
  return rows;
}

/** Read the single open (current) version of a logical entity, or null. */
export async function readOpen<T extends Record<string, unknown>>(
  client: pg.PoolClient,
  table: string,
  externalId: string,
): Promise<T | null> {
  if (!isTemporalTable(table)) throw new Error(`Not a temporal table: ${table}`);
  const { rows } = await client.query<T>(
    `SELECT * FROM ${table} WHERE external_id = $1 AND valid_to IS NULL`,
    [externalId],
  );
  return rows[0] ?? null;
}
