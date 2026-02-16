import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalPlanner, type WorldState, type PlanAction } from '../ai/GoalPlanner';

// =============================================================================
// C272 — Goal Planner
// =============================================================================

function action(id: string, cost: number, pre: Record<string, boolean>, eff: Record<string, boolean>): PlanAction {
  return { id, name: id, cost, preconditions: new Map(Object.entries(pre)), effects: new Map(Object.entries(eff)), execute: vi.fn() };
}

describe('GoalPlanner', () => {
  let planner: GoalPlanner;
  beforeEach(() => { planner = new GoalPlanner(); });

  it('addAction and getActionCount', () => {
    planner.addAction(action('a', 1, {}, {}));
    expect(planner.getActionCount()).toBe(1);
  });

  it('removeAction removes by id', () => {
    planner.addAction(action('a', 1, {}, {}));
    planner.removeAction('a');
    expect(planner.getActionCount()).toBe(0);
  });

  it('addGoal and getGoalCount', () => {
    planner.addGoal({ id: 'g1', name: 'Win', conditions: new Map([['won', true]]), priority: 1 });
    expect(planner.getGoalCount()).toBe(1);
  });

  it('plan returns null when no actions can satisfy goal', () => {
    planner.addGoal({ id: 'g1', name: 'Win', conditions: new Map([['won', true]]), priority: 1 });
    const state: WorldState = new Map([['won', false]]);
    expect(planner.plan(state)).toBeNull();
  });

  it('plan returns null when goal already satisfied', () => {
    planner.addGoal({ id: 'g1', name: 'Win', conditions: new Map([['won', true]]), priority: 1 });
    planner.addAction(action('noop', 1, {}, {}));
    const state: WorldState = new Map([['won', true]]);
    const result = planner.plan(state);
    // Already satisfied => plan with 0 actions
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(0);
  });

  it('plan finds single-action solution', () => {
    planner.addAction(action('setWon', 5, {}, { won: true }));
    planner.addGoal({ id: 'g1', name: 'Win', conditions: new Map([['won', true]]), priority: 1 });
    const result = planner.plan(new Map([['won', false]]));
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(1);
    expect(result!.totalCost).toBe(5);
  });

  it('plan finds cheapest multi-action solution', () => {
    planner.addAction(action('getAxe', 1, {}, { hasAxe: true }));
    planner.addAction(action('chopTree', 2, { hasAxe: true }, { hasWood: true }));
    planner.addGoal({ id: 'g1', name: 'Get Wood', conditions: new Map([['hasWood', true]]), priority: 1 });
    const result = planner.plan(new Map());
    expect(result).not.toBeNull();
    expect(result!.actions.map(a => a.id)).toEqual(['getAxe', 'chopTree']);
    expect(result!.totalCost).toBe(3);
  });

  it('plan selects higher priority goal', () => {
    planner.addAction(action('eat', 1, {}, { fed: true }));
    planner.addAction(action('sleep', 1, {}, { rested: true }));
    planner.addGoal({ id: 'g1', name: 'Eat', conditions: new Map([['fed', true]]), priority: 5 });
    planner.addGoal({ id: 'g2', name: 'Sleep', conditions: new Map([['rested', true]]), priority: 1 });
    const result = planner.plan(new Map());
    expect(result!.goalId).toBe('g1');
  });

  it('executePlan calls action execute functions', () => {
    const a1 = action('a', 1, {}, { done: true });
    planner.addAction(a1);
    planner.addGoal({ id: 'g', name: 'G', conditions: new Map([['done', true]]), priority: 1 });
    const result = planner.plan(new Map());
    planner.executePlan(result!);
    expect(a1.execute).toHaveBeenCalled();
  });

  it('plan respects preconditions', () => {
    planner.addAction(action('build', 1, { hasWood: true }, { hasHouse: true }));
    planner.addGoal({ id: 'g', name: 'House', conditions: new Map([['hasHouse', true]]), priority: 1 });
    // No way to get wood
    expect(planner.plan(new Map())).toBeNull();
  });
});
