/**
 * Unit tests for easing — AUDIT-mode coverage
 *
 * Slice 1 pure helper. Called every animation frame via
 * updateAnimations (slice 6). A regression here visibly breaks all
 * HoloScript animations.
 *
 * **See**: packages/core/src/runtime/easing.ts (slice 1)
 */

import { describe, it, expect } from 'vitest';
import { applyEasing } from './easing';

describe('applyEasing — endpoints', () => {
  it.each([
    'linear',
    'easeIn',
    'easeOut',
    'easeInOut',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
  ])('curve "%s" maps 0 → 0 and 1 → 1', (curve) => {
    expect(applyEasing(0, curve)).toBe(0);
    expect(applyEasing(1, curve)).toBe(1);
  });
});

describe('applyEasing — linear', () => {
  it('is the identity function', () => {
    expect(applyEasing(0.25, 'linear')).toBe(0.25);
    expect(applyEasing(0.5, 'linear')).toBe(0.5);
    expect(applyEasing(0.75, 'linear')).toBe(0.75);
  });

  it('unknown easing names fall back to linear', () => {
    expect(applyEasing(0.5, 'not-a-curve')).toBe(0.5);
    expect(applyEasing(0.5, '')).toBe(0.5);
  });
});

describe('applyEasing — easeIn / easeInQuad (t²)', () => {
  it('t=0.5 → 0.25 (slow start)', () => {
    expect(applyEasing(0.5, 'easeIn')).toBe(0.25);
    expect(applyEasing(0.5, 'easeInQuad')).toBe(0.25);
  });

  it('monotonically increasing', () => {
    const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
    let prev = applyEasing(0, 'easeIn');
    for (const t of samples) {
      const v = applyEasing(t, 'easeIn');
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('below linear for 0 < t < 1 (slow start)', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(applyEasing(t, 'easeIn')).toBeLessThan(t);
    }
  });
});

describe('applyEasing — easeOut / easeOutQuad (t * (2-t))', () => {
  it('t=0.5 → 0.75 (fast start, slow end)', () => {
    expect(applyEasing(0.5, 'easeOut')).toBe(0.75);
    expect(applyEasing(0.5, 'easeOutQuad')).toBe(0.75);
  });

  it('above linear for 0 < t < 1 (fast start)', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(applyEasing(t, 'easeOut')).toBeGreaterThan(t);
    }
  });

  it('easeIn and easeOut are mirror images: easeOut(t) = 1 - easeIn(1 - t)', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const out = applyEasing(t, 'easeOut');
      const mirrored = 1 - applyEasing(1 - t, 'easeIn');
      expect(out).toBeCloseTo(mirrored, 10);
    }
  });
});

describe('applyEasing — easeInOut / easeInOutQuad', () => {
  it('t=0.5 → 0.5 (symmetric midpoint)', () => {
    expect(applyEasing(0.5, 'easeInOut')).toBe(0.5);
    expect(applyEasing(0.5, 'easeInOutQuad')).toBe(0.5);
  });

  it('symmetric around t=0.5: f(t) + f(1-t) = 1', () => {
    for (const t of [0.1, 0.2, 0.3, 0.4]) {
      const a = applyEasing(t, 'easeInOut');
      const b = applyEasing(1 - t, 'easeInOut');
      expect(a + b).toBeCloseTo(1, 10);
    }
  });

  it('first half is easeIn-like (below linear)', () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(applyEasing(t, 'easeInOut')).toBeLessThan(t);
    }
  });

  it('second half is easeOut-like (above linear)', () => {
    for (const t of [0.6, 0.75, 0.9]) {
      expect(applyEasing(t, 'easeInOut')).toBeGreaterThan(t);
    }
  });
});

describe('applyEasing — Quad aliases are identical to non-Quad variants', () => {
  it('easeIn and easeInQuad produce same output', () => {
    for (const t of [0.1, 0.33, 0.5, 0.67, 0.9]) {
      expect(applyEasing(t, 'easeIn')).toBe(applyEasing(t, 'easeInQuad'));
    }
  });

  it('easeOut and easeOutQuad produce same output', () => {
    for (const t of [0.1, 0.33, 0.5, 0.67, 0.9]) {
      expect(applyEasing(t, 'easeOut')).toBe(applyEasing(t, 'easeOutQuad'));
    }
  });

  it('easeInOut and easeInOutQuad produce same output', () => {
    for (const t of [0.1, 0.33, 0.5, 0.67, 0.9]) {
      expect(applyEasing(t, 'easeInOut')).toBe(applyEasing(t, 'easeInOutQuad'));
    }
  });
});
