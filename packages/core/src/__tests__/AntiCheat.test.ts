import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AntiCheat } from '../network/AntiCheat';

describe('AntiCheat', () => {
  let ac: AntiCheat;

  beforeEach(() => {
    ac = new AntiCheat({ maxSpeed: 10, maxTeleportDistance: 50, maxActionsPerSecond: 5, banThreshold: 3 });
  });

  it('registers and unregisters players', () => {
    ac.registerPlayer('p1');
    expect(ac.getPlayerIds()).toContain('p1');
    ac.unregisterPlayer('p1');
    expect(ac.getPlayerIds()).not.toContain('p1');
  });

  it('accepts valid position update', () => {
    vi.useFakeTimers();
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    vi.advanceTimersByTime(1000); // 1 second elapsed → speed = 1 u/s < maxSpeed=10
    const r = ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 });
    expect(r.valid).toBe(true);
    vi.useRealTimers();
  });

  it('rejects teleport beyond threshold', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    const r = ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
    expect(r.valid).toBe(false);
    expect(r.violation?.type).toBe('teleport');
  });

  it('rejects banned player updates', () => {
    ac.registerPlayer('p1');
    ac.ban('p1');
    expect(ac.isBanned('p1')).toBe(true);
    const r = ac.validatePositionUpdate('p1', { x: 1, y: 0, z: 0 });
    expect(r.valid).toBe(false);
  });

  it('accumulates violations', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
    ac.validatePositionUpdate('p1', { x: 200, y: 0, z: 0 });
    expect(ac.getViolationCount('p1')).toBe(2);
  });

  it('auto-bans after banThreshold violations', () => {
    ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 3; i++) ac.validatePositionUpdate('p1', { x: (i + 1) * 100, y: 0, z: 0 });
    expect(ac.isBanned('p1')).toBe(true);
  });

  it('validates action rate limiting', () => {
    ac.registerPlayer('p1');
    for (let i = 0; i < 5; i++) expect(ac.validateAction('p1').allowed).toBe(true);
    const r = ac.validateAction('p1');
    expect(r.allowed).toBe(false);
    expect(r.violation?.type).toBe('rate_limit');
  });

  it('returns config copy', () => {
    const cfg = ac.getConfig();
    expect(cfg.maxSpeed).toBe(10);
    expect(cfg.banThreshold).toBe(3);
  });

  it('returns undefined for unknown player state', () => {
    expect(ac.getPlayerState('nobody')).toBeUndefined();
    expect(ac.getViolationCount('nobody')).toBe(0);
  });

  it('returns violations list', () => {
    ac.registerPlayer('p1');
    ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
    const violations = ac.getViolations('p1');
    expect(violations.length).toBe(1);
    expect(violations[0].type).toBe('teleport');
  });

  it('false for unknown player actions', () => {
    expect(ac.validateAction('ghost').allowed).toBe(false);
  });
});
