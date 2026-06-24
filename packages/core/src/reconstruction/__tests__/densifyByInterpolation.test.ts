/**
 * densifyByInterpolation tests — the honest (non-hallucinating) densifier.
 * @see ../densifyByInterpolation.ts
 */
import { describe, it, expect } from 'vitest';
import { densifyByInterpolation } from '../densifyByInterpolation';
import { POINT_PROVENANCE_CODE } from '../PointProvenance';

describe('densifyByInterpolation', () => {
  it('adds a midpoint between two points, tagging originals observed and the midpoint interpolated', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const colors = new Float32Array([1, 0, 0, 0, 0, 1]); // red, blue
    const r = densifyByInterpolation(positions, colors);

    expect(r.observedCount).toBe(2);
    expect(r.interpolatedCount).toBe(1);
    expect(r.positions.length).toBe(3 * 3);
    expect(r.provenance[0]).toBe(POINT_PROVENANCE_CODE.observed);
    expect(r.provenance[1]).toBe(POINT_PROVENANCE_CODE.observed);
    expect(r.provenance[2]).toBe(POINT_PROVENANCE_CODE.interpolated);
    // midpoint geometry + color average — bounded by the two real observations
    expect(r.positions[6]).toBeCloseTo(0.5, 6);
    expect(r.positions[7]).toBeCloseTo(0, 6);
    expect(r.colors[6]).toBeCloseTo(0.5, 6); // (1+0)/2 red
    expect(r.colors[8]).toBeCloseTo(0.5, 6); // (0+1)/2 blue
  });

  it('never tags an added point observed and never loses an original', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const colors = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const r = densifyByInterpolation(positions, colors);
    for (let i = 0; i < r.observedCount; i++) {
      expect(r.provenance[i]).toBe(POINT_PROVENANCE_CODE.observed);
    }
    for (let i = r.observedCount; i < r.provenance.length; i++) {
      expect(r.provenance[i]).toBe(POINT_PROVENANCE_CODE.interpolated);
    }
    expect(r.interpolatedCount).toBeGreaterThan(0);
  });

  it('respects the maxAdded cap', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const colors = new Float32Array(12).fill(0.5);
    const r = densifyByInterpolation(positions, colors, { maxAdded: 1 });
    expect(r.interpolatedCount).toBe(1);
  });

  it('accepts RGBA input (stride 4) and emits RGB', () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0]);
    const colors = new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]); // 2 RGBA
    const r = densifyByInterpolation(positions, colors);
    expect(r.interpolatedCount).toBe(1);
    expect(r.colors.length).toBe(r.positions.length);
  });

  it('returns just the original for a single point (no neighbour to interpolate)', () => {
    const r = densifyByInterpolation(new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1]));
    expect(r.observedCount).toBe(1);
    expect(r.interpolatedCount).toBe(0);
  });
});
