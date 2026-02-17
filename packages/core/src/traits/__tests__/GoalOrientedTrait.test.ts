import { describe, it, expect, beforeEach } from 'vitest';
import { goalOrientedHandler } from '../GoalOrientedTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('GoalOrientedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    goals: [
      { name: 'get_wood', priority: 1, desiredState: { has_wood: true } },
    ],
    actions: [
      { name: 'chop_tree', cost: 1, preconditions: { near_tree: true }, effects: { has_wood: true }, duration: 1 },
    ],
    initial_state: { near_tree: true, has_wood: false },
    replan_interval: 5000,
    max_plan_depth: 10,
  };

  beforeEach(() => {
    node = createMockNode('goap');
    ctx = createMockContext();
    attachTrait(goalOrientedHandler, node, cfg, ctx);
  });

  it('creates plan on attach', () => {
    expect(getEventCount(ctx, 'goap_plan_created')).toBe(1);
    expect((node as any).__goalOrientedState.isExecuting).toBe(true);
    expect((node as any).__goalOrientedState.plan.length).toBe(1);
  });

  it('executes action and completes goal', () => {
    // Run enough delta to exceed duration (1s)
    updateTrait(goalOrientedHandler, node, cfg, ctx, 1.1);
    expect(getEventCount(ctx, 'goap_action_complete')).toBe(1);
    expect(getEventCount(ctx, 'goap_goal_complete')).toBe(1);
    expect((node as any).__goalOrientedState.worldState.has_wood).toBe(true);
  });

  it('replans on state change', () => {
    sendEvent(goalOrientedHandler, node, cfg, ctx, {
      type: 'goap_set_state',
      state: { has_wood: true },
    });
    // Goal already met, no new plan needed
    const s = (node as any).__goalOrientedState;
    expect(s.plan.length).toBe(0);
  });

  it('cancel stops execution', () => {
    sendEvent(goalOrientedHandler, node, cfg, ctx, { type: 'goap_cancel' });
    expect((node as any).__goalOrientedState.isExecuting).toBe(false);
    expect(getEventCount(ctx, 'goap_cancelled')).toBe(1);
  });

  it('fails when no actions satisfy preconditions', () => {
    const n = createMockNode('goap2');
    const c = createMockContext();
    attachTrait(goalOrientedHandler, n, {
      ...cfg,
      initial_state: { near_tree: false, has_wood: false },
    }, c);
    expect(getEventCount(c, 'goap_plan_failed')).toBe(1);
  });

  it('add goal triggers replan', () => {
    sendEvent(goalOrientedHandler, node, cfg, ctx, {
      type: 'goap_add_goal',
      goal: { name: 'build_house', priority: 2, desiredState: { house_built: true } },
    });
    // Will try to plan, likely fail (no action), but should attempt
    const totalPlanEvents = getEventCount(ctx, 'goap_plan_created') + getEventCount(ctx, 'goap_plan_failed');
    expect(totalPlanEvents).toBeGreaterThanOrEqual(2);
  });

  it('detach cleans up', () => {
    goalOrientedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__goalOrientedState).toBeUndefined();
  });
});
