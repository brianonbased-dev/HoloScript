import { describe, it, expect, vi } from 'vitest';
import {
  lerp,
  clamp,
  inverseLerp,
  remap,
  smoothStep,
  smootherStep,
  degToRad,
  radToDeg,
  random,
  randomInt,
  randomItem,
  shuffle,
  normalize,
  wrap,
  pingPong,
} from '../math.js';

describe('Math Utilities', () => {
  describe('lerp', () => {
    it('should return a when t is 0', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('should return b when t is 1', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('should return midpoint when t is 0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('should work with negative values', () => {
      expect(lerp(-100, 100, 0.5)).toBe(0);
    });

    it('should extrapolate when t > 1', () => {
      expect(lerp(0, 100, 2)).toBe(200);
    });

    it('should extrapolate when t < 0', () => {
      expect(lerp(0, 100, -1)).toBe(-100);
    });
  });

  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should return min when value is below', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should return max when value is above', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max', () => {
      expect(clamp(5, 10, 10)).toBe(10);
    });

    it('should work with negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });
  });

  describe('inverseLerp', () => {
    it('should return 0 when value equals a', () => {
      expect(inverseLerp(0, 100, 0)).toBe(0);
    });

    it('should return 1 when value equals b', () => {
      expect(inverseLerp(0, 100, 100)).toBe(1);
    });

    it('should return 0.5 for midpoint', () => {
      expect(inverseLerp(0, 100, 50)).toBe(0.5);
    });

    it('should clamp to 0-1 range', () => {
      expect(inverseLerp(0, 100, 150)).toBe(1);
      expect(inverseLerp(0, 100, -50)).toBe(0);
    });

    it('should handle equal a and b', () => {
      expect(inverseLerp(50, 50, 50)).toBe(0);
    });
  });

  describe('remap', () => {
    it('should remap value from one range to another', () => {
      expect(remap(5, 0, 10, 0, 100)).toBe(50);
    });

    it('should remap to different scale', () => {
      expect(remap(50, 0, 100, 0, 1)).toBe(0.5);
    });

    it('should handle inverted output range', () => {
      expect(remap(0, 0, 10, 100, 0)).toBe(100);
      expect(remap(10, 0, 10, 100, 0)).toBe(0);
    });

    it('should clamp output to range', () => {
      // Since inverseLerp clamps, remap will too
      expect(remap(15, 0, 10, 0, 100)).toBe(100);
    });
  });

  describe('smoothStep', () => {
    it('should return 0 when x <= edge0', () => {
      expect(smoothStep(0, 1, -0.5)).toBe(0);
      expect(smoothStep(0, 1, 0)).toBe(0);
    });

    it('should return 1 when x >= edge1', () => {
      expect(smoothStep(0, 1, 1)).toBe(1);
      expect(smoothStep(0, 1, 1.5)).toBe(1);
    });

    it('should return smooth interpolation at midpoint', () => {
      expect(smoothStep(0, 1, 0.5)).toBe(0.5);
    });

    it('should be smoother than linear at edges', () => {
      // Derivative at edges should be 0
      const nearEdge = smoothStep(0, 1, 0.01);
      expect(nearEdge).toBeCloseTo(0, 2);
    });
  });

  describe('smootherStep', () => {
    it('should return 0 when x <= edge0', () => {
      expect(smootherStep(0, 1, 0)).toBe(0);
    });

    it('should return 1 when x >= edge1', () => {
      expect(smootherStep(0, 1, 1)).toBe(1);
    });

    it('should return 0.5 at midpoint', () => {
      expect(smootherStep(0, 1, 0.5)).toBe(0.5);
    });
  });

  describe('degToRad', () => {
    it('should convert 0 degrees to 0 radians', () => {
      expect(degToRad(0)).toBe(0);
    });

    it('should convert 180 degrees to PI radians', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI);
    });

    it('should convert 360 degrees to 2*PI radians', () => {
      expect(degToRad(360)).toBeCloseTo(2 * Math.PI);
    });

    it('should convert 90 degrees to PI/2 radians', () => {
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
    });

    it('should handle negative degrees', () => {
      expect(degToRad(-90)).toBeCloseTo(-Math.PI / 2);
    });
  });

  describe('radToDeg', () => {
    it('should convert 0 radians to 0 degrees', () => {
      expect(radToDeg(0)).toBe(0);
    });

    it('should convert PI radians to 180 degrees', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180);
    });

    it('should convert 2*PI radians to 360 degrees', () => {
      expect(radToDeg(2 * Math.PI)).toBeCloseTo(360);
    });

    it('should be inverse of degToRad', () => {
      expect(radToDeg(degToRad(45))).toBeCloseTo(45);
    });
  });

  describe('random', () => {
    it('should return value between 0 and 1 by default', () => {
      for (let i = 0; i < 100; i++) {
        const val = random();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it('should return value between min and max', () => {
      for (let i = 0; i < 100; i++) {
        const val = random(10, 20);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThan(20);
      }
    });

    it('should handle negative ranges', () => {
      const val = random(-10, -5);
      expect(val).toBeGreaterThanOrEqual(-10);
      expect(val).toBeLessThan(-5);
    });
  });

  describe('randomInt', () => {
    it('should return integer between min and max inclusive', () => {
      const results = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        const val = randomInt(1, 3);
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(3);
        results.add(val);
      }
      // Should have seen all values 1, 2, 3
      expect(results.size).toBe(3);
    });

    it('should return same value when min equals max', () => {
      expect(randomInt(5, 5)).toBe(5);
    });
  });

  describe('randomItem', () => {
    it('should return item from array', () => {
      const arr = ['a', 'b', 'c'];
      const item = randomItem(arr);
      expect(arr).toContain(item);
    });

    it('should return undefined for empty array', () => {
      expect(randomItem([])).toBeUndefined();
    });

    it('should return the only item for single-element array', () => {
      expect(randomItem(['only'])).toBe('only');
    });
  });

  describe('shuffle', () => {
    it('should return array with same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = shuffle([...arr]);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('should shuffle in place', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffle(arr);
      expect(result).toBe(arr);
    });

    it('should handle empty array', () => {
      expect(shuffle([])).toEqual([]);
    });

    it('should handle single element', () => {
      expect(shuffle([1])).toEqual([1]);
    });

    it('should actually shuffle (probabilistic test)', () => {
      // Run multiple times and check that order changes at least sometimes
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let changedCount = 0;

      for (let i = 0; i < 20; i++) {
        const copy = [...original];
        shuffle(copy);
        if (copy.join(',') !== original.join(',')) {
          changedCount++;
        }
      }

      // Should have changed at least once (very high probability)
      expect(changedCount).toBeGreaterThan(0);
    });
  });

  describe('normalize', () => {
    it('should normalize value to 0-1 range', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(25, 20, 30)).toBe(0.5);
      expect(normalize(0, 0, 100)).toBe(0);
      expect(normalize(100, 0, 100)).toBe(1);
    });

    it('should handle edge cases', () => {
      expect(normalize(0, 0, 0)).toBe(NaN); // Division by zero
      expect(normalize(5, 5, 5)).toBe(NaN); // No range
      expect(normalize(10, 0, 5)).toBe(2); // Outside range
    });

    it('should work with negative ranges', () => {
      expect(normalize(-5, -10, 0)).toBe(0.5);
      expect(normalize(-15, -20, -10)).toBe(0.5);
    });

    it('should work with fractional values', () => {
      expect(normalize(2.5, 0, 10)).toBe(0.25);
      expect(normalize(7.5, 0, 10)).toBe(0.75);
    });
  });

  describe('wrap', () => {
    it('should wrap values within range', () => {
      expect(wrap(5, 0, 10)).toBe(5);
      expect(wrap(15, 0, 10)).toBe(5);
      expect(wrap(-5, 0, 10)).toBe(5);
      expect(wrap(25, 0, 10)).toBe(5);
    });

    it('should handle zero-based range', () => {
      expect(wrap(0, 0, 5)).toBe(0);
      expect(wrap(5, 0, 5)).toBe(0);
      expect(wrap(-1, 0, 5)).toBe(4);
    });

    it('should handle negative ranges', () => {
      expect(wrap(-15, -10, 0)).toBe(-5);
      expect(wrap(-5, -10, 0)).toBe(-5);
      expect(wrap(5, -10, 0)).toBe(-5);
    });

    it('should handle fractional values', () => {
      expect(wrap(2.5, 0, 5)).toBe(2.5);
      expect(wrap(7.5, 0, 5)).toBe(2.5);
      expect(wrap(-2.5, 0, 5)).toBe(2.5);
    });
  });

  describe('pingPong', () => {
    it('should ping pong between 0 and length', () => {
      expect(pingPong(0, 5)).toBe(0);
      expect(pingPong(2.5, 5)).toBe(2.5);
      expect(pingPong(5, 5)).toBe(5);
      expect(pingPong(7.5, 5)).toBe(2.5);
      expect(pingPong(10, 5)).toBe(0);
    });

    it('should handle negative values', () => {
      expect(pingPong(-2.5, 5)).toBe(2.5);
      expect(pingPong(-5, 5)).toBe(5);
      expect(pingPong(-7.5, 5)).toBe(2.5);
    });

    it('should handle zero length', () => {
      expect(pingPong(5, 0)).toBe(0);
      expect(pingPong(-5, 0)).toBe(0);
    });

    it('should handle fractional lengths', () => {
      expect(pingPong(1.25, 2.5)).toBe(1.25);
      expect(pingPong(3.75, 2.5)).toBe(1.25);
    });
  });
});
