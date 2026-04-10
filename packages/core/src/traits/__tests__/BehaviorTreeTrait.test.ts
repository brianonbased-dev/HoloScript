import { describe, it, expect, beforeEach } from 'vitest';
import { behaviorTreeHandler } from '../BehaviorTreeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('BehaviorTreeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('bt-agent');
    ctx = createMockContext();
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  describe('lifecycle', () => {
    it('attaches with default config', () => {
      attachTrait(behaviorTreeHandler, node, {}, ctx);
      expect((node as any).__behaviorTreeState).toBeDefined();
      expect(getEventCount(ctx, 'bt_started')).toBe(1);
    });

    it('detaches and cleans state', () => {
      attachTrait(behaviorTreeHandler, node, {}, ctx);
      behaviorTreeHandler.onDetach?.(node as any, behaviorTreeHandler.defaultConfig, ctx as any);
      expect((node as any).__behaviorTreeState).toBeUndefined();
    });
  });

  // ===========================================================================
  // Sequence Node
  // ===========================================================================
  describe('sequence', () => {
    it('succeeds when all children succeed', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            { type: 'action' as const, action: 'set:key1:true' },
            { type: 'action' as const, action: 'set:key2:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.key1).toBe(true);
      expect(state.blackboard.key2).toBe(true);
    });

    it('fails and stops on first child failure', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            { type: 'condition' as const, condition: 'nonexistent' }, // fails
            { type: 'action' as const, action: 'set:reached:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.reached).toBeUndefined();
    });
  });

  // ===========================================================================
  // Selector Node
  // ===========================================================================
  describe('selector', () => {
    it('succeeds on first successful child', () => {
      const config = {
        root: {
          type: 'selector' as const,
          children: [
            { type: 'condition' as const, condition: 'nonexistent' }, // fails
            { type: 'action' as const, action: 'set:selected:yes' }, // succeeds
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.selected).toBe('yes');
    });
  });

  // ===========================================================================
  // Condition Node
  // ===========================================================================
  describe('condition', () => {
    it('succeeds when blackboard key is truthy', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            { type: 'action' as const, action: 'set:ready:true' },
            { type: 'condition' as const, condition: 'ready' },
            { type: 'action' as const, action: 'set:passed:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.passed).toBe(true);
    });

    it('handles negated condition with !', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            { type: 'condition' as const, condition: '!nonexistent' }, // !undefined = true
            { type: 'action' as const, action: 'set:negated:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.negated).toBe(true);
    });
  });

  // ===========================================================================
  // Inverter Node
  // ===========================================================================
  describe('inverter', () => {
    it('inverts success to failure', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            {
              type: 'inverter' as const,
              children: [{ type: 'action' as const, action: 'set:x:1' }], // success
            },
            // Sequence fails here because inverter returns failure
            { type: 'action' as const, action: 'set:unreached:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.unreached).toBeUndefined();
    });
  });

  // ===========================================================================
  // Wait Node
  // ===========================================================================
  describe('wait', () => {
    it('returns running until duration elapsed', () => {
      const config = {
        root: {
          type: 'sequence' as const,
          children: [
            { type: 'wait' as const, duration: 1.0 },
            { type: 'action' as const, action: 'set:waited:true' },
          ],
        },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);

      // First update — wait is running
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.5);
      let state = (node as any).__behaviorTreeState;
      expect(state.blackboard.waited).toBeUndefined();

      // Second update — wait completes
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.6);
      state = (node as any).__behaviorTreeState;
      expect(state.blackboard.waited).toBe(true);
    });
  });

  // ===========================================================================
  // Events
  // ===========================================================================
  describe('events', () => {
    it('bt_set_blackboard updates blackboard', () => {
      attachTrait(behaviorTreeHandler, node, {}, ctx);
      sendEvent(behaviorTreeHandler, node, {}, ctx, {
        type: 'bt_set_blackboard',
        values: { health: 100, name: 'hero' },
      });

      const state = (node as any).__behaviorTreeState;
      expect(state.blackboard.health).toBe(100);
      expect(state.blackboard.name).toBe('hero');
    });

    it('bt_pause stops execution', () => {
      attachTrait(behaviorTreeHandler, node, {}, ctx);
      sendEvent(behaviorTreeHandler, node, {}, ctx, { type: 'bt_pause' });

      const state = (node as any).__behaviorTreeState;
      expect(state.isRunning).toBe(false);
    });

    it('bt_resume restarts execution', () => {
      attachTrait(behaviorTreeHandler, node, {}, ctx);
      sendEvent(behaviorTreeHandler, node, {}, ctx, { type: 'bt_pause' });
      sendEvent(behaviorTreeHandler, node, {}, ctx, { type: 'bt_resume' });

      const state = (node as any).__behaviorTreeState;
      expect(state.isRunning).toBe(true);
    });

    it('bt_reset clears tree state', () => {
      const config = {
        root: { type: 'action' as const, action: 'set:x:1' },
        tick_rate: 100,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      sendEvent(behaviorTreeHandler, node, config, ctx, { type: 'bt_reset' });
      const state = (node as any).__behaviorTreeState;
      expect(state.nodeStates.size).toBe(0);
      expect(state.status).toBe('running');
    });

    it('action nodes dispatch action:<name> and wait for action:result', () => {
      const config = {
        root: { type: 'action' as const, action: 'diagnose', params: { target: 'core' } },
        tick_rate: 100,
        restart_on_complete: false,
      };

      attachTrait(behaviorTreeHandler, node, config, ctx);

      // First tick dispatches and stays running.
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);
      expect(getEventCount(ctx, 'action:diagnose')).toBe(1);
      expect(getEventCount(ctx, 'bt_complete')).toBe(0);

      const actionPayload = getLastEvent(ctx, 'action:diagnose') as Record<string, unknown>;
      expect(typeof actionPayload.requestId).toBe('string');
      expect(actionPayload.params).toEqual({ target: 'core' });

      // Action result arrives asynchronously.
      sendEvent(behaviorTreeHandler, node, config, ctx, {
        type: 'action:result',
        requestId: actionPayload.requestId,
        status: 'success',
      });

      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);
      expect(getEventCount(ctx, 'bt_complete')).toBe(1);

      const done = getLastEvent(ctx, 'bt_complete') as Record<string, unknown>;
      expect(done.status).toBe('success');
    });
  });

  // ===========================================================================
  // Completion
  // ===========================================================================
  describe('completion', () => {
    it('emits bt_complete when tree finishes', () => {
      const config = {
        root: { type: 'action' as const, action: 'set:done:true' },
        tick_rate: 100,
        restart_on_complete: false,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      expect(getEventCount(ctx, 'bt_complete')).toBe(1);
      const state = (node as any).__behaviorTreeState;
      expect(state.isRunning).toBe(false);
    });

    it('restarts when restart_on_complete is true', () => {
      const config = {
        root: { type: 'action' as const, action: 'set:x:1' },
        tick_rate: 100,
        restart_on_complete: true,
      };
      attachTrait(behaviorTreeHandler, node, config, ctx);
      updateTrait(behaviorTreeHandler, node, config, ctx, 0.1);

      const state = (node as any).__behaviorTreeState;
      expect(state.isRunning).toBe(true);
      expect(state.status).toBe('running');
    });
  });
});
