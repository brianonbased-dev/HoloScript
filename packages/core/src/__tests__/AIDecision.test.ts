import { describe, it, expect } from 'vitest';
import { UtilityAI, type UtilityAction } from '../ai/UtilityAI';
import { GoalPlanner, type WorldState } from '../ai/GoalPlanner';
import { BehaviorSelector, type Behavior } from '../ai/BehaviorSelector';

describe('Cycle 153: AI Decision Systems', () => {
  // -------------------------------------------------------------------------
  // UtilityAI
  // -------------------------------------------------------------------------

  it('should score actions and select the best', () => {
    const ai = new UtilityAI();
    let executed = '';

    ai.addAction({
      id: 'eat',
      name: 'Eat',
      cooldown: 0,
      lastExecuted: -1,
      bonus: 0,
      considerations: [
        { name: 'hunger', input: () => 0.9, curve: 'linear', weight: 1, invert: false },
      ],
      execute: () => {
        executed = 'eat';
      },
    });
    ai.addAction({
      id: 'sleep',
      name: 'Sleep',
      cooldown: 0,
      lastExecuted: -1,
      bonus: 0,
      considerations: [
        { name: 'fatigue', input: () => 0.3, curve: 'linear', weight: 1, invert: false },
      ],
      execute: () => {
        executed = 'sleep';
      },
    });

    const scores = ai.scoreAll();
    expect(scores[0].actionId).toBe('eat'); // Higher hunger = higher score

    ai.executeBest();
    expect(executed).toBe('eat');
  });

  it('should respect cooldowns', () => {
    const ai = new UtilityAI();

    ai.addAction({
      id: 'attack',
      name: 'Attack',
      cooldown: 5,
      lastExecuted: 0,
      bonus: 0,
      considerations: [
        { name: 'threat', input: () => 1, curve: 'linear', weight: 1, invert: false },
      ],
      execute: () => {},
    });

    ai.setTime(2); // Only 2s passed, cooldown is 5
    const scores = ai.scoreAll();
    expect(scores[0].score).toBe(0); // On cooldown — score is 0

    ai.setTime(6); // 6s > 5s cooldown
    expect(ai.selectBest()?.id).toBe('attack');
  });

  // -------------------------------------------------------------------------
  // GoalPlanner
  // -------------------------------------------------------------------------

  it('should find a plan to achieve a goal', () => {
    const planner = new GoalPlanner();
    const log: string[] = [];

    planner.addAction({
      id: 'getAxe',
      name: 'Get Axe',
      cost: 1,
      preconditions: new Map(),
      effects: new Map([['hasAxe', true]]),
      execute: () => log.push('getAxe'),
    });
    planner.addAction({
      id: 'chopTree',
      name: 'Chop Tree',
      cost: 2,
      preconditions: new Map([['hasAxe', true]]),
      effects: new Map([['hasWood', true]]),
      execute: () => log.push('chopTree'),
    });

    planner.addGoal({
      id: 'getWood',
      name: 'Get Wood',
      priority: 1,
      conditions: new Map([['hasWood', true]]),
    });

    const currentState: WorldState = new Map([
      ['hasAxe', false],
      ['hasWood', false],
    ]);
    const plan = planner.plan(currentState);

    expect(plan).not.toBeNull();
    expect(plan!.actions.map((a) => a.id)).toEqual(['getAxe', 'chopTree']);
    expect(plan!.totalCost).toBe(3);

    planner.executePlan(plan!);
    expect(log).toEqual(['getAxe', 'chopTree']);
  });

  // -------------------------------------------------------------------------
  // BehaviorSelector
  // -------------------------------------------------------------------------

  it('should select by priority', () => {
    const selector = new BehaviorSelector('priority');
    let picked = '';

    selector.addBehavior({
      id: 'a',
      name: 'Low',
      weight: 1,
      priority: 1,
      action: () => {
        picked = 'a';
      },
      lockoutMs: 0,
      lastExecuted: -1,
    });
    selector.addBehavior({
      id: 'b',
      name: 'High',
      weight: 1,
      priority: 10,
      action: () => {
        picked = 'b';
      },
      lockoutMs: 0,
      lastExecuted: -1,
    });

    selector.execute();
    expect(picked).toBe('b');
  });

  it('should skip locked-out behaviors', () => {
    const selector = new BehaviorSelector('priority');
    let picked = '';

    selector.addBehavior({
      id: 'x',
      name: 'Main',
      weight: 1,
      priority: 10,
      action: () => {
        picked = 'x';
      },
      lockoutMs: 1000,
      lastExecuted: 0,
    });
    selector.addBehavior({
      id: 'y',
      name: 'Backup',
      weight: 1,
      priority: 1,
      action: () => {
        picked = 'y';
      },
      lockoutMs: 0,
      lastExecuted: -1,
    });

    selector.setTime(500); // Main still locked out
    selector.execute();
    expect(picked).toBe('y');

    selector.setTime(1500); // Main available again
    selector.execute();
    expect(picked).toBe('x');
  });

  it('should use fallback when no behavior is available', () => {
    const selector = new BehaviorSelector('priority');
    let picked = '';

    selector.addBehavior({
      id: 'a',
      name: 'A',
      weight: 1,
      priority: 1,
      condition: () => false,
      action: () => {
        picked = 'a';
      },
      lockoutMs: 0,
      lastExecuted: -1,
    });
    selector.setFallback({
      id: 'fb',
      name: 'Fallback',
      weight: 1,
      priority: 0,
      action: () => {
        picked = 'fb';
      },
      lockoutMs: 0,
      lastExecuted: -1,
    });

    selector.execute();
    expect(picked).toBe('fb');
  });
});
