import { describe, it, expect } from 'vitest';

import {
  measureBoundsDimension,
  anchorReconstruction,
  assertAnchoredDimension,
  type ReconstructionManifest,
} from './anchor.js';

function makeManifest(height: number): ReconstructionManifest {
  return {
    bounds: {
      min: [0, 0, 0],
      max: [0.5, height, 0.3],
    },
  };
}

describe('measureBoundsDimension', () => {
  it('measures the y-axis by default', () => {
    const m = makeManifest(1.0);
    expect(measureBoundsDimension(m)).toBe(1.0);
  });

  it('measures the x-axis when requested', () => {
    const m = makeManifest(2.0);
    expect(measureBoundsDimension(m, 'x')).toBe(0.5);
  });

  it('measures the z-axis when requested', () => {
    const m = makeManifest(2.0);
    expect(measureBoundsDimension(m, 'z')).toBe(0.3);
  });
});

describe('anchorReconstruction', () => {
  it('tags a within-tolerance reconstruction as metric', () => {
    const m = makeManifest(1.02); // 2 cm over 1.0 m
    const result = anchorReconstruction(m, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });
    expect(result.isAnchored).toBe(true);
    expect(result.tag).toBe('metric');
    expect(result.scaleFactor).toBeCloseTo(1.0 / 1.02, 5);
  });

  it('tags an out-of-tolerance reconstruction as relative-scale-only', () => {
    const m = makeManifest(1.15); // 15 cm over — outside 5 cm tolerance
    const result = anchorReconstruction(m, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });
    expect(result.isAnchored).toBe(false);
    expect(result.tag).toBe('relative-scale-only');
  });

  it('throws on malformed bounds', () => {
    const m: ReconstructionManifest = {
      bounds: { min: [0, 0, 0], max: [NaN, NaN, NaN] },
    };
    expect(() => anchorReconstruction(m, { referenceDimension: 1.0, axis: 'y' })).toThrow(
      'Invalid measured dimension'
    );
  });
});

describe('assertAnchoredDimension', () => {
  it('passes when the measured dimension is within tolerance', () => {
    const m = makeManifest(0.98); // 2 cm under
    const result = assertAnchoredDimension(m, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });
    expect(result.isAnchored).toBe(true);
    expect(result.tag).toBe('metric');
  });

  it('fails when the scale is wrong (outside tolerance)', () => {
    const m = makeManifest(1.2); // 20 cm over
    expect(() =>
      assertAnchoredDimension(m, {
        referenceDimension: 1.0,
        axis: 'y',
        tolerance: 0.05,
      })
    ).toThrow('Anchor assertion failed');
  });

  it('anchors a fixture to a known 1.0 m reference and asserts within tolerance', () => {
    // Fixture: a synthetic reconstruction whose true height is 1.0 m
    const fixture = makeManifest(1.0);
    const result = assertAnchoredDimension(fixture, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });

    expect(result.measuredDimension).toBe(1.0);
    expect(result.isAnchored).toBe(true);
    expect(result.tag).toBe('metric');
  });

  it('flags an unanchored export as relative-scale-only', () => {
    // No reference applied — raw reconstruction with wrong scale
    const unanchored = makeManifest(2.5);
    const result = anchorReconstruction(unanchored, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });

    expect(result.isAnchored).toBe(false);
    expect(result.tag).toBe('relative-scale-only');
  });

  it('fails if the unanchored flag is missing on a bad match', () => {
    // This is the negative guard: a badly-scaled model MUST NOT be tagged metric.
    const bad = makeManifest(5.0);
    const result = anchorReconstruction(bad, {
      referenceDimension: 1.0,
      axis: 'y',
      tolerance: 0.05,
    });

    // The tag must NOT be 'metric' — it must flag the problem.
    expect(result.tag).not.toBe('metric');
    expect(result.tag).toBe('relative-scale-only');
  });
});
