// The connector framework. A connector is a READ-ONLY source of tabular rows.
// It fetches an extract from some external system and returns the raw headers
// and rows; everything downstream (mapping, validation, quality scoring) is the
// job of @wfb/ingestion, and loading into the canonical tables is a separate,
// human-gated step that lives outside this package.
//
// Write-back is deliberately out of scope. A connector never mutates its
// source, and there is no code path here that pushes data back. That is where
// connector projects go to die, so this framework does not open the door.

import type pg from 'pg';
import { requireContext, type TenantContext } from '@wfb/tenancy';
import {
  proposeMapping,
  validate,
  type CanonicalRow,
  type MappingProposal,
  type TargetField,
  type ValidationReport,
} from '@wfb/ingestion';

/**
 * A read-only connector. `fetch` pulls an extract and returns its headers and
 * rows. It returns rows; it never writes anything back to the source. The
 * config is the connector-specific settings persisted on the connection row.
 */
export interface Connector {
  readonly kind: string;
  fetch(config: Record<string, unknown>): Promise<{ headers: string[]; rows: string[][] }>;
}

// The connector registry. Connectors register themselves at module load, and
// runSync resolves a connection's `kind` to its connector here.
const registry = new Map<string, Connector>();

/** Register a connector under its `kind`. Later registration overrides earlier. */
export function registerConnector(connector: Connector): void {
  registry.set(connector.kind, connector);
}

/** Resolve a connector by kind, throwing a clear error when none is registered. */
export function getConnector(kind: string): Connector {
  const connector = registry.get(kind);
  if (connector === undefined) {
    throw new Error(
      `No connector is registered for kind "${kind}". Register one with registerConnector.`,
    );
  }
  return connector;
}

/** The connection row as loaded, tenant-scoped, from the connections table. */
interface ConnectionRow {
  readonly external_id: string;
  readonly kind: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
}

/** The outcome of a sync: rows read, the quality score and the mapping used. */
export interface SyncOutcome {
  readonly rowsRead: number;
  readonly score: number;
  readonly mapping: MappingProposal[];
  readonly validation: ValidationReport;
}

// Only these two canonical fields are numeric; the rest are free text. Kept
// local so the row builder stays exhaustive and type-safe without an `any`.
function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Strip thousands separators and spaces that real extracts carry.
  const n = Number(trimmed.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

type MutableCanonicalRow = { -readonly [K in keyof CanonicalRow]: CanonicalRow[K] };

/**
 * Turn fetched headers and rows into canonical rows by applying a proposed
 * mapping. Columns whose proposal is null are ignored. A row that carries no
 * mapped external identifier is still given a stable synthetic one so the
 * validation report can reference it; the real identifier is expected from the
 * source in practice. Exhaustive switch keeps this strictly typed.
 */
export function buildCanonicalRows(
  headers: string[],
  rows: string[][],
  proposals: MappingProposal[],
): CanonicalRow[] {
  void headers; // Headers drive the proposals; kept in the signature for clarity.
  const fieldByIndex = new Map<number, TargetField>();
  proposals.forEach((proposal, index) => {
    if (proposal.targetField !== null) fieldByIndex.set(index, proposal.targetField);
  });

  return rows.map((cells, rowIndex) => {
    const out: MutableCanonicalRow = { external_id: `row_${rowIndex}`, rowIndex };
    for (const [index, field] of fieldByIndex) {
      const raw = cells[index];
      if (raw === undefined) continue;
      switch (field) {
        case 'external_id': {
          const trimmed = raw.trim();
          if (trimmed !== '') out.external_id = trimmed;
          break;
        }
        case 'title':
          out.title = raw;
          break;
        case 'grade':
          out.grade = raw;
          break;
        case 'status':
          out.status = raw;
          break;
        case 'cost_centre_external_id':
          out.cost_centre_external_id = raw;
          break;
        case 'location_external_id':
          out.location_external_id = raw;
          break;
        case 'org_unit_external_id':
          out.org_unit_external_id = raw;
          break;
        case 'manager_external_id':
          out.manager_external_id = raw;
          break;
        case 'person_external_id':
          out.person_external_id = raw;
          break;
        case 'person_name':
          out.person_name = raw;
          break;
        case 'email':
          out.email = raw;
          break;
        case 'fte':
          out.fte = toNumberOrNull(raw);
          break;
        case 'base_salary':
          out.base_salary = toNumberOrNull(raw);
          break;
      }
    }
    return out;
  });
}

/**
 * Run a read-only sync for a configured connection. It loads the connection
 * (tenant-scoped by row-level security), fetches its extract through the
 * connector, proposes a mapping, builds and validates the canonical rows, and
 * records a sync_runs row carrying the row count, quality score and a report of
 * the mapping and validation counts.
 *
 * It does NOT load the rows into the canonical tables. This is a preview and a
 * quality report; loading is a deliberate, human-gated step handled elsewhere.
 * The client must already carry tenant context (use runInTenant).
 */
export async function runSync(
  client: pg.PoolClient,
  connectionExternalId: string,
  ctx: TenantContext = requireContext(),
): Promise<SyncOutcome> {
  // Load the connection. Row-level security scopes this to the caller's tenant
  // and workspace, so a connection from another tenant is simply not found.
  const { rows: connectionRows } = await client.query<ConnectionRow>(
    `SELECT external_id, kind, name, config
       FROM connections
      WHERE external_id = $1`,
    [connectionExternalId],
  );
  const connection = connectionRows[0];
  if (connection === undefined) {
    throw new Error(
      `No connection "${connectionExternalId}" is visible in this workspace.`,
    );
  }

  // Open the run record first, so a failure is still recorded and attributable.
  const { rows: runRows } = await client.query<{ id: string }>(
    `INSERT INTO sync_runs (tenant_id, workspace_id, connection_external_id, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id`,
    [ctx.tenantId, ctx.workspaceId, connection.external_id],
  );
  const runId = runRows[0]!.id;

  try {
    const connector = getConnector(connection.kind);
    const { headers, rows } = await connector.fetch(connection.config);

    const mapping = proposeMapping(headers);
    const canonical = buildCanonicalRows(headers, rows, mapping);
    const validation = validate(canonical);

    const report = {
      status: 'succeeded' as const,
      connector: connection.kind,
      rowsRead: rows.length,
      mapping: mapping.map((m) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField,
        confidence: m.confidence,
      })),
      qualityScore: validation.score,
      countsByCode: validation.countsByCode,
    };

    await client.query(
      `UPDATE sync_runs
          SET status = 'succeeded',
              finished_at = now(),
              rows_read = $2,
              quality_score = $3,
              report = $4
        WHERE id = $1`,
      [runId, rows.length, validation.score, report],
    );

    return { rowsRead: rows.length, score: validation.score, mapping, validation };
  } catch (err) {
    // Record the failure in the same run row, then re-raise. The report keeps
    // the message so a consultant can see why a sync did not complete.
    await client.query(
      `UPDATE sync_runs
          SET status = 'failed', finished_at = now(), report = $2
        WHERE id = $1`,
      [runId, { status: 'failed', error: (err as Error).message }],
    );
    throw err;
  }
}
