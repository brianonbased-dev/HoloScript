import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../errors/safeJsonParse.js', () => ({
  readJson: vi.fn((json: string) => JSON.parse(json)),
}));

import {
  ALL_EXPORT_TARGETS,
  DEFAULT_BENCHMARK_CONFIG,
  TargetBenchmarkRunner,
  CircuitBreakerBenchmarkSuite,
  type ExportTarget,
  type BenchmarkSuiteResults,
} from '../CircuitBreakerBenchmarks.js';

// Helper to build a minimal BenchmarkSuiteResults
function makeSuiteResults(overrides: Partial<BenchmarkSuiteResults> = {}): BenchmarkSuiteResults {
  const base: BenchmarkSuiteResults = {
    metadata: {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      totalDurationMs: 1000,
      config: DEFAULT_BENCHMARK_CONFIG,
      platform: {
        runtime: 'node',
        arch: 'x64',
        cpus: 4,
        totalMemoryMB: 8192,
        nodeVersion: 'v18.0.0',
      },
    },
    targetResults: [],
    aggregate: {
      totalTargets: 0,
      passedTargets: 0,
      failedTargets: 0,
      regressedTargets: 0,
      meanCompilationTimeMs: 0,
      totalBenchmarkTimeMs: 1000,
      overallSuccessRate: 1.0,
      fastestTarget: { target: 'incremental', meanMs: 8 },
      slowestTarget: { target: 'nir', meanMs: 50 },
    },
    verdict: 'pass',
    summary: 'Verdict: PASS\nTargets: 0 passed, 0 failed, 0 regressed',
    ...overrides,
  };
  return base;
}

describe('ALL_EXPORT_TARGETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(ALL_EXPORT_TARGETS)).toBe(true);
    expect(ALL_EXPORT_TARGETS.length).toBeGreaterThan(0);
  });

  it('contains expected targets', () => {
    const targets = ALL_EXPORT_TARGETS as string[];
    expect(targets).toContain('r3f');
    expect(targets).toContain('unity');
    expect(targets).toContain('unreal');
    expect(targets).toContain('webgpu');
    expect(targets).toContain('nir');
  });

  it('has no duplicates', () => {
    const set = new Set(ALL_EXPORT_TARGETS);
    expect(set.size).toBe(ALL_EXPORT_TARGETS.length);
  });
});

describe('DEFAULT_BENCHMARK_CONFIG', () => {
  it('has expected shape', () => {
    expect(DEFAULT_BENCHMARK_CONFIG).toMatchObject({
      warmupIterations: expect.any(Number),
      measuredIterations: expect.any(Number),
      timeoutMs: expect.any(Number),
      collectMemory: expect.any(Boolean),
      gcBetweenIterations: expect.any(Boolean),
      regressionThreshold: expect.any(Number),
      compositionSizes: expect.any(Array),
      parallel: expect.any(Boolean),
      maxConcurrency: expect.any(Number),
    });
  });

  it('has positive measuredIterations', () => {
    expect(DEFAULT_BENCHMARK_CONFIG.measuredIterations).toBeGreaterThan(0);
  });

  it('compositionSizes is non-empty', () => {
    expect(DEFAULT_BENCHMARK_CONFIG.compositionSizes.length).toBeGreaterThan(0);
  });
});

describe('TargetBenchmarkRunner', () => {
  it('constructs without error', () => {
    const runner = new TargetBenchmarkRunner('r3f', DEFAULT_BENCHMARK_CONFIG);
    expect(runner).toBeDefined();
  });

  it('run() returns a TargetBenchmarkResult', async () => {
    const runner = new TargetBenchmarkRunner('r3f', {
      ...DEFAULT_BENCHMARK_CONFIG,
      warmupIterations: 1,
      measuredIterations: 3,
    });
    const result = await runner.run(5);
    expect(result.target).toBe('r3f');
    expect(result.compositionSize).toBe(5);
    expect(result.compilationTime).toBeDefined();
    expect(result.compilationTime.samples).toBeGreaterThan(0);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.iterations)).toBe(true);
    expect(result.throughput).toBeGreaterThanOrEqual(0);
    expect(typeof result.regressionDetected).toBe('boolean');
  });

  it('run() detects regression when baseline mean is lower', async () => {
    const runner = new TargetBenchmarkRunner('nir', {
      ...DEFAULT_BENCHMARK_CONFIG,
      warmupIterations: 0,
      measuredIterations: 3,
      regressionThreshold: 0, // 0% threshold triggers regression immediately
    });
    // Provide a baseline of 0ms which guarantees current > baseline
    const fakeBaseline = {
      samples: 3,
      mean: 0.001, // near zero so any positive time is a regression
      median: 0.001,
      stddev: 0,
      min: 0.001,
      max: 0.001,
      p50: 0.001,
      p90: 0.001,
      p95: 0.001,
      p99: 0.001,
      cv: 0,
    };
    const result = await runner.run(1, fakeBaseline);
    expect(result.regression).toBeDefined();
    expect(result.regression!.baselineMean).toBe(0.001);
    expect(typeof result.regression!.compilationTimeChange).toBe('number');
  });

  it('run() without baseline has no regression', async () => {
    const runner = new TargetBenchmarkRunner('incremental', {
      ...DEFAULT_BENCHMARK_CONFIG,
      warmupIterations: 0,
      measuredIterations: 2,
    });
    const result = await runner.run(1);
    expect(result.regressionDetected).toBe(false);
    expect(result.regression).toBeUndefined();
  });
});

describe('CircuitBreakerBenchmarkSuite', () => {
  describe('serialize()', () => {
    it('returns a JSON string', () => {
      const results = makeSuiteResults();
      const json = CircuitBreakerBenchmarkSuite.serialize(results);
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('round-trips through JSON', () => {
      const results = makeSuiteResults({ verdict: 'warn' });
      const json = CircuitBreakerBenchmarkSuite.serialize(results);
      const parsed = JSON.parse(json) as BenchmarkSuiteResults;
      expect(parsed.verdict).toBe('warn');
    });
  });

  describe('deserialize()', () => {
    it('parses JSON back to BenchmarkSuiteResults', () => {
      const results = makeSuiteResults({ verdict: 'fail' });
      const json = CircuitBreakerBenchmarkSuite.serialize(results);
      const deserialized = CircuitBreakerBenchmarkSuite.deserialize(json);
      expect(deserialized.verdict).toBe('fail');
      expect(deserialized.metadata).toBeDefined();
    });
  });

  describe('compareRuns()', () => {
    it('returns improved/regressed/unchanged/overallChange', () => {
      const baseline = makeSuiteResults({
        targetResults: [
          {
            target: 'r3f',
            compositionSize: 5,
            compilationTime: {
              samples: 3,
              mean: 100,
              median: 100,
              stddev: 5,
              min: 90,
              max: 110,
              p50: 100,
              p90: 108,
              p95: 109,
              p99: 110,
              cv: 0.05,
            },
            outputSize: {
              samples: 3,
              mean: 1000,
              median: 1000,
              stddev: 50,
              min: 900,
              max: 1100,
              p50: 1000,
              p90: 1080,
              p95: 1090,
              p99: 1100,
              cv: 0.05,
            },
            throughput: 10,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      const current = makeSuiteResults({
        targetResults: [
          {
            target: 'r3f',
            compositionSize: 5,
            compilationTime: {
              samples: 3,
              mean: 200, // much slower = regression
              median: 200,
              stddev: 5,
              min: 190,
              max: 210,
              p50: 200,
              p90: 208,
              p95: 209,
              p99: 210,
              cv: 0.025,
            },
            outputSize: {
              samples: 3,
              mean: 1000,
              median: 1000,
              stddev: 50,
              min: 900,
              max: 1100,
              p50: 1000,
              p90: 1080,
              p95: 1090,
              p99: 1100,
              cv: 0.05,
            },
            throughput: 5,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      const diff = CircuitBreakerBenchmarkSuite.compareRuns(baseline, current);
      expect(diff).toHaveProperty('improved');
      expect(diff).toHaveProperty('regressed');
      expect(diff).toHaveProperty('unchanged');
      expect(typeof diff.overallChange).toBe('number');
      // r3f went from 100ms to 200ms = 100% regression
      expect(diff.regressed.some((r) => r.target === 'r3f')).toBe(true);
    });

    it('classifies improved targets', () => {
      const baseline = makeSuiteResults({
        targetResults: [
          {
            target: 'incremental',
            compositionSize: 1,
            compilationTime: {
              samples: 3,
              mean: 200,
              median: 200,
              stddev: 5,
              min: 190,
              max: 210,
              p50: 200,
              p90: 208,
              p95: 209,
              p99: 210,
              cv: 0.025,
            },
            outputSize: {
              samples: 3,
              mean: 500,
              median: 500,
              stddev: 10,
              min: 480,
              max: 520,
              p50: 500,
              p90: 515,
              p95: 518,
              p99: 520,
              cv: 0.02,
            },
            throughput: 5,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      const current = makeSuiteResults({
        targetResults: [
          {
            target: 'incremental',
            compositionSize: 1,
            compilationTime: {
              samples: 3,
              mean: 50, // 75% faster = improved
              median: 50,
              stddev: 2,
              min: 45,
              max: 55,
              p50: 50,
              p90: 54,
              p95: 55,
              p99: 55,
              cv: 0.04,
            },
            outputSize: {
              samples: 3,
              mean: 500,
              median: 500,
              stddev: 10,
              min: 480,
              max: 520,
              p50: 500,
              p90: 515,
              p95: 518,
              p99: 520,
              cv: 0.02,
            },
            throughput: 20,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      const diff = CircuitBreakerBenchmarkSuite.compareRuns(baseline, current);
      expect(diff.improved.some((r) => r.target === 'incremental')).toBe(true);
    });

    it('uses custom regression threshold', () => {
      const baseline = makeSuiteResults({
        targetResults: [
          {
            target: 'r3f',
            compositionSize: 5,
            compilationTime: {
              samples: 3,
              mean: 100,
              median: 100,
              stddev: 5,
              min: 90,
              max: 110,
              p50: 100,
              p90: 108,
              p95: 109,
              p99: 110,
              cv: 0.05,
            },
            outputSize: {
              samples: 3,
              mean: 1000,
              median: 1000,
              stddev: 50,
              min: 900,
              max: 1100,
              p50: 1000,
              p90: 1080,
              p95: 1090,
              p99: 1100,
              cv: 0.05,
            },
            throughput: 10,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      const current = makeSuiteResults({
        targetResults: [
          {
            target: 'r3f',
            compositionSize: 5,
            compilationTime: {
              samples: 3,
              mean: 110, // only 10% slower
              median: 110,
              stddev: 5,
              min: 100,
              max: 120,
              p50: 110,
              p90: 118,
              p95: 119,
              p99: 120,
              cv: 0.045,
            },
            outputSize: {
              samples: 3,
              mean: 1000,
              median: 1000,
              stddev: 50,
              min: 900,
              max: 1100,
              p50: 1000,
              p90: 1080,
              p95: 1090,
              p99: 1100,
              cv: 0.05,
            },
            throughput: 9,
            successRate: 1.0,
            iterations: [],
            regressionDetected: false,
          },
        ],
      });

      // With 5% threshold → 10% change is regression
      const diffStrict = CircuitBreakerBenchmarkSuite.compareRuns(baseline, current, 5);
      expect(diffStrict.regressed.some((r) => r.target === 'r3f')).toBe(true);

      // With 20% threshold → 10% change is not regression
      const diffLenient = CircuitBreakerBenchmarkSuite.compareRuns(baseline, current, 20);
      expect(diffLenient.regressed.some((r) => r.target === 'r3f')).toBe(false);
    });
  });

  describe('formatReport()', () => {
    it('returns a string containing verdict', () => {
      const results = makeSuiteResults({ verdict: 'pass' });
      const report = CircuitBreakerBenchmarkSuite.formatReport(results);
      expect(typeof report).toBe('string');
      expect(report).toContain('PASS');
    });
  });

  describe('constructor', () => {
    it('constructs with default config', () => {
      const suite = new CircuitBreakerBenchmarkSuite();
      expect(suite).toBeDefined();
    });

    it('constructs with custom targets', () => {
      const suite = new CircuitBreakerBenchmarkSuite({}, ['r3f', 'incremental']);
      expect(suite).toBeDefined();
    });

    it('constructs with partial config override', () => {
      const suite = new CircuitBreakerBenchmarkSuite({ measuredIterations: 5 });
      expect(suite).toBeDefined();
    });
  });

  describe('runAll()', () => {
    it('returns BenchmarkSuiteResults with verdict', async () => {
      const suite = new CircuitBreakerBenchmarkSuite(
        { warmupIterations: 0, measuredIterations: 2, compositionSizes: [1] },
        ['incremental'] // single fast target
      );
      const results = await suite.runAll();
      expect(results.verdict).toMatch(/^(pass|fail|warn)$/);
      expect(results.metadata).toBeDefined();
      expect(results.targetResults.length).toBe(1);
      expect(results.targetResults[0].target).toBe('incremental');
    }, 30000);
  });
});
