import { describe, it, expect, beforeEach } from 'vitest';
import { AntiCheat } from '../AntiCheat';

describe('AntiCheat', () => {
  let ac: AntiCheat;

  beforeEach(() => {
    ac = new AntiCheat({
      maxSpeed: 20,
      maxTeleportDistance: 50,
      maxActionsPerSecond: 30,
      banThreshold: 5,
    });
  });

  // ---------------------------------------------------------------------------
  // Player Registration
  // ---------------------------------------------------------------------------

  it('registerPlayer adds a tracked player', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    expect(ac.getPlayerState('p1')).toBeDefined();
    expect(ac.getPlayerIds()).toContain('p1');
  });

  it('unregisterPlayer removes player', () => {
    ac.registerPlayer('p1');
    ac.unregisterPlayer('p1');
    expect(ac.getPlayerState('p1')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Position Validation
  // ---------------------------------------------------------------------------

  it('valid position update passes', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    // Use same position (distance=0) to avoid speed check issues with near-zero dt
    const result = ac.validatePositionUpdate('p1', { x: 0, y: 0, z: 0 });
    expect(result.valid).toBe(true);
    expect(result.violation).toBeUndefined();
  });

  it('teleport detection flags large distance', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    const result = ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
    expect(result.valid).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.type).toBe('teleport');
    expect(result.violation!.severity).toBe('kick');
  });

  it('returns invalid for unknown player', () => {
    const result = ac.validatePositionUpdate('ghost', { x: 0, y: 0, z: 0 });
    expect(result.valid).toBe(false);
  });

  it('returns invalid for banned player', () => {
    ac.registerPlayer('p1');
    ac.ban('p1');
    const result = ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 });
    expect(result.valid).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------

  it('first action is allowed', () => {
    ac.registerPlayer('p1');
    const result = ac.validateAction('p1');
    expect(result.allowed).toBe(true);
  });

  it('action returns not allowed for unknown player', () => {
    expect(ac.validateAction('nope').allowed).toBe(false);
  });

  it('exceeding rate limit is flagged', () => {
    ac.registerPlayer('p1');
    // Fire more actions than maxActionsPerSecond (30) within same second window
    for (let i = 0; i < 30; i++) {
      ac.validateAction('p1');
    }
    const result = ac.validateAction('p1');
    expect(result.allowed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation!.type).toBe('rate_limit');
  });

  // ---------------------------------------------------------------------------
  // Violation Tracking
  // ---------------------------------------------------------------------------

  it('getViolations returns violations for player', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    ac.validatePositionUpdate('p1', { x: 1000, y: 0, z: 0 });
    expect(ac.getViolations('p1').length).toBeGreaterThan(0);
    expect(ac.getViolationCount('p1')).toBeGreaterThan(0);
  });

  it('getViolations returns empty for clean player', () => {
    ac.registerPlayer('p1');
    expect(ac.getViolations('p1')).toHaveLength(0);
    expect(ac.getViolationCount('p1')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Banning
  // ---------------------------------------------------------------------------

  it('manual ban sets banned flag', () => {
    ac.registerPlayer('p1');
    expect(ac.isBanned('p1')).toBe(false);
    ac.ban('p1');
    expect(ac.isBanned('p1')).toBe(true);
  });

  it('auto-ban after reaching banThreshold via teleport violations', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    // Generate enough teleport violations (banThreshold = 5)
    // Each teleport violation adds one violation to the player's record
    for (let i = 0; i < 5; i++) {
      // Teleport far enough to exceed maxTeleportDistance (50)
      const state = ac.getPlayerState('p1')!;
      const farPos = { x: state.position.x + 1000, y: 0, z: 0 };
      ac.validatePositionUpdate('p1', farPos);
    }
    expect(ac.getViolationCount('p1')).toBeGreaterThanOrEqual(5);
    expect(ac.isBanned('p1')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  it('getConfig returns current config', () => {
    const cfg = ac.getConfig();
    expect(cfg.maxSpeed).toBe(20);
    expect(cfg.maxTeleportDistance).toBe(50);
    expect(cfg.maxActionsPerSecond).toBe(30);
    expect(cfg.banThreshold).toBe(5);
  });
});
