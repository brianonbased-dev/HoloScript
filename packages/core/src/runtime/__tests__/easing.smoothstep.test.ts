/**
 * Unit tests for the `smoothstep` easing (the default timeline-track tween).
 *
 * `smoothstep(t) = t²(3 − 2t)` — Hermite ease-in-out. Authorable now via
 * `move … easing smoothstep` and `key … easing smoothstep`, and the default the
 * sequencer/driver use when a keyframe specifies no easing.
 *
 * **See**: packages/core/src/runtime/easing.ts
 */

import { describe, it, expect } from 'vitest';
import { applyEasing } from '../easing';

describe('applyEasing — smoothstep', () => {
  it('has exact endpoints and a symmetric midpoint', () => {
    expect(applyEasing(0, 'smoothstep')).toBe(0);
    expect(applyEasing(1, 'smoothstep')).toBe(1);
    expect(applyEasing(0.5, 'smoothstep')).toBeCloseTo(0.5);
  });

  it('matches the Hermite form t²(3 − 2t)', () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(applyEasing(t, 'smoothstep')).toBeCloseTo(t * t * (3 - 2 * t), 10);
    }
  });

  it('eases in then out (below linear early, above linear late)', () => {
    expect(applyEasing(0.25, 'smoothstep')).toBeLessThan(0.25);
    expect(applyEasing(0.75, 'smoothstep')).toBeGreaterThan(0.75);
  });
});
