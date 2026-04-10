/**
 * HITLTrait Tests
 *
 * Tests for Human-in-the-Loop approval workflows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { hitlHandler } from '../HITLTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('HITLTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('hitl-agent');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(hitlHandler.defaultConfig.mode).toBe('supervised');
      expect(hitlHandler.defaultConfig.confidence_threshold).toBe(0.8);
      expect(hitlHandler.defaultConfig.risk_threshold).toBe(0.5);
      expect(hitlHandler.defaultConfig.enable_audit_log).toBe(true);
      expect(hitlHandler.defaultConfig.enable_rollback).toBe(true);
    });

    it('should attach and initialize state', () => {
      attachTrait(hitlHandler, node, {}, ctx);

      const state = (node as any).__hitlState;
      expect(state).toBeDefined();
      expect(state.isEnabled).toBe(true);
      expect(state.currentMode).toBe('supervised');
      expect(state.pendingApprovals).toEqual([]);
      expect(state.auditLog).toEqual([]);
      expect(state.rollbackCheckpoints).toEqual([]);
    });

    it('should emit hitl_initialized event', () => {
      attachTrait(hitlHandler, node, { mode: 'autonomous' }, ctx);

      expect(getEventCount(ctx, 'hitl_initialized')).toBe(1);
      const event = getLastEvent(ctx, 'hitl_initialized');
      expect(event.mode).toBe('autonomous');
    });
  });

  describe('operating modes', () => {
    it('should support autonomous mode', () => {
      attachTrait(hitlHandler, node, { mode: 'autonomous' }, ctx);

      const state = (node as any).__hitlState;
      expect(state.currentMode).toBe('autonomous');
    });

    it('should support supervised mode', () => {
      attachTrait(hitlHandler, node, { mode: 'supervised' }, ctx);

      const state = (node as any).__hitlState;
      expect(state.currentMode).toBe('supervised');
    });

    it('should support manual mode', () => {
      attachTrait(hitlHandler, node, { mode: 'manual' }, ctx);

      const state = (node as any).__hitlState;
      expect(state.currentMode).toBe('manual');
    });
  });

  describe('action approval - autonomous', () => {
    beforeEach(() => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'autonomous',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: [],
          never_approve_categories: ['read'],
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should auto-approve high confidence, low risk actions', () => {
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'autonomous',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: [],
          never_approve_categories: ['read'],
        },
        ctx,
        {
          type: 'agent_action_request',
          payload: {
            action: 'update_scene',
            category: 'write',
            confidence: 0.95,
            riskScore: 0.2,
            description: 'Update scene lighting',
            metadata: {},
          },
        }
      );

      expect(getEventCount(ctx, 'hitl_action_approved')).toBe(1);
      const event = getLastEvent(ctx, 'hitl_action_approved');
      expect(event.autonomous).toBe(true);
    });

    it('should increment action count on approval', () => {
      const config = {
        mode: 'autonomous' as const,
        confidence_threshold: 0.8,
        risk_threshold: 0.5,
        always_approve_categories: [] as any[],
        never_approve_categories: ['read'] as any[],
      };

      attachTrait(hitlHandler, node, config, ctx);
      ctx.clearEvents();

      sendEvent(hitlHandler, node, config, ctx, {
        type: 'agent_action_request',
        payload: {
          action: 'update_scene',
          category: 'write',
          confidence: 0.95,
          riskScore: 0.2,
          description: 'Update scene',
          metadata: {},
        },
      });

      const state = (node as any).__hitlState;
      expect(state.actionCountThisSession).toBeGreaterThan(0);
    });
  });

  describe('action approval - requires human', () => {
    beforeEach(() => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'supervised',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: ['financial', 'admin'],
          never_approve_categories: [],
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should require approval for always_approve categories', () => {
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'supervised',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: ['financial', 'admin'],
          never_approve_categories: [],
        },
        ctx,
        {
          type: 'agent_action_request',
          payload: {
            action: 'transfer_funds',
            category: 'financial',
            confidence: 0.99,
            riskScore: 0.1,
            description: 'Transfer funds',
            metadata: {},
          },
        }
      );

      expect(getEventCount(ctx, 'hitl_approval_required')).toBe(1);
    });

    it('should require approval for low confidence actions', () => {
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'supervised',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: [],
          never_approve_categories: [],
        },
        ctx,
        {
          type: 'agent_action_request',
          payload: {
            action: 'risky_action',
            category: 'execute',
            confidence: 0.3,
            riskScore: 0.2,
            description: 'Low confidence action',
            metadata: {},
          },
        }
      );

      expect(getEventCount(ctx, 'hitl_approval_required')).toBe(1);
    });

    it('should require approval for high risk actions', () => {
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'supervised',
          confidence_threshold: 0.8,
          risk_threshold: 0.5,
          always_approve_categories: [],
          never_approve_categories: [],
        },
        ctx,
        {
          type: 'agent_action_request',
          payload: {
            action: 'dangerous_action',
            category: 'execute',
            confidence: 0.9,
            riskScore: 0.9,
            description: 'High risk action',
            metadata: {},
          },
        }
      );

      expect(getEventCount(ctx, 'hitl_approval_required')).toBe(1);
    });
  });

  describe('operator approval flow', () => {
    beforeEach(() => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approved_operators: ['operator1', 'operator2'],
        },
        ctx
      );
      ctx.clearEvents();

      // Trigger an action that requires approval
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approved_operators: ['operator1', 'operator2'],
        },
        ctx,
        {
          type: 'agent_action_request',
          payload: {
            action: 'test_action',
            category: 'write',
            confidence: 0.5,
            riskScore: 0.5,
            description: 'Test',
            metadata: {},
          },
        }
      );
    });

    it('should create pending approval', () => {
      const state = (node as any).__hitlState;
      expect(state.pendingApprovals.length).toBeGreaterThan(0);
    });

    it('should reject unauthorized operator', () => {
      const state = (node as any).__hitlState;
      const approvalId = state.pendingApprovals[0]?.id;

      ctx.clearEvents();
      sendEvent(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approved_operators: ['operator1', 'operator2'],
        },
        ctx,
        {
          type: 'operator_approval',
          payload: {
            approvalId,
            approved: true,
            operator: 'unauthorized_user',
          },
        }
      );

      expect(getEventCount(ctx, 'hitl_unauthorized_operator')).toBe(1);
    });
  });

  describe('approval timeout', () => {
    it('should expire approvals after timeout', () => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approval_timeout: 1000,
          auto_approve_on_timeout: false,
        },
        ctx
      );

      // Create a pending approval with past expiration
      const state = (node as any).__hitlState;
      state.pendingApprovals.push({
        id: 'test-approval',
        timestamp: Date.now() - 2000,
        agentId: 'test',
        action: 'test',
        category: 'write',
        description: 'test',
        confidence: 0.5,
        riskScore: 0.5,
        context: {},
        status: 'pending',
        expiresAt: Date.now() - 1000, // Already expired
        metadata: {},
      });

      ctx.clearEvents();
      updateTrait(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approval_timeout: 1000,
          auto_approve_on_timeout: false,
        },
        ctx,
        16
      );

      expect(getEventCount(ctx, 'hitl_approval_resolved')).toBe(1);
      const event = getLastEvent(ctx, 'hitl_approval_resolved');
      expect(event.approval.status).toBe('expired');
    });

    it('should auto-approve on timeout if configured', () => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approval_timeout: 1000,
          auto_approve_on_timeout: true,
        },
        ctx
      );

      const state = (node as any).__hitlState;
      state.pendingApprovals.push({
        id: 'test-approval',
        timestamp: Date.now() - 2000,
        agentId: 'test',
        action: 'test',
        category: 'write',
        description: 'test',
        confidence: 0.5,
        riskScore: 0.5,
        context: {},
        status: 'pending',
        expiresAt: Date.now() - 1000,
        metadata: {},
      });

      ctx.clearEvents();
      updateTrait(
        hitlHandler,
        node,
        {
          mode: 'manual',
          approval_timeout: 1000,
          auto_approve_on_timeout: true,
        },
        ctx,
        16
      );

      const event = getLastEvent(ctx, 'hitl_approval_resolved');
      expect(event.approval.status).toBe('auto_approved');
    });
  });

  describe('max autonomous actions limit', () => {
    it('should switch to supervised mode after max actions', () => {
      attachTrait(
        hitlHandler,
        node,
        {
          mode: 'autonomous',
          max_autonomous_actions: 2,
          confidence_threshold: 0.1,
          risk_threshold: 0.9,
        },
        ctx
      );

      const state = (node as any).__hitlState;
      state.actionCountThisSession = 100; // Already at limit

      ctx.clearEvents();
      updateTrait(
        hitlHandler,
        node,
        {
          mode: 'autonomous',
          max_autonomous_actions: 2,
          confidence_threshold: 0.1,
          risk_threshold: 0.9,
        },
        ctx,
        16
      );

      expect(getEventCount(ctx, 'hitl_mode_change')).toBe(1);
      expect(state.currentMode).toBe('supervised');
    });
  });

  describe('rollback checkpoints', () => {
    it('should clean expired rollback checkpoints', () => {
      attachTrait(
        hitlHandler,
        node,
        {
          enable_rollback: true,
          rollback_retention: 1000,
        },
        ctx
      );

      const state = (node as any).__hitlState;
      state.rollbackCheckpoints.push({
        id: 'expired-checkpoint',
        timestamp: Date.now() - 2000,
        agentId: 'test',
        action: 'test',
        stateBefore: {},
        canRollback: true,
        expiresAt: Date.now() - 1000, // Expired
      });

      updateTrait(
        hitlHandler,
        node,
        {
          enable_rollback: true,
          rollback_retention: 1000,
        },
        ctx,
        16
      );

      expect(state.rollbackCheckpoints.length).toBe(0);
    });
  });

  describe('detach', () => {
    it('should persist audit log on detach', () => {
      attachTrait(
        hitlHandler,
        node,
        {
          enable_audit_log: true,
        },
        ctx
      );

      const state = (node as any).__hitlState;
      state.auditLog.push({
        id: 'log-1',
        timestamp: Date.now(),
        agentId: 'test',
        action: 'test',
        decision: 'autonomous',
        confidence: 0.9,
        riskScore: 0.1,
        rollbackAvailable: false,
      });

      ctx.clearEvents();
      hitlHandler.onDetach?.(
        node as any,
        { ...hitlHandler.defaultConfig, enable_audit_log: true },
        ctx as any
      );

      expect(getEventCount(ctx, 'hitl_audit_persist')).toBe(1);
    });

    it('should clean up state on detach', () => {
      attachTrait(hitlHandler, node, {}, ctx);
      hitlHandler.onDetach?.(node as any, hitlHandler.defaultConfig, ctx as any);

      expect((node as any).__hitlState).toBeUndefined();
    });
  });
});
