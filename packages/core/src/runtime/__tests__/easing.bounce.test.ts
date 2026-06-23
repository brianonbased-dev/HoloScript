/**
 * Unit tests for the `bounce` easing primitive (physics easing).
 *
 * `bounce` is the canonical decaying-parabolic-arc "ball on a floor" curve,
 * exposed to the HoloScript animation DSL so `.holo`/`.hsplus` can author
 * `move <t> to <d> over <n> easing bounce`. Defining properties vs the other
 * physics ease (`spring`): it NEVER exceeds 1 (no overshoot) yet it IS
 * non-monotonic — it peaks, rebounds, and repeats while settling to 1.
 *
 * **See**: packages/core/src/runtime/easing.ts
 */

import { describe, it, expect } from 'vitest';
import { applyEasing, bounceEasing, springEasing } from '../easing';

describe('bounceEasing — exact endpoints', () => {
  it('f(0) is exactly 0 and f(1) is exactly 1', () => {
    expect(bounceEasing(0)).toBe(0);
    expect(bounceEasing(1)).toBe(1);
  });

  it('clamps out-of-range t to the endpoints', () => {
    expect(bounceEasing(-0.25)).toBe(0);
    expect(bounceEasing(2)).toBe(1);
  });

  it('matches the canonical sample value at t=0.5', () => {
    expect(bounceEasing(0.5)).toBeCloseTo(0.765625, 6);
  });
});

describe('bounceEasing — physics signature', () => {
  it('stays within [0,1] — never overshoots (unlike spring)', () => {
    for (let i = 0; i <= 20; i++) {
      const v = bounceEasing(i / 20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is non-monotonic: rises to a peak then rebounds back down', () => {
    // First arc peaks near t≈0.36 (~0.98), then dips into the rebound (~0.75).
    expect(bounceEasing(0.36)).toBeGreaterThan(bounceEasing(0.55));
  });

  it('FALSE case: spring overshoots above 1 where bounce does not', () => {
    expect(springEasing(0.4)).toBeGreaterThan(1);
    expect(bounceEasing(0.4)).toBeLessThanOrEqual(1);
  });
});

describe('applyEasing — bounce routing & regressions', () => {
  it('applyEasing(t, "bounce") delegates to bounceEasing', () => {
    for (const t of [0, 0.2, 0.36, 0.55, 0.8, 1]) {
      expect(applyEasing(t, 'bounce')).toBe(bounceEasing(t));
    }
  });

  it('unknown easing names still fall back to linear (no regression)', () => {
    expect(applyEasing(0.5, 'not-a-curve')).toBe(0.5);
  });
});
