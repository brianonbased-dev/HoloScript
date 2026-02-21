import { describe, it, expect, vi } from 'vitest';
import { goalOrientedHandler } from '../GoalOrientedTrait';
type GOAPConfig = NonNullable<Parameters<typeof goalOrientedHandler.onAttach>[1]>;
function mkCfg(o: Partial<GOAPConfig> = {}): GOAPConfig { return { ...goalOrientedHandler.defaultConfig!, ...o }; }
function mkNode(id = 'goap-node') { return { id } as any; }
function mkCtx() { const e: any[] = []; return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any }; }
function attach(cfg: GOAPConfig, node = mkNode(), ctx = mkCtx()) {
  goalOrientedHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

// Simple GOAP world used in multiple tests
const actions = [
  { name: 'find_food', cost: 1, preconditions: { hungry: true }, effects: { has_food: true } },
  { name: 'eat_food',  cost: 1, preconditions: { has_food: true }, effects: { hungry: false, has_food: false } },
];
const goals = [
  { name: 'satiate', priority: 10, desiredState: { hungry: false } },
];

describe('goalOrientedHandler — defaultConfig', () => {
  it('goals = []', () => expect(goalOrientedHandler.defaultConfig?.goals).toHaveLength(0));
  it('actions = []', () => expect(goalOrientedHandler.defaultConfig?.actions).toHaveLength(0));
  it('replan_interval = 5000', () => expect(goalOrientedHandler.defaultConfig?.replan_interval).toBe(5000));
  it('max_plan_depth = 10', () => expect(goalOrientedHandler.defaultConfig?.max_plan_depth).toBe(10));
});

describe('goalOrientedHandler — onAttach', () => {
  it('creates __goalOrientedState', () => {
    const { node } = attach(mkCfg({ goals: [], actions: [], initial_state: {} }));
    expect((node as any).__goalOrientedState).toBeDefined();
  });
  it('worldState = initial_state copy', () => {
    const { node } = attach(mkCfg({ initial_state: { hp: 100 }, goals: [], actions: [] }));
    expect((node as any).__goalOrientedState.worldState.hp).toBe(100);
  });
  it('plans on attach when goals+actions provided', () => {
    const { node, ctx } = attach(mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false } }));
    // goap_plan_created should have been emitted during attach
    const ev = ctx.emitted.find((e: any) => e.type === 'goap_plan_created') ?? undefined;
    // emit was cleared, so check via node state
    expect((node as any).__goalOrientedState.plan.length).toBeGreaterThan(0);
  });
  it('isExecuting = true after plan found', () => {
    const { node } = attach(mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false } }));
    expect((node as any).__goalOrientedState.isExecuting).toBe(true);
  });
});

describe('goalOrientedHandler — onDetach', () => {
  it('removes __goalOrientedState', () => {
    const cfg = mkCfg({ goals: [], actions: [], initial_state: {} });
    const { node, ctx } = attach(cfg);
    goalOrientedHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__goalOrientedState).toBeUndefined();
  });
});

describe('goalOrientedHandler — plan creation', () => {
  it('emits goap_plan_created with correct action sequence', () => {
    const node = mkNode(); const ctx = mkCtx();
    const cfg = mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false } });
    goalOrientedHandler.onAttach!(node, cfg, ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'goap_plan_created');
    expect(ev?.payload.actions).toEqual(['find_food', 'eat_food']);
  });
  it('emits goap_plan_failed when no plan possible', () => {
    const node = mkNode(); const ctx = mkCtx();
    // Goal requires 'flying:true' but no action provides it
    const cfg = mkCfg({
      goals: [{ name: 'fly', priority: 10, desiredState: { flying: true } }],
      actions: [],
      initial_state: { flying: false },
    });
    goalOrientedHandler.onAttach!(node, cfg, ctx as any);
    expect(ctx.emitted.find((e: any) => e.type === 'goap_plan_failed')).toBeDefined();
  });
  it('currentGoal is highest priority', () => {
    const goalsTwo = [
      { name: 'low', priority: 1, desiredState: { a: true } },
      { name: 'high', priority: 50, desiredState: { b: true } },
    ];
    const actionsTwo = [
      { name: 'get_a', cost: 1, preconditions: {}, effects: { a: true } },
      { name: 'get_b', cost: 1, preconditions: {}, effects: { b: true } },
    ];
    const node = mkNode(); const ctx = mkCtx();
    goalOrientedHandler.onAttach!(node, mkCfg({ goals: goalsTwo, actions: actionsTwo, initial_state: {} }), ctx as any);
    expect((node as any).__goalOrientedState.currentGoal?.name).toBe('high');
  });
});

describe('goalOrientedHandler — onUpdate (action execution)', () => {
  it('emits goap_action_complete after action duration', () => {
    const cfg = mkCfg({ goals, actions: [{ name: 'do_it', cost: 1, preconditions: {}, effects: { hungry: false }, duration: 1 }], initial_state: { hungry: true } });
    const goals2 = [{ name: 'not_hungry', priority: 10, desiredState: { hungry: false } }];
    const cfg2 = mkCfg({ goals: goals2, actions: [{ name: 'do_it', cost: 1, preconditions: {}, effects: { hungry: false }, duration: 1 }], initial_state: { hungry: true } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onUpdate!(node, cfg2, ctx as any, 1.5); // delta 1.5 > duration 1
    expect(ctx.emitted.some((e: any) => e.type === 'goap_action_complete')).toBe(true);
  });
  it('applies action effects to worldState', () => {
    const actions2 = [{ name: 'get_water', cost: 1, preconditions: {}, effects: { has_water: true }, duration: 1 }];
    const goals2 = [{ name: 'get_water_goal', priority: 10, desiredState: { has_water: true } }];
    const cfg2 = mkCfg({ goals: goals2, actions: actions2, initial_state: { has_water: false } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onUpdate!(node, cfg2, ctx as any, 1.5);
    expect((node as any).__goalOrientedState.worldState.has_water).toBe(true);
  });
  it('emits goap_goal_complete when all actions done', () => {
    const actions2 = [{ name: 'final_act', cost: 1, preconditions: {}, effects: { done: true }, duration: 0.5 }];
    const goals2 = [{ name: 'finish', priority: 10, desiredState: { done: true } }];
    const cfg2 = mkCfg({ goals: goals2, actions: actions2, initial_state: { done: false } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onUpdate!(node, cfg2, ctx as any, 1.0);
    expect(ctx.emitted.some((e: any) => e.type === 'goap_goal_complete')).toBe(true);
  });
  it('triggers replan after replan_interval', () => {
    const cfg2 = mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false }, replan_interval: 1000 });
    const { node, ctx } = attach(cfg2, mkNode(), mkCtx());
    // advance replanTimer by multiplying many tiny deltas × 1000 = 1s > 1000ms (values are in ms)
    (node as any).__goalOrientedState.replanTimer = 900;
    goalOrientedHandler.onUpdate!(node, cfg2, ctx as any, 0.2); // 0.2*1000 = 200ms, total=1100 > 1000
    // replan occurs, plan recreated
    expect((node as any).__goalOrientedState.replanTimer).toBeLessThan(1000);
  });
});

describe('goalOrientedHandler — onEvent', () => {
  it('goap_set_state updates worldState and replans', () => {
    const cfg2 = mkCfg({ goals, actions, initial_state: { hungry: false, has_food: false } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onEvent!(node, cfg2, ctx as any, { type: 'goap_set_state', state: { hungry: true } } as any);
    expect((node as any).__goalOrientedState.worldState.hungry).toBe(true);
  });
  it('goap_add_goal adds and replans', () => {
    const cfg2 = mkCfg({ goals: [], actions, initial_state: { hungry: true, has_food: false } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onEvent!(node, cfg2, ctx as any, { type: 'goap_add_goal', goal: { name: 'new_goal', priority: 50, desiredState: { hungry: false } } } as any);
    expect(cfg2.goals).toHaveLength(1);
  });
  it('goap_cancel stops execution', () => {
    const cfg2 = mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false } });
    const { node, ctx } = attach(cfg2);
    goalOrientedHandler.onEvent!(node, cfg2, ctx as any, { type: 'goap_cancel' } as any);
    expect((node as any).__goalOrientedState.isExecuting).toBe(false);
    expect(ctx.emitted.some((e: any) => e.type === 'goap_cancelled')).toBe(true);
  });
  it('no-op on unknown event', () => {
    const cfg2 = mkCfg({ goals: [], actions: [], initial_state: {} });
    const { node, ctx } = attach(cfg2);
    expect(() => goalOrientedHandler.onEvent!(node, cfg2, ctx as any, { type: 'unknown' } as any)).not.toThrow();
  });
});

describe('GOAP planner — multi-step planning', () => {
  it('finds 2-action plan for hungry world state', () => {
    const node = mkNode(); const ctx = mkCtx();
    const cfg2 = mkCfg({ goals, actions, initial_state: { hungry: true, has_food: false } });
    goalOrientedHandler.onAttach!(node, cfg2, ctx as any);
    const state = (node as any).__goalOrientedState;
    expect(state.plan).toHaveLength(2);
    expect(state.plan[0].name).toBe('find_food');
    expect(state.plan[1].name).toBe('eat_food');
  });
  it('uses cheapest path (cost-based A*)', () => {
    const cheapActions = [
      { name: 'cheap_path', cost: 1, preconditions: {}, effects: { goal_met: true } },
      { name: 'expensive_path', cost: 10, preconditions: {}, effects: { goal_met: true } },
    ];
    const g = [{ name: 'achieve', priority: 10, desiredState: { goal_met: true } }];
    const node = mkNode(); const ctx = mkCtx();
    goalOrientedHandler.onAttach!(node, mkCfg({ goals: g, actions: cheapActions, initial_state: {} }), ctx as any);
    const state = (node as any).__goalOrientedState;
    expect(state.plan[0].name).toBe('cheap_path');
  });
  it('no plan when already in goal state', () => {
    const node = mkNode(); const ctx = mkCtx();
    goalOrientedHandler.onAttach!(node, mkCfg({ goals, actions, initial_state: { hungry: false } }), ctx as any);
    // Goal already satisfied — no plan needed
    expect((node as any).__goalOrientedState.plan).toHaveLength(0);
  });
});
