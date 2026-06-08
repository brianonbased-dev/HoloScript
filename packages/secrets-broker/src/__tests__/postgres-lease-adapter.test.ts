import { describe, expect, it } from 'vitest';
import {
  createPostgresLeaseAdapter,
  SECRET_LEASES_DDL,
  type LeaseQueryRunner,
} from '../postgres-lease-adapter';

/**
 * Minimal in-memory fake of the `secret_leases` table + a `query` runner that
 * understands ONLY the three statements the adapter emits (INSERT / SELECT /
 * UPDATE). It is deliberately not a general SQL engine — it pattern-matches the
 * adapter's exact queries and operates on a Map. This keeps the adapter under
 * test without pulling in pg-mem or a real database.
 */
interface FakeLeaseRow {
  lease_id: string;
  task_id: string;
  agent_id: string;
  scope: string; // stored as the JSON string the adapter serializes
  expires_at: string; // ISO string
  revoked: boolean;
  revoked_reason: string | null;
  revoked_by: string | null;
}

function createFakeDb(): {
  query: LeaseQueryRunner['query'];
  rows: Map<string, FakeLeaseRow>;
} {
  const rows = new Map<string, FakeLeaseRow>();

  const query: LeaseQueryRunner['query'] = async (sql, params) => {
    const text = sql.trim();

    if (text.startsWith('INSERT INTO secret_leases')) {
      const [leaseId, taskId, agentId, scopeJson, expiresAt] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      rows.set(leaseId, {
        lease_id: leaseId,
        task_id: taskId,
        agent_id: agentId,
        scope: scopeJson,
        expires_at: expiresAt,
        revoked: false,
        revoked_reason: null,
        revoked_by: null,
      });
      return { rows: [] };
    }

    if (text.startsWith('SELECT')) {
      const [leaseId] = params as [string];
      const row = rows.get(leaseId);
      if (!row) return { rows: [] };
      return {
        rows: [
          {
            agent_id: row.agent_id,
            // Hand back the raw JSON string to exercise the adapter's
            // jsonb-string narrowing path (a real pg driver would parse it).
            scope: row.scope,
            expires_at: row.expires_at,
            revoked: row.revoked,
          },
        ],
      };
    }

    if (text.startsWith('UPDATE secret_leases')) {
      const [leaseId, reason, by] = params as [string, string, string];
      const row = rows.get(leaseId);
      // Mirror the adapter's WHERE clause: only update if present AND not revoked.
      if (!row || row.revoked) return { rows: [] };
      row.revoked = true;
      row.revoked_reason = reason;
      row.revoked_by = by;
      return { rows: [{ lease_id: leaseId }] };
    }

    throw new Error(`Fake DB received an unexpected statement: ${text.slice(0, 60)}`);
  };

  return { query, rows };
}

const REF = 'secret://namespace/ns_test/key';

describe('createPostgresLeaseAdapter', () => {
  it('exposes idempotent DDL for the secret_leases table', () => {
    expect(SECRET_LEASES_DDL).toContain('CREATE TABLE IF NOT EXISTS secret_leases');
    expect(SECRET_LEASES_DDL).toContain('lease_id');
    expect(SECRET_LEASES_DDL).toContain('JSONB');
  });

  it('issues a lease and resolves it (happy path)', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId, expiresAt } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
    });

    expect(leaseId).toMatch(/^lease-[0-9a-f-]{36}$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: REF,
    });
    expect(resolved).toEqual({ ok: true });
  });

  it('returns lease_not_found for an unknown lease id', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const resolved = await adapter.resolveLease({
      leaseId: 'lease-does-not-exist',
      agentId: 'agent_a',
      secretRef: REF,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_not_found');
  });

  it('returns lease_revoked after revocation', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
    });

    const revoke = await adapter.revokeLease({ leaseId, reason: 'manual', by: 'admin' });
    expect(revoke.ok).toBe(true);

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: REF,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_revoked');
  });

  it('returns lease_expired once the lease TTL has passed', async () => {
    // Advancing clock: first call (issue) sees t0, later calls (resolve) see t0 + 1h.
    let calls = 0;
    const base = new Date('2026-01-01T00:00:00.000Z').getTime();
    const now = (): Date => {
      const t = calls === 0 ? base : base + 60 * 60 * 1000; // +1h on resolve
      calls += 1;
      return new Date(t);
    };

    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query, now });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
      durationMs: 60 * 1000, // 60s TTL, far less than the +1h advance
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: REF,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_expired');
  });

  it('returns lease_agent_mismatch for the wrong agent', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_b',
      secretRef: REF,
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_agent_mismatch');
  });

  it('returns lease_scope_violation for an out-of-scope secret', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: 'secret://namespace/ns_test/other',
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_scope_violation');
  });

  it('revokeLease returns ok:false when the lease does not exist', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const revoke = await adapter.revokeLease({
      leaseId: 'lease-missing',
      reason: 'manual',
      by: 'admin',
    });
    expect(revoke.ok).toBe(false);
  });

  it('revokeLease is idempotent: second revoke returns ok:false (0 rows)', async () => {
    const { query } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: [REF],
    });

    const first = await adapter.revokeLease({ leaseId, reason: 'manual', by: 'admin' });
    expect(first.ok).toBe(true);
    const second = await adapter.revokeLease({ leaseId, reason: 'again', by: 'admin' });
    expect(second.ok).toBe(false);
  });

  it('persists task_id, scope, revoked_reason and revoked_by to the row', async () => {
    const { query, rows } = createFakeDb();
    const adapter = createPostgresLeaseAdapter({ query });

    const { leaseId } = await adapter.issueLease({
      taskId: 'task_42',
      agentId: 'agent_a',
      scope: [REF, 'secret://namespace/ns_test/two'],
    });
    await adapter.revokeLease({ leaseId, reason: 'rotation', by: 'ops' });

    const row = rows.get(leaseId);
    expect(row?.task_id).toBe('task_42');
    expect(JSON.parse(row?.scope ?? '[]')).toEqual([REF, 'secret://namespace/ns_test/two']);
    expect(row?.revoked_reason).toBe('rotation');
    expect(row?.revoked_by).toBe('ops');
  });
});
