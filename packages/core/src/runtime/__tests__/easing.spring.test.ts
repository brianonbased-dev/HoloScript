/**
 * Unit tests for the `spring` easing primitive (physics easing).
 *
 * `spring` is the analytic step response of an underdamped mass-spring-damper,
 * exposed to the HoloScript animation DSL so `.holo`/`.hsplus` can author
 * `move <t> to <d> over <n> easing spring`. Defining property: it OVERSHOOTS
 * above 1 mid-curve (the bounce) while still landing exactly on target.
 *
 * **See**: packages/core/src/runtime/easing.ts
 */

import { describe, it, expect } from 'vitest';
import { applyEasing, springEasing } from '../easing';

describe('springEasing — anchored endpoints', () => {
  it('f(0) is exactly 0 and f(1) is exactly 1 (duration-locked move lands on target)', () => {
    expect(springEasing(0)).toBe(0);
    expect(springEasing(1)).toBe(1);
  });

  it('clamps out-of-range t to the endpoints', () => {
    expect(springEasing(-0.5)).toBe(0);
    expect(springEasing(1.5)).toBe(1);
  });
});

describe('springEasing — overshoot is the defining property', () => {
  it('exceeds 1 somewhere mid-curve (a bounce, not a monotone ease)', () => {
    const peak = Math.max(
      ...[0.3, 0.35, 0.4, 0.45, 0.5].map((t) => springEasing(t)),
    );
    expect(peak).toBeGreaterThan(1.05);
  });

  it('FALSE case: monotone eases never exceed 1, so spring is distinguishable', () => {
    for (const t of [0.3, 0.4, 0.5]) {
      expect(applyEasing(t, 'easeOut')).toBeLessThanOrEqual(1);
    }
    expect(springEasing(0.4)).toBeGreaterThan(1);
  });
});

describe('springEasing — shape', () => {
  it('rises monotonically from 0 up to the first peak', () => {
    const early = [0, 0.05, 0.1, 0.2, 0.3].map((t) => springEasing(t));
    for (let i = 1; i < early.length; i++) {
      expect(early[i]).toBeGreaterThan(early[i - 1]);
    }
  });

  it('settles back below the overshoot peak after bouncing', () => {
    const peak = springEasing(0.4);
    expect(springEasing(0.8)).toBeLessThan(peak);
  });
});

describe('applyEasing — spring routing & regressions', () => {
  it('applyEasing(t, "spring") delegates to springEasing', () => {
    for (const t of [0, 0.15, 0.4, 0.6, 0.85, 1]) {
      expect(applyEasing(t, 'spring')).toBe(springEasing(t));
    }
  });

  it('unknown easing names still fall back to linear (no regression)', () => {
    expect(applyEasing(0.5, 'not-a-curve')).toBe(0.5);
    expect(applyEasing(0.3, 'linear')).toBe(0.3);
  });
});
