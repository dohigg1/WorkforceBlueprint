import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { createConnection, runSync, workdayConnector } from '@wfb/connectors';

/**
 * E19 to E21: the read-only connector framework and the file connector.
 *
 * Proves that the file connector fetches an awkward-header extract, that runSync
 * proposes a mapping, validates the rows and records a sync_runs row with a row
 * count and a quality score, that a connection created under Tenant A is not
 * visible to Tenant B (INV-1 isolation on connections), and that the Workday
 * stub reports itself as not implemented.
 *
 * All data below is SYNTHETIC: obviously fictional identifiers and names, no
 * real client, personal or salary data (CLAUDE.md, INV-10).
 */

// Deliberately awkward headers to exercise the mapper: SAP-style PERNR, an
// abbreviated cost centre, a "Reports To" manager column (the hierarchy is a
// hierarchy of positions, so this is the parent position, never a person).
const AWKWARD_CSV = [
  'Posn ID,Job Title,Pay Grade,Reports To,Cost Ctr,PERNR,Employee Name',
  'P-1000,Widget Inspector,G4,,CC-900,E-01,Alex Fictional',
  'P-1001,Widget Polisher,G3,P-1000,CC-900,E-02,Sam Imaginary',
  'P-1002,Widget Packer,G3,P-1000,CC-900,E-03,Jo Notreal',
].join('\n');

let a: TenantContext;
let b: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  a = (await seedTenant('connA')).context;
  b = (await seedTenant('connB')).context;
});

afterAll(async () => {
  await closePools();
});

describe('connector framework and file connector', () => {
  it('fetches an awkward-header CSV, maps the obvious fields, and records a sync run', async () => {
    const outcome = await runInTenant(a, async (client) => {
      await createConnection(client, 'file-1', 'file', 'Nightly HR extract', {
        csv: AWKWARD_CSV,
      });
      return runSync(client, 'file-1', a);
    });

    // Three data rows read (the header is not a data row).
    expect(outcome.rowsRead).toBe(3);
    // A clean synthetic extract scores well; the score is a number in range.
    expect(typeof outcome.score).toBe('number');
    expect(outcome.score).toBeGreaterThan(0);
    expect(outcome.score).toBeLessThanOrEqual(100);

    // The mapping routes at least the obvious fields.
    const routed = new Map(outcome.mapping.map((m) => [m.sourceColumn, m.targetField]));
    expect(routed.get('Posn ID')).toBe('external_id');
    expect(routed.get('Job Title')).toBe('title');
    expect(routed.get('Reports To')).toBe('manager_external_id');
    expect(routed.get('PERNR')).toBe('person_external_id');

    // The sync_runs row is persisted with the count, score and a report.
    const persisted = await runInTenant(a, async (client) => {
      const { rows } = await client.query<{
        status: string;
        rows_read: number;
        quality_score: number | null;
        report: { rowsRead: number; qualityScore: number } | null;
      }>(
        `SELECT status, rows_read, quality_score, report
           FROM sync_runs
          WHERE connection_external_id = $1
          ORDER BY started_at DESC
          LIMIT 1`,
        ['file-1'],
      );
      return rows[0];
    });
    expect(persisted).toBeDefined();
    expect(persisted!.status).toBe('succeeded');
    expect(persisted!.rows_read).toBe(3);
    expect(persisted!.quality_score).toBe(outcome.score);
    expect(persisted!.report?.rowsRead).toBe(3);
  });

  it('does not show Tenant A a connection created by Tenant B (INV-1 isolation)', async () => {
    // Tenant B creates its own connection with the same external id, which is
    // permitted because uniqueness is per workspace.
    await runInTenant(b, (client) =>
      createConnection(client, 'file-1', 'file', "B's private extract", {
        csv: AWKWARD_CSV,
      }),
    );

    // Tenant A must see only its own connection row, never Tenant B's.
    const rowsSeenByA = await runInTenant(a, async (client) => {
      const { rows } = await client.query<{ name: string }>(
        `SELECT name FROM connections WHERE external_id = $1`,
        ['file-1'],
      );
      return rows;
    });
    expect(rowsSeenByA).toHaveLength(1);
    expect(rowsSeenByA[0]!.name).toBe('Nightly HR extract');
    expect(rowsSeenByA.map((r) => r.name)).not.toContain("B's private extract");
  });

  it('reports the Workday connector as not yet implemented', async () => {
    expect(() => workdayConnector.fetch({})).toThrow(/not yet implemented/i);

    // A sync against a Workday connection fails cleanly. runInTenant rolls the
    // whole transaction back on the throw, so nothing is loaded and no partial
    // run is left behind; the caller simply sees the clear error.
    await runInTenant(a, (client) =>
      createConnection(client, 'wd-1', 'workday', 'Workday RaaS', {}),
    );
    await expect(
      runInTenant(a, (client) => runSync(client, 'wd-1', a)),
    ).rejects.toThrow(/not yet implemented/i);
  });
});
