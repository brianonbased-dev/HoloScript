/**
 * Tests for mathematical utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAverage,
  calculateSuccessRate,
  calculateStandardDeviation,
  calculateMedian,
} from './math';

describe('Math Utilities', () => {
  describe('calculateAverage', () => {
    it('should return 0 for empty array', () => {
      expect(calculateAverage([])).toBe(0);
    });

    it('should calculate average of single number', () => {
      expect(calculateAverage([5])).toBe(5);
    });

    it('should calculate average of multiple positive numbers', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should handle decimal results', () => {
      expect(calculateAverage([1, 2])).toBe(1.5);
    });

    it('should handle negative numbers', () => {
      expect(calculateAverage([-1, -2, -3])).toBe(-2);
    });

    it('should handle mixed positive and negative numbers', () => {
      expect(calculateAverage([-10, 10, 0])).toBe(0);
    });

    it('should handle large numbers', () => {
      const large = [1000000, 2000000, 3000000];
      expect(calculateAverage(large)).toBe(2000000);
    });

    it('should handle compilation time benchmarks realistically', () => {
      // Typical compilation times in milliseconds
      const compilationTimes = [250, 340, 180, 420, 300];
      expect(calculateAverage(compilationTimes)).toBe(298);
    });

    it('should handle feature parity scores', () => {
      // Feature parity percentages
      const parityScores = [85.5, 92.3, 78.1, 89.7];
      expect(calculateAverage(parityScores)).toBeCloseTo(86.4, 1);
    });

    it('should handle zero values mixed with positive', () => {
      expect(calculateAverage([0, 0, 6])).toBe(2);
    });
  });

  describe('calculateSuccessRate', () => {
    it('should return 0 for zero total', () => {
      expect(calculateSuccessRate(0, 0)).toBe(0);
    });

    it('should calculate 100% success rate', () => {
      expect(calculateSuccessRate(10, 10)).toBe(100);
    });

    it('should calculate partial success rate', () => {
      expect(calculateSuccessRate(8, 10)).toBe(80);
    });

    it('should handle zero successes', () => {
      expect(calculateSuccessRate(0, 10)).toBe(0);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('should return 0 for empty array', () => {
      expect(calculateStandardDeviation([])).toBe(0);
    });

    it('should return 0 for single element', () => {
      expect(calculateStandardDeviation([5])).toBe(0);
    });

    it('should calculate standard deviation for uniform values', () => {
      expect(calculateStandardDeviation([5, 5, 5, 5])).toBe(0);
    });

    it('should calculate standard deviation for varied values', () => {
      const result = calculateStandardDeviation([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(1.414, 2);
    });
  });

  describe('calculateMedian', () => {
    it('should return 0 for empty array', () => {
      expect(calculateMedian([])).toBe(0);
    });

    it('should return single value for array of one', () => {
      expect(calculateMedian([5])).toBe(5);
    });

    it('should calculate median for odd-length array', () => {
      expect(calculateMedian([1, 3, 5])).toBe(3);
    });

    it('should calculate median for even-length array', () => {
      expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
    });

    it('should handle unsorted input', () => {
      expect(calculateMedian([5, 1, 3])).toBe(3);
    });
  });
});