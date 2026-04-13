import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UtilityAI } from '@holoscript/framework/ai';
import type { UtilityAction, Consideration } from '@holoscript/framework/ai';

// =============================================================================
// C254 — Utility AI
// =============================================================================

function makeAction(id: string, inputVal = 1, opts: Partial<UtilityAction> = {}): UtilityAction {
  return {
    id,
    name: id,
    considerations: [
      { name: 'test', input: () => inputVal, curve: 'linear', weight: 1, invert: false },
    ],
    cooldown: 0,
    lastExecuted: -999,
    bonus: 0,
    execute: vi.fn(),
    ...opts,
  };
}

describe('UtilityAI', () => {
  let ai: UtilityAI;
  beforeEach(() => {
    ai = new UtilityAI();
    ai.setTime(0);
  });

  it('addAction and getActionCount', () => {
    ai.addAction(makeAction('eat'));
    expect(ai.getActionCount()).toBe(1);
  });

  it('removeAction deletes action', () => {
    ai.addAction(makeAction('eat'));
    ai.removeAction('eat');
    expect(ai.getActionCount()).toBe(0);
  });

  it('scoreAction returns input * weight', () => {
    const action = makeAction('eat', 0.8);
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBeCloseTo(0.8);
  });

  it('scoreAction with bonus adds flat value', () => {
    const action = makeAction('eat', 0.5, { bonus: 0.3 });
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBeCloseTo(0.8);
  });

  it('quadratic curve squares input', () => {
    const action = makeAction('eat', 0.5, {
      considerations: [
        { name: 'hunger', input: () => 0.5, curve: 'quadratic', weight: 1, invert: false },
      ],
    });
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBeCloseTo(0.25);
  });

  it('step curve returns 0 below 0.5', () => {
    const action = makeAction('eat', 0.4, {
      considerations: [
        { name: 'threshold', input: () => 0.4, curve: 'step', weight: 1, invert: false },
      ],
    });
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBe(0 + action.bonus);
  });

  it('invert flips input', () => {
    const action = makeAction('eat', 0.8, {
      considerations: [
        { name: 'test', input: () => 0.8, curve: 'linear', weight: 1, invert: true },
      ],
    });
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBeCloseTo(0.2);
  });

  it('cooldown returns 0 score', () => {
    ai.setTime(10);
    const action = makeAction('heal', 1, { cooldown: 5, lastExecuted: 8 });
    ai.addAction(action);
    expect(ai.scoreAction(action)).toBe(0);
  });

  it('selectBest picks highest score', () => {
    ai.addAction(makeAction('low', 0.2));
    ai.addAction(makeAction('high', 0.9));
    expect(ai.selectBest()?.id).toBe('high');
  });

  it('executeBest calls execute on best', () => {
    const action = makeAction('eat', 1);
    ai.addAction(action);
    expect(ai.executeBest()).toBe('eat');
    expect(action.execute).toHaveBeenCalled();
  });

  it('executeBest returns null when all on cooldown', () => {
    ai.setTime(5);
    ai.addAction(makeAction('heal', 1, { cooldown: 100, lastExecuted: 4 }));
    expect(ai.executeBest()).toBeNull();
  });

  it('scoreAll returns sorted descending', () => {
    ai.addAction(makeAction('a', 0.3));
    ai.addAction(makeAction('b', 0.8));
    ai.addAction(makeAction('c', 0.5));
    const scores = ai.scoreAll();
    expect(scores[0].actionId).toBe('b');
    expect(scores[1].actionId).toBe('c');
    expect(scores[2].actionId).toBe('a');
  });

  it('history tracks executions', () => {
    ai.addAction(makeAction('eat', 1));
    ai.executeBest();
    expect(ai.getHistory()).toHaveLength(1);
    expect(ai.getHistory()[0].actionId).toBe('eat');
  });
});
