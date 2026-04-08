/**
 * Sprint27.test.ts â€” AI + Behavior + Agents (v3.36.0)
 *
 * 100 acceptance tests covering:
 *   Feature 1A: ai/StateMachine
 *   Feature 1B: ai/Blackboard
 *   Feature 2A: behavior/BehaviorTree nodes
 *   Feature 2B: behavior/StateMachine
 *   Feature 3A: ai/GoalPlanner
 *   Feature 3B: ai/UtilityAI
 *   Feature 4A: ai/BehaviorTree (ai module)
 *   Feature 4B: agents/AgentTypes constants
 */
import { describe, it, expect, vi } from 'vitest';

// Feature 1A
import { StateMachine as AiSM } from '../ai/StateMachine.js';

// Feature 1B
import { Blackboard } from '../ai/Blackboard.js';

// Feature 2A
import {
  ActionNode,
  ConditionNode,
  WaitNode,
  SequenceNode,
  SelectorNode,
  InverterNode,
  RepeaterNode,
  BehaviorTree as BehaviorBT,
  type BTContext,
  type NodeStatus,
} from '../behavior/BehaviorTree.js';

// Feature 2B
import { StateMachine as BehaviorSM } from '../behavior/StateMachine.js';

// Feature 3A
import { GoalPlanner } from '../ai/GoalPlanner.js';
import type { PlanAction, Goal } from '../ai/GoalPlanner.js';

// Feature 3B
import { UtilityAI } from '../ai/UtilityAI.js';
import type { UtilityAction } from '../ai/UtilityAI.js';

// Feature 4A
import { BehaviorTree as AiBT } from '../ai/BehaviorTree.js';
import {
  ActionNode as AIActionNode,
  ConditionNode as AIConditionNode,
  SequenceNode as AISequenceNode,
  SelectorNode as AISelectorNode,
  InverterNode as AIInverterNode,
  WaitNode as AIWaitNode,
} from '../ai/BTNodes.js';

// Feature 4B
import { PHASE_ORDER, DEFAULT_PHASE_TIMINGS } from '../agents/AgentTypes.js';

// =============================================================================
// FEATURE 1A: ai/StateMachine
// =============================================================================

describe('Feature 1A: ai/StateMachine', () => {
  it('getCurrentState returns null before initialization', () => {
    const sm = new AiSM();
    expect(sm.getCurrentState()).toBeNull();
  });

  it('addState + setInitialState sets current state', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('getStateCount reflects added states', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    expect(sm.getStateCount()).toBe(2);
  });

  it('addTransition + send() transitions state', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go' });
    sm.send('go');
    expect(sm.getCurrentState()).toBe('run');
  });

  it('send() returns true on successful transition', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go' });
    expect(sm.send('go')).toBe(true);
  });

  it('send() returns false for unknown event', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.send('noop')).toBe(false);
  });

  it('onEnter callback fires when entering state', () => {
    const onEnter = vi.fn();
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run', onEnter });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go' });
    sm.send('go');
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('onExit callback fires when leaving state', () => {
    const onExit = vi.fn();
    const sm = new AiSM();
    sm.addState({ id: 'idle', onExit });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go' });
    sm.send('go');
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('guard returning false blocks transition', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go', guard: () => false });
    sm.send('go');
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('guard returning true allows transition', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go', guard: () => true });
    sm.send('go');
    expect(sm.getCurrentState()).toBe('run');
  });

  it('setContext / getContext stores values', () => {
    const sm = new AiSM();
    sm.setContext('speed', 10);
    expect(sm.getContext('speed')).toBe(10);
  });

  it('getHistory records state entries', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.addState({ id: 'run' });
    sm.setInitialState('idle');
    sm.addTransition({ from: 'idle', to: 'run', event: 'go' });
    sm.send('go');
    expect(sm.getHistory()).toContain('run');
  });

  it('isInState returns true for current, false for others', () => {
    const sm = new AiSM();
    sm.addState({ id: 'idle' });
    sm.setInitialState('idle');
    expect(sm.isInState('idle')).toBe(true);
    expect(sm.isInState('run')).toBe(false);
  });

  it('getChildStates returns children of a parent state', () => {
    const sm = new AiSM();
    sm.addState({ id: 'locomotion' });
    sm.addState({ id: 'walk', parent: 'locomotion' });
    sm.addState({ id: 'Sprint', parent: 'locomotion' });
    const children = sm.getChildStates('locomotion');
    expect(children).toContain('walk');
    expect(children).toContain('Sprint');
  });
});

// =============================================================================
// FEATURE 1B: ai/Blackboard
// =============================================================================

describe('Feature 1B: ai/Blackboard', () => {
  it('set and get a value', () => {
    const bb = new Blackboard();
    bb.set('hp', 100);
    expect(bb.get('hp')).toBe(100);
  });

  it('has returns true for existing key', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    expect(bb.has('x')).toBe(true);
  });

  it('has returns false for missing key', () => {
    expect(new Blackboard().has('nope')).toBe(false);
  });

  it('delete removes a key and returns true', () => {
    const bb = new Blackboard();
    bb.set('y', 2);
    expect(bb.delete('y')).toBe(true);
    expect(bb.has('y')).toBe(false);
  });

  it('delete returns false for missing key', () => {
    expect(new Blackboard().delete('ghost')).toBe(false);
  });

  it('getEntryCount reflects stored entries', () => {
    const bb = new Blackboard();
    bb.set('a', 1);
    bb.set('b', 2);
    expect(bb.getEntryCount()).toBe(2);
  });

  it('getKeys returns all keys', () => {
    const bb = new Blackboard();
    bb.set('alpha', 1);
    bb.set('beta', 2);
    const keys = bb.getKeys();
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
  });

  it('getByScope returns only entries in that scope', () => {
    const bb = new Blackboard();
    bb.set('local_val', 10, 'local');
    bb.set('global_val', 20, 'global');
    const localMap = bb.getByScope('local');
    expect(localMap.get('local_val')).toBe(10);
    expect(localMap.has('global_val')).toBe(false);
  });

  it('clearScope removes entries in scope and returns count', () => {
    const bb = new Blackboard();
    bb.set('tmp1', 1, 'temp');
    bb.set('tmp2', 2, 'temp');
    bb.set('keep', 3, 'global');
    const removed = bb.clearScope('temp');
    expect(removed).toBe(2);
    expect(bb.has('tmp1')).toBe(false);
    expect(bb.has('keep')).toBe(true);
  });

  it('observe fires callback on value change', () => {
    const cb = vi.fn();
    const bb = new Blackboard();
    bb.observe('score', cb);
    bb.set('score', 99);
    expect(cb).toHaveBeenCalledWith('score', 99, undefined);
  });

  it('getVersion increments with each update', () => {
    const bb = new Blackboard();
    bb.set('v', 1);
    const v1 = bb.getVersion('v');
    bb.set('v', 2);
    const v2 = bb.getVersion('v');
    expect(v2).toBeGreaterThan(v1);
  });

  it('toJSON returns an object', () => {
    const bb = new Blackboard();
    bb.set('name', 'hero');
    const json = bb.toJSON();
    expect(typeof json).toBe('object');
    expect(json).not.toBeNull();
  });

  it('fromJSON restores entries to a scope', () => {
    const bb = new Blackboard();
    bb.fromJSON({ score: 42, level: 7 });
    expect(bb.get('score')).toBe(42);
    expect(bb.get('level')).toBe(7);
  });

  it('clear empties all entries', () => {
    const bb = new Blackboard();
    bb.set('a', 1);
    bb.set('b', 2);
    bb.clear();
    expect(bb.getEntryCount()).toBe(0);
  });
});

// =============================================================================
// FEATURE 2A: behavior/BehaviorTree
// =============================================================================

describe('Feature 2A: behavior/BehaviorTree nodes', () => {
  const ctx: BTContext = {};

  it('ActionNode returns success', () => {
    const n = new ActionNode('act', () => 'success');
    expect(n.tick(ctx, 0)).toBe('success');
  });

  it('ActionNode returns failure', () => {
    const n = new ActionNode('act', () => 'failure');
    expect(n.tick(ctx, 0)).toBe('failure');
  });

  it('ActionNode returns running', () => {
    const n = new ActionNode('act', () => 'running');
    expect(n.tick(ctx, 0)).toBe('running');
  });

  it('ConditionNode returns success when predicate true', () => {
    const n = new ConditionNode('cond', () => true);
    expect(n.tick(ctx)).toBe('success');
  });

  it('ConditionNode returns failure when predicate false', () => {
    const n = new ConditionNode('cond', () => false);
    expect(n.tick(ctx)).toBe('failure');
  });

  it('SequenceNode: all children succeed â†’ success', () => {
    const seq = new SequenceNode([
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'success'),
    ]);
    expect(seq.tick(ctx, 0)).toBe('success');
  });

  it('SequenceNode: first child fails â†’ failure', () => {
    const seq = new SequenceNode([
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => 'success'),
    ]);
    expect(seq.tick(ctx, 0)).toBe('failure');
  });

  it('SequenceNode: short-circuits on failure (second not called)', () => {
    let bCalled = false;
    const seq = new SequenceNode([
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => {
        bCalled = true;
        return 'success';
      }),
    ]);
    seq.tick(ctx, 0);
    expect(bCalled).toBe(false);
  });

  it('SequenceNode: running child pauses sequence', () => {
    const seq = new SequenceNode([
      new ActionNode('a', () => 'running'),
      new ActionNode('b', () => 'success'),
    ]);
    expect(seq.tick(ctx, 0)).toBe('running');
  });

  it('SelectorNode: first child succeeds â†’ success', () => {
    const sel = new SelectorNode([
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'failure'),
    ]);
    expect(sel.tick(ctx, 0)).toBe('success');
  });

  it('SelectorNode: all children fail â†’ failure', () => {
    const sel = new SelectorNode([
      new ActionNode('a', () => 'failure'),
      new ActionNode('b', () => 'failure'),
    ]);
    expect(sel.tick(ctx, 0)).toBe('failure');
  });

  it('SelectorNode: short-circuits on success', () => {
    let bCalled = false;
    const sel = new SelectorNode([
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => {
        bCalled = true;
        return 'failure';
      }),
    ]);
    sel.tick(ctx, 0);
    expect(bCalled).toBe(false);
  });

  it('InverterNode: flips success to failure', () => {
    const inv = new InverterNode(new ActionNode('a', () => 'success'));
    expect(inv.tick(ctx, 0)).toBe('failure');
  });

  it('InverterNode: flips failure to success', () => {
    const inv = new InverterNode(new ActionNode('a', () => 'failure'));
    expect(inv.tick(ctx, 0)).toBe('success');
  });

  it('InverterNode: passes through running', () => {
    const inv = new InverterNode(new ActionNode('a', () => 'running'));
    expect(inv.tick(ctx, 0)).toBe('running');
  });

  it('WaitNode: returns running before duration elapsed', () => {
    const w = new WaitNode(1.0);
    expect(w.tick(ctx, 0.4)).toBe('running');
  });

  it('WaitNode: returns success when duration reached', () => {
    const w = new WaitNode(1.0);
    w.tick(ctx, 0.5);
    expect(w.tick(ctx, 0.6)).toBe('success');
  });

  it('WaitNode: reset() clears elapsed time', () => {
    const w = new WaitNode(1.0);
    w.tick(ctx, 0.9);
    w.reset();
    expect(w.tick(ctx, 0.4)).toBe('running');
  });

  it('RepeaterNode: runs child and returns success after maxCount', () => {
    let calls = 0;
    const child = new ActionNode('c', () => {
      calls++;
      return 'success';
    });
    const rep = new RepeaterNode(child, 2);
    const s1 = rep.tick(ctx, 0); // count=1, not at max
    expect(s1).toBe('running');
    const s2 = rep.tick(ctx, 0); // count=2, at max
    expect(s2).toBe('success');
    expect(calls).toBe(2);
  });

  it('BehaviorTree tick returns the root node status', () => {
    const bt = new BehaviorBT(new ActionNode('root', () => 'success'));
    expect(bt.tick(0)).toBe('success');
  });

  it('BehaviorTree setContext / getContext', () => {
    const bt = new BehaviorBT(new ActionNode('root', () => 'success'));
    bt.setContext('lives', 3);
    expect(bt.getContext().lives).toBe(3);
  });

  it('BehaviorTree reset() does not throw', () => {
    const bt = new BehaviorBT(new ActionNode('root', () => 'success'));
    bt.tick(0);
    expect(() => bt.reset()).not.toThrow();
  });

  it('Nested: Selector with failing Sequence and passing Sequence', () => {
    const sel = new SelectorNode([
      new SequenceNode([
        new ActionNode('x', () => 'failure'),
        new ActionNode('y', () => 'success'),
      ]),
      new SequenceNode([
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'success'),
      ]),
    ]);
    expect(sel.tick(ctx, 0)).toBe('success');
  });
});

// =============================================================================
// FEATURE 2B: behavior/StateMachine
// =============================================================================

describe('Feature 2B: behavior/StateMachine', () => {
  function makePlayerSM() {
    return new BehaviorSM({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'run' }, { name: 'jump' }],
      transitions: [
        { from: 'idle', to: 'run', event: 'start' },
        { from: 'run', to: 'jump', event: 'jump' },
        { from: 'jump', to: 'idle', event: 'land' },
      ],
    });
  }

  it('getCurrentState returns initialState', () => {
    expect(makePlayerSM().getCurrentState()).toBe('idle');
  });

  it('send() transitions to the target state', () => {
    const sm = makePlayerSM();
    sm.send('start');
    expect(sm.getCurrentState()).toBe('run');
  });

  it('send() returns true on successful transition', () => {
    expect(makePlayerSM().send('start')).toBe(true);
  });

  it('send() returns false when no matching transition', () => {
    expect(makePlayerSM().send('jump')).toBe(false);
  });

  it('isInState returns true for current state', () => {
    expect(makePlayerSM().isInState('idle')).toBe(true);
  });

  it('isInState returns false for other states', () => {
    expect(makePlayerSM().isInState('run')).toBe(false);
  });

  it('getHistory is non-empty after construction', () => {
    expect(makePlayerSM().getHistory().length).toBeGreaterThan(0);
  });

  it('getHistory records transitions', () => {
    const sm = makePlayerSM();
    sm.send('start');
    expect(sm.getHistory()).toContain('run');
  });

  it('onEnter callback fires on state entry', () => {
    const entered = vi.fn();
    const sm = new BehaviorSM({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'active', onEnter: entered }],
      transitions: [{ from: 'idle', to: 'active', event: 'activate' }],
    });
    sm.send('activate');
    expect(entered).toHaveBeenCalledOnce();
  });

  it('onExit callback fires on state exit', () => {
    const exited = vi.fn();
    const sm = new BehaviorSM({
      initialState: 'idle',
      states: [{ name: 'idle', onExit: exited }, { name: 'active' }],
      transitions: [{ from: 'idle', to: 'active', event: 'activate' }],
    });
    sm.send('activate');
    expect(exited).toHaveBeenCalledOnce();
  });

  it('guard returning false blocks transition', () => {
    const sm = new BehaviorSM({
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'run' }],
      transitions: [{ from: 'idle', to: 'run', event: 'go', guard: () => false }],
    });
    sm.send('go');
    expect(sm.getCurrentState()).toBe('idle');
  });

  it('getPreviousState returns prior state after transition', () => {
    const sm = makePlayerSM();
    sm.send('start');
    expect(sm.getPreviousState()).toBe('idle');
  });

  it('getContext returns the provided context', () => {
    const sm = new BehaviorSM({
      initialState: 'idle',
      states: [{ name: 'idle' }],
      transitions: [],
      context: { speed: 5 },
    });
    expect((sm.getContext() as any).speed).toBe(5);
  });
});

// =============================================================================
// FEATURE 3A: ai/GoalPlanner
// =============================================================================

describe('Feature 3A: ai/GoalPlanner', () => {
  function makeAction(
    id: string,
    pre: Record<string, boolean>,
    eff: Record<string, boolean>,
    cost = 1
  ): PlanAction {
    return {
      id,
      name: id,
      cost,
      preconditions: new Map(Object.entries(pre)),
      effects: new Map(Object.entries(eff)),
      execute: vi.fn(),
    };
  }
  function makeGoal(id: string, conds: Record<string, boolean>): Goal {
    return { id, name: id, conditions: new Map(Object.entries(conds)), priority: 1 };
  }

  it('getActionCount is 0 initially', () => {
    expect(new GoalPlanner().getActionCount()).toBe(0);
  });

  it('addAction increments getActionCount', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('chop', {}, { hasWood: true }));
    expect(gp.getActionCount()).toBe(1);
  });

  it('getGoalCount is 0 initially', () => {
    expect(new GoalPlanner().getGoalCount()).toBe(0);
  });

  it('addGoal increments getGoalCount', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g1', { done: true }));
    expect(gp.getGoalCount()).toBe(1);
  });

  it('plan returns null with no goals registered', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('a', {}, { done: true }));
    expect(gp.plan(new Map())).toBeNull();
  });

  it('plan returns null when goal is unsatisfiable', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g', { impossible: true }));
    expect(gp.plan(new Map([['impossible', false]]))).toBeNull();
  });

  it('plan returns a Plan for a single-step achievable goal', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('pickup', {}, { hasItem: true }));
    gp.addGoal(makeGoal('collect', { hasItem: true }));
    const plan = gp.plan(new Map([['hasItem', false]]));
    expect(plan).not.toBeNull();
  });

  it('plan.goalId matches the goal id', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('pickup', {}, { hasItem: true }));
    gp.addGoal(makeGoal('collect', { hasItem: true }));
    const plan = gp.plan(new Map([['hasItem', false]]))!;
    expect(plan.goalId).toBe('collect');
  });

  it('plan.actions contains the required action', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('pickup', {}, { hasItem: true }));
    gp.addGoal(makeGoal('collect', { hasItem: true }));
    const plan = gp.plan(new Map([['hasItem', false]]))!;
    expect(plan.actions.some((a) => a.id === 'pickup')).toBe(true);
  });

  it('plan.totalCost equals sum of action costs', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('act', {}, { done: true }, 4));
    gp.addGoal(makeGoal('finish', { done: true }));
    const plan = gp.plan(new Map([['done', false]]))!;
    expect(plan.totalCost).toBe(4);
  });

  it('plan chains multiple actions for multi-step goal', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('chop', {}, { hasWood: true }));
    gp.addAction(makeAction('build', { hasWood: true }, { hasHouse: true }));
    gp.addGoal(makeGoal('shelter', { hasHouse: true }));
    const plan = gp.plan(
      new Map([
        ['hasWood', false],
        ['hasHouse', false],
      ])
    )!;
    expect(plan).not.toBeNull();
    expect(plan.actions.length).toBeGreaterThanOrEqual(2);
  });

  it('executePlan calls execute() on each action', () => {
    const execFn = vi.fn();
    const gp = new GoalPlanner();
    gp.addAction({
      id: 'act',
      name: 'act',
      cost: 1,
      preconditions: new Map(),
      effects: new Map([['done', true]]),
      execute: execFn,
    });
    gp.addGoal(makeGoal('g', { done: true }));
    const plan = gp.plan(new Map([['done', false]]))!;
    gp.executePlan(plan);
    expect(execFn).toHaveBeenCalled();
  });

  it('removeAction decrements count', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('a', {}, {}));
    gp.removeAction('a');
    expect(gp.getActionCount()).toBe(0);
  });

  it('removeGoal decrements count', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g', {}));
    gp.removeGoal('g');
    expect(gp.getGoalCount()).toBe(0);
  });
});

// =============================================================================
// FEATURE 3B: ai/UtilityAI
// =============================================================================

describe('Feature 3B: ai/UtilityAI', () => {
  function makeAction(id: string, inputScore: number, cooldown = 0): UtilityAction {
    return {
      id,
      name: id,
      considerations: [
        {
          name: 'c',
          input: () => inputScore,
          curve: 'linear' as const,
          weight: 1,
          invert: false,
        },
      ],
      cooldown,
      lastExecuted: -Infinity,
      bonus: 0,
      execute: vi.fn(),
    };
  }

  it('getActionCount is 0 initially', () => {
    expect(new UtilityAI().getActionCount()).toBe(0);
  });

  it('addAction increments getActionCount', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('flee', 0.8));
    expect(ai.getActionCount()).toBe(1);
  });

  it('scoreAction with linear curve returns input value', () => {
    const ai = new UtilityAI();
    expect(ai.scoreAction(makeAction('a', 0.7))).toBeCloseTo(0.7, 5);
  });

  it('scoreAll returns an array with one entry per action', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('a', 0.6));
    ai.addAction(makeAction('b', 0.3));
    const scores = ai.scoreAll();
    expect(scores).toHaveLength(2);
    expect(scores.every((s) => typeof s.score === 'number')).toBe(true);
  });

  it('selectBest returns the highest-scoring action', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('low', 0.2));
    ai.addAction(makeAction('high', 0.9));
    expect(ai.selectBest()?.id).toBe('high');
  });

  it('selectBest returns null with no actions', () => {
    expect(new UtilityAI().selectBest()).toBeNull();
  });

  it('executeBest calls execute() and returns action id', () => {
    const fn = vi.fn();
    const ai = new UtilityAI();
    const action = makeAction('act', 0.8);
    action.execute = fn;
    ai.addAction(action);
    const id = ai.executeBest();
    expect(id).toBe('act');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('executeBest returns null with no actions', () => {
    expect(new UtilityAI().executeBest()).toBeNull();
  });

  it('cooldown: scoreAction returns 0 when action is on cooldown', () => {
    const ai = new UtilityAI();
    ai.setTime(10);
    const action = makeAction('act', 1.0, 5);
    action.lastExecuted = 8; // elapsed=2, cooldown=5 â†’ still on cooldown
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBe(0);
  });

  it('getHistory tracks executed actions', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('act', 0.9));
    ai.executeBest();
    expect(ai.getHistory().length).toBeGreaterThan(0);
  });

  it('removeAction decrements count', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('act', 0.5));
    ai.removeAction('act');
    expect(ai.getActionCount()).toBe(0);
  });

  it('scoreAction with invert=true inverts the score', () => {
    const ai = new UtilityAI();
    const action: UtilityAction = {
      id: 'inv',
      name: 'inv',
      considerations: [{ name: 'c', input: () => 0.8, curve: 'linear', weight: 1, invert: true }],
      cooldown: 0,
      lastExecuted: -Infinity,
      bonus: 0,
      execute: vi.fn(),
    };
    const score = ai.scoreAction(action);
    expect(score).toBeCloseTo(0.2, 5); // 1 - 0.8
  });
});

// =============================================================================
// FEATURE 4A: ai/BehaviorTree (ai module)
// =============================================================================

describe('Feature 4A: ai/BehaviorTree (ai module)', () => {
  it('createTree returns a BTTreeDef with correct id', () => {
    const bt = new AiBT();
    const root = new AIActionNode('act', () => 'success');
    const tree = bt.createTree('tree1', root, 'entity1');
    expect(tree.id).toBe('tree1');
  });

  it('getTreeCount increments after createTree', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    expect(bt.getTreeCount()).toBe(1);
  });

  it('tick returns a valid BTStatus', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    const status = bt.tick('t1', 0.016);
    expect(['success', 'failure', 'running', 'ready']).toContain(status);
  });

  it('tick with success ActionNode returns success', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    expect(bt.tick('t1', 0)).toBe('success');
  });

  it('tick with failure ActionNode returns failure', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'failure'), 'e1');
    expect(bt.tick('t1', 0)).toBe('failure');
  });

  it('removeTree removes the tree from getTreeCount', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    bt.removeTree('t1');
    expect(bt.getTreeCount()).toBe(0);
  });

  it('getTree returns the correct BTTreeDef', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    expect(bt.getTree('t1')?.id).toBe('t1');
  });

  it('abort sets tree.aborted to true', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'running'), 'e1');
    bt.abort('t1');
    expect(bt.getTree('t1')?.aborted).toBe(true);
  });

  it('getStatus returns current status after tick', () => {
    const bt = new AiBT();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    bt.tick('t1', 0);
    expect(['success', 'failure', 'running', 'ready']).toContain(bt.getStatus('t1'));
  });

  it('enableTracing + getTrace records tick entries', () => {
    const bt = new AiBT();
    bt.enableTracing();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    bt.tick('t1', 0);
    expect(bt.getTrace().length).toBeGreaterThan(0);
  });

  it('clearTrace empties the trace log', () => {
    const bt = new AiBT();
    bt.enableTracing();
    bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    bt.tick('t1', 0);
    bt.clearTrace();
    expect(bt.getTrace()).toHaveLength(0);
  });

  it('createTree auto-creates Blackboard when none provided', () => {
    const bt = new AiBT();
    const tree = bt.createTree('t1', new AIActionNode('a', () => 'success'), 'e1');
    expect(tree.context.blackboard).toBeDefined();
  });

  it('AISequenceNode with all success children â†’ success', () => {
    const bt = new AiBT();
    const seq = new AISequenceNode('seq', [
      new AIActionNode('a', () => 'success'),
      new AIActionNode('b', () => 'success'),
    ]);
    bt.createTree('t1', seq, 'e1');
    expect(bt.tick('t1', 0)).toBe('success');
  });

  it('AISelectorNode with first failure second success â†’ success', () => {
    const bt = new AiBT();
    const sel = new AISelectorNode('sel', [
      new AIActionNode('a', () => 'failure'),
      new AIActionNode('b', () => 'success'),
    ]);
    bt.createTree('t1', sel, 'e1');
    expect(bt.tick('t1', 0)).toBe('success');
  });

  it('AIInverterNode flips success to failure', () => {
    const bt = new AiBT();
    const inv = new AIInverterNode('inv', new AIActionNode('a', () => 'success'));
    bt.createTree('t1', inv, 'e1');
    expect(bt.tick('t1', 0)).toBe('failure');
  });
});

// =============================================================================
// FEATURE 4B: agents/AgentTypes constants
// =============================================================================

describe('Feature 4B: agents/AgentTypes constants', () => {
  it('PHASE_ORDER has exactly 7 phases', () => {
    expect(PHASE_ORDER).toHaveLength(7);
  });

  it('PHASE_ORDER[0] is INTAKE', () => {
    expect(PHASE_ORDER[0]).toBe('INTAKE');
  });

  it('PHASE_ORDER[1] is REFLECT', () => {
    expect(PHASE_ORDER[1]).toBe('REFLECT');
  });

  it('PHASE_ORDER[2] is EXECUTE', () => {
    expect(PHASE_ORDER[2]).toBe('EXECUTE');
  });

  it('PHASE_ORDER[3] is COMPRESS', () => {
    expect(PHASE_ORDER[3]).toBe('COMPRESS');
  });

  it('PHASE_ORDER[4] is REINTAKE', () => {
    expect(PHASE_ORDER[4]).toBe('REINTAKE');
  });

  it('PHASE_ORDER[5] is GROW', () => {
    expect(PHASE_ORDER[5]).toBe('GROW');
  });

  it('PHASE_ORDER[6] is EVOLVE', () => {
    expect(PHASE_ORDER[6]).toBe('EVOLVE');
  });

  it('DEFAULT_PHASE_TIMINGS has a key for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(DEFAULT_PHASE_TIMINGS).toHaveProperty(phase);
    }
  });

  it('DEFAULT_PHASE_TIMINGS values are positive numbers', () => {
    for (const phase of PHASE_ORDER) {
      expect(DEFAULT_PHASE_TIMINGS[phase]).toBeGreaterThan(0);
    }
  });
});
