/**
 * Tests for the main benchmark entry point
 */
import { describe, it, expect } from 'vitest';
import { extractResults, detectRegressions } from './index.js';

describe('Benchmark Index', () => {

  describe('extractResults', () => {
    it('should extract benchmark results correctly', () => {
      const mockBench = {
        tasks: [
          {
            name: 'test1',
            result: {
              hz: 1000,
              mean: 0.001,
              samples: [1, 2, 3],
              moe: 0.05
            }
          },
          {
            name: 'test2',
            result: {
              hz: 500,
              mean: 0.002,
              samples: [4, 5],
              moe: 0.1
            }
          }
        ]
      };

      const result = extractResults(mockBench, 'TestSuite');

      expect(result).toEqual({
        suite: 'TestSuite',
        timestamp: expect.any(String),
        results: [
          {
            name: 'test1',
            opsPerSecond: 1000,
            meanMs: 1,
            samples: 3,
            marginOfError: 5
          },
          {
            name: 'test2',
            opsPerSecond: 500,
            meanMs: 2,
            samples: 2,
            marginOfError: 10
          }
        ]
      });
    });

    it('should handle tasks without results', () => {
      const mockBench = {
        tasks: [
          { name: 'test1' }, // No result
          {
            name: 'test2',
            result: {
              hz: 100,
              mean: 0.01,
              samples: [1],
              moe: 0.2
            }
          }
        ]
      };

      const result = extractResults(mockBench, 'TestSuite');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('test2');
    });
  });

  describe('detectRegressions', () => {
    it('should detect performance regressions', () => {
      const current = {
        suites: [{
          suite: 'Parser',
          results: [
            { name: 'parseSmall', opsPerSecond: 900 }, // 10% slower
            { name: 'parseLarge', opsPerSecond: 450 }  // 10% slower
          ]
        }]
      };

      const baseline = {
        suites: [{
          suite: 'Parser',
          results: [
            { name: 'parseSmall', opsPerSecond: 1000 },
            { name: 'parseLarge', opsPerSecond: 500 }
          ]
        }]
      };

      const report = detectRegressions(current, baseline, 5); // 5% threshold

      expect(report.hasRegressions).toBe(true);
      expect(report.regressions).toHaveLength(2);
      expect(report.regressions[0]).toEqual({
        suite: 'Parser',
        benchmark: 'parseSmall',
        baseline: 1000,
        current: 900,
        changePercent: 10
      });
    });

    it('should not flag improvements as regressions', () => {
      const current = {
        suites: [{
          suite: 'Parser',
          results: [
            { name: 'parseSmall', opsPerSecond: 1100 } // 10% faster
          ]
        }]
      };

      const baseline = {
        suites: [{
          suite: 'Parser',
          results: [
            { name: 'parseSmall', opsPerSecond: 1000 }
          ]
        }]
      };

      const report = detectRegressions(current, baseline, 10);

      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should handle missing suites and benchmarks', () => {
      const current = {
        suites: [{
          suite: 'NewSuite',
          results: [{ name: 'newBench', opsPerSecond: 500 }]
        }]
      };

      const baseline = {
        suites: [{
          suite: 'OldSuite', 
          results: [{ name: 'oldBench', opsPerSecond: 1000 }]
        }]
      };

      const report = detectRegressions(current, baseline);

      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should use custom threshold', () => {
      const current = {
        suites: [{
          suite: 'Parser',
          results: [{ name: 'test', opsPerSecond: 950 }] // 5% slower
        }]
      };

      const baseline = {
        suites: [{
          suite: 'Parser', 
          results: [{ name: 'test', opsPerSecond: 1000 }]
        }]
      };

      // Should not detect with 10% threshold
      const report1 = detectRegressions(current, baseline, 10);
      expect(report1.hasRegressions).toBe(false);

      // Should detect with 3% threshold
      const report2 = detectRegressions(current, baseline, 3);
      expect(report2.hasRegressions).toBe(true);
    });
  });
});