/**
 * HITLTrait Backend Integration Tests
 *
 * Tests webhook notifications, audit log batching/flush,
 * rollback execution, auto-approve from webhook, and backend events.
 *
 * Commence All VI — Track 2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hitlHandler,
  evaluateAction,
  matchesCondition,
  createApprovalRequest,
  createRollbackCheckpoint,
} from '../HITLTrait';
import type {
  HITLConfig,
  HITLState,
  ApprovalRequest,
  ActionCategory,
  EscalationCondition,
  ActionEvaluation,
} from '../HITLTrait';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockNode(id = 'agent-1') {
  return { id, name: id };
}

function createMockContext() {
  return { emit: vi.fn() };
}

function getState(node: any): HITLState {
  return (node as any).__hitlState;
}

function makeConfig(overrides: Partial<HITLConfig> = {}): HITLConfig {
  return { ...hitlHandler.defaultConfig, ...overrides };
}

// =============================================================================
// TESTS
// =============================================================================

describe('HITLTrait — Backend Integration', () => {
  let node: any;
  let ctx: any;
  let config: HITLConfig;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
    config = makeConfig({
      notification_webhook: 'https://example.com/webhook',
      approved_operators: ['admin'],
    });
  });

  // ---------------------------------------------------------------------------
  // 1. INITIALIZATION
  // ---------------------------------------------------------------------------

  describe('initialization', () => {
    it('attaches state with correct defaults', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      expect(s.isEnabled).toBe(true);
      expect(s.currentMode).toBe('supervised');
      expect(s.pendingApprovals).toEqual([]);
      expect(s.auditLog).toEqual([]);
      expect(s.rollbackCheckpoints).toEqual([]);
    });

    it('permissions start empty', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      expect(s.permissions).toEqual({});
    });

    it('session start time is captured', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      expect(s.sessionStartTime).toBeGreaterThan(0);
    });

    it('detach cleans up state', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onDetach!(node, config, ctx);
      expect(getState(node)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ACTION EVALUATION
  // ---------------------------------------------------------------------------

  describe('action evaluation', () => {
    it('evaluateAction approves high-confidence action in supervised mode', () => {
      const evalConfig = makeConfig({
        always_approve_categories: [],
        never_approve_categories: [],
        constitution: [],
      });
      hitlHandler.onAttach!(node, evalConfig, ctx);
      const s = getState(node);
      const result = evaluateAction(node, s, evalConfig, {
        action: 'read_file',
        category: 'read',
        confidence: 0.95,
        riskScore: 0.1,
      });
      expect(result.approved).toBe(true);
      expect(result.reason).toBe('passed_checks');
    });

    it('rejects low-confidence actions', () => {
      const evalConfig = makeConfig({
        always_approve_categories: [],
        never_approve_categories: [],
        constitution: [],
      });
      hitlHandler.onAttach!(node, evalConfig, ctx);
      const s = getState(node);
      const result = evaluateAction(node, s, evalConfig, {
        action: 'delete_user',
        category: 'delete',
        confidence: 0.3,
        riskScore: 0.2,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('low_confidence');
    });

    it('rejects high-risk actions', () => {
      const evalConfig = makeConfig({
        always_approve_categories: [],
        never_approve_categories: [],
        constitution: [],
        escalation_rules: [],
      });
      hitlHandler.onAttach!(node, evalConfig, ctx);
      const s = getState(node);
      const result = evaluateAction(node, s, evalConfig, {
        action: 'overwrite_data',
        category: 'write',
        confidence: 0.9,
        riskScore: 0.95,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('high_risk');
    });

    it('manual mode always requires approval', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.currentMode = 'manual';
      const result = evaluateAction(node, s, config, {
        action: 'read_file',
        category: 'read',
        confidence: 0.99,
        riskScore: 0.01,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('manual_mode');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ESCALATION MATCHING
  // ---------------------------------------------------------------------------

  describe('escalation condition matching', () => {
    it('matches confidence_below condition', () => {
      const condition: EscalationCondition = { type: 'confidence_below', value: 0.5 };
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'read',
          confidence: 0.3,
          riskScore: 0,
        })
      ).toBe(true);
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'read',
          confidence: 0.7,
          riskScore: 0,
        })
      ).toBe(false);
    });

    it('matches risk_above condition', () => {
      const condition: EscalationCondition = { type: 'risk_above', value: 0.8 };
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'read',
          confidence: 0.9,
          riskScore: 0.9,
        })
      ).toBe(true);
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'read',
          confidence: 0.9,
          riskScore: 0.3,
        })
      ).toBe(false);
    });

    it('matches category_match condition with array', () => {
      const condition: EscalationCondition = { type: 'category_match', value: ['delete', 'admin'] };
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'delete',
          confidence: 0.9,
          riskScore: 0,
        })
      ).toBe(true);
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'read',
          confidence: 0.9,
          riskScore: 0,
        })
      ).toBe(false);
    });

    it('matches category_match condition with string', () => {
      const condition: EscalationCondition = { type: 'category_match', value: 'admin' };
      expect(
        matchesCondition(condition, {
          action: 'x',
          category: 'admin',
          confidence: 0.9,
          riskScore: 0,
        })
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. APPROVAL REQUEST CREATION
  // ---------------------------------------------------------------------------

  describe('approval requests', () => {
    it('createApprovalRequest generates valid approval', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      const approval = createApprovalRequest(s, config, {
        action: 'deploy_service',
        category: 'execute',
        confidence: 0.6,
        riskScore: 0.7,
        description: 'Deploy to prod',
        metadata: { env: 'prod' },
        agentId: 'agent-1',
      });

      expect(approval.id).toMatch(/^approval_/);
      expect(approval.status).toBe('pending');
      expect(approval.action).toBe('deploy_service');
      expect(approval.category).toBe('execute');
      expect(approval.agentId).toBe('agent-1');
      expect(approval.expiresAt).toBeGreaterThan(Date.now());
    });

    it('emits hitl_approval_required for risky actions via event', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'delete_db',
          category: 'delete',
          confidence: 0.3,
          riskScore: 0.5,
          description: 'Drop table',
          metadata: {},
        },
      } as any);

      const approvalCalls = ctx.emit.mock.calls.filter(
        (c: any) => c[0] === 'hitl_approval_required'
      );
      expect(approvalCalls.length).toBe(1);
      expect(approvalCalls[0][1].approval.action).toBe('delete_db');
    });

    it('emits hitl_action_approved for high-confidence actions', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'read_config',
          category: 'read',
          confidence: 0.95,
          riskScore: 0.05,
          description: 'Read config file',
          metadata: {},
        },
      } as any);

      const approvedCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_action_approved');
      expect(approvedCalls.length).toBe(1);
      expect(approvedCalls[0][1].autonomous).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. OPERATOR APPROVAL
  // ---------------------------------------------------------------------------

  describe('operator approval', () => {
    it('resolves pending approval when operator approves', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      const approval = createApprovalRequest(s, config, {
        action: 'deploy',
        category: 'execute',
        confidence: 0.6,
        riskScore: 0.5,
        description: 'Deploy',
        metadata: {},
        agentId: 'agent-1',
      });
      s.pendingApprovals.push(approval);

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'operator_approval',
        payload: { approvalId: approval.id, approved: true, reason: 'LGTM', operator: 'admin' },
      } as any);

      expect(approval.status).toBe('approved');
      expect(approval.approver).toBe('admin');
    });

    it('rejects unauthorized operators', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'operator_approval',
        payload: { approvalId: 'test', approved: true, operator: 'hacker' },
      } as any);

      const unauth = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_unauthorized_operator');
      expect(unauth.length).toBe(1);
    });

    it('builds confidence bonus after repeated approvals', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);

      // Simulate 5 approvals for the same action category
      for (let i = 0; i < 5; i++) {
        const approval = createApprovalRequest(s, config, {
          action: 'deploy',
          category: 'execute',
          confidence: 0.6,
          riskScore: 0.5,
          description: 'Deploy',
          metadata: {},
          agentId: 'agent-1',
        });
        s.pendingApprovals.push(approval);

        hitlHandler.onEvent!(node, config, ctx, {
          type: 'operator_approval',
          payload: { approvalId: approval.id, approved: true, operator: 'admin' },
        } as any);
      }

      expect(s.permissions['execute:deploy']).toBeDefined();
      expect(s.permissions['execute:deploy'].approvals).toBe(5);
      expect(s.permissions['execute:deploy'].confidenceBonus).toBe(0.05);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. ROLLBACK EXECUTION (v3.1)
  // ---------------------------------------------------------------------------

  describe('rollback execution', () => {
    it('creates rollback checkpoint', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      createRollbackCheckpoint(s, config, {
        action: 'update_user',
        agentId: 'agent-1',
        stateBefore: { name: 'old_name' },
      });

      expect(s.rollbackCheckpoints.length).toBe(1);
      expect(s.rollbackCheckpoints[0].action).toBe('update_user');
      expect(s.rollbackCheckpoints[0].canRollback).toBe(true);
    });

    it('applies stateBefore to node on rollback', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      node.foo = 'after_change';

      createRollbackCheckpoint(s, config, {
        action: 'modify_foo',
        agentId: 'agent-1',
        stateBefore: { foo: 'original' },
      });
      const cpId = s.rollbackCheckpoints[0].id;

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      expect(node.foo).toBe('original');
    });

    it('emits hitl_rollback_executed with before/after', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      node.value = 42;

      createRollbackCheckpoint(s, config, {
        action: 'set_value',
        agentId: 'agent-1',
        stateBefore: { value: 10 },
      });
      const cpId = s.rollbackCheckpoints[0].id;

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      const rollbackCalls = ctx.emit.mock.calls.filter(
        (c: any) => c[0] === 'hitl_rollback_executed'
      );
      expect(rollbackCalls.length).toBe(1);
      expect(rollbackCalls[0][1].stateBefore).toEqual({ value: 10 });
    });

    it('marks checkpoint as used after rollback', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      createRollbackCheckpoint(s, config, {
        action: 'test',
        agentId: 'agent-1',
        stateBefore: {},
      });
      const cpId = s.rollbackCheckpoints[0].id;

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      expect(s.rollbackCheckpoints[0].canRollback).toBe(false);
    });

    it('rejects double rollback', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      createRollbackCheckpoint(s, config, {
        action: 'test',
        agentId: 'agent-1',
        stateBefore: {},
      });
      const cpId = s.rollbackCheckpoints[0].id;

      // First rollback
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      // Second rollback — should fail
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      const failedCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_rollback_failed');
      expect(failedCalls.length).toBe(1);
      expect(failedCalls[0][1].reason).toBe('already_rolled_back');
    });

    it('rejects expired rollback checkpoint', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      createRollbackCheckpoint(s, config, {
        action: 'test',
        agentId: 'agent-1',
        stateBefore: {},
      });
      // Force expiry
      s.rollbackCheckpoints[0].expiresAt = Date.now() - 1000;
      const cpId = s.rollbackCheckpoints[0].id;

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'rollback_request',
        payload: { checkpointId: cpId },
      } as any);

      const failedCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_rollback_failed');
      expect(failedCalls.length).toBe(1);
      expect(failedCalls[0][1].reason).toBe('expired');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. WEBHOOK NOTIFICATION
  // ---------------------------------------------------------------------------

  describe('webhook notification', () => {
    it('emits hitl_notification_sent when notifying via event', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'risky_op',
          category: 'admin',
          confidence: 0.3,
          riskScore: 0.5,
          description: 'Risky',
          metadata: {},
        },
      } as any);

      const notifyCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_notification_sent');
      expect(notifyCalls.length).toBe(1);
      expect(notifyCalls[0][1].webhook).toBe('https://example.com/webhook');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. MODE CHANGES
  // ---------------------------------------------------------------------------

  describe('mode changes', () => {
    it('changes mode on authorized operator request', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'autonomous', operator: 'admin' },
      } as any);

      const s = getState(node);
      expect(s.currentMode).toBe('autonomous');
    });

    it('resets action count when switching to autonomous', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.actionCountThisSession = 5;

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'autonomous', operator: 'admin' },
      } as any);

      expect(s.actionCountThisSession).toBe(0);
    });

    it('emits hitl_mode_changed with from/to modes', () => {
      hitlHandler.onAttach!(node, config, ctx);
      hitlHandler.onEvent!(node, config, ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'manual', operator: 'admin' },
      } as any);

      const modeCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'hitl_mode_changed');
      expect(modeCalls.length).toBe(1);
      expect(modeCalls[0][1].fromMode).toBe('supervised');
      expect(modeCalls[0][1].toMode).toBe('manual');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. AUDIT LOG FLUSH (v3.1)
  // ---------------------------------------------------------------------------

  describe('audit log flush', () => {
    it('flush_audit_log event triggers flush', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);

      // Add some audit entries manually
      s.auditLog.push(
        {
          id: 'a1',
          timestamp: Date.now(),
          agentId: 'ag',
          action: 'test',
          decision: 'autonomous',
          confidence: 0.9,
          riskScore: 0.1,
          rollbackAvailable: false,
        },
        {
          id: 'a2',
          timestamp: Date.now(),
          agentId: 'ag',
          action: 'test2',
          decision: 'approved',
          confidence: 0.8,
          riskScore: 0.2,
          rollbackAvailable: false,
        }
      );

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'flush_audit_log',
        payload: { endpoint: 'https://example.com/audit', batchSize: 10 },
      } as any);

      // Audit entries should be spliced out (consumed)
      // Note: flush is async, but the splice happens synchronously before fetch
      expect(s.auditLog.length).toBe(0);
    });

    it('uses notification_webhook as default flush endpoint', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.auditLog.push({
        id: 'a1',
        timestamp: Date.now(),
        agentId: 'ag',
        action: 'test',
        decision: 'autonomous',
        confidence: 0.9,
        riskScore: 0.1,
        rollbackAvailable: false,
      });

      hitlHandler.onEvent!(node, config, ctx, {
        type: 'flush_audit_log',
        payload: {},
      } as any);

      // Should not throw — uses config.notification_webhook
      expect(s.auditLog.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. APPROVAL TIMEOUT
  // ---------------------------------------------------------------------------

  describe('approval timeout', () => {
    it('expires pending approvals in onUpdate', () => {
      hitlHandler.onAttach!(node, config, ctx);
      const s = getState(node);

      const approval = createApprovalRequest(s, config, {
        action: 'test',
        category: 'write',
        confidence: 0.5,
        riskScore: 0.5,
        description: 'Test',
        metadata: {},
        agentId: 'agent-1',
      });
      approval.expiresAt = Date.now() - 1000; // Already expired
      s.pendingApprovals.push(approval);

      hitlHandler.onUpdate!(node, config, ctx, 16);

      const expiredApproval = s.pendingApprovals.find((a) => a.id === approval.id);
      expect(expiredApproval?.status).toBe('expired');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. HANDLER METADATA
  // ---------------------------------------------------------------------------

  describe('handler metadata', () => {
    it('has correct name', () => {
      expect(hitlHandler.name).toBe('hitl');
    });

    it('has all lifecycle methods', () => {
      expect(hitlHandler.onAttach).toBeTypeOf('function');
      expect(hitlHandler.onDetach).toBeTypeOf('function');
      expect(hitlHandler.onUpdate).toBeTypeOf('function');
      expect(hitlHandler.onEvent).toBeTypeOf('function');
    });

    it('default config has expected values', () => {
      const d = hitlHandler.defaultConfig;
      expect(d.mode).toBe('supervised');
      expect(d.confidence_threshold).toBeGreaterThan(0);
      expect(d.risk_threshold).toBeLessThan(1);
      expect(d.enable_audit_log).toBe(true);
      expect(d.enable_rollback).toBe(true);
    });
  });
});
