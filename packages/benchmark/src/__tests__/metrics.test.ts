import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  compareMetrics,
  formatMetrics,
  BenchmarkMetrics,
} from '../analysis/metrics';

describe('Benchmark Metrics', () => {
  describe('calculateMetrics', () => {
    it('should calculate metrics from task result', () => {
      const task = {
        result: {
          hz: 1000,
          mean: 0.001,
        },
      };

      const metrics = calculateMetrics(task);

      expect(metrics.hz).toBe(1000);
      expect(metrics.mean).toBe(0.001);
      expect(metrics.period).toBe(1); // 1000ms / 1000hz = 1ms
    });

    it('should handle missing result', () => {
      const task = {};

      const metrics = calculateMetrics(task);

      expect(metrics.hz).toBe(0);
      expect(metrics.mean).toBe(0);
      expect(metrics.period).toBe(0);
    });

    it('should handle undefined hz', () => {
      const task = {
        result: {
          mean: 0.005,
        },
      };

      const metrics = calculateMetrics(task);

      expect(metrics.hz).toBe(0);
      expect(metrics.period).toBe(0);
    });

    it('should calculate period correctly for various hz values', () => {
      // 100 ops/sec = 10ms per op
      const task100 = { result: { hz: 100 } };
      expect(calculateMetrics(task100).period).toBe(10);

      // 500 ops/sec = 2ms per op
      const task500 = { result: { hz: 500 } };
      expect(calculateMetrics(task500).period).toBe(2);

      // 10000 ops/sec = 0.1ms per op
      const task10k = { result: { hz: 10000 } };
      expect(calculateMetrics(task10k).period).toBe(0.1);
    });

    it('should return default values for empty samples', () => {
      const task = { result: { hz: 1000, mean: 0.001 } };
      const metrics = calculateMetrics(task);

      expect(metrics.samples).toBe(0);
      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
      expect(metrics.median).toBe(0);
      expect(metrics.stdDev).toBe(0);
    });
  });

  describe('compareMetrics', () => {
    const baseline: BenchmarkMetrics = {
      name: 'test-benchmark',
      hz: 1000,
      period: 1,
      samples: 100,
      min: 0.8,
      max: 1.2,
      mean: 1,
      median: 1,
      stdDev: 0.1,
    };

    it('should detect performance improvement', () => {
      const current: BenchmarkMetrics = {
        ...baseline,
        hz: 1200, // 20% faster
      };

      const result = compareMetrics(baseline, current);

      expect(result.percentChange).toBe(20);
      expect(result.isRegression).toBe(false);
    });

    it('should detect performance regression', () => {
      const current: BenchmarkMetrics = {
        ...baseline,
        hz: 800, // 20% slower
      };

      const result = compareMetrics(baseline, current);

      expect(result.percentChange).toBe(-20);
      expect(result.isRegression).toBe(true);
    });

    it('should respect custom threshold', () => {
      const current: BenchmarkMetrics = {
        ...baseline,
        hz: 970, // 3% slower
      };

      // Default 5% threshold - not a regression
      const result5 = compareMetrics(baseline, current, 5);
      expect(result5.isRegression).toBe(false);

      // Custom 2% threshold - is a regression
      const result2 = compareMetrics(baseline, current, 2);
      expect(result2.isRegression).toBe(true);
    });

    it('should handle identical performance', () => {
      const current: BenchmarkMetrics = { ...baseline };

      const result = compareMetrics(baseline, current);

      expect(result.percentChange).toBe(0);
      expect(result.isRegression).toBe(false);
    });

    it('should return baseline and current values', () => {
      const current: BenchmarkMetrics = {
        ...baseline,
        name: 'current-test',
        hz: 1100,
      };

      const result = compareMetrics(baseline, current);

      expect(result.metric).toBe('current-test');
      expect(result.baseline).toBe(1000);
      expect(result.current).toBe(1100);
    });

    it('should handle zero baseline hz', () => {
      const zeroBaseline: BenchmarkMetrics = { ...baseline, hz: 0 };
      const current: BenchmarkMetrics = { ...baseline, hz: 100 };

      const result = compareMetrics(zeroBaseline, current);

      // Division by zero results in Infinity
      expect(result.percentChange).toBe(Infinity);
    });

    it('should correctly calculate negative percentage for slower performance', () => {
      const current: BenchmarkMetrics = {
        ...baseline,
        hz: 500, // 50% slower
      };

      const result = compareMetrics(baseline, current);

      expect(result.percentChange).toBe(-50);
      expect(result.isRegression).toBe(true);
    });
  });

  describe('formatMetrics', () => {
    it('should format metrics as string', () => {
      const metrics: BenchmarkMetrics = {
        name: 'parse-simple',
        hz: 50000,
        period: 0.02,
        samples: 100,
        min: 0.018,
        max: 0.025,
        mean: 0.02,
        median: 0.02,
        stdDev: 0.002,
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('parse-simple');
      expect(formatted).toContain('50000.00 hz');
      expect(formatted).toContain('0.020 ms');
      expect(formatted).toContain('100');
    });

    it('should format zero values', () => {
      const metrics: BenchmarkMetrics = {
        name: 'empty',
        hz: 0,
        period: 0,
        samples: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('0.00 hz');
      expect(formatted).toContain('0.000 ms');
    });

    it('should handle high precision values', () => {
      const metrics: BenchmarkMetrics = {
        name: 'precise',
        hz: 123456.789,
        period: 0.0081,
        samples: 1000,
        min: 0.007,
        max: 0.009,
        mean: 0.008123456,
        median: 0.008,
        stdDev: 0.0005,
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('123456.79 hz');
      expect(formatted).toContain('0.008 ms');
    });
  });
});
