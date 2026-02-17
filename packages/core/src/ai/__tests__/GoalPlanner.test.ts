/**
 * GoalPlanner Unit Tests
 *
 * Tests GOAP planning, action/goal registration,
 * BFS plan generation, plan execution, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoalPlanner } from '../GoalPlanner';
import type { PlanAction, Goal, WorldState } from '../GoalPlanner';

function makeAction(id: string, cost: number, pre: [string, boolean][], eff: [string, boolean][]): PlanAction {
  return {
    id, name: id, cost,
    preconditions: new Map(pre),
    effects: new Map(eff),
    execute: vi.fn(),
  };
}

function makeGoal(id: string, conditions: [string, boolean][], priority = 1): Goal {
  return { id, name: id, conditions: new Map(conditions), priority };
}

describe('GoalPlanner', () => {
  let planner: GoalPlanner;

  beforeEach(() => {
    planner = new GoalPlanner();
  });

  describe('registration', () => {
    it('should add and count actions', () => {
      planner.addAction(makeAction('a1', 1, [], []));
      planner.addAction(makeAction('a2', 2, [], []));
      expect(planner.getActionCount()).toBe(2);
    });

    it('should add and count goals', () => {
      planner.addGoal(makeGoal('g1', [['done', true]]));
      expect(planner.getGoalCount()).toBe(1);
    });

    it('should remove actions and goals', () => {
      planner.addAction(makeAction('a1', 1, [], []));
      planner.removeAction('a1');
      expect(planner.getActionCount()).toBe(0);

      planner.addGoal(makeGoal('g1', [['x', true]]));
      planner.removeGoal('g1');
      expect(planner.getGoalCount()).toBe(0);
    });
  });

  describe('planning', () => {
    it('should return null when no goals', () => {
      const state: WorldState = new Map();
      expect(planner.plan(state)).toBeNull();
    });

    it('should return empty plan when goal already satisfied', () => {
      planner.addGoal(makeGoal('g', [['hasAxe', true]]));
      const state: WorldState = new Map([['hasAxe', true]]);
      const plan = planner.plan(state);
      expect(plan).not.toBeNull();
      expect(plan!.actions).toEqual([]);
      expect(plan!.totalCost).toBe(0);
    });

    it('should find single-step plan', () => {
      const getAxe = makeAction('getAxe', 2, [], [['hasAxe', true]]);
      planner.addAction(getAxe);
      planner.addGoal(makeGoal('g', [['hasAxe', true]]));

      const state: WorldState = new Map([['hasAxe', false]]);
      const plan = planner.plan(state);
      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBe(1);
      expect(plan!.actions[0].id).toBe('getAxe');
      expect(plan!.totalCost).toBe(2);
    });

    it('should find multi-step plan', () => {
      planner.addAction(makeAction('getWood', 1, [], [['hasWood', true]]));
      planner.addAction(makeAction('buildFire', 3, [['hasWood', true]], [['hasFire', true]]));
      planner.addGoal(makeGoal('warmth', [['hasFire', true]]));

      const state: WorldState = new Map();
      const plan = planner.plan(state);
      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBe(2);
      expect(plan!.totalCost).toBe(4);
    });

    it('should prefer cheaper plan', () => {
      planner.addAction(makeAction('cheap', 1, [], [['done', true]]));
      planner.addAction(makeAction('expensive', 10, [], [['done', true]]));
      planner.addGoal(makeGoal('g', [['done', true]]));

      const plan = planner.plan(new Map());
      expect(plan!.actions[0].id).toBe('cheap');
    });

    it('should respect preconditions', () => {
      planner.addAction(makeAction('locked', 5, [['hasKey', true]], [['done', true]]));
      planner.addGoal(makeGoal('g', [['done', true]]));

      const plan = planner.plan(new Map([['hasKey', false]]));
      expect(plan).toBeNull();
    });

    it('should prioritize higher-priority goals', () => {
      planner.addAction(makeAction('a', 1, [], [['x', true]]));
      planner.addAction(makeAction('b', 1, [], [['y', true]]));
      planner.addGoal(makeGoal('low', [['x', true]], 1));
      planner.addGoal(makeGoal('high', [['y', true]], 10));

      const plan = planner.plan(new Map());
      expect(plan!.goalId).toBe('high');
    });
  });

  describe('executePlan', () => {
    it('should call execute on each action in order', () => {
      const a1 = makeAction('a1', 1, [], []);
      const a2 = makeAction('a2', 1, [], []);
      planner.executePlan({ actions: [a1, a2], totalCost: 2, goalId: 'g' });
      expect(a1.execute).toHaveBeenCalled();
      expect(a2.execute).toHaveBeenCalled();
    });
  });
});
