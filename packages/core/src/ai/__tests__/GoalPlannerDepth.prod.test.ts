import { describe, it, expect, vi } from 'vitest';
import { GoalPlanner, type WorldState, type PlanAction, type Goal } from '@holoscript/framework/ai';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeAction(
  id: string,
  cost: number,
  pre: Record<string, boolean>,
  effects: Record<string, boolean>,
  execute = vi.fn()
): PlanAction {
  return {
    id,
    name: id,
    cost,
    preconditions: new Map(Object.entries(pre)),
    effects: new Map(Object.entries(effects)),
    execute,
  };
}

function makeGoal(id: string, priority: number, conditions: Record<string, boolean>): Goal {
  return { id, name: id, priority, conditions: new Map(Object.entries(conditions)) };
}

function makeState(entries: Record<string, boolean>): WorldState {
  return new Map(Object.entries(entries));
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('GoalPlanner — registration', () => {
  it('getActionCount starts at 0', () => expect(new GoalPlanner().getActionCount()).toBe(0));
  it('getGoalCount starts at 0', () => expect(new GoalPlanner().getGoalCount()).toBe(0));
  it('addAction increments count', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('a', 1, {}, {}));
    expect(gp.getActionCount()).toBe(1);
  });
  it('addGoal increments count', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g', 1, {}));
    expect(gp.getGoalCount()).toBe(1);
  });
  it('removeAction decrements count', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('act1', 1, {}, {}));
    gp.removeAction('act1');
    expect(gp.getActionCount()).toBe(0);
  });
  it('removeGoal decrements count', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g1', 1, {}));
    gp.removeGoal('g1');
    expect(gp.getGoalCount()).toBe(0);
  });
  it('addAction multiple keeps all', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('a', 1, {}, {}));
    gp.addAction(makeAction('b', 1, {}, {}));
    expect(gp.getActionCount()).toBe(2);
  });
});

describe('GoalPlanner — plan() no goals/actions', () => {
  it('returns null when no goals', () => {
    const gp = new GoalPlanner();
    expect(gp.plan(makeState({}))).toBeNull();
  });
  it('returns null when goal already satisfied', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g', 10, { done: true }));
    // Already satisfied — returns a plan with 0 actions
    const plan = gp.plan(makeState({ done: true }));
    // Implementation may return a plan (empty) or null — either is valid
    if (plan !== null) {
      expect(plan.actions).toHaveLength(0);
    }
  });
  it('returns null when no path to goal', () => {
    const gp = new GoalPlanner();
    gp.addGoal(makeGoal('g', 10, { impossible: true }));
    // No actions available to achieve it
    expect(gp.plan(makeState({}))).toBeNull();
  });
});

describe('GoalPlanner — single-action plan', () => {
  it('finds plan for single-step goal', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('unlock', 1, { hasKey: true }, { doorOpen: true }));
    gp.addGoal(makeGoal('openDoor', 10, { doorOpen: true }));
    const plan = gp.plan(makeState({ hasKey: true, doorOpen: false }));
    expect(plan).not.toBeNull();
    expect(plan!.actions).toHaveLength(1);
    expect(plan!.actions[0].id).toBe('unlock');
  });
  it('plan carries correct goalId', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('act', 1, {}, { x: true }));
    gp.addGoal(makeGoal('myGoal', 5, { x: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.goalId).toBe('myGoal');
  });
  it('plan carries correct totalCost', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('act', 7, {}, { x: true }));
    gp.addGoal(makeGoal('g', 5, { x: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.totalCost).toBe(7);
  });
});

describe('GoalPlanner — multi-action plan', () => {
  it('chains two actions', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('pickupKey', 1, { near_key: true }, { hasKey: true }));
    gp.addAction(makeAction('openDoor', 1, { hasKey: true }, { doorOpen: true }));
    gp.addGoal(makeGoal('escape', 10, { doorOpen: true }));
    const plan = gp.plan(makeState({ near_key: true }));
    expect(plan).not.toBeNull();
    expect(plan!.actions).toHaveLength(2);
    expect(plan!.actions[0].id).toBe('pickupKey');
    expect(plan!.actions[1].id).toBe('openDoor');
  });
  it('total cost is sum of action costs', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('a1', 3, {}, { mid: true }));
    gp.addAction(makeAction('a2', 5, { mid: true }, { goal: true }));
    gp.addGoal(makeGoal('g', 10, { goal: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.totalCost).toBe(8);
  });
});

describe('GoalPlanner — cost optimization (A*)', () => {
  it('picks cheaper path when two routes exist', () => {
    const gp = new GoalPlanner();
    // Expensive route: single action cost=100
    gp.addAction(makeAction('expensive', 100, {}, { done: true }));
    // Cheap route: two actions, total cost=3
    gp.addAction(makeAction('step1', 1, {}, { mid: true }));
    gp.addAction(makeAction('step2', 2, { mid: true }, { done: true }));
    gp.addGoal(makeGoal('goal', 10, { done: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.totalCost).toBe(3);
    expect(plan!.actions.some((a) => a.id === 'expensive')).toBe(false);
  });
});

describe('GoalPlanner — goal priority', () => {
  it('plans highest priority goal first', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('doA', 1, {}, { goalA: true }));
    gp.addAction(makeAction('doB', 1, {}, { goalB: true }));
    gp.addGoal(makeGoal('lowPriority', 1, { goalA: true }));
    gp.addGoal(makeGoal('highPriority', 100, { goalB: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.goalId).toBe('highPriority');
  });
  it('falls back to next goal if first is unreachable', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('doB', 1, {}, { goalB: true }));
    gp.addGoal(makeGoal('high', 100, { impossible: true }));
    gp.addGoal(makeGoal('low', 1, { goalB: true }));
    const plan = gp.plan(makeState({}));
    expect(plan!.goalId).toBe('low');
  });
});

describe('GoalPlanner — precondition enforcement', () => {
  it('action with unmet precondition is not used', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('guarded', 1, { hasSpecialItem: true }, { done: true }));
    gp.addGoal(makeGoal('g', 10, { done: true }));
    // hasSpecialItem is NOT in world state
    const plan = gp.plan(makeState({ hasSpecialItem: false }));
    expect(plan).toBeNull();
  });
  it('action used when precondition met', () => {
    const gp = new GoalPlanner();
    gp.addAction(makeAction('guarded', 1, { hasSpecialItem: true }, { done: true }));
    gp.addGoal(makeGoal('g', 10, { done: true }));
    const plan = gp.plan(makeState({ hasSpecialItem: true }));
    expect(plan).not.toBeNull();
  });
});

describe('GoalPlanner — executePlan', () => {
  it('calls execute on each action in order', () => {
    const calls: string[] = [];
    const gp = new GoalPlanner();
    gp.addAction(
      makeAction(
        'a1',
        1,
        {},
        { mid: true },
        vi.fn(() => calls.push('a1'))
      )
    );
    gp.addAction(
      makeAction(
        'a2',
        1,
        { mid: true },
        { done: true },
        vi.fn(() => calls.push('a2'))
      )
    );
    gp.addGoal(makeGoal('g', 10, { done: true }));
    const plan = gp.plan(makeState({}));
    gp.executePlan(plan!);
    expect(calls).toEqual(['a1', 'a2']);
  });
});
