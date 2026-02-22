/**
 * GoalOrientedTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { goalOrientedHandler } from '../GoalOrientedTrait';

function makeNode() { return { id: 'goap_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...goalOrientedHandler.defaultConfig!, ...cfg };
  goalOrientedHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('goalOrientedHandler.defaultConfig', () => {
  const d = goalOrientedHandler.defaultConfig!;
  it('goals=[]', () => expect(d.goals).toEqual([]));
  it('actions=[]', () => expect(d.actions).toEqual([]));
  it('initial_state={}', () => expect(d.initial_state).toEqual({}));
  it('replan_interval=5000', () => expect(d.replan_interval).toBe(5000));
  it('max_plan_depth=10', () => expect(d.max_plan_depth).toBe(10));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('goalOrientedHandler.onAttach', () => {
  it('creates __goalOrientedState', () => expect(attach().node.__goalOrientedState).toBeDefined());
  it('worldState cloned from initial_state', () => {
    const { node } = attach({ initial_state: { hp: 100, hasWeapon: true } });
    expect(node.__goalOrientedState.worldState.hp).toBe(100);
    expect(node.__goalOrientedState.worldState.hasWeapon).toBe(true);
  });
  it('currentGoal=null when no goals provided', () => {
    const { node } = attach({ goals: [], actions: [] });
    expect(node.__goalOrientedState.currentGoal).toBeNull();
  });
  it('replanTimer=0', () => expect(attach().node.__goalOrientedState.replanTimer).toBe(0));
  it('emits goap_plan_created when a plan is found on attach', () => {
    const { ctx } = attach({
      initial_state: { hasWeapon: false },
      goals: [{ name: 'arm', priority: 1, desiredState: { hasWeapon: true } }],
      actions: [{
        name: 'pickupWeapon',
        cost: 1,
        preconditions: {},
        effects: { hasWeapon: true },
        duration: 1,
      }],
    });
    expect(ctx.emit).toHaveBeenCalledWith('goap_plan_created', expect.objectContaining({ goal: 'arm' }));
  });
  it('emits goap_plan_failed when no action can reach goal', () => {
    const { ctx } = attach({
      initial_state: { hasWeapon: false },
      goals: [{ name: 'arm', priority: 1, desiredState: { hasWeapon: true } }],
      actions: [], // no actions available
    });
    expect(ctx.emit).toHaveBeenCalledWith('goap_plan_failed', expect.objectContaining({ goal: 'arm' }));
  });
  it('skips goal already satisfied by initial_state', () => {
    const { node, ctx } = attach({
      initial_state: { hasWeapon: true },
      goals: [{ name: 'arm', priority: 1, desiredState: { hasWeapon: true } }],
      actions: [],
    });
    // Goal already satisfied — no plan needed, no currentGoal
    expect(node.__goalOrientedState.currentGoal).toBeNull();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('goalOrientedHandler.onDetach', () => {
  it('removes __goalOrientedState', () => {
    const { node, config, ctx } = attach();
    goalOrientedHandler.onDetach!(node, config, ctx);
    expect(node.__goalOrientedState).toBeUndefined();
  });
});

// ─── onUpdate — replan timer ──────────────────────────────────────────────────

describe('goalOrientedHandler.onUpdate — replan timer', () => {
  it('accumulates replanTimer in ms (delta * 1000)', () => {
    const { node, config, ctx } = attach({ replan_interval: 5000 });
    // 1s = 1000ms, interval is 5000ms — NOT yet reached, timer accumulates at 1000
    goalOrientedHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__goalOrientedState.replanTimer).toBeCloseTo(1000);
  });

  it('does not tick before replan_interval', () => {
    const { node, config, ctx } = attach({ replan_interval: 5000 });
    goalOrientedHandler.onUpdate!(node, config, ctx, 0.1); // 100ms
    expect(node.__goalOrientedState.replanTimer).toBeCloseTo(100);
  });
});

// ─── onUpdate — action execution ─────────────────────────────────────────────

describe('goalOrientedHandler.onUpdate — action execution', () => {
  function setupExecuting() {
    const cfg = {
      initial_state: { hasWeapon: false, atEnemy: false },
      goals: [{ name: 'kill', priority: 1, desiredState: { atEnemy: false, hasWeapon: true } }],
      actions: [
        { name: 'pickupWeapon', cost: 1, preconditions: {}, effects: { hasWeapon: true }, duration: 1 },
      ],
    };
    return attach(cfg);
  }

  it('starts executing plan on attach', () => {
    const { node } = setupExecuting();
    expect(node.__goalOrientedState.isExecuting).toBe(true);
  });

  it('applies action effects after duration', () => {
    const { node, config, ctx } = setupExecuting();
    // pickupWeapon has duration=1
    goalOrientedHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('goap_action_complete',
      expect.objectContaining({ action: 'pickupWeapon' })
    );
  });

  it('emits goap_goal_complete after all actions done', () => {
    const { node, config, ctx } = setupExecuting();
    goalOrientedHandler.onUpdate!(node, config, ctx, 2);
    expect(ctx.emit).toHaveBeenCalledWith('goap_goal_complete',
      expect.objectContaining({ goal: 'kill' })
    );
  });

  it('does not emit goap_action_complete before duration', () => {
    const { node, config, ctx } = setupExecuting();
    ctx.emit.mockClear();
    goalOrientedHandler.onUpdate!(node, config, ctx, 0.5);
    expect(ctx.emit).not.toHaveBeenCalledWith('goap_action_complete', expect.anything());
  });

  it('world state is updated after action completes', () => {
    const { node, config, ctx } = setupExecuting();
    goalOrientedHandler.onUpdate!(node, config, ctx, 2);
    expect(node.__goalOrientedState.worldState.hasWeapon).toBe(true);
  });
});

// ─── A* planner — multi-step ──────────────────────────────────────────────────

describe('goalOrientedHandler — A* multi-step plan', () => {
  it('finds a 2-step plan and executes first action', () => {
    const cfg = {
      initial_state: { hasKey: false, doorOpen: false },
      goals: [{ name: 'escape', priority: 1, desiredState: { doorOpen: true } }],
      actions: [
        { name: 'getKey', cost: 1, preconditions: {}, effects: { hasKey: true }, duration: 0.5 },
        { name: 'openDoor', cost: 1, preconditions: { hasKey: true }, effects: { doorOpen: true }, duration: 0.5 },
      ],
    };
    const { node, config, ctx } = attach(cfg);
    expect(node.__goalOrientedState.plan.length).toBe(2);
    expect(node.__goalOrientedState.plan[0].name).toBe('getKey');
    ctx.emit.mockClear();
    goalOrientedHandler.onUpdate!(node, config, ctx, 0.5);
    expect(ctx.emit).toHaveBeenCalledWith('goap_action_complete', expect.objectContaining({ action: 'getKey' }));
  });

  it('executes second action after first completes', () => {
    const cfg = {
      initial_state: { hasKey: false, doorOpen: false },
      goals: [{ name: 'escape', priority: 1, desiredState: { doorOpen: true } }],
      actions: [
        { name: 'getKey', cost: 1, preconditions: {}, effects: { hasKey: true }, duration: 0.5 },
        { name: 'openDoor', cost: 1, preconditions: { hasKey: true }, effects: { doorOpen: true }, duration: 0.5 },
      ],
    };
    const { node, config, ctx } = attach(cfg);
    goalOrientedHandler.onUpdate!(node, config, ctx, 0.5); // getKey completes
    ctx.emit.mockClear();
    goalOrientedHandler.onUpdate!(node, config, ctx, 0.5); // openDoor completes
    expect(ctx.emit).toHaveBeenCalledWith('goap_action_complete', expect.objectContaining({ action: 'openDoor' }));
  });

  it('chooses lower-cost action when two preconditions are met', () => {
    const cfg = {
      initial_state: { ready: false },
      goals: [{ name: 'go', priority: 1, desiredState: { ready: true } }],
      actions: [
        { name: 'expensive', cost: 10, preconditions: {}, effects: { ready: true }, duration: 1 },
        { name: 'cheap', cost: 1, preconditions: {}, effects: { ready: true }, duration: 1 },
      ],
    };
    const { node } = attach(cfg);
    expect(node.__goalOrientedState.plan[0].name).toBe('cheap');
  });
});

// ─── onEvent — goap_set_state ─────────────────────────────────────────────────

describe('goalOrientedHandler.onEvent — goap_set_state', () => {
  it('merges new state into worldState', () => {
    const { node, config, ctx } = attach({ initial_state: { hp: 50 } });
    goalOrientedHandler.onEvent!(node, config, ctx, { type: 'goap_set_state', state: { hp: 80, shield: true } });
    expect(node.__goalOrientedState.worldState.hp).toBe(80);
    expect(node.__goalOrientedState.worldState.shield).toBe(true);
  });

  it('triggers replan after state change', () => {
    const cfg = {
      initial_state: { hasWeapon: false },
      goals: [{ name: 'arm', priority: 1, desiredState: { hasWeapon: true } }],
      actions: [{ name: 'pickup', cost: 1, preconditions: {}, effects: { hasWeapon: true }, duration: 1 }],
    };
    const { node, config, ctx } = attach(cfg);
    // Manually corrupt state so we can see replan
    node.__goalOrientedState.worldState.hasWeapon = true; // satisfy goal
    ctx.emit.mockClear();
    goalOrientedHandler.onEvent!(node, config, ctx, { type: 'goap_set_state', state: { hasWeapon: false } });
    // Replan should re-select goal and create plan
    expect(ctx.emit).toHaveBeenCalledWith('goap_plan_created', expect.objectContaining({ goal: 'arm' }));
  });
});

// ─── onEvent — goap_add_goal ──────────────────────────────────────────────────

describe('goalOrientedHandler.onEvent — goap_add_goal', () => {
  it('dynamically adds a goal and triggers replan', () => {
    const { node, config, ctx } = attach({
      initial_state: { safe: false },
      actions: [{ name: 'hide', cost: 1, preconditions: {}, effects: { safe: true }, duration: 1 }],
    });
    ctx.emit.mockClear();
    goalOrientedHandler.onEvent!(node, config, ctx, {
      type: 'goap_add_goal',
      goal: { name: 'beSafe', priority: 5, desiredState: { safe: true } },
    });
    expect(ctx.emit).toHaveBeenCalledWith('goap_plan_created', expect.objectContaining({ goal: 'beSafe' }));
  });
});

// ─── onEvent — goap_cancel ────────────────────────────────────────────────────

describe('goalOrientedHandler.onEvent — goap_cancel', () => {
  it('stops execution and emits goap_cancelled', () => {
    const cfg = {
      initial_state: { done: false },
      goals: [{ name: 'finish', priority: 1, desiredState: { done: true } }],
      actions: [{ name: 'doIt', cost: 1, preconditions: {}, effects: { done: true }, duration: 5 }],
    };
    const { node, config, ctx } = attach(cfg);
    ctx.emit.mockClear();
    goalOrientedHandler.onEvent!(node, config, ctx, { type: 'goap_cancel' });
    expect(node.__goalOrientedState.isExecuting).toBe(false);
    expect(node.__goalOrientedState.plan).toHaveLength(0);
    expect(ctx.emit).toHaveBeenCalledWith('goap_cancelled', expect.anything());
  });
});

// ─── priority selection ───────────────────────────────────────────────────────

describe('goalOrientedHandler — goal priority', () => {
  it('selects highest priority valid goal', () => {
    const cfg = {
      initial_state: { a: false, b: false },
      goals: [
        { name: 'lowPri', priority: 1, desiredState: { a: true } },
        { name: 'highPri', priority: 10, desiredState: { b: true } },
      ],
      actions: [
        { name: 'doA', cost: 1, preconditions: {}, effects: { a: true }, duration: 1 },
        { name: 'doB', cost: 1, preconditions: {}, effects: { b: true }, duration: 1 },
      ],
    };
    const { node } = attach(cfg);
    expect(node.__goalOrientedState.currentGoal?.name).toBe('highPri');
  });
});
