import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UtilityAI, type UtilityAction, type Consideration } from '../UtilityAI';

function makeAction(id: string, overrides: Partial<UtilityAction> = {}): UtilityAction {
  return {
    id,
    name: id,
    considerations: [{ name: 'always', input: () => 1, curve: 'linear', weight: 1, invert: false }],
    cooldown: 0,
    lastExecuted: -999,
    bonus: 0,
    execute: vi.fn(),
    ...overrides,
  };
}

describe('UtilityAI', () => {
  let ai: UtilityAI;

  beforeEach(() => {
    ai = new UtilityAI();
  });

  // ---------------------------------------------------------------------------
  // Action Management
  // ---------------------------------------------------------------------------

  it('addAction registers action', () => {
    ai.addAction(makeAction('a'));
    expect(ai.getActionCount()).toBe(1);
  });

  it('removeAction unregisters', () => {
    ai.addAction(makeAction('a'));
    ai.removeAction('a');
    expect(ai.getActionCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  it('scoreAction returns positive for available action', () => {
    const act = makeAction('a');
    ai.addAction(act);
    expect(ai.scoreAction(act)).toBeGreaterThan(0);
  });

  it('scoreAction returns 0 during cooldown', () => {
    const act = makeAction('a', { cooldown: 5, lastExecuted: 0 });
    ai.addAction(act);
    ai.setTime(2); // only 2s since lastExecuted, cooldown is 5
    expect(ai.scoreAction(act)).toBe(0);
  });

  it('scoreAction applies quadratic curve', () => {
    const c: Consideration = {
      name: 'c',
      input: () => 0.5,
      curve: 'quadratic',
      weight: 1,
      invert: false,
    };
    const act = makeAction('a', { considerations: [c] });
    ai.addAction(act);
    expect(ai.scoreAction(act)).toBeCloseTo(0.25); // 0.5^2
  });

  it('scoreAction applies step curve', () => {
    const cLow: Consideration = {
      name: 'c',
      input: () => 0.3,
      curve: 'step',
      weight: 1,
      invert: false,
    };
    const cHigh: Consideration = {
      name: 'c2',
      input: () => 0.7,
      curve: 'step',
      weight: 1,
      invert: false,
    };
    expect(ai.scoreAction(makeAction('lo', { considerations: [cLow] }))).toBe(0);
    expect(ai.scoreAction(makeAction('hi', { considerations: [cHigh] }))).toBe(1);
  });

  it('scoreAction with invert flips input', () => {
    const c: Consideration = {
      name: 'c',
      input: () => 0.2,
      curve: 'linear',
      weight: 1,
      invert: true,
    };
    const act = makeAction('a', { considerations: [c] });
    expect(ai.scoreAction(act)).toBeCloseTo(0.8);
  });

  it('scoreAction adds bonus', () => {
    const act = makeAction('a', { bonus: 5 });
    expect(ai.scoreAction(act)).toBe(6); // 1 (from consideration) + 5
  });

  // ---------------------------------------------------------------------------
  // Score All
  // ---------------------------------------------------------------------------

  it('scoreAll returns sorted scores', () => {
    ai.addAction(makeAction('low', { bonus: 0 }));
    ai.addAction(makeAction('high', { bonus: 10 }));
    const scores = ai.scoreAll();
    expect(scores[0].actionId).toBe('high');
    expect(scores[0].score).toBeGreaterThan(scores[1].score);
  });

  // ---------------------------------------------------------------------------
  // Selection & Execution
  // ---------------------------------------------------------------------------

  it('selectBest returns highest scored action', () => {
    ai.addAction(makeAction('low', { bonus: 0 }));
    ai.addAction(makeAction('high', { bonus: 10 }));
    expect(ai.selectBest()!.id).toBe('high');
  });

  it('executeBest calls execute and returns id', () => {
    const act = makeAction('a');
    ai.addAction(act);
    ai.setTime(10);
    const result = ai.executeBest();
    expect(result).toBe('a');
    expect(act.execute).toHaveBeenCalledTimes(1);
  });

  it('executeBest returns null when all on cooldown', () => {
    ai.addAction(makeAction('a', { cooldown: 100, lastExecuted: 0 }));
    ai.setTime(1);
    expect(ai.executeBest()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  it('history records executed actions', () => {
    ai.addAction(makeAction('a'));
    ai.setTime(5);
    ai.executeBest();
    const hist = ai.getHistory();
    expect(hist).toHaveLength(1);
    expect(hist[0].actionId).toBe('a');
    expect(hist[0].timestamp).toBe(5);
  });
});
