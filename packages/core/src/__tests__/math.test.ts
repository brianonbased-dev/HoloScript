import { describe, it, expect } from 'vitest';
import {
  calculateAverage,
  calculateSuccessRate,
  calculateStandardDeviation,
  calculateMedian
} from '../utils/math';

describe('Math utilities', () => {
  describe('calculateAverage', () => {
    it('calculates average of positive numbers', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateAverage([10, 20, 30])).toBe(20);
    });

    it('calculates average of negative numbers', () => {
      expect(calculateAverage([-1, -2, -3])).toBe(-2);
      expect(calculateAverage([-10, -20, -30])).toBe(-20);
    });

    it('calculates average of mixed positive/negative numbers', () => {
      expect(calculateAverage([-1, 1])).toBe(0);
      expect(calculateAverage([-5, 0, 5])).toBe(0);
      expect(calculateAverage([-2, 4, 1])).toBe(1);
    });

    it('calculates average of decimal numbers', () => {
      expect(calculateAverage([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
      expect(calculateAverage([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
    });

    it('handles single element array', () => {
      expect(calculateAverage([42])).toBe(42);
      expect(calculateAverage([0])).toBe(0);
      expect(calculateAverage([-7])).toBe(-7);
    });

    it('returns 0 for empty array', () => {
      expect(calculateAverage([])).toBe(0);
    });

    it('handles large arrays efficiently', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i + 1);
      expect(calculateAverage(largeArray)).toBe(5000.5);
    });

    it('handles floating point precision correctly', () => {
      const result = calculateAverage([0.1, 0.1, 0.1]);
      expect(result).toBeCloseTo(0.1);
    });
  });

  describe('calculateSuccessRate', () => {
    it('calculates success rate for typical cases', () => {
      expect(calculateSuccessRate(8, 10)).toBe(80);
      expect(calculateSuccessRate(50, 100)).toBe(50);
      expect(calculateSuccessRate(1, 4)).toBe(25);
    });

    it('handles perfect success rate', () => {
      expect(calculateSuccessRate(10, 10)).toBe(100);
      expect(calculateSuccessRate(1, 1)).toBe(100);
    });

    it('handles zero success rate', () => {
      expect(calculateSuccessRate(0, 10)).toBe(0);
      expect(calculateSuccessRate(0, 1)).toBe(0);
    });

    it('handles zero total count', () => {
      expect(calculateSuccessRate(0, 0)).toBe(0);
      expect(calculateSuccessRate(5, 0)).toBe(0);
    });

    it('calculates fractional success rates', () => {
      expect(calculateSuccessRate(1, 3)).toBeCloseTo(33.333333);
      expect(calculateSuccessRate(2, 3)).toBeCloseTo(66.666667);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('calculates standard deviation for simple cases', () => {
      expect(calculateStandardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.58113883);
      expect(calculateStandardDeviation([10, 12, 23, 23, 16, 23, 21, 16])).toBeCloseTo(4.898979);
    });

    it('returns 0 for identical values', () => {
      expect(calculateStandardDeviation([5, 5, 5, 5])).toBe(0);
      expect(calculateStandardDeviation([0, 0, 0])).toBe(0);
    });

    it('returns 0 for single element', () => {
      expect(calculateStandardDeviation([42])).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(calculateStandardDeviation([])).toBe(0);
    });

    it('handles negative numbers', () => {
      expect(calculateStandardDeviation([-1, -2, -3])).toBeCloseTo(1);
      expect(calculateStandardDeviation([-5, 0, 5])).toBeCloseTo(5);
    });

    it('handles decimal values', () => {
      const result = calculateStandardDeviation([1.1, 2.2, 3.3]);
      expect(result).toBeCloseTo(1.1);
    });
  });

  describe('calculateMedian', () => {
    it('calculates median for odd-length arrays', () => {
      expect(calculateMedian([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateMedian([7, 1, 9])).toBe(7);
      expect(calculateMedian([100])).toBe(100);
    });

    it('calculates median for even-length arrays', () => {
      expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
      expect(calculateMedian([10, 20])).toBe(15);
      expect(calculateMedian([1, 3, 5, 7])).toBe(4);
    });

    it('handles unsorted arrays', () => {
      expect(calculateMedian([5, 1, 9, 3, 7])).toBe(5);
      expect(calculateMedian([100, 1, 50, 25])).toBe(37.5);
    });

    it('handles duplicate values', () => {
      expect(calculateMedian([1, 2, 2, 3])).toBe(2);
      expect(calculateMedian([5, 5, 5, 5, 5])).toBe(5);
    });

    it('handles negative numbers', () => {
      expect(calculateMedian([-5, -1, -3])).toBe(-3);
      expect(calculateMedian([-10, -20, 0, 10])).toBe(-5);
    });

    it('returns 0 for empty array', () => {
      expect(calculateMedian([])).toBe(0);
    });

    it('handles decimal values', () => {
      expect(calculateMedian([1.1, 2.2, 3.3])).toBe(2.2);
      expect(calculateMedian([1.5, 2.5])).toBe(2);
    });

    it('does not mutate original array', () => {
      const original = [3, 1, 4, 1, 5];
      const originalCopy = [...original];
      calculateMedian(original);
      expect(original).toEqual(originalCopy);
    });
  });
});