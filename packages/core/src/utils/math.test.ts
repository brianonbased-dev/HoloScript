import { describe, it, expect } from 'vitest';
import { 
  calculateAverage, 
  calculateSuccessRate, 
  calculateStandardDeviation, 
  calculateMedian 
} from './math';

describe('Math Utilities', () => {
  describe('calculateAverage', () => {
    it('calculates the average of positive numbers', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateAverage([10, 20, 30])).toBe(20);
    });

    it('calculates the average of negative numbers', () => {
      expect(calculateAverage([-1, -2, -3])).toBe(-2);
    });

    it('calculates the average of mixed positive and negative numbers', () => {
      expect(calculateAverage([-5, 0, 5])).toBe(0);
      expect(calculateAverage([-10, 10, 15, -5])).toBe(2.5);
    });

    it('handles decimal numbers', () => {
      expect(calculateAverage([1.5, 2.5, 3.5])).toBe(2.5);
      expect(calculateAverage([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
    });

    it('returns 0 for empty array', () => {
      expect(calculateAverage([])).toBe(0);
    });

    it('handles single element array', () => {
      expect(calculateAverage([42])).toBe(42);
      expect(calculateAverage([0])).toBe(0);
      expect(calculateAverage([-10])).toBe(-10);
    });

    it('handles very large numbers', () => {
      expect(calculateAverage([1e10, 2e10, 3e10])).toBe(2e10);
    });

    it('handles very small numbers', () => {
      expect(calculateAverage([1e-10, 2e-10, 3e-10])).toBeCloseTo(2e-10, 15);
    });
  });

  describe('calculateSuccessRate', () => {
    it('calculates success rate correctly', () => {
      expect(calculateSuccessRate(8, 10)).toBe(80);
      expect(calculateSuccessRate(5, 5)).toBe(100);
      expect(calculateSuccessRate(0, 10)).toBe(0);
    });

    it('handles edge cases', () => {
      expect(calculateSuccessRate(0, 0)).toBe(0);
      expect(calculateSuccessRate(5, 0)).toBe(0);
    });

    it('handles partial successes with decimals', () => {
      expect(calculateSuccessRate(1, 3)).toBeCloseTo(33.333, 2);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('calculates standard deviation correctly', () => {
      expect(calculateStandardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.4142, 3);
      expect(calculateStandardDeviation([10, 10, 10, 10])).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(calculateStandardDeviation([])).toBe(0);
    });

    it('returns 0 for single element array', () => {
      expect(calculateStandardDeviation([5])).toBe(0);
    });

    it('handles negative numbers', () => {
      expect(calculateStandardDeviation([-2, -1, 0, 1, 2])).toBeCloseTo(1.4142, 3);
    });
  });

  describe('calculateMedian', () => {
    it('calculates median for odd number of elements', () => {
      expect(calculateMedian([1, 3, 5])).toBe(3);
      expect(calculateMedian([7, 1, 9, 3, 5])).toBe(5);
    });

    it('calculates median for even number of elements', () => {
      expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
      expect(calculateMedian([10, 20])).toBe(15);
    });

    it('returns 0 for empty array', () => {
      expect(calculateMedian([])).toBe(0);
    });

    it('handles single element array', () => {
      expect(calculateMedian([42])).toBe(42);
    });

    it('handles unsorted input', () => {
      expect(calculateMedian([5, 1, 9, 3, 7])).toBe(5);
    });

    it('handles negative numbers', () => {
      expect(calculateMedian([-5, -1, -3])).toBe(-3);
    });

    it('handles duplicate values', () => {
      expect(calculateMedian([1, 1, 2, 2, 3])).toBe(2);
      expect(calculateMedian([5, 5, 5, 5])).toBe(5);
    });
  });
});