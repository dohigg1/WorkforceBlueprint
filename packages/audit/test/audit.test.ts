import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, getAdminPool, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion } from '@wfb/data-model';
import { readAuditLog, type AuditEntry } from '@wfb/audit';

/**
 * INV-3: every mutation of customer data writes exactly one entry to the
 * append-only audit log, inside the same transaction, by a database trigger
 * that cannot be bypassed. The log is immutable and tenant-isolated.
 */

let a: TenantContext;
let b: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  a = (await seedTenant('auditA')).context;
  b = (await seedTenant('auditB')).context;
});

afterAll(async () => {
  await closePools();
});

async function entriesFor(ctx: TenantContext, externalId: string): Promise<AuditEntry[]> {
  const all = await runInTenant(ctx, (client) =>
    readAuditLog(client, { tableName: 'positions', limit: 500 }),
  );
  return all.filter((e) => e.row_external_id === externalId);
}

describe('INV-3 audit log', () => {
  it('a committed insert produces exactly one INSERT audit entry', async () => {
    await runInTenant(a, (client) =>
      insertVersion(client, 'positions', {
        tenant_id: a.tenantId,
        workspace_id: a.workspaceId,
        external_id: 'AUD-INSERT',
        title: 'Chief Auditor',
      }),
    );

    const found = await entriesFor(a, 'AUD-INSERT');
    expect(found.length).toBe(1);
    const entry = found[0]!;
    expect(entry.operation).toBe('INSERT');
    expect(entry.table_name).toBe('positions');
    expect(entry.tenant_id).toBe(a.tenantId);
    expect(entry.workspace_id).toBe(a.workspaceId);
    expect(entry.actor_user_id).toBe(a.userId);
    expect(entry.before).toBeNull();
    expect(entry.after?.['title']).toBe('Chief Auditor');
  });

  it('a rolled-back change leaves neither the row nor an audit entry (same transaction)', async () => {
    // Insert then throw, so the whole unit of work rolls back. Because the
    // audit entry is written by a trigger in the SAME transaction, it rolls
    // back with the change.
    await expect(
      runInTenant(a, async (client) => {
        await insertVersion(client, 'positions', {
          tenant_id: a.tenantId,
          workspace_id: a.workspaceId,
          external_id: 'AUD-ROLLBACK',
          title: 'Never Committed',
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    // Fresh unit: neither the position nor any audit entry survives.
    const survivingPositions = await runInTenant(a, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM positions WHERE external_id = $1',
        ['AUD-ROLLBACK'],
      );
      return rows;
    });
    expect(survivingPositions.length).toBe(0);

    const survivingAudit = await entriesFor(a, 'AUD-ROLLBACK');
    expect(survivingAudit.length).toBe(0);
  });

  it('a direct database change, bypassing the application, is still audited', async () => {
    // The administrative superuser connection bypasses row-level security and
    // does not go through any application code path. The trigger still fires,
    // proving it cannot be forgotten. actor_user_id is null on this path.
    const admin = getAdminPool();
    await admin.query(
      `INSERT INTO positions (tenant_id, workspace_id, external_id, title)
       VALUES ($1, $2, $3, $4)`,
      [a.tenantId, a.workspaceId, 'AUD-DIRECT', 'Backdoor Insert'],
    );

    const found = await entriesFor(a, 'AUD-DIRECT');
    expect(found.length).toBe(1);
    const entry = found[0]!;
    expect(entry.operation).toBe('INSERT');
    expect(entry.table_name).toBe('positions');
    expect(entry.tenant_id).toBe(a.tenantId);
    expect(entry.actor_user_id).toBeNull();
    expect(entry.after?.['title']).toBe('Backdoor Insert');
  });

  it('the audit log is immutable: UPDATE is rejected', async () => {
    await expect(
      runInTenant(a, async (client) => {
        await insertVersion(client, 'positions', {
          tenant_id: a.tenantId,
          workspace_id: a.workspaceId,
          external_id: 'AUD-IMMUT-U',
          title: 'Immutable Probe U',
        });
        // The just-written audit entry is visible in this transaction; the
        // immutability trigger must reject any attempt to modify it.
        await client.query('UPDATE audit_log SET actor_user_id = NULL');
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('the audit log is immutable: DELETE is rejected', async () => {
    await expect(
      runInTenant(a, async (client) => {
        await insertVersion(client, 'positions', {
          tenant_id: a.tenantId,
          workspace_id: a.workspaceId,
          external_id: 'AUD-IMMUT-D',
          title: 'Immutable Probe D',
        });
        await client.query('DELETE FROM audit_log');
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('an audit entry written under Tenant A is invisible to Tenant B', async () => {
    await runInTenant(a, (client) =>
      insertVersion(client, 'positions', {
        tenant_id: a.tenantId,
        workspace_id: a.workspaceId,
        external_id: 'AUD-XTENANT',
        title: 'A only',
      }),
    );

    // Tenant B must see none of Tenant A's audit entries.
    const seenByB = await runInTenant(b, (client) =>
      readAuditLog(client, { tableName: 'positions', limit: 500 }),
    );
    expect(seenByB.some((e) => e.row_external_id === 'AUD-XTENANT')).toBe(false);
    for (const entry of seenByB) {
      expect(entry.tenant_id).toBe(b.tenantId);
      expect(entry.tenant_id).not.toBe(a.tenantId);
    }
  });
});
