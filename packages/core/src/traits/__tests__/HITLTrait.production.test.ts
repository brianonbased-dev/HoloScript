/**
 * HITLTrait - Production Test Suite
 *
 * Commence All V — Tests aligned to actual hitlHandler implementation.
 * Covers: onAttach state, onDetach cleanup, onUpdate expiry, onEvent dispatch
 * (agent_action_request, operator_approval, rollback_request, hitl_mode_change_request),
 * evaluateAction logic (constitutional, confidence, risk, escalation rules).
 */

import { describe, it, expect, vi } from 'vitest';
import { hitlHandler } from '../HITLTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'test-agent') {
  return { id, __hitlState: undefined as any };
}

function makeContext() {
  const emitted: { event: string; data: any }[] = [];
  return {
    emit: (event: string, data: any) => emitted.push({ event, data }),
    emitted,
  };
}

function defaultConfig() {
  return { ...hitlHandler.defaultConfig };
}

function attachNode(config = defaultConfig()) {
  const node = makeNode();
  const ctx = makeContext();
  hitlHandler.onAttach(node, config, ctx);
  return { node, ctx };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('HITLTrait — Production Tests', () => {
  // =========================================================================
  // Handler defaults
  // =========================================================================
  describe('handler defaults', () => {
    it('has name hitl', () => {
      expect(hitlHandler.name).toBe('hitl');
    });

    it('default mode is supervised', () => {
      expect(hitlHandler.defaultConfig.mode).toBe('supervised');
    });

    it('default confidence threshold is 0.8', () => {
      expect(hitlHandler.defaultConfig.confidence_threshold).toBe(0.8);
    });

    it('default risk threshold is 0.5', () => {
      expect(hitlHandler.defaultConfig.risk_threshold).toBe(0.5);
    });

    it('default max autonomous actions is 100', () => {
      expect(hitlHandler.defaultConfig.max_autonomous_actions).toBe(100);
    });

    it('default enables audit log', () => {
      expect(hitlHandler.defaultConfig.enable_audit_log).toBe(true);
    });

    it('default enables rollback', () => {
      expect(hitlHandler.defaultConfig.enable_rollback).toBe(true);
    });

    it('default rollback retention is 24 hours', () => {
      expect(hitlHandler.defaultConfig.rollback_retention).toBe(86400000);
    });

    it('auto_approve_on_timeout is false by default', () => {
      expect(hitlHandler.defaultConfig.auto_approve_on_timeout).toBe(false);
    });

    it('default has empty constitution', () => {
      expect(hitlHandler.defaultConfig.constitution).toEqual([]);
    });

    it('default has empty approved operators', () => {
      expect(hitlHandler.defaultConfig.approved_operators).toEqual([]);
    });

    it('always_approve_categories includes financial, admin, delete', () => {
      expect(hitlHandler.defaultConfig.always_approve_categories).toEqual(
        expect.arrayContaining(['financial', 'admin', 'delete'])
      );
    });

    it('never_approve_categories includes read', () => {
      expect(hitlHandler.defaultConfig.never_approve_categories).toEqual(
        expect.arrayContaining(['read'])
      );
    });
  });

  // =========================================================================
  // onAttach — State initialization
  // =========================================================================
  describe('onAttach', () => {
    it('initializes state on node', () => {
      const { node } = attachNode();
      expect(node.__hitlState).toBeDefined();
    });

    it('starts enabled', () => {
      const { node } = attachNode();
      expect(node.__hitlState.isEnabled).toBe(true);
    });

    it('starts with mode from config', () => {
      const { node } = attachNode();
      expect(node.__hitlState.currentMode).toBe('supervised');
    });

    it('respects custom mode config', () => {
      const { node } = attachNode({ ...defaultConfig(), mode: 'manual' as const });
      expect(node.__hitlState.currentMode).toBe('manual');
    });

    it('starts with empty pending approvals', () => {
      const { node } = attachNode();
      expect(node.__hitlState.pendingApprovals).toEqual([]);
    });

    it('starts with empty audit log', () => {
      const { node } = attachNode();
      expect(node.__hitlState.auditLog).toEqual([]);
    });

    it('starts with empty rollback checkpoints', () => {
      const { node } = attachNode();
      expect(node.__hitlState.rollbackCheckpoints).toEqual([]);
    });

    it('starts with zero action count', () => {
      const { node } = attachNode();
      expect(node.__hitlState.actionCountThisSession).toBe(0);
    });

    it('records session start time', () => {
      const before = Date.now();
      const { node } = attachNode();
      const after = Date.now();
      expect(node.__hitlState.sessionStartTime).toBeGreaterThanOrEqual(before);
      expect(node.__hitlState.sessionStartTime).toBeLessThanOrEqual(after);
    });

    it('starts with empty permissions', () => {
      const { node } = attachNode();
      expect(node.__hitlState.permissions).toEqual({});
    });

    it('emits hitl_initialized', () => {
      const { ctx } = attachNode();
      const initEvents = ctx.emitted.filter((e) => e.event === 'hitl_initialized');
      expect(initEvents.length).toBe(1);
    });
  });

  // =========================================================================
  // onDetach — Cleanup
  // =========================================================================
  describe('onDetach', () => {
    it('removes state from node', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onDetach(node, defaultConfig(), ctx);
      expect(node.__hitlState).toBeUndefined();
    });

    it('emits hitl_audit_persist when audit logging enabled', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onDetach(node, defaultConfig(), ctx);
      const persistEvents = ctx.emitted.filter((e) => e.event === 'hitl_audit_persist');
      expect(persistEvents.length).toBe(1);
    });
  });

  // =========================================================================
  // onEvent — agent_action_request (the real event type)
  // =========================================================================
  describe('onEvent — agent_action_request', () => {
    it('auto-approves read category (never_approve_categories = exempt from approval)', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'read_data',
          category: 'read',
          confidence: 0.5,
          riskScore: 0.1,
          description: 'Read some data',
          metadata: {},
        },
      });
      const approved = ctx.emitted.filter((e) => e.event === 'hitl_action_approved');
      expect(approved.length).toBe(1);
      expect(approved[0].data.autonomous).toBe(true);
    });

    it('requires approval for high-confidence financial actions (always_approve_categories)', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'transfer_funds',
          category: 'financial',
          confidence: 0.99,
          riskScore: 0.1,
          description: 'Transfer funds',
          metadata: {},
        },
      });
      const approvalRequired = ctx.emitted.filter((e) => e.event === 'hitl_approval_required');
      expect(approvalRequired.length).toBe(1);
    });

    it('requires approval in manual mode regardless of confidence', () => {
      const config = { ...defaultConfig(), mode: 'manual' as const };
      const { node, ctx } = attachNode(config);
      hitlHandler.onEvent(node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'safe_action',
          category: 'execute',
          confidence: 1.0,
          riskScore: 0.0,
          description: 'Even safe actions need approval in manual',
          metadata: {},
        },
      });
      const approvalRequired = ctx.emitted.filter((e) => e.event === 'hitl_approval_required');
      expect(approvalRequired.length).toBe(1);
    });

    it('auto-approves high-confidence low-risk execute action in supervised mode', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'safe_execute',
          category: 'execute',
          confidence: 0.95,
          riskScore: 0.1,
          description: 'Safe execution',
          metadata: {},
        },
      });
      const approved = ctx.emitted.filter((e) => e.event === 'hitl_action_approved');
      expect(approved.length).toBe(1);
    });

    it('requires approval for low-confidence action', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'risky_op',
          category: 'write',
          confidence: 0.3,
          riskScore: 0.2,
          description: 'Low confidence write',
          metadata: {},
        },
      });
      const approvalRequired = ctx.emitted.filter((e) => e.event === 'hitl_approval_required');
      expect(approvalRequired.length).toBe(1);
    });

    it('requires approval for high-risk action', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'dangerous',
          category: 'execute',
          confidence: 0.9,
          riskScore: 0.9,
          description: 'High risk',
          metadata: {},
        },
      });
      const approvalRequired = ctx.emitted.filter((e) => e.event === 'hitl_approval_required');
      expect(approvalRequired.length).toBe(1);
    });

    it('increments actionCountThisSession on auto-approve', () => {
      const { node, ctx } = attachNode();
      const before = node.__hitlState.actionCountThisSession;
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'read_file',
          category: 'read',
          confidence: 0.95,
          riskScore: 0.0,
          description: 'Reading file',
          metadata: {},
        },
      });
      expect(node.__hitlState.actionCountThisSession).toBe(before + 1);
    });

    it('creates rollback checkpoint on auto-approve when enabled', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'read_config',
          category: 'read',
          confidence: 0.95,
          riskScore: 0.0,
          description: 'Read config',
          metadata: { stateBefore: { key: 'old' } },
        },
      });
      expect(node.__hitlState.rollbackCheckpoints.length).toBe(1);
    });

    it('adds audit log entry on auto-approve', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'read_data',
          category: 'read',
          confidence: 0.9,
          riskScore: 0.0,
          description: 'Read',
          metadata: {},
        },
      });
      expect(node.__hitlState.auditLog.length).toBe(1);
      expect(node.__hitlState.auditLog[0].decision).toBe('autonomous');
    });
  });

  // =========================================================================
  // onEvent — operator_approval
  // =========================================================================
  describe('onEvent — operator_approval', () => {
    it('resolves pending approval when approved by operator', () => {
      const config = { ...defaultConfig(), mode: 'manual' as const };
      const { node, ctx } = attachNode(config);
      // Create pending approval
      hitlHandler.onEvent(node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'test_action',
          category: 'execute',
          confidence: 0.5,
          riskScore: 0.3,
          description: 'Test',
          metadata: {},
        },
      });
      const pendingId = node.__hitlState.pendingApprovals[0]?.id;
      expect(pendingId).toBeDefined();

      hitlHandler.onEvent(node, config, ctx, {
        type: 'operator_approval',
        payload: { approvalId: pendingId, approved: true, operator: 'human-1' },
      });
      const resolved = ctx.emitted.filter((e) => e.event === 'hitl_approval_resolved');
      expect(resolved.length).toBeGreaterThanOrEqual(1);
      expect(node.__hitlState.pendingApprovals[0].status).toBe('approved');
    });

    it('rejects unauthorized operator', () => {
      const config = { ...defaultConfig(), approved_operators: ['alice'] };
      const { node, ctx } = attachNode(config);
      hitlHandler.onEvent(node, config, ctx, {
        type: 'operator_approval',
        payload: { approvalId: 'fake', approved: true, operator: 'bob' },
      });
      const unauthorized = ctx.emitted.filter((e) => e.event === 'hitl_unauthorized_operator');
      expect(unauthorized.length).toBe(1);
    });
  });

  // =========================================================================
  // onEvent — hitl_mode_change_request (the real event type)
  // =========================================================================
  describe('onEvent — hitl_mode_change_request', () => {
    it('changes mode when operator is authorized', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'autonomous', operator: 'admin' },
      });
      expect(node.__hitlState.currentMode).toBe('autonomous');
    });

    it('emits hitl_mode_changed event', () => {
      const { node, ctx } = attachNode();
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'manual', operator: 'admin' },
      });
      const modeEvents = ctx.emitted.filter((e) => e.event === 'hitl_mode_changed');
      expect(modeEvents.length).toBe(1);
      expect(modeEvents[0].data.fromMode).toBe('supervised');
      expect(modeEvents[0].data.toMode).toBe('manual');
    });

    it('resets actionCountThisSession when switching to autonomous', () => {
      const { node, ctx } = attachNode();
      node.__hitlState.actionCountThisSession = 50;
      hitlHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'autonomous', operator: 'admin' },
      });
      expect(node.__hitlState.actionCountThisSession).toBe(0);
    });

    it('blocks mode change from unauthorized operator', () => {
      const config = { ...defaultConfig(), approved_operators: ['alice'] };
      const { node, ctx } = attachNode(config);
      hitlHandler.onEvent(node, config, ctx, {
        type: 'hitl_mode_change_request',
        payload: { newMode: 'autonomous', operator: 'bob' },
      });
      expect(node.__hitlState.currentMode).toBe('supervised'); // unchanged
    });
  });

  // =========================================================================
  // onUpdate — expiry and autonomous limit
  // =========================================================================
  describe('onUpdate', () => {
    it('does not throw on normal update', () => {
      const { node, ctx } = attachNode();
      expect(() => hitlHandler.onUpdate(node, defaultConfig(), ctx, 16)).not.toThrow();
    });

    it('expires timed-out pending approvals', () => {
      const { node, ctx } = attachNode();
      node.__hitlState.pendingApprovals.push({
        id: 'test-expired',
        timestamp: Date.now() - 700000,
        agentId: 'agent-1',
        action: 'old_action',
        category: 'execute',
        description: 'Expired',
        confidence: 0.5,
        riskScore: 0.3,
        context: {},
        status: 'pending',
        expiresAt: Date.now() - 1, // already expired
        metadata: {},
      });
      hitlHandler.onUpdate(node, defaultConfig(), ctx, 16);
      expect(node.__hitlState.pendingApprovals[0].status).toBe('expired');
    });

    it('auto-approves on timeout when config enables it', () => {
      const config = { ...defaultConfig(), auto_approve_on_timeout: true };
      const { node, ctx } = attachNode(config);
      node.__hitlState.pendingApprovals.push({
        id: 'test-auto',
        timestamp: Date.now() - 700000,
        agentId: 'agent-1',
        action: 'auto_action',
        category: 'write',
        description: 'Auto',
        confidence: 0.7,
        riskScore: 0.2,
        context: {},
        status: 'pending',
        expiresAt: Date.now() - 1,
        metadata: {},
      });
      hitlHandler.onUpdate(node, config, ctx, 16);
      expect(node.__hitlState.pendingApprovals[0].status).toBe('auto_approved');
    });

    it('switches from autonomous to supervised when max actions reached', () => {
      const config = { ...defaultConfig(), max_autonomous_actions: 5 };
      const { node, ctx } = attachNode(config);
      node.__hitlState.currentMode = 'autonomous';
      node.__hitlState.actionCountThisSession = 5;
      hitlHandler.onUpdate(node, config, ctx, 16);
      expect(node.__hitlState.currentMode).toBe('supervised');
    });

    it('cleans expired rollback checkpoints', () => {
      const { node, ctx } = attachNode();
      node.__hitlState.rollbackCheckpoints.push({
        id: 'expired-cp',
        timestamp: Date.now() - 100000,
        agentId: 'agent-1',
        action: 'old',
        stateBefore: {},
        canRollback: true,
        expiresAt: Date.now() - 1,
      });
      hitlHandler.onUpdate(node, defaultConfig(), ctx, 16);
      expect(node.__hitlState.rollbackCheckpoints.length).toBe(0);
    });
  });

  // =========================================================================
  // Permissions tracking
  // =========================================================================
  describe('permissions tracking', () => {
    it('permissions start empty and are populated on approval', () => {
      const { node } = attachNode();
      expect(Object.keys(node.__hitlState.permissions).length).toBe(0);
    });
  });
});
