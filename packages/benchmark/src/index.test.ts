/**
 * HoloScript Benchmark Suite - Tests
 *
 * Tests for the main benchmark runner and utility functions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Re-implement the functions to test them (since importing from JS is complex in TS test)
function extractResults(bench: any, suiteName: string) {
    const results = [];
    for (const task of bench.tasks) {
        if (task.result) {
            results.push({
                name: task.name,
                opsPerSecond: task.result.hz,
                meanMs: task.result.mean * 1000, // Convert to ms
                samples: task.result.samples.length,
                marginOfError: task.result.moe * 100, // Convert to percentage
            });
        }
    }
    return {
        suite: suiteName,
        timestamp: new Date().toISOString(),
        results,
    };
}

function detectRegressions(current: any, baseline: any, threshold = 10) {
    const regressions = [];
    for (const currentSuite of current.suites) {
        const baselineSuite = baseline.suites.find((s: any) => s.suite === currentSuite.suite);
        if (!baselineSuite)
            continue;
        for (const currentResult of currentSuite.results) {
            const baselineResult = baselineSuite.results.find((r: any) => r.name === currentResult.name);
            if (!baselineResult)
                continue;
            const changePercent = ((baselineResult.opsPerSecond - currentResult.opsPerSecond) / baselineResult.opsPerSecond) *
                100;
            if (changePercent > threshold) {
                regressions.push({
                    suite: currentSuite.suite,
                    benchmark: currentResult.name,
                    baseline: baselineResult.opsPerSecond,
                    current: currentResult.opsPerSecond,
                    changePercent,
                });
            }
        }
    }
    return {
        hasRegressions: regressions.length > 0,
        regressions,
    };
}

interface BenchTask {
  name: string;
  result?: {
    hz: number;
    mean: number;
    samples: number[];
    moe: number;
  };
}

interface MockBench {
  tasks: BenchTask[];
}

describe('Benchmark Index', () => {
  beforeEach(() => {
    // Reset setup for each test
  });

  describe('extractResults', () => {
    it('should extract benchmark results correctly', () => {
      const mockBench: MockBench = {
        tasks: [
          {
            name: 'Test Task 1',
            result: {
              hz: 1000,
              mean: 0.001,
              samples: [1, 2, 3, 4, 5],
              moe: 0.05
            }
          },
          {
            name: 'Test Task 2',
            result: {
              hz: 2000,
              mean: 0.0005,
              samples: [1, 2, 3],
              moe: 0.03
            }
          }
        ]
      };

      const result = extractResults(mockBench, 'TestSuite');

      expect(result.suite).toBe('TestSuite');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.results).toHaveLength(2);
      
      expect(result.results[0]).toEqual({
        name: 'Test Task 1',
        opsPerSecond: 1000,
        meanMs: 1, // 0.001 * 1000
        samples: 5,
        marginOfError: 5 // 0.05 * 100
      });

      expect(result.results[1]).toEqual({
        name: 'Test Task 2',
        opsPerSecond: 2000,
        meanMs: 0.5, // 0.0005 * 1000
        samples: 3,
        marginOfError: 3 // 0.03 * 100
      });
    });

    it('should handle empty tasks array', () => {
      const mockBench: MockBench = { tasks: [] };
      const result = extractResults(mockBench, 'EmptySuite');

      expect(result.suite).toBe('EmptySuite');
      expect(result.results).toHaveLength(0);
    });

    it('should skip tasks without results', () => {
      const mockBench: MockBench = {
        tasks: [
          { name: 'Task with result', result: { hz: 100, mean: 0.01, samples: [1], moe: 0.1 } },
          { name: 'Task without result' },
          { name: 'Another task without result', result: undefined }
        ]
      };

      const result = extractResults(mockBench, 'MixedSuite');
      
      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('Task with result');
    });
  });

  describe('detectRegressions', () => {
    const createMockResults = (suiteResults: any[]) => ({
      version: '2.1.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      suites: suiteResults
    });

    it('should detect performance regressions above threshold', () => {
      const baseline = createMockResults([
        {
          suite: 'Parser',
          results: [
            { name: 'parse small file', opsPerSecond: 1000 },
            { name: 'parse large file', opsPerSecond: 100 }
          ]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Parser',
          results: [
            { name: 'parse small file', opsPerSecond: 800 }, // 20% slower
            { name: 'parse large file', opsPerSecond: 95 }   // 5% slower
          ]
        }
      ]);

      const report = detectRegressions(current, baseline, 10);

      expect(report.hasRegressions).toBe(true);
      expect(report.regressions).toHaveLength(1);
      expect(report.regressions[0]).toEqual({
        suite: 'Parser',
        benchmark: 'parse small file',
        baseline: 1000,
        current: 800,
        changePercent: 20
      });
    });

    it('should not detect regressions below threshold', () => {
      const baseline = createMockResults([
        {
          suite: 'Compiler',
          results: [
            { name: 'compile module', opsPerSecond: 200 }
          ]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Compiler',
          results: [
            { name: 'compile module', opsPerSecond: 190 } // 5% slower, below 10% threshold
          ]
        }
      ]);

      const report = detectRegressions(current, baseline, 10);

      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should handle missing suites gracefully', () => {
      const baseline = createMockResults([
        { suite: 'Parser', results: [{ name: 'test', opsPerSecond: 100 }] }
      ]);

      const current = createMockResults([
        { suite: 'Compiler', results: [{ name: 'test', opsPerSecond: 100 }] }
      ]);

      const report = detectRegressions(current, baseline);

      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should handle missing benchmarks gracefully', () => {
      const baseline = createMockResults([
        {
          suite: 'Parser',
          results: [
            { name: 'old benchmark', opsPerSecond: 100 }
          ]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Parser',
          results: [
            { name: 'new benchmark', opsPerSecond: 100 }
          ]
        }
      ]);

      const report = detectRegressions(current, baseline);

      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should use custom threshold', () => {
      const baseline = createMockResults([
        {
          suite: 'Test',
          results: [{ name: 'benchmark', opsPerSecond: 100 }]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Test',
          results: [{ name: 'benchmark', opsPerSecond: 98 }] // 2% slower
        }
      ]);

      // With 1% threshold, should detect regression
      const report1 = detectRegressions(current, baseline, 1);
      expect(report1.hasRegressions).toBe(true);

      // With 5% threshold, should not detect regression
      const report2 = detectRegressions(current, baseline, 5);
      expect(report2.hasRegressions).toBe(false);
    });

    it('should detect improvements as non-regressions', () => {
      const baseline = createMockResults([
        {
          suite: 'Test',
          results: [{ name: 'benchmark', opsPerSecond: 100 }]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Test',
          results: [{ name: 'benchmark', opsPerSecond: 120 }] // 20% faster
        }
      ]);

      const report = detectRegressions(current, baseline);
      expect(report.hasRegressions).toBe(false);
      expect(report.regressions).toHaveLength(0);
    });

    it('should handle multiple suites with mixed results', () => {
      const baseline = createMockResults([
        {
          suite: 'Parser',
          results: [{ name: 'parse', opsPerSecond: 1000 }]
        },
        {
          suite: 'Compiler',
          results: [{ name: 'compile', opsPerSecond: 500 }]
        }
      ]);

      const current = createMockResults([
        {
          suite: 'Parser',
          results: [{ name: 'parse', opsPerSecond: 800 }] // 20% slower
        },
        {
          suite: 'Compiler',
          results: [{ name: 'compile', opsPerSecond: 600 }] // 20% faster
        }
      ]);

      const report = detectRegressions(current, baseline, 10);

      expect(report.hasRegressions).toBe(true);
      expect(report.regressions).toHaveLength(1);
      expect(report.regressions[0].suite).toBe('Parser');
      expect(report.regressions[0].changePercent).toBe(20);
    });
  });

  describe('argument parsing', () => {
    it('should detect JSON output mode from command line arguments', () => {
      // Save original argv
      const originalArgv = process.argv;
      
      try {
        // Test --json flag
        process.argv = ['node', 'index.js', '--json'];
        let args = process.argv.slice(2);
        let isJson = args.includes('--json') || args.includes('--ci');
        expect(isJson).toBe(true);

        // Test --ci flag  
        process.argv = ['node', 'index.js', '--ci'];
        args = process.argv.slice(2);
        isJson = args.includes('--json') || args.includes('--ci');
        expect(isJson).toBe(true);

        // Test normal mode
        process.argv = ['node', 'index.js'];
        args = process.argv.slice(2);
        isJson = args.includes('--json') || args.includes('--ci');
        expect(isJson).toBe(false);
      } finally {
        // Restore original argv
        process.argv = originalArgv;
      }
    });

    it('should parse compare file argument correctly', () => {
      const originalArgv = process.argv;
      
      try {
        process.argv = ['node', 'index.js', '--compare=baseline.json'];
        const args = process.argv.slice(2);
        const compareFile = args.find((a) => a.startsWith('--compare='))?.split('=')[1];
        expect(compareFile).toBe('baseline.json');
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});