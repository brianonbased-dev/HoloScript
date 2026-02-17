import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkInterpolation, NetworkSnapshot } from '../NetworkInterpolation';

function snap(entityId: string, ts: number, pos: { x: number; y: number; z: number }, vel?: { x: number; y: number; z: number }): NetworkSnapshot {
  return {
    entityId,
    timestamp: ts,
    position: pos,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: vel,
  };
}

describe('NetworkInterpolation', () => {
  let ni: NetworkInterpolation;

  beforeEach(() => { ni = new NetworkInterpolation({ bufferTimeMs: 100, maxExtrapolationMs: 250 }); });

  // --- Snapshot Buffer ---
  it('pushSnapshot stores snapshot', () => {
    ni.pushSnapshot(snap('e1', 100, { x: 0, y: 0, z: 0 }));
    expect(ni.getBufferSize('e1')).toBe(1);
  });

  it('pushSnapshot keeps buffer bounded', () => {
    for (let i = 0; i < 50; i++) {
      ni.pushSnapshot(snap('e1', i * 10, { x: i, y: 0, z: 0 }));
    }
    expect(ni.getBufferSize('e1')).toBeLessThanOrEqual(30);
  });

  it('getLatestSnapshot returns last by timestamp', () => {
    ni.pushSnapshot(snap('e1', 100, { x: 1, y: 0, z: 0 }));
    ni.pushSnapshot(snap('e1', 200, { x: 2, y: 0, z: 0 }));
    const latest = ni.getLatestSnapshot('e1');
    expect(latest!.timestamp).toBe(200);
    expect(latest!.position.x).toBe(2);
  });

  it('getLatestSnapshot returns null for unknown entity', () => {
    expect(ni.getLatestSnapshot('nope')).toBeNull();
  });

  // --- Interpolation (between two snapshots) ---
  it('interpolates position between two snapshots', () => {
    ni.pushSnapshot(snap('e1', 0, { x: 0, y: 0, z: 0 }));
    ni.pushSnapshot(snap('e1', 200, { x: 10, y: 0, z: 0 }));
    // renderTime = 200 - 100 (buffer) = 100 → midway between 0 and 200
    const state = ni.getInterpolatedState('e1', 200);
    expect(state).not.toBeNull();
    expect(state!.isExtrapolating).toBe(false);
    // t = (100 - 0) / (200 - 0) = 0.5, so x ≈ 5
    expect(state!.position.x).toBeCloseTo(5, 0);
  });

  // --- Extrapolation (only before snapshot) ---
  it('extrapolates with velocity when no future snapshot', () => {
    ni.pushSnapshot(snap('e1', 0, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }));
    // renderTime = 150 - 100 = 50, timeSince = 50ms, vel*0.05s → x += 0.5
    const state = ni.getInterpolatedState('e1', 150);
    expect(state).not.toBeNull();
    expect(state!.isExtrapolating).toBe(true);
    expect(state!.position.x).toBeGreaterThan(0);
  });

  it('extrapolation caps at maxExtrapolationMs', () => {
    ni.pushSnapshot(snap('e1', 0, { x: 5, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }));
    // renderTime = 500 - 100 = 400 >> maxExtrap 250 → stale, returns last known
    const state = ni.getInterpolatedState('e1', 500);
    expect(state!.isExtrapolating).toBe(true);
    expect(state!.position.x).toBe(5); // last known position, no velocity applied
  });

  // --- Only future snapshots ---
  it('returns future snapshot when renderTime is before all', () => {
    ni.pushSnapshot(snap('e1', 500, { x: 10, y: 0, z: 0 }));
    // renderTime = 100 - 100 = 0, only future snapshot at 500
    const state = ni.getInterpolatedState('e1', 100);
    expect(state).not.toBeNull();
    expect(state!.position.x).toBe(10);
  });

  // --- smoothCorrection ---
  it('smoothCorrection blends toward server pos', () => {
    const curr = { x: 0, y: 0, z: 0 };
    const server = { x: 5, y: 0, z: 0 };
    const result = ni.smoothCorrection(curr, server, 0.016);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(5);
  });

  it('smoothCorrection snaps when distance exceeds threshold', () => {
    const ni2 = new NetworkInterpolation({ snapThreshold: 2 });
    const curr = { x: 0, y: 0, z: 0 };
    const server = { x: 100, y: 0, z: 0 };
    const result = ni2.smoothCorrection(curr, server, 0.016);
    expect(result.x).toBe(100); // snapped
  });

  // --- Null cases ---
  it('getInterpolatedState returns null for unknown entity', () => {
    expect(ni.getInterpolatedState('nope', 100)).toBeNull();
  });

  // --- Clear ---
  it('clearEntity removes buffer', () => {
    ni.pushSnapshot(snap('e1', 0, { x: 0, y: 0, z: 0 }));
    ni.clearEntity('e1');
    expect(ni.getBufferSize('e1')).toBe(0);
  });

  it('clearAll removes all buffers', () => {
    ni.pushSnapshot(snap('e1', 0, { x: 0, y: 0, z: 0 }));
    ni.pushSnapshot(snap('e2', 0, { x: 0, y: 0, z: 0 }));
    ni.clearAll();
    expect(ni.getBufferSize('e1')).toBe(0);
    expect(ni.getBufferSize('e2')).toBe(0);
  });

  // --- Config defaults ---
  it('default config is applied when no partial given', () => {
    const def = new NetworkInterpolation();
    // Just make sure it works
    def.pushSnapshot(snap('e', 0, { x: 0, y: 0, z: 0 }));
    expect(def.getBufferSize('e')).toBe(1);
  });

  // --- Rotation interpolation ---
  it('interpolates rotation via nlerp', () => {
    ni.pushSnapshot({
      entityId: 'e1', timestamp: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    ni.pushSnapshot({
      entityId: 'e1', timestamp: 200,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 1, z: 0, w: 0 },
    });
    const state = ni.getInterpolatedState('e1', 200); // renderTime = 100 → midway
    expect(state).not.toBeNull();
    // Rotation should be normalized interpolation
    const { x, y, z, w } = state!.rotation;
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    expect(len).toBeCloseTo(1, 2);
  });
});
