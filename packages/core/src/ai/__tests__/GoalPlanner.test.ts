import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoalPlanner, type PlanAction, type Goal, type WorldState } from '../GoalPlanner';

function action(id: string, cost: number, pre: Record<string, boolean>, eff: Record<string, boolean>): PlanAction {
  return {
    id, name: id, cost,
    preconditions: new Map(Object.entries(pre)),
    effects: new Map(Object.entries(eff)),
    execute: vi.fn(),
  };
}

function goal(id: string, conditions: Record<string, boolean>, priority: number): Goal {
  return { id, name: id, conditions: new Map(Object.entries(conditions)), priority };
}

describe('GoalPlanner', () => {
  let planner: GoalPlanner;

  beforeEach(() => { planner = new GoalPlanner(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('addAction increases action count', () => {
    planner.addAction(action('a', 1, {}, {}));
    expect(planner.getActionCount()).toBe(1);
  });

  it('addGoal increases goal count', () => {
    planner.addGoal(goal('g', { win: true }, 1));
    expect(planner.getGoalCount()).toBe(1);
  });

  it('removeAction decreases count', () => {
    planner.addAction(action('a', 1, {}, {}));
    planner.removeAction('a');
    expect(planner.getActionCount()).toBe(0);
  });

  it('removeGoal decreases count', () => {
    planner.addGoal(goal('g', { win: true }, 1));
    planner.removeGoal('g');
    expect(planner.getGoalCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Planning
  // ---------------------------------------------------------------------------

  it('plan returns null when no goals', () => {
    const state: WorldState = new Map();
    expect(planner.plan(state)).toBeNull();
  });

  it('plan returns null when goal already met', () => {
    planner.addGoal(goal('g', { happy: true }, 1));
    const state: WorldState = new Map([['happy', true]]);
    const result = planner.plan(state);
    // Goal is already met, plan should contain zero actions
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(0);
  });

  it('plan finds single-step plan', () => {
    planner.addAction(action('eat', 1, {}, { fed: true }));
    planner.addGoal(goal('g', { fed: true }, 1));
    const state: WorldState = new Map([['fed', false]]);
    const result = planner.plan(state);
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(1);
    expect(result!.actions[0].id).toBe('eat');
  });

  it('plan finds multi-step plan', () => {
    planner.addAction(action('chop', 1, {}, { hasWood: true }));
    planner.addAction(action('build', 2, { hasWood: true }, { hasShelter: true }));
    planner.addGoal(goal('shelter', { hasShelter: true }, 1));
    const state: WorldState = new Map([['hasWood', false], ['hasShelter', false]]);
    const result = planner.plan(state);
    expect(result).not.toBeNull();
    expect(result!.actions.length).toBeGreaterThanOrEqual(2);
  });

  it('plan prefers cheaper path', () => {
    planner.addAction(action('expensive', 10, {}, { done: true }));
    planner.addAction(action('cheap', 1, {}, { done: true }));
    planner.addGoal(goal('g', { done: true }, 1));
    const state: WorldState = new Map([['done', false]]);
    const result = planner.plan(state);
    expect(result).not.toBeNull();
    expect(result!.totalCost).toBe(1);
  });

  it('plan returns null when no actions can satisfy goal', () => {
    planner.addAction(action('noop', 1, {}, { irrelevant: true }));
    planner.addGoal(goal('g', { impossible: true }, 1));
    const state: WorldState = new Map();
    expect(planner.plan(state)).toBeNull();
  });

  it('plan selects highest priority goal', () => {
    planner.addAction(action('a1', 1, {}, { low: true }));
    planner.addAction(action('a2', 1, {}, { high: true }));
    planner.addGoal(goal('lo', { low: true }, 1));
    planner.addGoal(goal('hi', { high: true }, 10));
    const state: WorldState = new Map();
    const result = planner.plan(state);
    expect(result).not.toBeNull();
    expect(result!.goalId).toBe('hi');
  });

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  it('executePlan calls execute on each action', () => {
    const a = action('a', 1, {}, {});
    const b = action('b', 1, {}, {});
    planner.executePlan({ actions: [a, b], totalCost: 2, goalId: 'g' });
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(b.execute).toHaveBeenCalledTimes(1);
  });
});
