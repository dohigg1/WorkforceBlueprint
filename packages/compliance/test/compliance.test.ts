import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInTenant, closePools, type TenantContext } from '@wfb/tenancy';
import { ensureMigrated, seedTenant } from '@wfb/tenancy/testing';
import { insertVersion, supersede, readOpen } from '@wfb/data-model';
import {
  subjectAccessRequest,
  erasePerson,
  setRetentionPolicy,
  findExpiredPersonalData,
} from '@wfb/compliance';

let ctx: TenantContext;

beforeAll(async () => {
  await ensureMigrated();
  ctx = (await seedTenant('comp')).context;
  await runInTenant(ctx, async (client) => {
    await insertVersion(client, 'positions', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'P1', title: 'Analyst', fte: 1.0, valid_from: new Date('2020-01-01T00:00:00Z'),
    });
    await insertVersion(client, 'people', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'PER-1', display_name: 'Synthetic Subject', email: 'subject@example.test',
      valid_from: new Date('2020-01-01T00:00:00Z'),
    });
    await insertVersion(client, 'occupancies', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'O-1', person_external_id: 'PER-1', position_external_id: 'P1', fte: 1.0,
      valid_from: new Date('2020-01-01T00:00:00Z'),
    });
    // A person with a superseded, retention-expired version.
    await insertVersion(client, 'people', {
      tenant_id: ctx.tenantId, workspace_id: ctx.workspaceId,
      external_id: 'PER-2', display_name: 'Old Record', valid_from: new Date('2020-01-01T00:00:00Z'),
    });
    await supersede(client, 'people', 'PER-2', { display_name: 'Renamed' }, new Date('2023-01-01T00:00:00Z'));
  });
});

afterAll(async () => {
  await closePools();
});

describe('enterprise data protection', () => {
  it('a subject access request gathers everything held about a subject', async () => {
    const report = await runInTenant(ctx, (c) => subjectAccessRequest(c, 'PER-1', ctx));
    expect(report.person?.display_name).toBe('Synthetic Subject');
    expect(report.occupancies.map((o) => o.position_external_id)).toContain('P1');
  });

  it('erasure anonymises personal data but preserves referential integrity and certificates it', async () => {
    const result = await runInTenant(ctx, (c) => erasePerson(c, 'PER-1', new Date('2026-06-01T00:00:00Z'), ctx));
    expect(result.certificate).toHaveLength(64); // sha256 hex

    const [person, position] = await runInTenant(ctx, async (c) => [
      await readOpen<{ display_name: string; email: string | null }>(c, 'people', 'PER-1'),
      await readOpen<{ external_id: string }>(c, 'positions', 'P1'),
    ]);
    expect(person?.display_name).toBe('[erased subject]');
    expect(person?.email).toBeNull();
    // The position the subject occupied still exists: structure is intact.
    expect(position?.external_id).toBe('P1');
  });

  it('retention identifies superseded personal data past its window, without deleting it', async () => {
    await runInTenant(ctx, (c) => setRetentionPolicy(c, 'personal', 1, ctx));
    const expired = await runInTenant(ctx, (c) => findExpiredPersonalData(c, '2026-07-11'));
    const people = expired.find((e) => e.table === 'people');
    expect(people).toBeDefined();
    expect(people!.count).toBeGreaterThan(0); // the 2023 superseded PER-2 version
  });
});
