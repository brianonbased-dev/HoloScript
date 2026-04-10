/**
 * HighFrequencySync — Production Test Suite
 *
 * Covers pure, synchronous utilities (no RAF/network required):
 *  - quantizePosition / dequantizePosition  (round-trip fidelity)
 *  - compressQuaternion / decompressQuaternion (round-trip fidelity)
 *  - JitterBuffer  (buffering, interpolation, stats)
 */

import { describe, it, expect } from 'vitest';
import {
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,
  JitterBuffer,
  type InterpolationSample,
} from '../HighFrequencySync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dot-product of two quaternions (measure of similarity) */
function quatDot(a: [number, number, number, number], b: [number, number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/** Euclidean distance between two positions */
function posDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Make an InterpolationSample */
function makeSample(
  timestamp: number,
  pos: [number, number, number],
  rot: [number, number, number, number] = [0, 0, 0, 1]
): InterpolationSample {
  return { timestamp, position: pos, rotation: rot };
}

// ---------------------------------------------------------------------------
// quantizePosition / dequantizePosition
// ---------------------------------------------------------------------------

describe('quantizePosition / dequantizePosition', () => {
  const cases: Array<[number, number, number]> = [
    [0, 0, 0],
    [1, 2, 3],
    [-1, -2, -3],
    [10.5, -7.25, 100.0],
    [0.01, 0.02, 0.03], // precision boundary
  ];

  it.each(cases)('round-trips (%f, %f, %f) within 0.01m tolerance', (x, y, z) => {
    const q = quantizePosition(x, y, z);
    const [rx, ry, rz] = dequantizePosition(q);
    expect(Math.abs(rx - x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(ry - y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(rz - z)).toBeLessThanOrEqual(0.01);
  });

  it('produces integer 16-bit values', () => {
    const q = quantizePosition(5, -3, 2);
    expect(q.x).toBeGreaterThanOrEqual(0);
    expect(q.y).toBeGreaterThanOrEqual(0);
    expect(q.z).toBeGreaterThanOrEqual(0);
    expect(q.x).toBeLessThanOrEqual(0xffff);
    expect(q.y).toBeLessThanOrEqual(0xffff);
    expect(q.z).toBeLessThanOrEqual(0xffff);
    expect(Number.isInteger(q.x)).toBe(true);
    expect(Number.isInteger(q.y)).toBe(true);
    expect(Number.isInteger(q.z)).toBe(true);
  });

  it('origin quantizes to (0, 0, 0)', () => {
    const q = quantizePosition(0, 0, 0);
    expect(q).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('dequantize of (0,0,0) is origin', () => {
    const [x, y, z] = dequantizePosition({ x: 0, y: 0, z: 0 });
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// compressQuaternion / decompressQuaternion
// ---------------------------------------------------------------------------

describe('compressQuaternion / decompressQuaternion', () => {
  /** Normalise a quaternion */
  function norm(x: number, y: number, z: number, w: number): [number, number, number, number] {
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    return [x / len, y / len, z / len, w / len];
  }

  const cases: Array<[number, number, number, number]> = [
    norm(0, 0, 0, 1), // identity
    norm(1, 0, 0, 1), // 90° around X
    norm(0, 1, 0, 1), // 90° around Y
    norm(0, 0, 1, 1), // 90° around Z
    norm(1, 1, 1, 1), // equal components
    norm(-1, 0, 0, 1), // negative component
    norm(0.5, -0.5, 0.5, 0.5), // mixed signs
  ];

  it.each(cases)('round-trips (%f, %f, %f, %f) — dot product ≥ 0.99', (qx, qy, qz, qw) => {
    const compressed = compressQuaternion(qx, qy, qz, qw);
    const decompressed = decompressQuaternion(compressed);
    // Account for double-cover: q and -q represent the same rotation
    const d = Math.abs(quatDot([qx, qy, qz, qw], decompressed));
    expect(d).toBeGreaterThanOrEqual(0.99);
  });

  it('selects the correct largest component index', () => {
    // w is clearly the largest
    const c = compressQuaternion(0, 0, 0, 1);
    expect(c.index).toBe(3);
  });

  it('compressed values are in 11-bit range', () => {
    const c = compressQuaternion(0, 0, 0, 1);
    expect(c.a).toBeGreaterThanOrEqual(0);
    expect(c.a).toBeLessThanOrEqual(0x7ff);
    expect(c.b).toBeGreaterThanOrEqual(0);
    expect(c.b).toBeLessThanOrEqual(0x7ff);
    expect(c.c).toBeGreaterThanOrEqual(0);
    expect(c.c).toBeLessThanOrEqual(0x7ff);
  });

  it('decompressed identity is close to (0,0,0,1)', () => {
    const [x, y, z, w] = decompressQuaternion({ index: 3, a: 1024, b: 1024, c: 1024 });
    // All small components ~0, w ~largest
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(y)).toBeLessThan(0.01);
    expect(Math.abs(z)).toBeLessThan(0.01);
    expect(w).toBeGreaterThan(0.99);
  });
});

// ---------------------------------------------------------------------------
// JitterBuffer
// ---------------------------------------------------------------------------

describe('JitterBuffer', () => {
  it('returns null for unknown entity', () => {
    const buf = new JitterBuffer(50);
    expect(buf.getInterpolatedState('nobody', Date.now())).toBeNull();
  });

  it('returns single sample directly when only 1 exists', () => {
    const buf = new JitterBuffer(0);
    const s = makeSample(1000, [1, 2, 3]);
    buf.addSample('e1', s);
    const result = buf.getInterpolatedState('e1', 1100);
    expect(result).not.toBeNull();
    // position should match the single sample
    expect(result!.position).toEqual([1, 2, 3]);
  });

  it('interpolates between two samples', () => {
    const buf = new JitterBuffer(0); // no delay for determinism
    buf.addSample('e1', makeSample(1000, [0, 0, 0]));
    buf.addSample('e1', makeSample(2000, [10, 0, 0]));

    // Query at midpoint (t=0.5)
    const result = buf.getInterpolatedState('e1', 1500);
    expect(result).not.toBeNull();
    // x should be ~5 (midpoint)
    expect(result!.position[0]).toBeCloseTo(5, 0);
  });

  it('returns first sample when query time is before buffer', () => {
    const buf = new JitterBuffer(0);
    buf.addSample('e1', makeSample(2000, [5, 0, 0]));
    buf.addSample('e1', makeSample(3000, [10, 0, 0]));
    const result = buf.getInterpolatedState('e1', 0); // far in the past
    expect(result).not.toBeNull();
    // Should return the earliest sample
    expect(result!.position[0]).toBe(5);
  });

  it('returns last sample when query time is after all samples', () => {
    const buf = new JitterBuffer(0);
    buf.addSample('e1', makeSample(1000, [0, 0, 0]));
    buf.addSample('e1', makeSample(2000, [10, 0, 0]));
    const result = buf.getInterpolatedState('e1', 9999);
    expect(result!.position[0]).toBe(10); // latest sample
  });

  it('caps buffer size at maxSize', () => {
    const buf = new JitterBuffer(0, 3);
    for (let i = 0; i < 10; i++) {
      buf.addSample('e1', makeSample(i * 100, [i, 0, 0]));
    }
    // Should still work but only keep last 3
    const stats = buf.getStats();
    expect(stats.averageBufferSize).toBeLessThanOrEqual(3);
  });

  it('clear removes entity buffer', () => {
    const buf = new JitterBuffer(0);
    buf.addSample('e1', makeSample(1000, [1, 2, 3]));
    buf.clear('e1');
    expect(buf.getInterpolatedState('e1', 1100)).toBeNull();
  });

  it('clearAll removes all entity buffers', () => {
    const buf = new JitterBuffer(0);
    buf.addSample('e1', makeSample(1000, [1, 0, 0]));
    buf.addSample('e2', makeSample(1000, [2, 0, 0]));
    buf.clearAll();
    expect(buf.getStats().entityCount).toBe(0);
  });

  it('getStats returns entity count and average buffer size', () => {
    const buf = new JitterBuffer(0);
    buf.addSample('e1', makeSample(1000, [1, 0, 0]));
    buf.addSample('e1', makeSample(2000, [2, 0, 0]));
    buf.addSample('e2', makeSample(1000, [3, 0, 0]));
    const stats = buf.getStats();
    expect(stats.entityCount).toBe(2);
    expect(stats.averageBufferSize).toBeGreaterThan(0);
  });

  it('handles slerp near-identical quaternions (linear path)', () => {
    const buf = new JitterBuffer(0);
    const q1: [number, number, number, number] = [0, 0, 0, 1];
    const q2: [number, number, number, number] = [0, 0, 0, 1]; // same
    buf.addSample('e1', makeSample(1000, [0, 0, 0], q1));
    buf.addSample('e1', makeSample(2000, [1, 0, 0], q2));
    const result = buf.getInterpolatedState('e1', 1500);
    expect(result).not.toBeNull();
    const [rx, ry, rz, rw] = result!.rotation;
    // Should still be close to identity quaternion
    expect(Math.abs(rw)).toBeGreaterThan(0.99);
  });

  it('applies buffer delay to interpolation queries', () => {
    const buf = new JitterBuffer(100); // 100ms delay
    buf.addSample('e1', makeSample(1000, [0, 0, 0]));
    buf.addSample('e1', makeSample(2000, [10, 0, 0]));
    // Query at time=1200 → effective target = 1200-100 = 1100 → x ≈ 1
    const result = buf.getInterpolatedState('e1', 1200);
    expect(result).not.toBeNull();
    // Position should reflect delayed query
    expect(result!.position[0]).toBeLessThan(5);
  });
});
