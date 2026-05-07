/**
 * Unit tests for identity/vault-lease-registry.ts - task-scoped credential
 * vault leases (task_1778102013331_u8q2).
 *
 * Coverage strategy (G.GOLD.013, G.GOLD.015):
 *   - Test the FALSE case for every guard (wallet rejection, expiry,
 *     scope violation, agent mismatch, duplicate, unknown lease).
 *   - Optimize for failure categories that the spec calls out as
 *     non-negotiable invariants 1-7.
 *   - Exercise atomicity: rejected issuance MUST leave zero state.
 *
 * @module holomesh/identity/__tests__/vault-lease-registry.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  issueLease,
  getLease,
  findActiveLease,
  isLeaseValid,
  resolveSecret,
  resolveSecretWithLease,
  runWithTaskContext,
  getCurrentTaskContext,
  VaultLeaseError,
  revokeLease,
  revokeLeasesForTask,
  sweepExpiredLeases,
  queryLeases,
  MAX_LEASE_DURATION_MS,
  MIN_LEASE_DURATION_MS,
  UNLEASABLE_PATTERNS,
  _resetVaultLeaseRegistryForTests,
  _getActiveLeaseIndexForTests,
} from '../vault-lease-registry';
import {
  _resetAuditLogForTests,
  _getEventBufferForTests,
} from '../audit-log';

beforeEach(() => {
  _resetVaultLeaseRegistryForTests();
  _resetAuditLogForTests();
});

const ENV_KEYS_FOR_TESTS = [
  'HOLOMESH_VAULT_LEASE_ENFORCE',
  'LEASE_TEST_KEY',
  'LEASE_TEST_OTHER',
  // Phase 3 wrap targets — leases scope tests touch these env names
  // through `resolveSecretWithLease`. Reset in afterEach to avoid bleed.
  'MOLTBOOK_API_KEY',
  'HOLOMESH_API_KEY',
  'HOLOSCRIPT_API_KEY',
  'ABSORB_API_KEY',
];
const ORIGINAL_ENV = new Map(
  ENV_KEYS_FOR_TESTS.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of ENV_KEYS_FOR_TESTS) {
    const original = ORIGINAL_ENV.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

// -- issueLease ------------------------------------------------------------

describe('issueLease - happy path', () => {
  it('issues a lease bound to (taskId, agentId) with the requested scope', () => {
    const result = issueLease({
      taskId: 'task_test_001',
      agentId: 'agent-1',
      agentTag: 'cursor-claude',
      scope: ['env:HOLOSCRIPT_API_KEY', 'env:GITHUB_TOKEN'],
      durationMs: 60_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lease.taskId).toBe('task_test_001');
    expect(result.lease.agentId).toBe('agent-1');
    expect(result.lease.agentTag).toBe('cursor-claude');
    expect(result.lease.scope).toEqual(['env:HOLOSCRIPT_API_KEY', 'env:GITHUB_TOKEN']);
    expect(result.lease.status).toBe('active');
    expect(result.lease.leaseId).toMatch(/^lease-/);
  });

  it('emits a vault_lease_issued audit event on success', () => {
    issueLease({
      taskId: 'task_test_002',
      agentId: 'agent-2',
      scope: ['env:HOLOSCRIPT_API_KEY'],
    });
    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_issued'
    );
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe('agent-2');
    expect(events[0].metadata.taskId).toBe('task_test_002');
    expect(events[0].severity).toBe('info');
  });

  it('defensive-copies the scope array (caller mutation does not bleed in)', () => {
    const scope = ['env:KEY_A'];
    const result = issueLease({ taskId: 't', agentId: 'a', scope });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    scope.push('env:KEY_B');
    expect(result.lease.scope).toEqual(['env:KEY_A']);
  });

  it('defaults durationMs to MAX_LEASE_DURATION_MS when omitted', () => {
    const now = Date.now();
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:KEY'],
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Date.parse(result.lease.expiresAt)).toBe(now + MAX_LEASE_DURATION_MS);
  });
});

describe('issueLease - wallet unleasable (G.GOLD.016)', () => {
  // Each pattern must reject. False case: every wallet pattern.
  const walletRefs: ReadonlyArray<[string, string]> = [
    ['HOLOMESH_WALLET_ADDRESS', 'env:HOLOMESH_WALLET_ADDRESS'],
    ['HOLOMESH_WALLET_KEY', 'env:HOLOMESH_WALLET_KEY'],
    ['MIXED_CASE wallet_key', 'env:My_Wallet_Key'],
    ['mnemonic suffix', 'env:USER_WALLET_MNEMONIC'],
    ['seed suffix', 'env:USER_WALLET_SEED'],
    ['private suffix', 'env:USER_WALLET_PRIVATE'],
    ['trezor surface', 'custodial:user-1:trezor-key'],
    ['ledger private', 'env:LEDGER_PRIVATE_KEY'],
  ];

  for (const [label, ref] of walletRefs) {
    it(`rejects scope containing '${label}' with wallet_unleasable`, () => {
      const result = issueLease({
        taskId: 't',
        agentId: 'a',
        scope: [ref],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('wallet_unleasable');
      expect(result.detail).toContain(ref);
    });
  }

  it('emits NO audit event on wallet rejection (atomicity invariant)', () => {
    issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:HOLOMESH_WALLET_KEY'],
    });
    const issuedEvents = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_issued'
    );
    expect(issuedEvents).toHaveLength(0);
  });

  it('rejects mixed valid+wallet scope without persisting any partial state', () => {
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:HOLOSCRIPT_API_KEY', 'env:HOLOMESH_WALLET_ADDRESS'],
    });
    expect(result.ok).toBe(false);
    expect(_getActiveLeaseIndexForTests().size).toBe(0);
    expect(queryLeases()).toHaveLength(0);
  });

  it('UNLEASABLE_PATTERNS export is non-empty (no accidental empty array)', () => {
    expect(UNLEASABLE_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('issueLease - argument validation', () => {
  it('rejects missing taskId', () => {
    const result = issueLease({ taskId: '', agentId: 'a', scope: ['env:K'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('task_id_missing');
  });

  it('rejects missing agentId', () => {
    const result = issueLease({ taskId: 't', agentId: '', scope: ['env:K'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('agent_id_missing');
  });

  it('rejects empty scope', () => {
    const result = issueLease({ taskId: 't', agentId: 'a', scope: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('scope_empty');
  });

  it('rejects duration > MAX_LEASE_DURATION_MS (24h cap)', () => {
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: MAX_LEASE_DURATION_MS + 1000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('expiry_too_far');
  });

  it('rejects duration < MIN_LEASE_DURATION_MS (zero/negative guard)', () => {
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('expiry_in_past');
  });

  it('accepts exactly MIN_LEASE_DURATION_MS (boundary)', () => {
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: MIN_LEASE_DURATION_MS,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts exactly MAX_LEASE_DURATION_MS (boundary)', () => {
    const result = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: MAX_LEASE_DURATION_MS,
    });
    expect(result.ok).toBe(true);
  });
});

describe('issueLease - duplicate lease invariant', () => {
  it('rejects a second active lease for the same (taskId, agentId)', () => {
    const first = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    expect(first.ok).toBe(true);

    const second = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('duplicate_lease');
  });

  it('allows a new lease for the same task by a DIFFERENT agent', () => {
    const a = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    const b = issueLease({ taskId: 't', agentId: 'b', scope: ['env:K'] });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('allows re-issuance after the previous lease is revoked', () => {
    const first = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    revokeLease({ leaseId: first.lease.leaseId, reason: 'manual', by: 'op' });

    const second = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    expect(second.ok).toBe(true);
  });

  it('lazily expires a stale lease and allows re-issuance', () => {
    const t0 = 1_000_000;
    const first = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: 1000,
      now: t0,
    });
    expect(first.ok).toBe(true);

    // 2 seconds later - the previous lease is past expiry.
    const second = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      now: t0 + 2000,
    });
    expect(second.ok).toBe(true);
  });
});

// -- resolveSecret ---------------------------------------------------------

describe('resolveSecret - happy path', () => {
  it('resolves a ref that is in scope under a valid lease', () => {
    const issued = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:HOLOSCRIPT_API_KEY'],
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const result = resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'a',
      secretRef: 'env:HOLOSCRIPT_API_KEY',
    });
    expect(result.ok).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.secretRef).toBe('env:HOLOSCRIPT_API_KEY');
  });

  it('emits vault_lease_resolve_secret on successful resolution', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    resolveSecret({ leaseId: issued.lease.leaseId, agentId: 'a', secretRef: 'env:K' });
    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_resolve_secret'
    );
    expect(events).toHaveLength(1);
  });
});

describe('resolveSecret - failure cases', () => {
  it('rejects unknown lease id', () => {
    const result = resolveSecret({
      leaseId: 'lease-nonexistent',
      agentId: 'a',
      secretRef: 'env:K',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease_not_found');
    expect(result.resolved).toBe(false);
  });

  it('rejects ref outside scope (lease_scope_violation)', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:KEY_A'] });
    if (!issued.ok) return;

    const result = resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'a',
      secretRef: 'env:KEY_B',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease_scope_violation');
  });

  it('emits key_access_denied audit event on scope violation', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:A'] });
    if (!issued.ok) return;
    resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'a',
      secretRef: 'env:B',
    });
    const denied = _getEventBufferForTests().filter(
      (e) => e.type === 'key_access_denied'
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].metadata.reason).toBe('lease_scope_violation');
  });

  it('rejects wrong agent (lease_agent_mismatch)', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;

    const result = resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'b', // different agent
      secretRef: 'env:K',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease_agent_mismatch');
  });

  it('rejects expired lease (lease_expired)', () => {
    const t0 = 1_000_000;
    const issued = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: 1000,
      now: t0,
    });
    if (!issued.ok) return;

    const result = resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'a',
      secretRef: 'env:K',
      now: t0 + 5000, // 5s later, lease was 1s
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease_expired');
  });

  it('rejects revoked lease (lease_revoked)', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });

    const result = resolveSecret({
      leaseId: issued.lease.leaseId,
      agentId: 'a',
      secretRef: 'env:K',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease_revoked');
  });
});

// -- revokeLease -----------------------------------------------------------

describe('revokeLease', () => {
  it('marks an active lease as revoked', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;

    const result = revokeLease({
      leaseId: issued.lease.leaseId,
      reason: 'task_completed',
      by: 'a',
    });
    expect('leaseId' in result).toBe(true);
    if (!('leaseId' in result)) return;
    expect(result.status).toBe('revoked');
    expect(result.revoked?.reason).toBe('task_completed');
    expect(result.revoked?.by).toBe('a');
  });

  it('drops revoked lease from active-lease index', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    expect(_getActiveLeaseIndexForTests().size).toBe(1);

    revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    expect(_getActiveLeaseIndexForTests().size).toBe(0);
  });

  it('is idempotent on already-revoked leases', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;

    const first = revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    const second = revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    expect('leaseId' in first).toBe(true);
    expect('leaseId' in second).toBe(true);
  });

  it('rejects revoke against unknown lease id', () => {
    const result = revokeLease({ leaseId: 'lease-bogus', reason: 'manual', by: 'op' });
    expect('ok' in result && result.ok === false).toBe(true);
  });

  it('uses error severity for agent_compromise reason', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({
      leaseId: issued.lease.leaseId,
      reason: 'agent_compromise',
      by: 'security-team',
    });
    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_revoked'
    );
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('error');
  });

  it('emits info severity for routine revocation reasons', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({
      leaseId: issued.lease.leaseId,
      reason: 'task_completed',
      by: 'a',
    });
    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_revoked'
    );
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('info');
  });
});

// -- revokeLeasesForTask ---------------------------------------------------

describe('revokeLeasesForTask', () => {
  it('revokes all active leases bound to a task', () => {
    issueLease({ taskId: 't1', agentId: 'a', scope: ['env:K'] });
    issueLease({ taskId: 't1', agentId: 'b', scope: ['env:K'] });
    issueLease({ taskId: 't2', agentId: 'a', scope: ['env:K'] });

    const revoked = revokeLeasesForTask('t1', 'task_completed', 'system');
    expect(revoked).toHaveLength(2);

    // t2 lease still active.
    expect(queryLeases({ taskId: 't2' })[0].status).toBe('active');
    expect(queryLeases({ taskId: 't1', includeExpired: true }).every(l => l.status === 'revoked')).toBe(true);
  });

  it('returns empty array when task has no active leases', () => {
    const revoked = revokeLeasesForTask('nonexistent', 'task_completed', 'system');
    expect(revoked).toEqual([]);
  });
});

// -- sweepExpiredLeases ----------------------------------------------------

describe('sweepExpiredLeases', () => {
  it('flips expired active leases to expired status', () => {
    const t0 = 1_000_000;
    issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'], durationMs: 1000, now: t0 });
    issueLease({ taskId: 't', agentId: 'b', scope: ['env:K'], durationMs: 60_000, now: t0 });

    const expired = sweepExpiredLeases(t0 + 5000); // 5s later
    expect(expired).toHaveLength(1);
    expect(expired[0].agentId).toBe('a');
  });

  it('emits vault_lease_expired audit event per swept lease', () => {
    const t0 = 1_000_000;
    issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'], durationMs: 1000, now: t0 });
    sweepExpiredLeases(t0 + 5000);

    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_expired'
    );
    expect(events).toHaveLength(1);
  });

  it('is idempotent - sweeping twice does not double-emit', () => {
    const t0 = 1_000_000;
    issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'], durationMs: 1000, now: t0 });
    sweepExpiredLeases(t0 + 5000);
    sweepExpiredLeases(t0 + 5000);

    const events = _getEventBufferForTests().filter(
      (e) => e.metadata.event === 'vault_lease_expired'
    );
    expect(events).toHaveLength(1);
  });
});

// -- isLeaseValid ----------------------------------------------------------

describe('isLeaseValid', () => {
  it('returns true for an active, non-expired lease', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    expect(isLeaseValid(issued.lease.leaseId)).toBe(true);
  });

  it('returns false for an unknown lease id', () => {
    expect(isLeaseValid('lease-bogus')).toBe(false);
  });

  it('returns false for a revoked lease', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    expect(isLeaseValid(issued.lease.leaseId)).toBe(false);
  });

  it('returns false for an expired lease (revocation propagates to readers)', () => {
    const t0 = 1_000_000;
    const issued = issueLease({
      taskId: 't',
      agentId: 'a',
      scope: ['env:K'],
      durationMs: 1000,
      now: t0,
    });
    if (!issued.ok) return;
    expect(isLeaseValid(issued.lease.leaseId, t0 + 5000)).toBe(false);
  });
});

// -- resolveSecretWithLease ------------------------------------------------

describe('resolveSecretWithLease', () => {
  it('passes through env refs while enforcement is disabled', () => {
    delete process.env.HOLOMESH_VAULT_LEASE_ENFORCE;
    process.env.LEASE_TEST_KEY = 'local-secret';

    expect(resolveSecretWithLease('env:LEASE_TEST_KEY')).toBe('local-secret');
  });

  it('still rejects wallet refs while enforcement is disabled', () => {
    delete process.env.HOLOMESH_VAULT_LEASE_ENFORCE;

    expect(() => resolveSecretWithLease('env:HOLOMESH_WALLET_KEY')).toThrow(
      VaultLeaseError
    );
    try {
      resolveSecretWithLease('env:HOLOMESH_WALLET_KEY');
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('unleasable_pattern');
    }
  });

  it('rejects non-env refs because this helper only resolves process.env', () => {
    expect(() => resolveSecretWithLease('x402:CLAUDECODE_X402')).toThrow(
      VaultLeaseError
    );
    try {
      resolveSecretWithLease('x402:CLAUDECODE_X402');
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('lease_scope_violation');
    }
  });

  it('requires AsyncLocalStorage task context when enforcement is enabled', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.LEASE_TEST_KEY = 'local-secret';

    expect(() => resolveSecretWithLease('env:LEASE_TEST_KEY')).toThrow(
      VaultLeaseError
    );
    try {
      resolveSecretWithLease('env:LEASE_TEST_KEY');
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('no_task_context');
    }
  });

  it('returns env value when enforcement is enabled and scope matches', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = 'true';
    process.env.LEASE_TEST_KEY = 'leased-secret';
    const issued = issueLease({
      taskId: 'task-lease',
      agentId: 'agent-lease',
      scope: ['env:LEASE_TEST_KEY'],
    });
    expect(issued.ok).toBe(true);

    const value = runWithTaskContext(
      { taskId: 'task-lease', agentId: 'agent-lease', agentTag: 'codex' },
      () => resolveSecretWithLease('env:LEASE_TEST_KEY')
    );

    expect(value).toBe('leased-secret');
  });

  it('propagates task context across async continuations', async () => {
    const taskId = await runWithTaskContext(
      { taskId: 'task-async', agentId: 'agent-async' },
      async () => {
        await Promise.resolve();
        return getCurrentTaskContext()?.taskId;
      }
    );

    expect(taskId).toBe('task-async');
  });

  it('rejects when context exists but no active lease was issued', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = 'on';
    process.env.LEASE_TEST_KEY = 'local-secret';

    expect(() =>
      runWithTaskContext({ taskId: 'task-none', agentId: 'agent-none' }, () =>
        resolveSecretWithLease('env:LEASE_TEST_KEY')
      )
    ).toThrow(VaultLeaseError);
    try {
      runWithTaskContext({ taskId: 'task-none', agentId: 'agent-none' }, () =>
        resolveSecretWithLease('env:LEASE_TEST_KEY')
      );
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('no_active_lease');
    }
  });

  it('rejects refs outside the active lease scope', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.LEASE_TEST_OTHER = 'other-secret';
    const issued = issueLease({
      taskId: 'task-scope',
      agentId: 'agent-scope',
      scope: ['env:LEASE_TEST_KEY'],
    });
    expect(issued.ok).toBe(true);

    expect(() =>
      runWithTaskContext({ taskId: 'task-scope', agentId: 'agent-scope' }, () =>
        resolveSecretWithLease('env:LEASE_TEST_OTHER')
      )
    ).toThrow(VaultLeaseError);
    try {
      runWithTaskContext({ taskId: 'task-scope', agentId: 'agent-scope' }, () =>
        resolveSecretWithLease('env:LEASE_TEST_OTHER')
      );
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('lease_scope_violation');
    }
  });

  it('throws env_value_missing after a valid lease resolves an unset env key', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    delete process.env.LEASE_TEST_KEY;
    const issued = issueLease({
      taskId: 'task-missing-env',
      agentId: 'agent-missing-env',
      scope: ['env:LEASE_TEST_KEY'],
    });
    expect(issued.ok).toBe(true);

    expect(() =>
      runWithTaskContext(
        { taskId: 'task-missing-env', agentId: 'agent-missing-env' },
        () => resolveSecretWithLease('env:LEASE_TEST_KEY')
      )
    ).toThrow(VaultLeaseError);
    try {
      runWithTaskContext(
        { taskId: 'task-missing-env', agentId: 'agent-missing-env' },
        () => resolveSecretWithLease('env:LEASE_TEST_KEY')
      );
    } catch (err) {
      expect((err as VaultLeaseError).reason).toBe('env_value_missing');
    }
  });
});

// -- queryLeases -----------------------------------------------------------

describe('queryLeases', () => {
  it('returns all active leases by default', () => {
    issueLease({ taskId: 't1', agentId: 'a', scope: ['env:K'] });
    issueLease({ taskId: 't2', agentId: 'b', scope: ['env:K'] });
    expect(queryLeases()).toHaveLength(2);
  });

  it('filters by taskId', () => {
    issueLease({ taskId: 't1', agentId: 'a', scope: ['env:K'] });
    issueLease({ taskId: 't2', agentId: 'b', scope: ['env:K'] });
    expect(queryLeases({ taskId: 't1' })).toHaveLength(1);
  });

  it('filters by agentId', () => {
    issueLease({ taskId: 't1', agentId: 'a', scope: ['env:K'] });
    issueLease({ taskId: 't2', agentId: 'a', scope: ['env:K'] });
    issueLease({ taskId: 't3', agentId: 'b', scope: ['env:K'] });
    expect(queryLeases({ agentId: 'a' })).toHaveLength(2);
  });

  it('returns defensive copies - caller mutation does not corrupt registry', () => {
    issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    const out = queryLeases();
    out[0].scope.push('env:UNAUTHORIZED');
    const fresh = queryLeases();
    expect(fresh[0].scope).toEqual(['env:K']);
  });
});

// -- findActiveLease + getLease -------------------------------------------

describe('findActiveLease', () => {
  it('finds the active lease for (taskId, agentId)', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    const found = findActiveLease('t', 'a');
    expect(found?.leaseId).toBe(issued.lease.leaseId);
  });

  it('returns undefined for non-existent (taskId, agentId)', () => {
    expect(findActiveLease('t', 'a')).toBeUndefined();
  });

  it('returns undefined after revocation', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    expect(findActiveLease('t', 'a')).toBeUndefined();
  });
});

describe('getLease', () => {
  it('returns the lease for a known id (regardless of status)', () => {
    const issued = issueLease({ taskId: 't', agentId: 'a', scope: ['env:K'] });
    if (!issued.ok) return;
    revokeLease({ leaseId: issued.lease.leaseId, reason: 'manual', by: 'op' });
    const fetched = getLease(issued.lease.leaseId);
    expect(fetched?.status).toBe('revoked');
  });

  it('returns undefined for unknown id', () => {
    expect(getLease('lease-bogus')).toBeUndefined();
  });
});

// -- Phase 3: medium-risk wrap-site coverage -------------------------------
//
// Phase 3 wrapped 7 per-task / per-request reads with resolveSecretWithLease:
//   1. holomesh-tools.ts:908   moltbook crosspost direct fallback   MOLTBOOK_API_KEY
//   2. holomesh-tools.ts:1434  knowledge-entry crosspost handler    MOLTBOOK_API_KEY
//   3. knowledge-routes.ts:1687 POST .../knowledge/:id/crosspost    MOLTBOOK_API_KEY
//   4. tools/moltbook-crosspost.ts:313  postToMoltbook helper       MOLTBOOK_API_KEY
//   5. http-server.ts:1831  POST /api/moltbook/crosspost route       MOLTBOOK_API_KEY
//   6. oracle-handler.ts:92  /oracle agent-inference fetch          HOLOSCRIPT_API_KEY || ABSORB_API_KEY
//   7. team-coordinator.ts:107 sub-agent delegation (runRoomCycle)  HOLOMESH_API_KEY || HOLOSCRIPT_API_KEY
//
// We exercise the lease helper directly with the env names the wrap sites
// pass — that is the substrate test. It would be more invasive to drive each
// route end-to-end here; the call-site wrapping is one-line passthrough that
// reduces to "does resolveSecretWithLease behave correctly for this ref under
// these flag/lease/context conditions?". The call-site tests live in their
// own files (absorb-provenance-tools.test.ts, http-routes.test.ts) and stay
// passing because the migration-window passthrough is transparent.
//
// G.GOLD.013: every test asserts the FALSE case for the relevant guard
// (no_task_context, no_active_lease, lease_revoked, lease_scope_violation,
// fallback-chain isolation under enforcement) — not just the happy path.
// G.GOLD.015: failure categories that have bitten production (W.075, W.088,
// W.129 — env-shadow + auth-fallback drift) are the ones we optimize for.

describe('Phase 3 wrap-site lease semantics', () => {
  // ── (1, 2, 3, 4, 5) MOLTBOOK_API_KEY: per-task moltbook crosspost surface ──

  it('phase3: moltbook key passes through transparently while enforcement is OFF', () => {
    delete process.env.HOLOMESH_VAULT_LEASE_ENFORCE;
    process.env.MOLTBOOK_API_KEY = 'moltbook-secret-7';

    expect(resolveSecretWithLease('env:MOLTBOOK_API_KEY')).toBe('moltbook-secret-7');
  });

  it('phase3: moltbook key requires task context + lease under enforcement', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.MOLTBOOK_API_KEY = 'moltbook-secret-7';

    // No active task context → no_task_context (call-site sees ''/undefined
    // via the wrapper's catch and emits the existing "not configured" error).
    let caught: VaultLeaseError | null = null;
    try {
      resolveSecretWithLease('env:MOLTBOOK_API_KEY');
    } catch (err) {
      caught = err as VaultLeaseError;
    }
    expect(caught).toBeInstanceOf(VaultLeaseError);
    expect(caught?.reason).toBe('no_task_context');
  });

  it('phase3: moltbook key resolves with a valid lease scoped to env:MOLTBOOK_API_KEY', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.MOLTBOOK_API_KEY = 'moltbook-secret-7';
    const issued = issueLease({
      taskId: 'task-mb-1',
      agentId: 'agent-mb-1',
      scope: ['env:MOLTBOOK_API_KEY'],
    });
    expect(issued.ok).toBe(true);

    const value = runWithTaskContext(
      { taskId: 'task-mb-1', agentId: 'agent-mb-1' },
      () => resolveSecretWithLease('env:MOLTBOOK_API_KEY')
    );
    expect(value).toBe('moltbook-secret-7');
  });

  it('phase3: revoked lease blocks moltbook key reads (revocation propagates)', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.MOLTBOOK_API_KEY = 'moltbook-secret-7';
    const issued = issueLease({
      taskId: 'task-mb-2',
      agentId: 'agent-mb-2',
      scope: ['env:MOLTBOOK_API_KEY'],
    });
    if (!issued.ok) {
      throw new Error('lease issuance unexpectedly failed: ' + issued.reason);
    }
    revokeLease({
      leaseId: issued.lease.leaseId,
      reason: 'rotation',
      by: 'system',
    });

    let caught: VaultLeaseError | null = null;
    try {
      runWithTaskContext(
        { taskId: 'task-mb-2', agentId: 'agent-mb-2' },
        () => resolveSecretWithLease('env:MOLTBOOK_API_KEY')
      );
    } catch (err) {
      caught = err as VaultLeaseError;
    }
    expect(caught).toBeInstanceOf(VaultLeaseError);
    // After revocation, findActiveLease returns undefined → no_active_lease.
    // (resolveSecret on the *direct* leaseId would surface lease_revoked, but
    //  the wrap-site path goes findActiveLease(taskId, agentId) first, which
    //  drops revoked leases out of the active index.)
    expect(caught?.reason).toBe('no_active_lease');
  });

  it('phase3: moltbook lease does NOT silently grant other env refs (scope isolation)', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.MOLTBOOK_API_KEY = 'moltbook-secret-7';
    process.env.LEASE_TEST_OTHER = 'should-be-blocked';
    const issued = issueLease({
      taskId: 'task-mb-3',
      agentId: 'agent-mb-3',
      scope: ['env:MOLTBOOK_API_KEY'],
    });
    expect(issued.ok).toBe(true);

    let caught: VaultLeaseError | null = null;
    try {
      runWithTaskContext(
        { taskId: 'task-mb-3', agentId: 'agent-mb-3' },
        () => resolveSecretWithLease('env:LEASE_TEST_OTHER')
      );
    } catch (err) {
      caught = err as VaultLeaseError;
    }
    expect(caught).toBeInstanceOf(VaultLeaseError);
    expect(caught?.reason).toBe('lease_scope_violation');
  });

  // ── (6) oracle-handler agent-inference: HOLOSCRIPT_API_KEY || ABSORB_API_KEY ──

  it('phase3: oracle fallback-chain — primary ref leased, secondary not — only primary resolves', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.HOLOSCRIPT_API_KEY = 'primary-key-99';
    process.env.ABSORB_API_KEY = 'secondary-key-99';

    // Lease scoped ONLY to env:HOLOSCRIPT_API_KEY. The wrap-site reads
    // both refs through resolveSecretWithLease — the primary must succeed
    // and the secondary MUST throw lease_scope_violation. The wrapper
    // catches and returns ''; net effect: primary value used, secondary
    // never bleeds into the auth header.
    const issued = issueLease({
      taskId: 'task-oracle-1',
      agentId: 'agent-oracle-1',
      scope: ['env:HOLOSCRIPT_API_KEY'],
    });
    expect(issued.ok).toBe(true);

    runWithTaskContext(
      { taskId: 'task-oracle-1', agentId: 'agent-oracle-1' },
      () => {
        // Primary read succeeds.
        expect(resolveSecretWithLease('env:HOLOSCRIPT_API_KEY')).toBe('primary-key-99');

        // Secondary read MUST be blocked even though the env value is set.
        let caught: VaultLeaseError | null = null;
        try {
          resolveSecretWithLease('env:ABSORB_API_KEY');
        } catch (err) {
          caught = err as VaultLeaseError;
        }
        expect(caught).toBeInstanceOf(VaultLeaseError);
        expect(caught?.reason).toBe('lease_scope_violation');
      }
    );
  });

  it('phase3: oracle fallback-chain — primary ref unset, secondary leased — secondary resolves', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    delete process.env.HOLOSCRIPT_API_KEY;
    process.env.ABSORB_API_KEY = 'secondary-only-42';

    const issued = issueLease({
      taskId: 'task-oracle-2',
      agentId: 'agent-oracle-2',
      scope: ['env:ABSORB_API_KEY'],
    });
    expect(issued.ok).toBe(true);

    runWithTaskContext(
      { taskId: 'task-oracle-2', agentId: 'agent-oracle-2' },
      () => {
        // Primary read is out-of-scope → lease_scope_violation.
        let primaryCaught: VaultLeaseError | null = null;
        try {
          resolveSecretWithLease('env:HOLOSCRIPT_API_KEY');
        } catch (err) {
          primaryCaught = err as VaultLeaseError;
        }
        expect(primaryCaught?.reason).toBe('lease_scope_violation');

        // Secondary read succeeds.
        expect(resolveSecretWithLease('env:ABSORB_API_KEY')).toBe('secondary-only-42');
      }
    );
  });

  // ── (7) team-coordinator sub-agent delegation: HOLOMESH_API_KEY || HOLOSCRIPT_API_KEY ──

  it('phase3: sub-agent delegation chain refuses to bleed across HOLOMESH/HOLOSCRIPT under partial scope', () => {
    process.env.HOLOMESH_VAULT_LEASE_ENFORCE = '1';
    process.env.HOLOMESH_API_KEY = 'holomesh-bearer-aa';
    process.env.HOLOSCRIPT_API_KEY = 'holoscript-bearer-bb';

    // Lease scoped ONLY to env:HOLOMESH_API_KEY. Mirrors the W.075/W.088/
    // W.129 risk: a stale or wrong-scoped HOLOMESH_API_KEY must NOT
    // silently fall through to HOLOSCRIPT_API_KEY through the lease layer.
    const issued = issueLease({
      taskId: 'task-tc-1',
      agentId: 'agent-tc-1',
      scope: ['env:HOLOMESH_API_KEY'],
    });
    expect(issued.ok).toBe(true);

    runWithTaskContext(
      { taskId: 'task-tc-1', agentId: 'agent-tc-1' },
      () => {
        expect(resolveSecretWithLease('env:HOLOMESH_API_KEY')).toBe('holomesh-bearer-aa');

        let caught: VaultLeaseError | null = null;
        try {
          resolveSecretWithLease('env:HOLOSCRIPT_API_KEY');
        } catch (err) {
          caught = err as VaultLeaseError;
        }
        expect(caught).toBeInstanceOf(VaultLeaseError);
        expect(caught?.reason).toBe('lease_scope_violation');
      }
    );
  });

  // ── G.GOLD.016 belt + suspenders: wallet refs MUST stay raw (Phase 3 must NOT loosen) ──

  it('phase3: G.GOLD.016 — wallet refs reject through the helper regardless of which Phase wrapped them', () => {
    // Phase 3 added MOLTBOOK_API_KEY/etc to the leasable surface but the
    // unleasable wallet patterns must remain inviolate. This is the
    // regression guard: every Phase that wraps more reads must NOT widen
    // the wallet protection.
    delete process.env.HOLOMESH_VAULT_LEASE_ENFORCE;

    // A representative wallet ref from each pattern family in
    // UNLEASABLE_PATTERNS: HOLOMESH_WALLET_KEY, TREZOR_*, LEDGER_PRIVATE_*.
    // Each must throw `unleasable_pattern` even with enforcement off,
    // because wrapping a wallet through the helper is ALWAYS a programming
    // error per G.GOLD.016 — not a permission gate.
    const walletRefs = [
      'env:HOLOMESH_WALLET_KEY',
      'env:HOLOMESH_WALLET_ADDRESS',
      'env:TREZOR_DEVICE_PATH',
      'env:LEDGER_PRIVATE_KEY',
    ];
    for (const ref of walletRefs) {
      let caught: VaultLeaseError | null = null;
      try {
        resolveSecretWithLease(ref);
      } catch (err) {
        caught = err as VaultLeaseError;
      }
      expect(caught).toBeInstanceOf(VaultLeaseError);
      expect(caught?.reason).toBe('unleasable_pattern');
    }
    // Sanity: the unleasable-pattern list still covers each family
    // (defense-in-depth check that nothing has been silently relaxed).
    const haystack = walletRefs.join('|');
    const matched = UNLEASABLE_PATTERNS.filter((re) => re.test(haystack));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });
});
