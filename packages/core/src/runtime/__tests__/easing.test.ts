import { describe, it, expect } from 'vitest';
import { applyEasing } from '../easing';

describe('applyEasing', () => {
  describe('linear (default)', () => {
    it('returns t unchanged at t=0', () => {
      expect(applyEasing(0, 'linear')).toBe(0);
    });

    it('returns t unchanged at t=1', () => {
      expect(applyEasing(1, 'linear')).toBe(1);
    });

    it('returns t unchanged at t=0.5', () => {
      expect(applyEasing(0.5, 'linear')).toBe(0.5);
    });

    it('falls back to linear for unknown easing name', () => {
      expect(applyEasing(0.3, 'unknown')).toBe(0.3);
      expect(applyEasing(0.7, 'bogus')).toBe(0.7);
    });
  });

  describe('easeIn', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeIn')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeIn')).toBe(1);
    });

    it('returns t*t (quad in) for mid values', () => {
      expect(applyEasing(0.5, 'easeIn')).toBeCloseTo(0.25);
      expect(applyEasing(0.25, 'easeIn')).toBeCloseTo(0.0625);
    });

    it('starts slow (below linear) for 0 < t < 1', () => {
      expect(applyEasing(0.5, 'easeIn')).toBeLessThan(0.5);
    });
  });

  describe('easeOut', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeOut')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeOut')).toBe(1);
    });

    it('returns t*(2-t) for mid values', () => {
      expect(applyEasing(0.5, 'easeOut')).toBeCloseTo(0.75);
    });

    it('ends fast (above linear) for 0 < t < 1', () => {
      expect(applyEasing(0.5, 'easeOut')).toBeGreaterThan(0.5);
    });
  });

  describe('easeInOut', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeInOut')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeInOut')).toBe(1);
    });

    it('returns 0.5 at t=0.5 (symmetric midpoint)', () => {
      expect(applyEasing(0.5, 'easeInOut')).toBeCloseTo(0.5);
    });

    it('is below linear for 0 < t < 0.5', () => {
      expect(applyEasing(0.25, 'easeInOut')).toBeLessThan(0.25);
    });

    it('is above linear for 0.5 < t < 1', () => {
      expect(applyEasing(0.75, 'easeInOut')).toBeGreaterThan(0.75);
    });
  });

  describe('easeInQuad (alias of easeIn)', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeInQuad')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeInQuad')).toBe(1);
    });

    it('matches easeIn values', () => {
      expect(applyEasing(0.5, 'easeInQuad')).toBeCloseTo(applyEasing(0.5, 'easeIn'));
    });
  });

  describe('easeOutQuad (alias of easeOut)', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeOutQuad')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeOutQuad')).toBe(1);
    });

    it('matches easeOut values', () => {
      expect(applyEasing(0.5, 'easeOutQuad')).toBeCloseTo(applyEasing(0.5, 'easeOut'));
    });
  });

  describe('easeInOutQuad (alias of easeInOut)', () => {
    it('returns 0 at t=0', () => {
      expect(applyEasing(0, 'easeInOutQuad')).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(applyEasing(1, 'easeInOutQuad')).toBe(1);
    });

    it('matches easeInOut values', () => {
      expect(applyEasing(0.5, 'easeInOutQuad')).toBeCloseTo(applyEasing(0.5, 'easeInOut'));
      expect(applyEasing(0.25, 'easeInOutQuad')).toBeCloseTo(applyEasing(0.25, 'easeInOut'));
    });
  });

  describe('boundary invariants', () => {
    const easings = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad'];

    it('every easing maps 0 → 0', () => {
      for (const e of easings) {
        expect(applyEasing(0, e)).toBe(0);
      }
    });

    it('every easing maps 1 → 1', () => {
      for (const e of easings) {
        expect(applyEasing(1, e)).toBeCloseTo(1);
      }
    });
  });
});
