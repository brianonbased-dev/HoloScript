import { describe, it, expect, beforeEach } from 'vitest';
import { goalOrientedHandler } from '../GoalOrientedTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('GoalOrientedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  const cfg = {
    goals: [
      { name: 'eat', priority: 1, desiredState: { hungry: false } },
    ],
    actions: [
      { name: 'find_food', cost: 1, preconditions: { hungry: true }, effects: { hasFood: true }, duration: 1 },
      { name: 'eat_food', cost: 1, preconditions: { hasFood: true }, effects: { hungry: false }, duration: 1 },
    ],
    initial_state: { hungry: true, hasFood: false } as Record<string, number | boolean | string>,
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
  });

  it('plan has correct actions', () => {
    const state = (node as any).__goalOrientedState;
    expect(state.plan).toHaveLength(2);
    expect(state.plan[0].name).toBe('find_food');
    expect(state.plan[1].name).toBe('eat_food');
  });

  it('executing actions applies effects on duration', () => {
    // First action duration = 1
    updateTrait(goalOrientedHandler, node, cfg, ctx, 1.1);
    expect(getEventCount(ctx, 'goap_action_complete')).toBe(1);
    const state = (node as any).__goalOrientedState;
    expect(state.worldState.hasFood).toBe(true);
  });

  it('completes full plan', () => {
    updateTrait(goalOrientedHandler, node, cfg, ctx, 1.1); // find_food
    updateTrait(goalOrientedHandler, node, cfg, ctx, 1.1); // eat_food
    expect(getEventCount(ctx, 'goap_goal_complete')).toBe(1);
    expect((node as any).__goalOrientedState.worldState.hungry).toBe(false);
  });

  it('no plan when goal already satisfied', () => {
    const n = createMockNode('g2');
    const c = createMockContext();
    const satisfiedCfg = { ...cfg, initial_state: { hungry: false, hasFood: false } };
    attachTrait(goalOrientedHandler, n, satisfiedCfg, c);
    expect(getEventCount(c, 'goap_plan_created')).toBe(0);
    expect((n as any).__goalOrientedState.isExecuting).toBe(false);
  });

  it('goap_set_state triggers replan', () => {
    sendEvent(goalOrientedHandler, node, cfg, ctx, {
      type: 'goap_set_state',
      state: { hungry: false },
    });
    // After setting hungry=false, goal is satisfied and isExecuting should be false
    expect((node as any).__goalOrientedState.worldState.hungry).toBe(false);
  });

  it('goap_cancel stops execution', () => {
    sendEvent(goalOrientedHandler, node, cfg, ctx, { type: 'goap_cancel' });
    expect((node as any).__goalOrientedState.isExecuting).toBe(false);
    expect(getEventCount(ctx, 'goap_cancelled')).toBe(1);
  });

  it('plan_failed when no valid actions', () => {
    const impossible = {
      ...cfg,
      actions: [],
    };
    const n = createMockNode('g3');
    const c = createMockContext();
    attachTrait(goalOrientedHandler, n, impossible, c);
    expect(getEventCount(c, 'goap_plan_failed')).toBe(1);
  });

  it('detach cleans up', () => {
    goalOrientedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__goalOrientedState).toBeUndefined();
  });
});
