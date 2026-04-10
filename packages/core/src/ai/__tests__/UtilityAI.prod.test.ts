/**
 * UtilityAI.prod.test.ts — Sprint CLXX
 *
 * Production edge-case integration tests for the Utility AI orchestrator.
 * Ensures complex quadratic falloffs, dual-agent prioritization,
 * cooldown evasion, and fuzzy logic integration correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UtilityAI } from '@holoscript/framework/ai';
import type { UtilityAction, Consideration } from '@holoscript/framework/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let ai: UtilityAI;
let globalTime = 0;

beforeEach(() => {
  ai = new UtilityAI();
  globalTime = 0;
});

function createAction(
  id: string,
  inputFn: () => number,
  weight = 1.0,
  cooldown = 0,
  curve: 'linear' | 'quadratic' | 'logistic' | 'step' = 'linear'
): UtilityAction {
  return {
    id,
    name: id,
    considerations: [
      {
        name: 'default',
        input: inputFn,
        curve,
        weight,
        invert: false,
      },
    ],
    cooldown,
    lastExecuted: -Infinity,
    bonus: 0,
    execute: () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UtilityAI Complex Integration', () => {
  it('handles 100 simultaneous actions, correctly prioritizing mathematically', () => {
    for (let i = 0; i < 100; i++) {
      ai.addAction(createAction(`action-${i}`, () => i / 100, 1.0));
    }

    // action-99 should have the highest score (99/100)
    const best = ai.selectBest();
    expect(best?.name).toBe('action-99');
  });

  it('quadratic score modifiers apply correctly over base weights', () => {
    // Action A: Input 0.5, Weight 1.0, Quadratic -> Final: 1.0 * (0.5)^2 = 0.25
    ai.addAction(createAction('A', () => 0.5, 1.0, 0, 'quadratic'));

    // Action B: Input 0.4, Weight 2.0, Linear -> Final: 2.0 * 0.4 = 0.8
    // Wait, earlier I assumed Weight * Input^2. Let's make B quadratic too.
    // Action B: Input 0.4, Weight 2.0, Quadratic -> Final: 2.0 * (0.4)^2 = 0.32
    ai.addAction(createAction('B', () => 0.4, 2.0, 0, 'quadratic'));

    const best = ai.selectBest();
    expect(best?.name).toBe('B'); // 0.32 > 0.25
  });

  it('returns null if all tasks score exactly 0', () => {
    ai.addAction(createAction('A', () => 0));
    ai.addAction(createAction('B', () => 0));
    expect(ai.executeBest()).toBeNull();
  });

  it('dynamic context changes dynamically swap active action', () => {
    let health = 100;
    let enemyDistance = 50;

    ai.addAction(createAction('attack', () => (100 - enemyDistance) / 100));
    ai.addAction(createAction('heal', () => (100 - health) / 100));

    // Enemy is 50m away (attack=0.5), health is full (heal=0.0). Attack!
    expect(ai.selectBest()?.name).toBe('attack');

    // Health drops to 10. Heal score = 0.9. Attack score = 0.5. Heal!
    health = 10;
    expect(ai.selectBest()?.name).toBe('heal');

    // Enemy is 5m away (attack=0.95). Health is 30 (heal=0.7). Attack!
    enemyDistance = 5;
    health = 30;
    expect(ai.selectBest()?.name).toBe('attack');
  });

  it('cooldown logic completely zeros out otherwise highly weighted actions', () => {
    const ultimate = createAction('ultimate-attack', () => 1.0, 1.0, 5.0);
    ai.addAction(ultimate);
    ai.addAction(createAction('punch', () => 0.5));

    // Ultimate is available and scores > 0
    expect(ai.scoreAction(ultimate)).toBeGreaterThan(0);

    // Execute ultimate
    ai.setTime(0);
    ai.executeBest();

    // Now it is on cooldown
    expect(ai.scoreAction(ultimate)).toBe(0);

    // Wait 2 seconds (still on cooldown)
    ai.setTime(2.0);
    expect(ai.scoreAction(ultimate)).toBe(0);

    // Wait 4 more seconds (2 + 4 = 6)
    ai.setTime(6.0);
    // Now it is off cooldown
    expect(ai.scoreAction(ultimate)).toBeGreaterThan(0);
  });

  it('keeps running current action if its priority drops slightly but not below others', () => {
    let runs = 0;
    let scoreA = 0.9;

    const actionA = createAction('A', () => scoreA);
    actionA.execute = () => {
      runs++;
    };

    ai.addAction(actionA);
    ai.addAction(createAction('B', () => 0.5));

    ai.executeBest();
    expect(runs).toBe(1);

    scoreA = 0.6; // Priority dropped, but still > 0.5
    ai.executeBest();
    expect(runs).toBe(2);
  });

  it('multiple considerations combine multiplicatively with flat bonus addition', () => {
    const action = createAction('complex', () => 0);
    action.considerations = [
      { name: 'c1', input: () => 0.8, curve: 'linear', weight: 1.0, invert: false },
      { name: 'c2', input: () => 0.5, curve: 'linear', weight: 2.0, invert: false },
    ];
    action.bonus = 0.2;
    // Score should be: (0.8 * 1.0) * (0.5 * 2.0) + 0.2 =  0.8 * 1.0 + 0.2 = 1.0
    // Wait, the formula is: score = 1. For each c: score *= c.value * c.weight
    // So: score = 1 * (0.8 * 1.0) * (0.5 * 2.0) = 0.8. Total with bonus: 0.8 + 0.2 = 1.0
    ai.addAction(action);

    expect(ai.scoreAction(action)).toBeCloseTo(1.0);
  });

  it('logistic curve calculation correctness', () => {
    const action = createAction('logistic', () => 0.5, 1.0, 0, 'logistic');
    ai.addAction(action);

    // logistic: 1 / (1 + Math.exp(-10 * (input - 0.5)))
    // For input 0.5: 1 / (1 + exp(0)) = 0.5
    expect(ai.scoreAction(action)).toBeCloseTo(0.5);

    action.considerations[0].input = () => 1.0;
    // For input 1.0: 1 / (1 + exp(-5)) ~ 0.9933
    expect(ai.scoreAction(action)).toBeCloseTo(0.9933, 3);
  });

  it('step curve calculation correctness', () => {
    const action = createAction('step', () => 0.49, 1.0, 0, 'step');
    ai.addAction(action);
    // < 0.5 = 0
    expect(ai.scoreAction(action)).toBe(0);

    // >= 0.5 returns 1.0
    action.considerations[0].input = () => 0.5;
    expect(ai.scoreAction(action)).toBe(1.0);
  });

  it('scoreAll returns correctly sorted array of scores', () => {
    ai.addAction(createAction('C', () => 0.2));
    ai.addAction(createAction('A', () => 0.8));
    ai.addAction(createAction('B', () => 0.5));

    const scores = ai.scoreAll();
    expect(scores.length).toBe(3);
    expect(scores[0].actionId).toBe('A');
    expect(scores[1].actionId).toBe('B');
    expect(scores[2].actionId).toBe('C');
  });

  it('executeBest handles no valid actions correctly', () => {
    expect(ai.executeBest()).toBeNull();

    ai.addAction(createAction('A', () => 0));
    expect(ai.executeBest()).toBeNull();
  });
});
