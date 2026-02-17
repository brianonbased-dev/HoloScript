import { describe, it, expect, beforeEach } from 'vitest';
import { goalOrientedHandler } from '../GoalOrientedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('GoalOrientedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  const woodcutterConfig = {
    goals: [
      { name: 'get_wood', priority: 10, desiredState: { hasWood: true } },
    ],
    actions: [
      {
        name: 'chop_tree',
        cost: 1,
        preconditions: { hasAxe: true },
        effects: { hasWood: true },
        duration: 0.5,
      },
      {
        name: 'get_axe',
        cost: 1,
        preconditions: {},
        effects: { hasAxe: true },
        duration: 0.3,
      },
    ],
    initial_state: { hasAxe: false, hasWood: false },
    replan_interval: 10000,
    max_plan_depth: 10,
  };

  beforeEach(() => {
    node = createMockNode('goap-agent');
    ctx = createMockContext();
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  describe('lifecycle', () => {
    it('attaches and creates plan on initialization', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      expect((node as any).__goalOrientedState).toBeDefined();
      expect(getEventCount(ctx, 'goap_plan_created')).toBe(1);
    });

    it('creates a plan with correct action sequence', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      const event = getLastEvent(ctx, 'goap_plan_created') as any;
      // Should plan: get_axe → chop_tree
      expect(event.actions).toEqual(['get_axe', 'chop_tree']);
    });

    it('detaches and cleans state', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      goalOrientedHandler.onDetach?.(node as any, goalOrientedHandler.defaultConfig, ctx as any);
      expect((node as any).__goalOrientedState).toBeUndefined();
    });
  });

  // ===========================================================================
  // Plan Execution
  // ===========================================================================
  describe('plan execution', () => {
    it('executes actions over time', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      ctx.clearEvents();

      // Execute get_axe (duration 0.3)
      updateTrait(goalOrientedHandler, node, woodcutterConfig, ctx, 0.4);
      expect(getEventCount(ctx, 'goap_action_complete')).toBe(1);
      const action1 = getLastEvent(ctx, 'goap_action_complete') as any;
      expect(action1.action).toBe('get_axe');
    });

    it('completes goal after all actions execute', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      ctx.clearEvents();

      // Execute get_axe (duration 0.3) + chop_tree (duration 0.5)
      updateTrait(goalOrientedHandler, node, woodcutterConfig, ctx, 0.4); // get_axe completes
      updateTrait(goalOrientedHandler, node, woodcutterConfig, ctx, 0.6); // chop_tree completes

      expect(getEventCount(ctx, 'goap_goal_complete')).toBe(1);
      const goalEvent = getLastEvent(ctx, 'goap_goal_complete') as any;
      expect(goalEvent.goal).toBe('get_wood');
    });
  });

  // ===========================================================================
  // No Plan Available
  // ===========================================================================
  describe('no plan', () => {
    it('emits goap_plan_failed for impossible goals', () => {
      const impossible = {
        ...woodcutterConfig,
        actions: [], // No actions available
      };
      attachTrait(goalOrientedHandler, node, impossible, ctx);
      expect(getEventCount(ctx, 'goap_plan_failed')).toBe(1);
    });

    it('handles no goals gracefully', () => {
      attachTrait(goalOrientedHandler, node, {
        goals: [],
        actions: [],
        initial_state: {},
        replan_interval: 1000,
        max_plan_depth: 5,
      }, ctx);

      // No plan created, no error
      expect(getEventCount(ctx, 'goap_plan_created')).toBe(0);
      expect(getEventCount(ctx, 'goap_plan_failed')).toBe(0);
    });
  });

  // ===========================================================================
  // Events
  // ===========================================================================
  describe('events', () => {
    it('goap_set_state updates world state and replans', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      ctx.clearEvents();

      sendEvent(goalOrientedHandler, node, woodcutterConfig, ctx, {
        type: 'goap_set_state',
        state: { hasAxe: true },
      });

      // Should replan — now only needs chop_tree
      const planEvent = getLastEvent(ctx, 'goap_plan_created') as any;
      expect(planEvent.actions).toEqual(['chop_tree']);
    });

    it('goap_cancel stops execution', () => {
      attachTrait(goalOrientedHandler, node, woodcutterConfig, ctx);
      sendEvent(goalOrientedHandler, node, woodcutterConfig, ctx, {
        type: 'goap_cancel',
      });

      expect(getEventCount(ctx, 'goap_cancelled')).toBe(1);
      const state = (node as any).__goalOrientedState;
      expect(state.isExecuting).toBe(false);
    });

    it('goap_add_goal adds a goal and replans', () => {
      attachTrait(goalOrientedHandler, node, {
        ...woodcutterConfig,
        goals: [],
      }, ctx);
      ctx.clearEvents();

      sendEvent(goalOrientedHandler, node, woodcutterConfig, ctx, {
        type: 'goap_add_goal',
        goal: { name: 'get_wood', priority: 5, desiredState: { hasWood: true } },
      });

      expect(getEventCount(ctx, 'goap_plan_created')).toBe(1);
    });
  });

  // ===========================================================================
  // Goal Priority
  // ===========================================================================
  describe('goal priority', () => {
    it('selects highest priority goal', () => {
      const multiGoal = {
        ...woodcutterConfig,
        goals: [
          { name: 'get_wood', priority: 5, desiredState: { hasWood: true } },
          { name: 'get_food', priority: 10, desiredState: { hasFood: true } },
        ],
        actions: [
          ...woodcutterConfig.actions,
          { name: 'forage', cost: 1, preconditions: {}, effects: { hasFood: true } },
        ],
      };
      attachTrait(goalOrientedHandler, node, multiGoal, ctx);
      const planEvent = getLastEvent(ctx, 'goap_plan_created') as any;
      expect(planEvent.goal).toBe('get_food');
    });

    it('skips already-satisfied goals', () => {
      const satisfied = {
        ...woodcutterConfig,
        initial_state: { hasAxe: false, hasWood: true },
      };
      attachTrait(goalOrientedHandler, node, satisfied, ctx);
      // Goal already met — no plan
      expect(getEventCount(ctx, 'goap_plan_created')).toBe(0);
    });
  });
});
