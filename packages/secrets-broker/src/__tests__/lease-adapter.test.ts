import { describe, expect, it } from 'vitest';
import { createMemoryLeaseAdapter, createNoOpLeaseAdapter } from '../lease-adapter';

describe('createMemoryLeaseAdapter', () => {
  it('issues a lease and resolves it', async () => {
    const adapter = createMemoryLeaseAdapter();
    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: ['secret://namespace/ns_test/key'],
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: 'secret://namespace/ns_test/key',
    });
    expect(resolved.ok).toBe(true);
  });

  it('rejects resolve for wrong agent', async () => {
    const adapter = createMemoryLeaseAdapter();
    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: ['secret://namespace/ns_test/key'],
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_b',
      secretRef: 'secret://namespace/ns_test/key',
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_agent_mismatch');
  });

  it('rejects resolve for out-of-scope secret', async () => {
    const adapter = createMemoryLeaseAdapter();
    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: ['secret://namespace/ns_test/key'],
    });

    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: 'secret://namespace/ns_test/other',
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_scope_violation');
  });

  it('revokes a lease so subsequent resolves fail', async () => {
    const adapter = createMemoryLeaseAdapter();
    const { leaseId } = await adapter.issueLease({
      taskId: 'task_1',
      agentId: 'agent_a',
      scope: ['secret://namespace/ns_test/key'],
    });

    await adapter.revokeLease({ leaseId, reason: 'manual', by: 'admin' });
    const resolved = await adapter.resolveLease({
      leaseId,
      agentId: 'agent_a',
      secretRef: 'secret://namespace/ns_test/key',
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('lease_revoked');
  });
});

describe('createNoOpLeaseAdapter', () => {
  it('always denies resolve', async () => {
    const adapter = createNoOpLeaseAdapter();
    const resolved = await adapter.resolveLease({
      leaseId: 'any',
      agentId: 'any',
      secretRef: 'secret://namespace/ns_test/key',
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe('no_op_adapter');
  });
});
