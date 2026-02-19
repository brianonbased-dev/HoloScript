/**
 * GoalPlanner (GOAP) — Production Test Suite
 *
 * Covers: action/goal registration, plan generation, BFS pathfinding,
 * preconditions, effects, cost optimization, plan execution, queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { GoalPlanner, type PlanAction, type Goal, type WorldState } from '../GoalPlanner';

// ─── Helpers ────────────────────────────────────────────────────────
function makeAction(id: string, cost: number, preconditions: [string, boolean][], effects: [string, boolean][]): PlanAction {
  return {
    id, name: id, cost,
    preconditions: new Map(preconditions),
    effects: new Map(effects),
    execute: vi.fn(),
  };
}

function makeGoal(id: string, priority: number, conditions: [string, boolean][]): Goal {
  return { id, name: id, priority, conditions: new Map(conditions) };
}

describe('GoalPlanner — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('addAction + getActionCount', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('chop', 1, [], [['hasWood', true]]));
    expect(planner.getActionCount()).toBe(1);
  });

  it('addGoal + getGoalCount', () => {
    const planner = new GoalPlanner();
    planner.addGoal(makeGoal('buildHouse', 1, [['hasHouse', true]]));
    expect(planner.getGoalCount()).toBe(1);
  });

  it('removeAction removes by id', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('chop', 1, [], [['hasWood', true]]));
    planner.removeAction('chop');
    expect(planner.getActionCount()).toBe(0);
  });

  it('removeGoal removes by id', () => {
    const planner = new GoalPlanner();
    planner.addGoal(makeGoal('build', 1, [['hasHouse', true]]));
    planner.removeGoal('build');
    expect(planner.getGoalCount()).toBe(0);
  });

  // ─── Plan: Simple ─────────────────────────────────────────────────
  it('plans single-step solution', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('chop', 1, [], [['hasWood', true]]));
    planner.addGoal(makeGoal('getWood', 1, [['hasWood', true]]));

    const state: WorldState = new Map([['hasWood', false]]);
    const plan = planner.plan(state);
    expect(plan).not.toBeNull();
    expect(plan!.actions.length).toBe(1);
    expect(plan!.actions[0].id).toBe('chop');
  });

  // ─── Plan: Multi-step ─────────────────────────────────────────────
  it('plans multi-step chain', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('getAxe', 1, [], [['hasAxe', true]]));
    planner.addAction(makeAction('chop', 2, [['hasAxe', true]], [['hasWood', true]]));
    planner.addGoal(makeGoal('getWood', 1, [['hasWood', true]]));

    const state: WorldState = new Map([['hasAxe', false], ['hasWood', false]]);
    const plan = planner.plan(state);
    expect(plan).not.toBeNull();
    expect(plan!.actions.length).toBe(2);
    expect(plan!.totalCost).toBe(3);
  });

  // ─── Plan: Already Satisfied ──────────────────────────────────────
  it('returns zero-cost plan when goal already met', () => {
    const planner = new GoalPlanner();
    planner.addGoal(makeGoal('getWood', 1, [['hasWood', true]]));

    const state: WorldState = new Map([['hasWood', true]]);
    const plan = planner.plan(state);
    expect(plan).not.toBeNull();
    expect(plan!.actions.length).toBe(0);
    expect(plan!.totalCost).toBe(0);
  });

  // ─── Plan: No Solution ────────────────────────────────────────────
  it('returns null when no plan possible', () => {
    const planner = new GoalPlanner();
    planner.addGoal(makeGoal('fly', 1, [['canFly', true]]));

    const state: WorldState = new Map([['canFly', false]]);
    expect(planner.plan(state)).toBeNull();
  });

  // ─── Plan: Cost Optimization ──────────────────────────────────────
  it('selects cheapest plan', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('expensive', 10, [], [['hasWood', true]]));
    planner.addAction(makeAction('cheap', 1, [], [['hasWood', true]]));
    planner.addGoal(makeGoal('getWood', 1, [['hasWood', true]]));

    const state: WorldState = new Map([['hasWood', false]]);
    const plan = planner.plan(state);
    expect(plan!.totalCost).toBe(1);
  });

  // ─── Plan: Priority ───────────────────────────────────────────────
  it('selects highest priority goal first', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('getFood', 1, [], [['hasFood', true]]));
    planner.addAction(makeAction('getWater', 1, [], [['hasWater', true]]));
    planner.addGoal(makeGoal('eat', 5, [['hasFood', true]]));
    planner.addGoal(makeGoal('drink', 10, [['hasWater', true]]));

    const state: WorldState = new Map([['hasFood', false], ['hasWater', false]]);
    const plan = planner.plan(state);
    expect(plan!.goalId).toBe('drink'); // higher priority
  });

  // ─── Preconditions ────────────────────────────────────────────────
  it('respects preconditions', () => {
    const planner = new GoalPlanner();
    planner.addAction(makeAction('build', 5, [['hasWood', true], ['hasNails', true]], [['hasHouse', true]]));
    planner.addGoal(makeGoal('shelter', 1, [['hasHouse', true]]));

    // Missing preconditions, no other actions to get them
    const state: WorldState = new Map([['hasWood', false], ['hasNails', false]]);
    expect(planner.plan(state)).toBeNull();
  });

  // ─── executePlan ──────────────────────────────────────────────────
  it('executePlan calls all action execute functions', () => {
    const planner = new GoalPlanner();
    const a1 = makeAction('a', 1, [], [['x', true]]);
    const a2 = makeAction('b', 1, [['x', true]], [['y', true]]);
    planner.addAction(a1);
    planner.addAction(a2);
    planner.addGoal(makeGoal('g', 1, [['y', true]]));

    const state: WorldState = new Map([['x', false], ['y', false]]);
    const plan = planner.plan(state);
    expect(plan).not.toBeNull();
    planner.executePlan(plan!);
    for (const action of plan!.actions) {
      expect(action.execute).toHaveBeenCalled();
    }
  });

  // ─── No Goals ─────────────────────────────────────────────────────
  it('returns null with no goals', () => {
    const planner = new GoalPlanner();
    const state: WorldState = new Map();
    expect(planner.plan(state)).toBeNull();
  });
});
