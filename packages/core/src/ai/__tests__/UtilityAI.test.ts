/**
 * UtilityAI Unit Tests
 *
 * Tests action scoring with curve types, cooldowns,
 * selection, execution, time management, and history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UtilityAI } from '../UtilityAI';
import type { UtilityAction, Consideration } from '../UtilityAI';

function makeAction(
  id: string,
  considerations: Consideration[],
  cooldown = 0,
  bonus = 0,
): UtilityAction {
  return { id, name: id, considerations, cooldown, lastExecuted: -Infinity, bonus, execute: vi.fn() };
}

function makeConsideration(
  name: string,
  input: () => number,
  curve: 'linear' | 'quadratic' | 'logistic' | 'step' = 'linear',
  weight = 1,
  invert = false,
): Consideration {
  return { name, input, curve, weight, invert };
}

describe('UtilityAI', () => {
  let ai: UtilityAI;

  beforeEach(() => {
    ai = new UtilityAI();
    ai.setTime(0);
  });

  describe('action management', () => {
    it('should add and count actions', () => {
      ai.addAction(makeAction('a', []));
      ai.addAction(makeAction('b', []));
      expect(ai.getActionCount()).toBe(2);
    });

    it('should remove actions', () => {
      ai.addAction(makeAction('a', []));
      ai.removeAction('a');
      expect(ai.getActionCount()).toBe(0);
    });
  });

  describe('scoring - curve types', () => {
    it('should score linear curve correctly', () => {
      const a = makeAction('a', [makeConsideration('c', () => 0.5, 'linear', 1)]);
      expect(ai.scoreAction(a)).toBeCloseTo(0.5);
    });

    it('should score quadratic curve correctly', () => {
      const a = makeAction('a', [makeConsideration('c', () => 0.5, 'quadratic', 1)]);
      expect(ai.scoreAction(a)).toBeCloseTo(0.25);
    });

    it('should score step curve', () => {
      const above = makeAction('a', [makeConsideration('c', () => 0.6, 'step', 1)]);
      const below = makeAction('b', [makeConsideration('c', () => 0.4, 'step', 1)]);
      expect(ai.scoreAction(above)).toBeCloseTo(1);
      expect(ai.scoreAction(below)).toBeCloseTo(0);
    });

    it('should score logistic curve (sigmoid)', () => {
      const high = makeAction('a', [makeConsideration('c', () => 0.9, 'logistic', 1)]);
      const low = makeAction('b', [makeConsideration('c', () => 0.1, 'logistic', 1)]);
      expect(ai.scoreAction(high)).toBeGreaterThan(0.9);
      expect(ai.scoreAction(low)).toBeLessThan(0.1);
    });

    it('should invert consideration input', () => {
      const normal = makeAction('n', [makeConsideration('c', () => 0.8, 'linear', 1, false)]);
      const inverted = makeAction('i', [makeConsideration('c', () => 0.8, 'linear', 1, true)]);
      expect(ai.scoreAction(normal)).toBeCloseTo(0.8);
      expect(ai.scoreAction(inverted)).toBeCloseTo(0.2);
    });

    it('should multiply considerations together', () => {
      const a = makeAction('a', [
        makeConsideration('c1', () => 0.5, 'linear', 1),
        makeConsideration('c2', () => 0.5, 'linear', 1),
      ]);
      expect(ai.scoreAction(a)).toBeCloseTo(0.25);
    });

    it('should apply bonus', () => {
      const a = makeAction('a', [makeConsideration('c', () => 0.5, 'linear', 1)], 0, 0.3);
      expect(ai.scoreAction(a)).toBeCloseTo(0.8);
    });
  });

  describe('cooldowns', () => {
    it('should return 0 score when on cooldown', () => {
      const a = makeAction('a', [makeConsideration('c', () => 1, 'linear', 1)], 5);
      a.lastExecuted = 0;
      ai.setTime(3); // Only 3s elapsed, cooldown is 5
      expect(ai.scoreAction(a)).toBe(0);
    });

    it('should score normally after cooldown', () => {
      const a = makeAction('a', [makeConsideration('c', () => 1, 'linear', 1)], 5);
      a.lastExecuted = 0;
      ai.setTime(6);
      expect(ai.scoreAction(a)).toBeGreaterThan(0);
    });
  });

  describe('scoreAll', () => {
    it('should return scores sorted descending', () => {
      ai.addAction(makeAction('low', [makeConsideration('c', () => 0.2, 'linear', 1)]));
      ai.addAction(makeAction('high', [makeConsideration('c', () => 0.9, 'linear', 1)]));
      const scores = ai.scoreAll();
      expect(scores[0].actionId).toBe('high');
      expect(scores[1].actionId).toBe('low');
    });
  });

  describe('selectBest', () => {
    it('should select the highest scoring action', () => {
      ai.addAction(makeAction('low', [makeConsideration('c', () => 0.2, 'linear', 1)]));
      ai.addAction(makeAction('high', [makeConsideration('c', () => 0.9, 'linear', 1)]));
      expect(ai.selectBest()?.id).toBe('high');
    });

    it('should return null when no actions', () => {
      expect(ai.selectBest()).toBeNull();
    });
  });

  describe('executeBest', () => {
    it('should execute the best action and track history', () => {
      const a = makeAction('doStuff', [makeConsideration('c', () => 1, 'linear', 1)]);
      ai.addAction(a);
      const result = ai.executeBest();
      expect(result).toBe('doStuff');
      expect(a.execute).toHaveBeenCalled();
      expect(ai.getHistory().length).toBe(1);
    });

    it('should return null when all scores are 0', () => {
      const a = makeAction('cd', [makeConsideration('c', () => 1, 'linear', 1)], 99);
      a.lastExecuted = 0; // currentTime=0, 0-0=0 < 99 → on cooldown → score=0
      ai.addAction(a);
      expect(ai.executeBest()).toBeNull();
    });
  });
});
