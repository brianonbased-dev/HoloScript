/**
 * AntiCheat — comprehensive edge-case test suite
 *
 * Covers: default config, multiple players, velocity tracking,
 * speed detection timing, rate limit window reset, violation
 * accumulation across types, ban persistence, and null/edge inputs.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AntiCheat } from '../AntiCheat';

describe('AntiCheat: comprehensive edge cases', () => {
  let ac: AntiCheat;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Default config
  // ===========================================================================

  describe('default config values', () => {
    it('uses defaults when no config is provided', () => {
      ac = new AntiCheat();
      const cfg = ac.getConfig();
      expect(cfg.maxSpeed).toBe(20);
      expect(cfg.maxTeleportDistance).toBe(50);
      expect(cfg.maxActionsPerSecond).toBe(30);
      expect(cfg.violationThreshold).toBe(3);
      expect(cfg.banThreshold).toBe(5);
    });

    it('uses defaults for omitted fields', () => {
      ac = new AntiCheat({ maxSpeed: 100 });
      const cfg = ac.getConfig();
      expect(cfg.maxSpeed).toBe(100);
      expect(cfg.maxTeleportDistance).toBe(50); // default
    });

    it('getConfig returns a copy (not a reference)', () => {
      ac = new AntiCheat();
      const cfg1 = ac.getConfig();
      const cfg2 = ac.getConfig();
      expect(cfg1).toEqual(cfg2);
      expect(cfg1).not.toBe(cfg2);
    });
  });

  // ===========================================================================
  // Registration edge cases
  // ===========================================================================

  describe('registration edge cases', () => {
    beforeEach(() => {
      ac = new AntiCheat();
    });

    it('registerPlayer with default position', () => {
      ac.registerPlayer('p1');
      const state = ac.getPlayerState('p1')!;
      expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('registerPlayer with custom position', () => {
      ac.registerPlayer('p1', { x: 10, y: 20, z: 30 });
      const state = ac.getPlayerState('p1')!;
      expect(state.position).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('player starts with empty violations', () => {
      ac.registerPlayer('p1');
      expect(ac.getPlayerState('p1')!.violations).toEqual([]);
    });

    it('player starts not banned', () => {
      ac.registerPlayer('p1');
      expect(ac.getPlayerState('p1')!.banned).toBe(false);
    });

    it('re-registering a player resets their state', () => {
      ac.registerPlayer('p1', { x: 10, y: 0, z: 0 });
      ac.ban('p1');
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      expect(ac.isBanned('p1')).toBe(false);
      expect(ac.getPlayerState('p1')!.position.x).toBe(0);
    });

    it('multiple players are tracked independently', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      ac.registerPlayer('p2', { x: 100, y: 0, z: 0 });
      expect(ac.getPlayerIds().length).toBe(2);
      expect(ac.getPlayerState('p1')!.position.x).toBe(0);
      expect(ac.getPlayerState('p2')!.position.x).toBe(100);
    });

    it('unregister one player does not affect others', () => {
      ac.registerPlayer('p1');
      ac.registerPlayer('p2');
      ac.unregisterPlayer('p1');
      expect(ac.getPlayerState('p1')).toBeUndefined();
      expect(ac.getPlayerState('p2')).toBeDefined();
    });

    it('unregister nonexistent player is safe', () => {
      expect(() => ac.unregisterPlayer('nonexistent')).not.toThrow();
    });
  });

  // ===========================================================================
  // Speed detection with time
  // ===========================================================================

  describe('speed detection with realistic timing', () => {
    beforeEach(() => {
      ac = new AntiCheat({ maxSpeed: 10, maxTeleportDistance: 100 });
    });

    it('allows movement within speed limit over time', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(1000); // 1 second
      // Speed = 5 / 1 = 5 u/s, maxSpeed = 10
      const result = ac.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      expect(result.valid).toBe(true);
    });

    it('detects speed violation over time', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(1000); // 1 second
      // Speed = 15 / 1 = 15 u/s, maxSpeed = 10
      const result = ac.validatePositionUpdate('p1', { x: 15, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('speed');
      expect(result.violation?.severity).toBe('warning');
    });

    it('skips speed check when dt is sub-10ms (avoids false positives)', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      // No time advance — dt < 10ms
      // Distance 15 < maxTeleportDistance 100, so teleport check passes
      // Speed check skipped due to sub-10ms dt
      const result = ac.validatePositionUpdate('p1', { x: 15, y: 0, z: 0 });
      // Should pass because speed check is skipped for sub-ms timing
      expect(result.valid).toBe(true);
    });

    it('updates velocity on valid move', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(1000);
      ac.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      const state = ac.getPlayerState('p1')!;
      expect(state.velocity.x).toBeCloseTo(5, 0); // ~5 u/s
    });
  });

  // ===========================================================================
  // Teleport detection edge cases
  // ===========================================================================

  describe('teleport detection edge cases', () => {
    beforeEach(() => {
      ac = new AntiCheat({ maxTeleportDistance: 50, maxSpeed: 100 });
    });

    it('position exactly at maxTeleportDistance is allowed (if within speed limit)', () => {
      // maxSpeed 100 is set, distance=50, need dt so speed=50/dt < 100
      // dt = 1s => speed = 50/1 = 50 < 100
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(1000);
      // distance = 50, maxTeleportDistance = 50, 50 > 50 is false (passes teleport check)
      // speed = 50/1 = 50 < 100 (passes speed check)
      const result = ac.validatePositionUpdate('p1', { x: 50, y: 0, z: 0 });
      expect(result.valid).toBe(true);
    });

    it('position just over maxTeleportDistance is flagged', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(100);
      const result = ac.validatePositionUpdate('p1', { x: 50.1, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('teleport');
    });

    it('3D distance is computed correctly', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(100);
      // sqrt(30^2 + 30^2 + 30^2) = sqrt(2700) ~ 51.96 > 50
      const result = ac.validatePositionUpdate('p1', { x: 30, y: 30, z: 30 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('teleport');
    });

    it('negative coordinate teleport is detected', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(100);
      const result = ac.validatePositionUpdate('p1', { x: -1000, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('teleport');
    });

    it('does not update position on failed teleport check', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
      expect(ac.getPlayerState('p1')!.position).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  // ===========================================================================
  // Rate limit edge cases
  // ===========================================================================

  describe('rate limit edge cases', () => {
    beforeEach(() => {
      ac = new AntiCheat({ maxActionsPerSecond: 3, banThreshold: 10 });
    });

    it('resets rate limit after window expires', () => {
      ac.registerPlayer('p1');
      // Use up the limit
      ac.validateAction('p1');
      ac.validateAction('p1');
      ac.validateAction('p1');
      expect(ac.validateAction('p1').allowed).toBe(false);

      // Advance past 1-second window
      vi.advanceTimersByTime(1100);
      expect(ac.validateAction('p1').allowed).toBe(true);
    });

    it('rate limit violation is added to player violations', () => {
      ac.registerPlayer('p1');
      for (let i = 0; i < 3; i++) ac.validateAction('p1');
      ac.validateAction('p1'); // exceeds limit
      expect(ac.getViolationCount('p1')).toBe(1);
      expect(ac.getViolations('p1')[0].type).toBe('rate_limit');
    });

    it('rate limit violation has warning severity', () => {
      ac.registerPlayer('p1');
      for (let i = 0; i < 3; i++) ac.validateAction('p1');
      const result = ac.validateAction('p1');
      expect(result.violation?.severity).toBe('warning');
    });
  });

  // ===========================================================================
  // Mixed violation types and auto-ban
  // ===========================================================================

  describe('mixed violation auto-ban', () => {
    it('auto-ban triggered by mixed violation types reaching threshold', () => {
      ac = new AntiCheat({
        maxSpeed: 10,
        maxTeleportDistance: 50,
        maxActionsPerSecond: 2,
        banThreshold: 3,
      });

      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });

      // Violation 1: teleport
      ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
      expect(ac.isBanned('p1')).toBe(false);

      // Violation 2: rate limit
      ac.validateAction('p1');
      ac.validateAction('p1');
      ac.validateAction('p1'); // exceeds
      expect(ac.getViolationCount('p1')).toBe(2);
      expect(ac.isBanned('p1')).toBe(false);

      // Violation 3: another teleport → triggers ban
      ac.validatePositionUpdate('p1', { x: 2000, y: 0, z: 0 });
      expect(ac.getViolationCount('p1')).toBe(3);
      expect(ac.isBanned('p1')).toBe(true);
    });
  });

  // ===========================================================================
  // Banned player behavior
  // ===========================================================================

  describe('banned player behavior', () => {
    beforeEach(() => {
      ac = new AntiCheat();
    });

    it('banned player position updates are always rejected', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      ac.ban('p1');
      const result = ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation).toBeUndefined(); // no new violation, just rejected
    });

    it('banning nonexistent player is safe (no crash)', () => {
      expect(() => ac.ban('ghost')).not.toThrow();
    });

    it('isBanned returns false for nonexistent player', () => {
      expect(ac.isBanned('ghost')).toBe(false);
    });
  });

  // ===========================================================================
  // Violation query edge cases
  // ===========================================================================

  describe('violation query edge cases', () => {
    beforeEach(() => {
      ac = new AntiCheat();
    });

    it('getViolations returns empty array for nonexistent player', () => {
      expect(ac.getViolations('ghost')).toEqual([]);
    });

    it('getViolationCount returns 0 for nonexistent player', () => {
      expect(ac.getViolationCount('ghost')).toBe(0);
    });

    it('violations have correct timestamp', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      const before = Date.now();
      ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
      const after = Date.now();
      const violation = ac.getViolations('p1')[0];
      expect(violation.timestamp).toBeGreaterThanOrEqual(before);
      expect(violation.timestamp).toBeLessThanOrEqual(after);
    });

    it('violation description contains distance for teleport', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
      const violation = ac.getViolations('p1')[0];
      expect(violation.description).toContain('1000');
    });
  });

  // ===========================================================================
  // getPlayerIds
  // ===========================================================================

  describe('getPlayerIds', () => {
    beforeEach(() => {
      ac = new AntiCheat();
    });

    it('returns empty array when no players', () => {
      expect(ac.getPlayerIds()).toEqual([]);
    });

    it('returns correct ids after multiple registrations', () => {
      ac.registerPlayer('alice');
      ac.registerPlayer('bob');
      ac.registerPlayer('charlie');
      const ids = ac.getPlayerIds();
      expect(ids.length).toBe(3);
      expect(ids).toContain('alice');
      expect(ids).toContain('bob');
      expect(ids).toContain('charlie');
    });

    it('reflects unregistration', () => {
      ac.registerPlayer('p1');
      ac.registerPlayer('p2');
      ac.unregisterPlayer('p1');
      expect(ac.getPlayerIds()).toEqual(['p2']);
    });
  });

  // ===========================================================================
  // Position update on valid move
  // ===========================================================================

  describe('position tracking after valid moves', () => {
    beforeEach(() => {
      ac = new AntiCheat({ maxSpeed: 1000, maxTeleportDistance: 10000 });
    });

    it('position is updated to new value after valid move', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(1000);
      ac.validatePositionUpdate('p1', { x: 10, y: 20, z: 30 });
      const state = ac.getPlayerState('p1')!;
      expect(state.position).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('sequential valid moves accumulate position correctly', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      vi.advanceTimersByTime(100);
      ac.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      vi.advanceTimersByTime(100);
      ac.validatePositionUpdate('p1', { x: 10, y: 0, z: 0 });
      expect(ac.getPlayerState('p1')!.position.x).toBe(10);
    });
  });
});
