/**
 * RewardSystem.prod.test.ts
 *
 * Production tests for RewardSystem.
 * Pure in-memory, zero I/O, deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RewardSystem, type RewardDef } from '../RewardSystem';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RewardSystem', () => {
  let sys: RewardSystem;

  beforeEach(() => {
    sys = new RewardSystem();
  });

  // ── Bundle Management ─────────────────────────────────────────────────────

  describe('createBundle / getBundle', () => {
    it('creates a bundle with an id and rewards', () => {
      const bundle = sys.createBundle('Quest Reward', [
        { type: 'xp', target: 'player', amount: 100 },
      ]);
      expect(bundle.name).toBe('Quest Reward');
      expect(bundle.claimed).toBe(false);
      expect(bundle.claimedAt).toBeNull();
      expect(bundle.rewards).toHaveLength(1);
    });

    it('each reward gets a unique id', () => {
      const bundle = sys.createBundle('R', [
        { type: 'xp', target: 'player', amount: 10 },
        { type: 'currency', target: 'gold', amount: 50 },
      ]);
      expect(bundle.rewards[0].id).not.toBe(bundle.rewards[1].id);
    });

    it('getBundle returns the bundle', () => {
      const b = sys.createBundle('B', []);
      expect(sys.getBundle(b.id)).toBeDefined();
    });

    it('getBundle returns undefined for unknown id', () => {
      expect(sys.getBundle('bad')).toBeUndefined();
    });

    it('getBundleCount increments', () => {
      sys.createBundle('A', []);
      sys.createBundle('B', []);
      expect(sys.getBundleCount()).toBe(2);
    });
  });

  // ── Claim ─────────────────────────────────────────────────────────────────

  describe('claim', () => {
    it('returns null for unknown bundle', () => {
      expect(sys.claim('bad')).toBeNull();
    });

    it('returns null when already claimed', () => {
      const b = sys.createBundle('C', []);
      sys.claim(b.id);
      expect(sys.claim(b.id)).toBeNull();
    });

    it('returns the array of granted rewards', () => {
      const b = sys.createBundle('C', [
        { type: 'xp', target: 'player', amount: 50 },
      ]);
      const granted = sys.claim(b.id);
      expect(granted).not.toBeNull();
      expect(granted).toHaveLength(1);
    });

    it('marks bundle as claimed', () => {
      const b = sys.createBundle('C', []);
      sys.claim(b.id);
      expect(sys.getBundle(b.id)!.claimed).toBe(true);
      expect(sys.getBundle(b.id)!.claimedAt).not.toBeNull();
    });

    it('getClaimedCount increments', () => {
      const b = sys.createBundle('C', []);
      sys.claim(b.id);
      expect(sys.getClaimedCount()).toBe(1);
    });
  });

  // ── XP & Leveling ─────────────────────────────────────────────────────────

  describe('addXP / leveling', () => {
    it('starts at xp=0 level=1', () => {
      expect(sys.getXP()).toBe(0);
      expect(sys.getLevel()).toBe(1);
    });

    it('addXP increases xp', () => {
      sys.addXP(50);
      expect(sys.getXP()).toBe(50);
    });

    it('level up occurs at xpPerLevel=100 threshold', () => {
      const result = sys.addXP(200); // level 1→2 at 200, level 2→3 at 300?
      // getXPForLevel(2) = 200, so 200 XP → level 2
      expect(result.leveled).toBe(true);
      expect(sys.getLevel()).toBe(2);
    });

    it('no level up below threshold', () => {
      const result = sys.addXP(50);
      expect(result.leveled).toBe(false);
      expect(sys.getLevel()).toBe(1);
    });

    it('setXPMultiplier scales added XP', () => {
      sys.setXPMultiplier(2);
      sys.addXP(50);
      expect(sys.getXP()).toBe(100);
    });

    it('xp reward through bundle triggers leveling', () => {
      const b = sys.createBundle('LevelUp', [
        { type: 'xp', target: 'player', amount: 200 },
      ]);
      sys.claim(b.id);
      expect(sys.getLevel()).toBeGreaterThan(1);
    });
  });

  // ── Currency ──────────────────────────────────────────────────────────────

  describe('currency', () => {
    it('initial gold is 0', () => {
      expect(sys.getCurrency('gold')).toBe(0);
    });

    it('currency reward adds to balance', () => {
      const b = sys.createBundle('Pay', [
        { type: 'currency', target: 'gold', amount: 150 },
      ]);
      sys.claim(b.id);
      expect(sys.getCurrency('gold')).toBe(150);
    });

    it('spendCurrency deducts balance', () => {
      const b = sys.createBundle('Pay', [
        { type: 'currency', target: 'gold', amount: 100 },
      ]);
      sys.claim(b.id);
      expect(sys.spendCurrency('gold', 40)).toBe(true);
      expect(sys.getCurrency('gold')).toBe(60);
    });

    it('spendCurrency returns false when insufficient', () => {
      expect(sys.spendCurrency('gold', 999)).toBe(false);
    });

    it('getCurrency returns 0 for unknown currency', () => {
      expect(sys.getCurrency('gems')).toBe(0);
    });
  });

  // ── Unlock Reward ─────────────────────────────────────────────────────────

  describe('unlock rewards', () => {
    it('unlock reward sets hasUnlock to true', () => {
      expect(sys.hasUnlock('dungeon_key')).toBe(false);
      const b = sys.createBundle('Key', [
        { type: 'unlock', target: 'dungeon_key', amount: 1 },
      ]);
      sys.claim(b.id);
      expect(sys.hasUnlock('dungeon_key')).toBe(true);
    });
  });

  // ── Skill Point Reward ────────────────────────────────────────────────────

  describe('skill_point rewards', () => {
    it('skill_point reward increases skillPoints', () => {
      const b = sys.createBundle('Skill', [
        { type: 'skill_point', target: '', amount: 3 },
      ]);
      sys.claim(b.id);
      expect(sys.getSkillPoints()).toBe(3);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns a snapshot of player stats', () => {
      const b = sys.createBundle('Multi', [
        { type: 'xp', target: 'player', amount: 50 },
        { type: 'currency', target: 'gold', amount: 30 },
        { type: 'unlock', target: 'sword', amount: 1 },
        { type: 'skill_point', target: '', amount: 2 },
      ]);
      sys.claim(b.id);
      const stats = sys.getStats();
      expect(stats.xp).toBe(50);
      expect(stats.currency.get('gold')).toBe(30);
      expect(stats.unlocks.has('sword')).toBe(true);
      expect(stats.skillPoints).toBe(2);
    });
  });
});
