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
});
