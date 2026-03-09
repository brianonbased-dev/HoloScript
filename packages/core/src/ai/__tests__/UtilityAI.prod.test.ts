/**
 * UtilityAI — Production Test Suite
 *
 * Covers: action management, scoring (linear/quadratic/logistic/step curves),
 * cooldowns, selectBest, executeBest, history, inversion, bonus.
 */
import { describe, it, expect, vi } from 'vitest';
import { UtilityAI, type UtilityAction, type Consideration } from '../UtilityAI';

// ─── Helpers ────────────────────────────────────────────────────────
function makeAction(
  id: string,
  considerations: Consideration[],
  overrides: Partial<UtilityAction> = {}
): UtilityAction {
  return {
    id,
    name: id,
    considerations,
    cooldown: 0,
    lastExecuted: -Infinity,
    bonus: 0,
    execute: vi.fn(),
    ...overrides,
  };
}

function makeCon(
  input: number,
  curve: 'linear' | 'quadratic' | 'logistic' | 'step' = 'linear',
  weight = 1,
  invert = false
): Consideration {
  return { name: 'c', input: () => input, curve, weight, invert };
}

describe('UtilityAI — Production', () => {
  // ─── Action Management ────────────────────────────────────────────
  it('addAction + getActionCount', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('eat', []));
    expect(ai.getActionCount()).toBe(1);
  });

  it('removeAction decrements count', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('eat', []));
    ai.removeAction('eat');
    expect(ai.getActionCount()).toBe(0);
  });

  // ─── Scoring: Linear ─────────────────────────────────────────────
  it('linear curve scores proportionally', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.5, 'linear')]);
    expect(ai.scoreAction(action)).toBeCloseTo(0.5);
  });

  // ─── Scoring: Quadratic ───────────────────────────────────────────
  it('quadratic curve squares input', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.5, 'quadratic')]);
    expect(ai.scoreAction(action)).toBeCloseTo(0.25);
  });

  // ─── Scoring: Logistic ────────────────────────────────────────────
  it('logistic curve at midpoint ≈ 0.5', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.5, 'logistic')]);
    expect(ai.scoreAction(action)).toBeCloseTo(0.5, 1);
  });

  it('logistic curve at 1 ≈ 1', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(1.0, 'logistic')]);
    expect(ai.scoreAction(action)).toBeGreaterThan(0.99);
  });

  // ─── Scoring: Step ────────────────────────────────────────────────
  it('step curve below threshold → 0', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.3, 'step')]);
    expect(ai.scoreAction(action)).toBe(0);
  });

  it('step curve above threshold → 1', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.7, 'step')]);
    expect(ai.scoreAction(action)).toBeCloseTo(1);
  });

  // ─── Inversion ────────────────────────────────────────────────────
  it('invert flips input', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.8, 'linear', 1, true)]);
    expect(ai.scoreAction(action)).toBeCloseTo(0.2);
  });

  // ─── Bonus ────────────────────────────────────────────────────────
  it('bonus adds to score', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.5, 'linear')], { bonus: 0.3 });
    expect(ai.scoreAction(action)).toBeCloseTo(0.8);
  });

  // ─── Cooldown ─────────────────────────────────────────────────────
  it('cooldown blocks scoring', () => {
    const ai = new UtilityAI();
    ai.setTime(10);
    const action = makeAction('a', [makeCon(1.0)], { cooldown: 5, lastExecuted: 8 });
    expect(ai.scoreAction(action)).toBe(0);
  });

  it('cooldown allows after elapsed', () => {
    const ai = new UtilityAI();
    ai.setTime(100);
    const action = makeAction('a', [makeCon(1.0)], { cooldown: 5, lastExecuted: 10 });
    expect(ai.scoreAction(action)).toBeGreaterThan(0);
  });

  // ─── scoreAll ─────────────────────────────────────────────────────
  it('scoreAll returns sorted scores', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('low', [makeCon(0.2)]));
    ai.addAction(makeAction('high', [makeCon(0.9)]));
    const scores = ai.scoreAll();
    expect(scores[0].actionId).toBe('high');
    expect(scores[1].actionId).toBe('low');
  });

  // ─── selectBest ───────────────────────────────────────────────────
  it('selectBest returns highest scoring action', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('low', [makeCon(0.1)]));
    ai.addAction(makeAction('high', [makeCon(0.9)]));
    expect(ai.selectBest()?.id).toBe('high');
  });

  it('selectBest returns null when empty', () => {
    const ai = new UtilityAI();
    expect(ai.selectBest()).toBeNull();
  });

  // ─── executeBest ──────────────────────────────────────────────────
  it('executeBest calls execute on best action', () => {
    const ai = new UtilityAI();
    const action = makeAction('eat', [makeCon(0.9)]);
    ai.addAction(action);
    const result = ai.executeBest();
    expect(result).toBe('eat');
    expect(action.execute).toHaveBeenCalled();
  });

  it('executeBest records in history', () => {
    const ai = new UtilityAI();
    ai.addAction(makeAction('eat', [makeCon(0.9)]));
    ai.executeBest();
    expect(ai.getHistory().length).toBe(1);
    expect(ai.getHistory()[0].actionId).toBe('eat');
  });

  // ─── Multiple Considerations ──────────────────────────────────────
  it('multiple considerations multiply scores', () => {
    const ai = new UtilityAI();
    const action = makeAction('a', [makeCon(0.5, 'linear'), makeCon(0.5, 'linear')]);
    expect(ai.scoreAction(action)).toBeCloseTo(0.25);
  });
});
