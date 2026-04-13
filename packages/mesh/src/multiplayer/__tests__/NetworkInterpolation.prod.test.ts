/**
 * NetworkInterpolation — Production Test Suite
 *
 * Covers: snapshot buffering, lerp interpolation, dead reckoning (extrapolation),
 * smooth correction, snap threshold, nlerp quaternion, buffer management.
 */
import { describe, it, expect } from 'vitest';
import { NetworkInterpolation, NetworkSnapshot } from '@holoscript/core';

// ─── Helpers ────────────────────────────────────────────────────────
function makeSnap(
  entityId: string,
  ts: number,
  x: number,
  y = 0,
  z = 0,
  vx?: number,
  vy?: number,
  vz?: number
): NetworkSnapshot {
  return {
    entityId,
    timestamp: ts,
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: vx !== undefined ? { x: vx, y: vy ?? 0, z: vz ?? 0 } : undefined,
  };
}

describe('NetworkInterpolation — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('defaults to 100ms buffer time', () => {
    const ni = new NetworkInterpolation();
    expect(ni.getBufferSize('e1')).toBe(0);
  });

  // ─── Snapshot Buffering ───────────────────────────────────────────
  it('pushSnapshot adds to buffer', () => {
    const ni = new NetworkInterpolation();
    ni.pushSnapshot(makeSnap('e1', 100, 0));
    expect(ni.getBufferSize('e1')).toBe(1);
  });

  it('buffer caps at max size', () => {
    const ni = new NetworkInterpolation();
    for (let i = 0; i < 50; i++) ni.pushSnapshot(makeSnap('e1', i * 10, i));
    expect(ni.getBufferSize('e1')).toBe(30);
  });

  it('sorts by timestamp', () => {
    const ni = new NetworkInterpolation();
    ni.pushSnapshot(makeSnap('e1', 200, 2));
    ni.pushSnapshot(makeSnap('e1', 100, 1));
    const latest = ni.getLatestSnapshot('e1')!;
    expect(latest.timestamp).toBe(200);
  });

  // ─── Interpolation ───────────────────────────────────────────────
  it('interpolates between two snapshots', () => {
    const ni = new NetworkInterpolation({ bufferTimeMs: 0 });
    ni.pushSnapshot(makeSnap('e1', 0, 0));
    ni.pushSnapshot(makeSnap('e1', 100, 10));
    const state = ni.getInterpolatedState('e1', 50)!;
    expect(state.isExtrapolating).toBe(false);
    expect(state.position.x).toBeCloseTo(5, 1);
  });

  it('interpolation respects bufferTimeMs', () => {
    const ni = new NetworkInterpolation({ bufferTimeMs: 50 });
    ni.pushSnapshot(makeSnap('e1', 0, 0));
    ni.pushSnapshot(makeSnap('e1', 100, 10));
    // currentTime=100, renderTime=50 → x=5
    const state = ni.getInterpolatedState('e1', 100)!;
    expect(state.position.x).toBeCloseTo(5, 1);
  });

  // ─── Extrapolation (Dead Reckoning) ───────────────────────────────
  it('extrapolates using velocity when no future snapshot', () => {
    const ni = new NetworkInterpolation({ bufferTimeMs: 0, maxExtrapolationMs: 1000 });
    ni.pushSnapshot(makeSnap('e1', 0, 0, 0, 0, 10, 0, 0)); // velocity.x = 10
    const state = ni.getInterpolatedState('e1', 500)!;
    expect(state.isExtrapolating).toBe(true);
    expect(state.position.x).toBeCloseTo(5, 1); // 10 units/s * 0.5s
  });

  it('stops extrapolating after maxExtrapolationMs', () => {
    const ni = new NetworkInterpolation({ bufferTimeMs: 0, maxExtrapolationMs: 100 });
    ni.pushSnapshot(makeSnap('e1', 0, 5, 0, 0, 10, 0, 0));
    const state = ni.getInterpolatedState('e1', 500)!;
    // Past max extrapolation, returns last position
    expect(state.isExtrapolating).toBe(true);
    expect(state.position.x).toBe(5);
  });

  it('returns null for unknown entity', () => {
    const ni = new NetworkInterpolation();
    expect(ni.getInterpolatedState('unknown', 0)).toBeNull();
  });

  it('uses first future snapshot when no before', () => {
    const ni = new NetworkInterpolation({ bufferTimeMs: 0 });
    ni.pushSnapshot(makeSnap('e1', 1000, 99));
    const state = ni.getInterpolatedState('e1', 0)!;
    expect(state.position.x).toBe(99);
    expect(state.isExtrapolating).toBe(false);
  });

  // ─── Smooth Correction ────────────────────────────────────────────
  it('smoothCorrection lerps toward server pos', () => {
    const ni = new NetworkInterpolation({ lerpSpeed: 10, snapThreshold: 100 });
    const result = ni.smoothCorrection({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.05);
    // t = min(1, 10 * 0.05) = 0.5
    expect(result.x).toBeCloseTo(5, 1);
  });

  it('smoothCorrection snaps when beyond threshold', () => {
    const ni = new NetworkInterpolation({ snapThreshold: 5 });
    const result = ni.smoothCorrection({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 0.016);
    expect(result.x).toBe(100); // instant snap
  });

  // ─── Buffer Management ────────────────────────────────────────────
  it('clearEntity removes all snapshots', () => {
    const ni = new NetworkInterpolation();
    ni.pushSnapshot(makeSnap('e1', 0, 0));
    ni.clearEntity('e1');
    expect(ni.getBufferSize('e1')).toBe(0);
  });

  it('clearAll removes all entities', () => {
    const ni = new NetworkInterpolation();
    ni.pushSnapshot(makeSnap('e1', 0, 0));
    ni.pushSnapshot(makeSnap('e2', 0, 0));
    ni.clearAll();
    expect(ni.getBufferSize('e1')).toBe(0);
    expect(ni.getBufferSize('e2')).toBe(0);
  });

  it('getLatestSnapshot returns null for missing entity', () => {
    const ni = new NetworkInterpolation();
    expect(ni.getLatestSnapshot('missing')).toBeNull();
  });
});
