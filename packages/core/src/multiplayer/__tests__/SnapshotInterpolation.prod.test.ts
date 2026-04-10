/**
 * SnapshotInterpolation — Production Test Suite
 *
 * Covers: buffer management, lerp interpolation, extrapolation fallback,
 * render delay, jitter buffer ordering, entity filtering.
 */
import { describe, it, expect } from 'vitest';
import { SnapshotInterpolation, Snapshot } from '../SnapshotInterpolation';

// ─── Helpers ────────────────────────────────────────────────────────
function makeSnapshot(
  ts: number,
  entities: Record<string, { x: number; y: number; z: number }>
): Snapshot {
  return { timestamp: ts, entities: new Map(Object.entries(entities)) };
}

describe('SnapshotInterpolation — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('starts with empty buffer', () => {
    const si = new SnapshotInterpolation();
    expect(si.getBufferCount()).toBe(0);
    expect(si.getRenderDelay()).toBe(100);
  });

  it('respects custom bufferSize and renderDelay', () => {
    const si = new SnapshotInterpolation(5, 200);
    expect(si.getRenderDelay()).toBe(200);
  });

  // ─── Buffer Management ────────────────────────────────────────────
  it('pushSnapshot adds to buffer', () => {
    const si = new SnapshotInterpolation();
    si.pushSnapshot(makeSnapshot(100, { a: { x: 0, y: 0, z: 0 } }));
    expect(si.getBufferCount()).toBe(1);
  });

  it('buffer respects max size', () => {
    const si = new SnapshotInterpolation(3); // max 3
    for (let i = 0; i < 5; i++) si.pushSnapshot(makeSnapshot(i * 100, {}));
    expect(si.getBufferCount()).toBe(3);
  });

  it('buffer sorts by timestamp', () => {
    const si = new SnapshotInterpolation(10, 0);
    si.pushSnapshot(makeSnapshot(300, { a: { x: 3, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(100, { a: { x: 1, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(200, { a: { x: 2, y: 0, z: 0 } }));
    // Interpolate at renderTime = 150, should lerp between t=100 and t=200
    const results = si.interpolate(150);
    const a = results.find((e) => e.id === 'a')!;
    expect(a.interpolated).toBe(true);
    expect(a.x).toBeCloseTo(1.5, 1);
  });

  // ─── Interpolation ───────────────────────────────────────────────
  it('lerps between two bracketing snapshots', () => {
    const si = new SnapshotInterpolation(10, 0);
    si.pushSnapshot(makeSnapshot(0, { p1: { x: 0, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(100, { p1: { x: 10, y: 0, z: 0 } }));
    const results = si.interpolate(50);
    const p = results.find((e) => e.id === 'p1')!;
    expect(p.interpolated).toBe(true);
    expect(p.x).toBeCloseTo(5, 1);
    expect(p.y).toBe(0);
  });

  it('interpolates Y and Z axes', () => {
    const si = new SnapshotInterpolation(10, 0);
    si.pushSnapshot(makeSnapshot(0, { e: { x: 0, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(100, { e: { x: 0, y: 10, z: 20 } }));
    const results = si.interpolate(75);
    const e = results.find((r) => r.id === 'e')!;
    expect(e.y).toBeCloseTo(7.5, 1);
    expect(e.z).toBeCloseTo(15, 1);
  });

  it('uses render delay offset', () => {
    const si = new SnapshotInterpolation(10, 50);
    si.pushSnapshot(makeSnapshot(0, { a: { x: 0, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(100, { a: { x: 10, y: 0, z: 0 } }));
    // currentTime=100, renderTime=50
    const results = si.interpolate(100);
    const a = results.find((e) => e.id === 'a')!;
    expect(a.x).toBeCloseTo(5, 1);
  });

  // ─── Extrapolation ───────────────────────────────────────────────
  it('falls back to latest snapshot when no bracket found', () => {
    const si = new SnapshotInterpolation(10, 0);
    si.pushSnapshot(makeSnapshot(100, { e: { x: 5, y: 0, z: 0 } }));
    const results = si.interpolate(999); // way beyond
    const e = results.find((r) => r.id === 'e')!;
    expect(e.interpolated).toBe(false);
    expect(e.x).toBe(5);
  });

  it('returns empty when buffer is empty', () => {
    const si = new SnapshotInterpolation();
    expect(si.interpolate(0)).toEqual([]);
  });

  // ─── Entity Filtering ────────────────────────────────────────────
  it('handles entity appearing in only one snapshot', () => {
    const si = new SnapshotInterpolation(10, 0);
    si.pushSnapshot(makeSnapshot(0, { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } }));
    si.pushSnapshot(makeSnapshot(100, { a: { x: 10, y: 0, z: 0 } })); // b gone
    const results = si.interpolate(50);
    const a = results.find((e) => e.id === 'a')!;
    const b = results.find((e) => e.id === 'b')!;
    expect(a.interpolated).toBe(true);
    expect(b.interpolated).toBe(false); // can't interpolate, uses 'from' pos
    expect(b.x).toBe(1);
  });

  // ─── setRenderDelay ───────────────────────────────────────────────
  it('setRenderDelay updates the delay', () => {
    const si = new SnapshotInterpolation(10, 100);
    si.setRenderDelay(50);
    expect(si.getRenderDelay()).toBe(50);
  });
});
