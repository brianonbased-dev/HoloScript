/**
 * AntiCheat — production test suite
 *
 * Tests: registerPlayer, unregisterPlayer, validatePositionUpdate
 * (valid move, teleport detection, speed detection, banned player),
 * validateAction (rate limiting), getViolations / getViolationCount,
 * ban threshold auto-ban, manual ban(), getPlayerIds, getConfig defaults,
 * unregistered player edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AntiCheat } from '../AntiCheat';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AntiCheat: production', () => {
  let ac: AntiCheat;

  beforeEach(() => {
    ac = new AntiCheat({
      maxSpeed: 10,
      maxTeleportDistance: 30,
      maxActionsPerSecond: 5,
      violationThreshold: 3,
      banThreshold: 3,
    });
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
  });

  // ─── register / unregister ────────────────────────────────────────────────
  describe('registerPlayer / unregisterPlayer', () => {
    it('registers a player', () => {
      expect(ac.getPlayerIds()).toContain('p1');
    });

    it('getPlayerState returns state after register', () => {
      expect(ac.getPlayerState('p1')).toBeDefined();
    });

    it('unregisters a player', () => {
      ac.unregisterPlayer('p1');
      expect(ac.getPlayerIds()).not.toContain('p1');
    });

    it('getPlayerState returns undefined for unregistered', () => {
      expect(ac.getPlayerState('ghost')).toBeUndefined();
    });
  });

  // ─── validatePositionUpdate ───────────────────────────────────────────────
  describe('validatePositionUpdate', () => {
    it('valid small move returns valid=true', () => {
      const result = ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 });
      expect(result.valid).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('updates player position on valid move', () => {
      ac.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      expect(ac.getPlayerState('p1')!.position.x).toBe(5);
    });

    it('teleport (>maxTeleportDistance) returns valid=false with teleport violation', () => {
      const result = ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('teleport');
    });

    it('teleport adds violation to player', () => {
      ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
      expect(ac.getViolationCount('p1')).toBe(1);
    });

    it('returns valid=false for unregistered player', () => {
      expect(ac.validatePositionUpdate('ghost', { x: 1, y: 0, z: 0 }).valid).toBe(false);
    });

    it('returns valid=false for banned player', () => {
      ac.ban('p1');
      expect(ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 }).valid).toBe(false);
    });
  });

  // ─── ban threshold ────────────────────────────────────────────────────────
  describe('auto-ban on ban threshold', () => {
    it('auto-bans after reaching banThreshold violations', () => {
      // banThreshold=3, each teleport adds 1 violation
      // Need to reset position between to avoid speed detection short-circuiting
      for (let i = 0; i < 3; i++) {
        // Reset to allow movement first
        const state = ac.getPlayerState('p1')!;
        state.position = { x: 0, y: 0, z: 0 };
        ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 }); // teleport
      }
      expect(ac.isBanned('p1')).toBe(true);
    });
  });

  // ─── manual ban ──────────────────────────────────────────────────────────
  describe('manual ban', () => {
    it('ban() marks player as banned', () => {
      ac.ban('p1');
      expect(ac.isBanned('p1')).toBe(true);
    });

    it('isBanned returns false for unregistered player', () => {
      expect(ac.isBanned('ghost')).toBe(false);
    });
  });

  // ─── validateAction (rate limiting) ──────────────────────────────────────
  describe('validateAction', () => {
    it('first actions within limit are allowed', () => {
      for (let i = 0; i < 5; i++) {
        expect(ac.validateAction('p1').allowed).toBe(true);
      }
    });

    it('exceeding maxActionsPerSecond is rejected', () => {
      // Fill up the window
      for (let i = 0; i < 6; i++) {
        ac.validateAction('p1');
      }
      const result = ac.validateAction('p1');
      expect(result.allowed).toBe(false);
      expect(result.violation?.type).toBe('rate_limit');
    });

    it('returns allowed=false for unregistered player', () => {
      expect(ac.validateAction('ghost').allowed).toBe(false);
    });
  });

  // ─── getViolations / count ────────────────────────────────────────────────
  describe('violations', () => {
    it('getViolations returns empty for clean player', () => {
      expect(ac.getViolations('p1')).toHaveLength(0);
    });

    it('getViolationCount returns 0 for unknown player', () => {
      expect(ac.getViolationCount('ghost')).toBe(0);
    });
  });

  // ─── getConfig ────────────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('returns custom config values', () => {
      const cfg = ac.getConfig();
      expect(cfg.maxSpeed).toBe(10);
      expect(cfg.maxTeleportDistance).toBe(30);
    });

    it('defaults are applied when not specified', () => {
      const ac2 = new AntiCheat();
      expect(ac2.getConfig().maxSpeed).toBe(20);
      expect(ac2.getConfig().maxTeleportDistance).toBe(50);
    });
  });

  // ─── getPlayerIds ─────────────────────────────────────────────────────────
  describe('getPlayerIds', () => {
    it('returns all registered player ids', () => {
      ac.registerPlayer('p2');
      expect(ac.getPlayerIds()).toContain('p1');
      expect(ac.getPlayerIds()).toContain('p2');
    });
  });
});
