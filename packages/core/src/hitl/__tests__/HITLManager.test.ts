import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HITLManager, type AgentAction } from '../HITLManager';

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 'act-1',
    agentId: 'agent-1',
    actionType: 'code_gen',
    description: 'Generate code',
    parameters: {},
    confidence: 0.5,
    reasoning: 'Testing',
    timestamp: Date.now(),
    requiredApproval: true,
    estimatedImpact: 'high',
    ...overrides,
  };
}

describe('HITLManager', () => {
  let mgr: HITLManager;

  beforeEach(() => {
    mgr = new HITLManager({ approvalTimeoutMs: 500 });
  });

  it('auto-approves when HITL disabled', async () => {
    const disabled = new HITLManager({ enabled: false });
    const decision = await disabled.requestApproval(makeAction(), ['user-1']);
    expect(decision.approved).toBe(true);
    expect(decision.approvedBy).toBe('system');
  });

  it('auto-approves high-confidence actions', async () => {
    const decision = await mgr.requestApproval(
      makeAction({ confidence: 0.95 }),
      ['user-1'],
    );
    expect(decision.approved).toBe(true);
    expect(decision.approvedBy).toBe('auto');
  });

  it('auto-approves when impact doesnt require approval', async () => {
    const decision = await mgr.requestApproval(
      makeAction({ estimatedImpact: 'low', confidence: 0.3 }),
      ['user-1'],
    );
    expect(decision.approved).toBe(true);
    expect(decision.approvedBy).toBe('auto');
  });

  it('rejects when no approvers provided', async () => {
    const decision = await mgr.requestApproval(makeAction(), []);
    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain('No approvers');
  });

  it('approveAction resolves pending request', async () => {
    const handler = vi.fn();
    mgr.onApproval('test', (req) => {
      // Approve after handler fires
      setTimeout(() => mgr.approveAction(req.id, 'user-1', true, 'OK'), 10);
    });

    const decision = await mgr.requestApproval(makeAction(), ['user-1']);
    expect(decision.approved).toBe(true);
    expect(decision.approvedBy).toBe('user-1');
  });

  it('rejectAction resolves as rejected', async () => {
    mgr.onApproval('test', (req) => {
      setTimeout(() => mgr.rejectAction(req.id, 'user-1', 'bad idea'), 10);
    });

    const decision = await mgr.requestApproval(makeAction(), ['user-1']);
    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('bad idea');
  });

  it('times out if no approval given', async () => {
    const shortMgr = new HITLManager({ approvalTimeoutMs: 50 });
    const decision = await shortMgr.requestApproval(makeAction(), ['user-1']);
    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain('timed out');
  });

  it('records action history', async () => {
    mgr.onApproval('test', (req) => {
      setTimeout(() => mgr.approveAction(req.id, 'user-1', true), 10);
    });
    await mgr.requestApproval(makeAction(), ['user-1']);
    expect(mgr.getActionHistory().length).toBe(1);
  });

  it('getStats calculates correctly', async () => {
    mgr.onApproval('test', (req) => {
      setTimeout(() => mgr.approveAction(req.id, 'user-1', true), 10);
    });
    await mgr.requestApproval(makeAction({ id: 'a1' }), ['user-1']);
    const stats = mgr.getStats();
    expect(stats.totalActions).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.approvalRate).toBe(100);
  });

  it('getPendingApprovalsForUser filters correctly', async () => {
    // Don't auto-resolve — let it pend
    const promise = mgr.requestApproval(makeAction(), ['user-1', 'user-2']);
    const pending = mgr.getPendingApprovalsForUser('user-1');
    expect(pending.length).toBe(1);
    expect(mgr.getPendingApprovalsForUser('user-3').length).toBe(0);
    // Clean up: approve it
    mgr.approveAction(pending[0].id, 'user-1', true);
    await promise;
  });

  it('escalateRequest sets fields and fires handler', async () => {
    const handler = vi.fn();
    mgr.onEscalation('esc', handler);
    // Start a request
    const promise = mgr.requestApproval(makeAction(), ['user-1']);
    // Get pending
    const pending = mgr.getPendingApprovalsForUser('user-1');
    mgr.escalateRequest(pending[0].id, 'urgent');
    expect(handler).toHaveBeenCalledTimes(1);
    // Clean up
    mgr.approveAction(pending[0].id, 'user-1', true);
    await promise;
  });

  it('audit log records entries', async () => {
    mgr.onApproval('test', (req) => {
      setTimeout(() => mgr.approveAction(req.id, 'user-1', true), 10);
    });
    await mgr.requestApproval(makeAction(), ['user-1']);
    const log = mgr.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(2); // request + decision
    expect(log.some(e => e.type === 'request')).toBe(true);
    expect(log.some(e => e.type === 'decision')).toBe(true);
  });

  it('queryAuditLog filters by agentId', async () => {
    mgr.onApproval('test', (req) => {
      setTimeout(() => mgr.approveAction(req.id, 'user-1', true), 10);
    });
    await mgr.requestApproval(makeAction({ agentId: 'agent-A' }), ['user-1']);
    const filtered = mgr.queryAuditLog({ agentId: 'agent-A' });
    expect(filtered.length).toBeGreaterThan(0);
    expect(mgr.queryAuditLog({ agentId: 'agent-B' }).length).toBe(0);
  });
});
