import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordAdminOperation,
  queryAdminOperationsAudit,
  resetAdminOperationsAudit,
} from '../admin-operations-audit';

describe('admin-operations-audit', () => {
  beforeEach(() => {
    resetAdminOperationsAudit();
  });

  it('records provision and returns newest-first with default limit 50', () => {
    recordAdminOperation({
      actor: { agentId: 'a1', agentName: 'Founder' },
      action: 'provision',
      path: '/api/holomesh/admin/provision',
      before: null,
      after: { agent_id: 'agent_x' },
    });
    recordAdminOperation({
      actor: { agentId: 'a1', agentName: 'Founder' },
      action: 'key_rotation',
      path: '/api/holomesh/admin/rotate-key',
      before: { key_prefix: 'hs_sk_abc...' },
      after: { key_prefix: 'hs_sk_def...' },
    });

    const q = queryAdminOperationsAudit(50);
    expect(q.total).toBe(2);
    expect(q.entries[0].action).toBe('key_rotation');
    expect(q.entries[1].action).toBe('provision');
  });

  it('caps requested limit at 500', () => {
    for (let i = 0; i < 5; i++) {
      recordAdminOperation({
        actor: { agentId: 'a1', agentName: 'Founder' },
        action: 'revoke',
        after: { n: i },
      });
    }
    const q = queryAdminOperationsAudit(9999);
    expect(q.entries.length).toBe(5);
  });

  it('records manual_failover with before/after state', () => {
    recordAdminOperation({
      actor: { agentId: 'a1', agentName: 'Founder', wallet: '0xabc' },
      action: 'manual_failover',
      path: '/api/holomesh/admin/manual-failover',
      before: { serviceId: 'svc-web', primaryBackend: 'backend-a' },
      after: { serviceId: 'svc-web', primaryBackend: 'backend-b', reason: 'drill' },
    });

    const q = queryAdminOperationsAudit(50);
    const entry = q.entries.find((e) => e.action === 'manual_failover');
    expect(entry).toBeDefined();
    expect(entry!.before!.primaryBackend).toBe('backend-a');
    expect(entry!.after!.primaryBackend).toBe('backend-b');
    expect(entry!.actor.wallet).toBe('0xabc');
  });

  it('records scaling_override with before/after state', () => {
    recordAdminOperation({
      actor: { agentId: 'a1', agentName: 'Founder' },
      action: 'scaling_override',
      path: '/api/holomesh/admin/scaling-override',
      before: { serviceId: 'svc-api', replicas: 2 },
      after: { serviceId: 'svc-api', replicas: 5, reason: 'peak load' },
    });

    const q = queryAdminOperationsAudit(50);
    const entry = q.entries.find((e) => e.action === 'scaling_override');
    expect(entry).toBeDefined();
    expect(entry!.before!.replicas).toBe(2);
    expect(entry!.after!.replicas).toBe(5);
  });
});
