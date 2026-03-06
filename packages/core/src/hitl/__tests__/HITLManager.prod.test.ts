/**
 * HITLManager.prod.test.ts — Sprint CLXVIII
 *
 * Production tests for HITLManager (Human-in-the-Loop).
 * Tests all approval paths, audit trail, escalation, and stats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HITLManager,
  createHITLManager,
  ActionApprovalStatus,
  type AgentAction,
  type HITLConfig,
} from '../HITLManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: `act_${Math.random().toString(36).slice(2, 8)}`,
    agentId: 'agent-test',
    actionType: 'data_write',
    description: 'Write data to store',
    parameters: { key: 'x', value: 42 },
    confidence: 0.5, // below default threshold of 0.8
    reasoning: 'Data needs updating',
    timestamp: Date.now(),
    requiredApproval: true,
    estimatedImpact: 'medium',
    ...overrides,
  };
}

function makeManager(config: Partial<HITLConfig> = {}): HITLManager {
  return new HITLManager({ approvalTimeoutMs: 5000, ...config });
}

// ---------------------------------------------------------------------------
// Auto-approve paths
// ---------------------------------------------------------------------------

describe('HITLManager', () => {
  describe('auto-approve paths', () => {
    it('auto-approves when HITL is disabled', async () => {
      const m = makeManager({ enabled: false });
      const decision = await m.requestApproval(makeAction(), ['human-1']);
      expect(decision.approved).toBe(true);
      expect(decision.approvedBy).toBe('system');
    });

    it('auto-approves when confidence >= threshold', async () => {
      const m = makeManager({ approvalThreshold: 0.8 });
      const decision = await m.requestApproval(makeAction({ confidence: 0.9 }), ['human-1']);
      expect(decision.approved).toBe(true);
      expect(decision.approvedBy).toBe('auto');
    });

    it('auto-approves at exactly the threshold boundary', async () => {
      const m = makeManager({ approvalThreshold: 0.8 });
      const decision = await m.requestApproval(makeAction({ confidence: 0.8 }), ['human-1']);
      expect(decision.approved).toBe(true);
      expect(decision.approvedBy).toBe('auto');
    });

    it('auto-approves when impact level is not in requiresApprovalFor', async () => {
      const m = makeManager({ requiresApprovalFor: ['high', 'critical'] });
      // 'low' is not in the list, confidence < threshold
      const decision = await m.requestApproval(
        makeAction({ confidence: 0.3, estimatedImpact: 'low' }),
        ['human-1'],
      );
      expect(decision.approved).toBe(true);
      expect(decision.approvedBy).toBe('auto');
    });

    it('rejects immediately when no approvers are given for required action', async () => {
      const m = makeManager();
      const decision = await m.requestApproval(makeAction(), []); // no approvers
      expect(decision.approved).toBe(false);
      expect(decision.approvedBy).toBe('system');
      expect(decision.reason).toMatch(/no approvers/i);
    });
  });

  // -------------------------------------------------------------------------
  // Manual approval flow
  // -------------------------------------------------------------------------

  describe('manual approval flow', () => {
    it('resolves with approved decision when approveAction is called', async () => {
      const m = makeManager();
      const action = makeAction();

      const promise = m.requestApproval(action, ['human-1']);

      // Let the request register
      await Promise.resolve();

      // Find request ID (deterministic: counter-based)
      const pending = m.getPendingApprovalsForUser('human-1');
      expect(pending).toHaveLength(1);
      const requestId = pending[0].id;

      m.approveAction(requestId, 'human-1', true, 'Looks good');

      const decision = await promise;
      expect(decision.approved).toBe(true);
      expect(decision.approvedBy).toBe('human-1');
      expect(decision.reason).toBe('Looks good');
    });

    it('resolves with rejected decision when rejectAction is called', async () => {
      const m = makeManager();
      const action = makeAction();

      const promise = m.requestApproval(action, ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.rejectAction(pending[0].id, 'human-1', 'Too risky');

      const decision = await promise;
      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('Too risky');
    });

    it('removes request from pending after decision', async () => {
      const m = makeManager();
      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);

      await promise;
      expect(m.getPendingApprovalsForUser('human-1')).toHaveLength(0);
    });

    it('forwards corrected parameters in decision', async () => {
      const m = makeManager();
      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true, 'OK', { value: 99 });

      const decision = await promise;
      expect(decision.correctedParameters).toEqual({ value: 99 });
    });

    it('silently ignores approveAction for unknown requestId', () => {
      const m = makeManager();
      expect(() => m.approveAction('nonexistent', 'user', true)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple concurrent requests
  // -------------------------------------------------------------------------

  describe('multiple concurrent requests', () => {
    it('handles multiple simultaneous pending requests', async () => {
      const m = makeManager();

      const p1 = m.requestApproval(makeAction(), ['human-1']);
      const p2 = m.requestApproval(makeAction(), ['human-1']);
      const p3 = m.requestApproval(makeAction(), ['human-2']);

      await Promise.resolve();

      const pendingH1 = m.getPendingApprovalsForUser('human-1');
      expect(pendingH1).toHaveLength(2);

      const pendingH2 = m.getPendingApprovalsForUser('human-2');
      expect(pendingH2).toHaveLength(1);

      // Approve all
      m.approveAction(pendingH1[0].id, 'human-1', true);
      m.approveAction(pendingH1[1].id, 'human-1', true);
      m.approveAction(pendingH2[0].id, 'human-2', true);

      const [d1, d2, d3] = await Promise.all([p1, p2, p3]);
      expect(d1.approved).toBe(true);
      expect(d2.approved).toBe(true);
      expect(d3.approved).toBe(true);
    });

    it('assigning correct sequential IDs to requests', async () => {
      const m = makeManager();

      const p1 = m.requestApproval(makeAction(), ['h']);
      const p2 = m.requestApproval(makeAction(), ['h']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('h');
      expect(pending[0].id).toBe('action_request_001');
      expect(pending[1].id).toBe('action_request_002');

      m.approveAction(pending[0].id, 'h', true);
      m.approveAction(pending[1].id, 'h', true);
      await Promise.all([p1, p2]);
    });
  });

  // -------------------------------------------------------------------------
  // Approval handler notification
  // -------------------------------------------------------------------------

  describe('onApprovalNeeded / onApproval', () => {
    it('calls registered approval handler when request is created', async () => {
      const m = makeManager();
      const handler = vi.fn();
      m.onApprovalNeeded(handler);

      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({ approvers: ['human-1'] });

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;
    });

    it('calls named approval handler', async () => {
      const m = makeManager();
      const handler = vi.fn();
      m.onApproval('my-handler', handler);

      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();
      expect(handler).toHaveBeenCalledTimes(1);

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;
    });
  });

  // -------------------------------------------------------------------------
  // Escalation
  // -------------------------------------------------------------------------

  describe('escalation', () => {
    it('calls escalation handler when escalateRequest is called', async () => {
      const m = makeManager();
      const escalationHandler = vi.fn();
      m.onEscalation('esc-handler', escalationHandler);

      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.escalateRequest(pending[0].id, 'Escalating due to urgency');

      expect(escalationHandler).toHaveBeenCalledTimes(1);
      expect(escalationHandler.mock.calls[0][0]).toMatchObject({
        escalationReason: 'Escalating due to urgency',
      });

      m.approveAction(pending[0].id, 'human-1', true);
      await promise;
    });

    it('silently ignores escalateRequest for unknown requestId', () => {
      const m = makeManager();
      expect(() => m.escalateRequest('nonexistent', 'Test')).not.toThrow();
    });

    it('onEscalation supports anonymous handler variant', async () => {
      const m = makeManager();
      const handler = vi.fn();
      m.onEscalation(handler); // anonymous variant

      const promise = m.requestApproval(makeAction(), ['h']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('h');
      m.escalateRequest(pending[0].id, 'urgent');

      expect(handler).toHaveBeenCalled();
      m.approveAction(pending[0].id, 'h', true);
      await promise;
    });
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  describe('audit log', () => {
    it('records request entry in audit log', async () => {
      const m = makeManager({ enableAuditLog: true });
      const promise = m.requestApproval(makeAction({ agentId: 'agent-audit' }), ['human-1']);
      await Promise.resolve();

      const log = m.getAuditLog();
      expect(log.some((e) => e.type === 'request' && e.agentId === 'agent-audit')).toBe(true);

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;
    });

    it('records decision entry in audit log', async () => {
      const m = makeManager({ enableAuditLog: true });
      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', false, 'Nope');
      await promise;

      const decisions = m.getAuditLog().filter((e) => e.type === 'decision');
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions.some((e) => e.details.approved === false)).toBe(true);
    });

    it('queryAuditLog filters by agentId', async () => {
      const m = makeManager({ enableAuditLog: true });
      const promise = m.requestApproval(makeAction({ agentId: 'agent-X' }), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;

      const results = m.queryAuditLog({ agentId: 'agent-X' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((e) => e.agentId === 'agent-X')).toBe(true);
    });

    it('queryAuditLog filters by type', async () => {
      const m = makeManager({ enableAuditLog: true });
      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;

      const requests = m.queryAuditLog({ type: 'request' });
      expect(requests.every((e) => e.type === 'request')).toBe(true);
    });

    it('does not record audit entries when enableAuditLog is false', async () => {
      const m = makeManager({ enableAuditLog: false });
      const promise = m.requestApproval(makeAction(), ['human-1']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('human-1');
      m.approveAction(pending[0].id, 'human-1', true);
      await promise;

      expect(m.getAuditLog()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe('getStats', () => {
    it('returns zero stats initially', () => {
      const m = makeManager();
      const stats = m.getStats();
      expect(stats.totalActions).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.approvalRate).toBe(0);
      expect(stats.pending).toBe(0);
    });

    it('tracks approved and rejected counts', async () => {
      const m = makeManager();

      const p1 = m.requestApproval(makeAction(), ['h']);
      const p2 = m.requestApproval(makeAction(), ['h']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('h');
      m.approveAction(pending[0].id, 'h', true);
      m.approveAction(pending[1].id, 'h', false);

      await Promise.all([p1, p2]);

      const stats = m.getStats();
      expect(stats.totalActions).toBe(2);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.approvalRate).toBe(50);
    });

    it('tracks pending count', async () => {
      const m = makeManager();
      const promise = m.requestApproval(makeAction(), ['h']);
      await Promise.resolve();

      expect(m.getStats().pending).toBe(1);

      const pending = m.getPendingApprovalsForUser('h');
      m.approveAction(pending[0].id, 'h', true);
      await promise;

      expect(m.getStats().pending).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Action history
  // -------------------------------------------------------------------------

  describe('getActionHistory', () => {
    it('records completed decisions', async () => {
      const m = makeManager();
      const action = makeAction({ agentId: 'hist-agent' });
      const promise = m.requestApproval(action, ['h']);
      await Promise.resolve();

      const pending = m.getPendingApprovalsForUser('h');
      m.approveAction(pending[0].id, 'h', true);
      await promise;

      const history = m.getActionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].action.agentId).toBe('hist-agent');
      expect(history[0].decision.approved).toBe(true);
    });

    it('returns a copy (immutable)', async () => {
      const m = makeManager();
      const promise = m.requestApproval(makeAction(), ['h']);
      await Promise.resolve();
      const pending = m.getPendingApprovalsForUser('h');
      m.approveAction(pending[0].id, 'h', true);
      await promise;

      const h1 = m.getActionHistory();
      h1.push({} as any); // mutate
      const h2 = m.getActionHistory();
      expect(h2).toHaveLength(1); // original unaffected
    });
  });

  // -------------------------------------------------------------------------
  // Feedback loop
  // -------------------------------------------------------------------------

  describe('recordFeedback', () => {
    it('adds audit entry when feedback is recorded with action + decision', () => {
      const m = makeManager({ enableAuditLog: true });
      const action = makeAction();
      const decision = {
        requestId: action.id,
        approvedBy: 'human-1',
        approved: true,
        feedback: 'Great job',
        timestamp: Date.now(),
      };
      m.recordFeedback(action, decision);

      const feedbackEntries = m.getAuditLog().filter((e) => e.type === 'feedback');
      expect(feedbackEntries).toHaveLength(1);
    });

    it('adds audit entry when feedback is recorded with just a decision', () => {
      const m = makeManager({ enableAuditLog: true });
      const decision = {
        requestId: 'req-1',
        approvedBy: 'human-1',
        approved: false,
        feedback: 'Review needed',
        timestamp: Date.now(),
      };
      m.recordFeedback(decision);

      const entries = m.getAuditLog().filter((e) => e.type === 'feedback');
      expect(entries).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // createHITLManager factory
  // -------------------------------------------------------------------------

  describe('createHITLManager', () => {
    it('creates a HITLManager instance', () => {
      const m = createHITLManager({ approvalThreshold: 0.9 });
      expect(m).toBeInstanceOf(HITLManager);
    });
  });
});
