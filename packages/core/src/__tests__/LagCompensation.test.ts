import { describe, it, expect, beforeEach } from 'vitest';
import { LagCompensation, HistoryState } from '@holoscript/mesh';

function makeState(
  ts: number,
  entities: Array<[string, number, number, number, number]>
): HistoryState {
  const map = new Map<string, { x: number; y: number; z: number; radius: number }>();
  for (const [id, x, y, z, r] of entities) map.set(id, { x, y, z, radius: r });
  return { timestamp: ts, entities: map };
}

describe('LagCompensation', () => {
  let lc: LagCompensation;

  beforeEach(() => {
    lc = new LagCompensation(60, 500);
  });

  it('pushState stores states and getHistoryLength returns count', () => {
    lc.pushState(makeState(100, [['a', 0, 0, 0, 1]]));
    lc.pushState(makeState(200, [['a', 1, 0, 0, 1]]));
    expect(lc.getHistoryLength()).toBe(2);
  });

  it('history is capped at maxHistory', () => {
    const small = new LagCompensation(3, 500);
    for (let i = 0; i < 5; i++) small.pushState(makeState(i * 100, []));
    expect(small.getHistoryLength()).toBe(3);
  });

  it('getStateAt returns closest state', () => {
    lc.pushState(makeState(100, [['a', 0, 0, 0, 1]]));
    lc.pushState(makeState(200, [['a', 5, 0, 0, 1]]));
    lc.pushState(makeState(300, [['a', 10, 0, 0, 1]]));
    const state = lc.getStateAt(190);
    expect(state).not.toBeNull();
    expect(state!.timestamp).toBe(200);
  });

  it('getStateAt returns null on empty history', () => {
    expect(lc.getStateAt(100)).toBeNull();
  });

  it('verifyHit returns hit=true when within radius', () => {
    lc.pushState(makeState(100, [['enemy', 5, 0, 0, 2]]));
    const result = lc.verifyHit({
      originX: 4,
      originY: 0,
      originZ: 0,
      targetId: 'enemy',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.hit).toBe(true);
    expect(result.distance).toBeCloseTo(1);
    expect(result.targetPosition).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('verifyHit returns hit=false when out of radius', () => {
    lc.pushState(makeState(100, [['enemy', 50, 0, 0, 1]]));
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 'enemy',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.hit).toBe(false);
    expect(result.distance).toBeGreaterThan(1);
  });

  it('verifyHit returns miss for unknown target', () => {
    lc.pushState(makeState(100, [['enemy', 5, 0, 0, 2]]));
    const result = lc.verifyHit({
      originX: 0,
      originY: 0,
      originZ: 0,
      targetId: 'ghost',
      clientTimestamp: 150,
      clientLatency: 50,
    });
    expect(result.hit).toBe(false);
    expect(result.targetPosition).toBeNull();
  });

  it('updateLatency uses exponential moving average', () => {
    lc.updateLatency('p1', 100);
    expect(lc.getLatency('p1')).toBe(100);
    lc.updateLatency('p1', 200);
    // 100*0.8 + 200*0.2 = 120
    expect(lc.getLatency('p1')).toBeCloseTo(120);
  });

  it('getLatency returns 0 for unknown player', () => {
    expect(lc.getLatency('nobody')).toBe(0);
  });

  it('getMaxRewindMs returns configured value', () => {
    expect(lc.getMaxRewindMs()).toBe(500);
  });
});
