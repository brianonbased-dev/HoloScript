/**
 * AchievementSystem.prod.test.ts
 *
 * Production tests for AchievementSystem.
 * Pure in-memory, zero I/O, deterministic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AchievementSystem,
  type AchievementDef,
  type AchievementRarity,
} from '../AchievementSystem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAch(
  sys: AchievementSystem,
  id: string,
  opts: {
    rarity?: AchievementRarity;
    maxProgress?: number;
    hidden?: boolean;
    category?: string;
  } = {}
): AchievementDef {
  return sys.register({
    id,
    name: `Achievement ${id}`,
    description: 'Test achievement',
    icon: 'star',
    rarity: opts.rarity ?? 'bronze',
    maxProgress: opts.maxProgress ?? 1,
    hidden: opts.hidden ?? false,
    category: opts.category ?? 'general',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AchievementSystem', () => {
  let sys: AchievementSystem;

  beforeEach(() => {
    sys = new AchievementSystem();
  });

  // ── Registration ──────────────────────────────────────────────────────────

  describe('register / get', () => {
    it('registers an achievement and returns it', () => {
      const ach = makeAch(sys, 'first_kill');
      expect(ach.id).toBe('first_kill');
      expect(ach.unlocked).toBe(false);
      expect(ach.currentProgress).toBe(0);
    });

    it('get() returns the achievement', () => {
      makeAch(sys, 'a1');
      const ach = sys.get('a1');
      expect(ach).toBeDefined();
      expect(ach!.id).toBe('a1');
    });

    it('get() returns undefined for unknown id', () => {
      expect(sys.get('nope')).toBeUndefined();
    });

    it('getCount() increases after registration', () => {
      makeAch(sys, 'x');
      makeAch(sys, 'y');
      expect(sys.getCount()).toBe(2);
    });
  });

  // ── Progress ──────────────────────────────────────────────────────────────

  describe('addProgress', () => {
    it('increments currentProgress', () => {
      makeAch(sys, 'p', { maxProgress: 10 });
      sys.addProgress('p', 3);
      expect(sys.get('p')!.currentProgress).toBe(3);
    });

    it('caps progress at maxProgress', () => {
      makeAch(sys, 'p', { maxProgress: 5 });
      sys.addProgress('p', 100);
      expect(sys.get('p')!.currentProgress).toBe(5);
    });

    it('returns false for unknown id', () => {
      expect(sys.addProgress('bad', 1)).toBe(false);
    });

    it('returns false when already unlocked', () => {
      makeAch(sys, 'done');
      sys.addProgress('done', 1);       // unlocks it
      expect(sys.addProgress('done', 1)).toBe(false);
    });

    it('returns true when progress reaches max (unlock)', () => {
      makeAch(sys, 'q', { maxProgress: 3 });
      sys.addProgress('q', 2);
      expect(sys.addProgress('q', 1)).toBe(true);
      expect(sys.get('q')!.unlocked).toBe(true);
    });

    it('default amount is 1', () => {
      makeAch(sys, 'r', { maxProgress: 5 });
      sys.addProgress('r');
      expect(sys.get('r')!.currentProgress).toBe(1);
    });
  });

  // ── Unlock ─────────────────────────────────────────────────────────────────

  describe('unlock', () => {
    it('unlocks immediately regardless of progress', () => {
      makeAch(sys, 'u', { maxProgress: 10 });
      expect(sys.unlock('u')).toBe(true);
      const ach = sys.get('u')!;
      expect(ach.unlocked).toBe(true);
      expect(ach.currentProgress).toBe(10);
      expect(ach.unlockedAt).not.toBeNull();
    });

    it('returns false for unknown id', () => {
      expect(sys.unlock('missing')).toBe(false);
    });

    it('returns false if already unlocked', () => {
      makeAch(sys, 'v');
      sys.unlock('v');
      expect(sys.unlock('v')).toBe(false);
    });
  });

  // ── Events ─────────────────────────────────────────────────────────────────

  describe('onUnlock listener', () => {
    it('fires on addProgress unlock', () => {
      const listener = vi.fn();
      sys.onUnlock(listener);
      makeAch(sys, 'evt', { maxProgress: 1 });
      sys.addProgress('evt', 1);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].id).toBe('evt');
    });

    it('fires on explicit unlock()', () => {
      const listener = vi.fn();
      sys.onUnlock(listener);
      makeAch(sys, 'e2');
      sys.unlock('e2');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('supports multiple listeners', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      sys.onUnlock(l1);
      sys.onUnlock(l2);
      makeAch(sys, 'multi');
      sys.unlock('multi');
      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });

  // ── Points ─────────────────────────────────────────────────────────────────

  describe('getTotalPoints / rarity', () => {
    it('starts at 0 points', () => {
      expect(sys.getTotalPoints()).toBe(0);
    });

    it('awards bronze=5 on unlock', () => {
      makeAch(sys, 'b', { rarity: 'bronze' });
      sys.unlock('b');
      expect(sys.getTotalPoints()).toBe(5);
    });

    it('awards silver=10 on unlock', () => {
      makeAch(sys, 's', { rarity: 'silver' });
      sys.unlock('s');
      expect(sys.getTotalPoints()).toBe(10);
    });

    it('awards gold=25 on unlock', () => {
      makeAch(sys, 'g', { rarity: 'gold' });
      sys.unlock('g');
      expect(sys.getTotalPoints()).toBe(25);
    });

    it('accumulates points across multiple unlocks', () => {
      makeAch(sys, 'x1', { rarity: 'bronze' });
      makeAch(sys, 'x2', { rarity: 'gold' });
      sys.unlock('x1');
      sys.unlock('x2');
      expect(sys.getTotalPoints()).toBe(30); // 5 + 25
    });
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  describe('queries', () => {
    beforeEach(() => {
      makeAch(sys, 'c1', { category: 'combat', rarity: 'bronze' });
      makeAch(sys, 'c2', { category: 'combat', rarity: 'silver' });
      makeAch(sys, 'e1', { category: 'exploration', rarity: 'gold' });
      sys.unlock('c1');
    });

    it('getAll() returns all', () => {
      expect(sys.getAll()).toHaveLength(3);
    });

    it('getUnlocked() returns only unlocked', () => {
      const unlocked = sys.getUnlocked();
      expect(unlocked).toHaveLength(1);
      expect(unlocked[0].id).toBe('c1');
    });

    it('getLocked() returns only locked', () => {
      expect(sys.getLocked()).toHaveLength(2);
    });

    it('getByCategory() filters correctly', () => {
      const combat = sys.getByCategory('combat');
      expect(combat).toHaveLength(2);
    });

    it('getByRarity() filters correctly', () => {
      expect(sys.getByRarity('gold')).toHaveLength(1);
      expect(sys.getByRarity('gold')[0].id).toBe('e1');
    });

    it('getUnlockedCount()', () => {
      expect(sys.getUnlockedCount()).toBe(1);
    });

    it('getCompletionPercent() = 33.33...%', () => {
      expect(sys.getCompletionPercent()).toBeCloseTo(33.33, 1);
    });

    it('getCompletionPercent() returns 0 when no achievements', () => {
      const empty = new AchievementSystem();
      expect(empty.getCompletionPercent()).toBe(0);
    });

    it('getProgress() returns 0-1 ratio', () => {
      makeAch(sys, 'prog', { maxProgress: 4 });
      sys.addProgress('prog', 2);
      expect(sys.getProgress('prog')).toBeCloseTo(0.5);
    });

    it('getProgress() returns 0 for unknown id', () => {
      expect(sys.getProgress('x')).toBe(0);
    });
  });
});
