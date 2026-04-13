/**
 * LagCompensation — Production Test Suite
 *
 * Covers: history buffer, state rewind, hit verification (hit/miss),
 * latency estimation (EMA), max history enforcement.
 */
import { describe, it, expect } from 'vitest';
import { LagCompensation, HistoryState } from '../LagCompensation';

// ─── Helpers ────────────────────────────────────────────────────────
function makeState(
  ts: number,
  entities: Record<string, { x: number; y: number; z: number; radius: number }>
): HistoryState {
  return { timestamp: ts, entities: new Map(Object.entries(entities)) };
}

describe('LagCompensation — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('starts with empty history', () => {
    const lc = new LagCompensation();
    expect(lc.getHistoryLength()).toBe(0);
    expect(lc.getMaxRewindMs()).toBe(500);
  });

  // ─── History Buffer ───────────────────────────────────────────────
  it('pushState grows history', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, {}));
    lc.pushState(makeState(200, {}));
    expect(lc.getHistoryLength()).toBe(2);
  });

  it('history respects max size', () => {
    const lc = new LagCompensation(3);
    for (let i = 0; i < 5; i++) lc.pushState(makeState(i * 100, {}));
    expect(lc.getHistoryLength()).toBe(3);
  });

  // ─── State Rewind ─────────────────────────────────────────────────
  it('getStateAt returns closest state', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, { a: { x: 1, y: 0, z: 0, radius: 1 } }));
    lc.pushState(makeState(200, { a: { x: 2, y: 0, z: 0, radius: 1 } }));
    lc.pushState(makeState(300, { a: { x: 3, y: 0, z: 0, radius: 1 } }));
    const state = lc.getStateAt(190);
    expect(state).not.toBeNull();
    expect(state!.timestamp).toBe(200);
  });

  it('getStateAt returns null on empty history', () => {
    const lc = new LagCompensation();
    expect(lc.getStateAt(100)).toBeNull();
  });

  // ─── Hit Verification ─────────────────────────────────────────────
  it('verifyHit returns hit when in radius', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, { target: { x: 5, y: 0, z: 0, radius: 2 } }));
    const result = lc.verifyHit({
      originX: 4,
      originY: 0,
      originZ: 0,
      targetId: 'target',
      clientTimestamp: 150,
      clientLatency: 50, // rewound to 100
    });
    expect(result.hit).toBe(true);
    expect(result.distance).toBeCloseTo(1, 1);
    expect(result.targetPosition).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('verifyHit returns miss when outside radius', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, { target: { x: 10, y: 0, z: 0, radius: 1 } }));
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 'target',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.hit).toBe(false);
    expect(result.distance).toBe(10);
  });

  it('verifyHit returns miss when target not found', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, { other: { x: 0, y: 0, z: 0, radius: 1 } }));
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 'nonexistent',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.hit).toBe(false);
    expect(result.distance).toBe(Infinity);
    expect(result.targetPosition).toBeNull();
  });

  it('verifyHit returns miss when history is empty', () => {
    const lc = new LagCompensation();
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 'a',
      clientTimestamp: 100,
      clientLatency: 50,
    });
    expect(result.hit).toBe(false);
  });

  // ─── 3D Distance ──────────────────────────────────────────────────
  it('verifyHit calculates correct 3D distance', () => {
    const lc = new LagCompensation();
    lc.pushState(makeState(100, { t: { x: 3, y: 4, z: 0, radius: 10 } })); // dist from origin = 5
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 't',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.distance).toBeCloseTo(5, 1);
    expect(result.hit).toBe(true); // 5 < radius 10
  });

  // ─── Latency Estimation ───────────────────────────────────────────
  it('updateLatency initializes to first RTT', () => {
    const lc = new LagCompensation();
    lc.updateLatency('p1', 100);
    expect(lc.getLatency('p1')).toBeCloseTo(100, 0);
  });

  it('updateLatency applies EMA', () => {
    const lc = new LagCompensation();
    lc.updateLatency('p1', 100);
    lc.updateLatency('p1', 200);
    // EMA: 100*0.8 + 200*0.2 = 120
    expect(lc.getLatency('p1')).toBeCloseTo(120, 0);
  });

  it('getLatency returns 0 for unknown player', () => {
    const lc = new LagCompensation();
    expect(lc.getLatency('unknown')).toBe(0);
  });
});
