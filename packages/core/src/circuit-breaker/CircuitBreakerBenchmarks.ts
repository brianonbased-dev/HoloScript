/**
 * CircuitBreakerBenchmarks.ts
 *
 * Benchmark suite for the HoloScript circuit breaker across 25+ compiler targets.
 * Measures compilation time, memory usage, throughput, and detects regressions.
 *
 * Targets benchmarked (aligned with compiler/CircuitBreaker.ts ExportTarget):
 *   urdf, sdf, unity, unreal, godot, vrchat, openxr, android, android-xr,
 *   ios, visionos, ar, babylon, webgpu, r3f, wasm, playcanvas, usd, usdz,
 *   dtdl, vrr, multi-layer, incremental, state, trait-composition, tsl,
 *   a2a-agent-card, nir, openxr-spatial-entities
 *
 * @module benchmarks
 * @version 1.0.0
 * @package @holoscript/examples
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Export target identifier (mirrors compiler/CircuitBreaker.ts)
 */
export type ExportTarget =
  | 'urdf'
  | 'sdf'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'vrchat'
  | 'openxr'
  | 'android'
  | 'android-xr'
  | 'ios'
  | 'visionos'
  | 'ar'
  | 'babylon'
  | 'webgpu'
  | 'r3f'
  | 'wasm'
  | 'playcanvas'
  | 'usd'
  | 'usdz'
  | 'dtdl'
  | 'vrr'
  | 'multi-layer'
  | 'incremental'
  | 'state'
  | 'trait-composition'
  | 'tsl'
  | 'a2a-agent-card'
  | 'nir'
  | 'openxr-spatial-entities'
  | 'phone-sleeve-vr';

/** All export targets as a constant array */
export const ALL_EXPORT_TARGETS: ExportTarget[] = [
  'urdf',
  'sdf',
  'unity',
  'unreal',
  'godot',
  'vrchat',
  'openxr',
  'android',
  'android-xr',
  'ios',
  'visionos',
  'ar',
  'babylon',
  'webgpu',
  'r3f',
  'wasm',
  'playcanvas',
  'usd',
  'usdz',
  'dtdl',
  'vrr',
  'multi-layer',
  'incremental',
  'state',
  'trait-composition',
  'tsl',
  'a2a-agent-card',
  'nir',
  'openxr-spatial-entities',
  'phone-sleeve-vr',
];

/**
 * Benchmark configuration.
 */
export interface BenchmarkConfig {
  /** Number of warmup iterations (not included in measurements) */
  warmupIterations: number;

  /** Number of measured iterations per target */
  measuredIterations: number;

  /** Timeout per individual benchmark run (ms) */
  timeoutMs: number;

  /** Whether to collect memory usage data (requires --expose-gc) */
  collectMemory: boolean;

  /** Whether to run garbage collection between iterations */
  gcBetweenIterations: boolean;

  /** Baseline results file path (for regression detection) */
  baselinePath?: string;

  /** Maximum acceptable regression percentage */
  regressionThreshold: number;

  /** Composition sizes to test (trait count) */
  compositionSizes: number[];

  /** Whether to run targets in parallel */
  parallel: boolean;

  /** Maximum concurrency when running in parallel */
  maxConcurrency: number;
}

/**
 * Single iteration timing result.
 */
export interface IterationResult {
  /** Iteration index */
  iteration: number;

  /** Compilation time (ms) */
  compilationTimeMs: number;

  /** Memory used during compilation (bytes, if collected) */
  memoryUsedBytes?: number;

  /** Output size (bytes) */
  outputSizeBytes: number;

  /** Whether the compilation succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Statistical summary of a benchmark.
 */
export interface BenchmarkStatistics {
  /** Number of samples */
  samples: number;

  /** Mean value */
  mean: number;

  /** Median value */
  median: number;

  /** Standard deviation */
  stddev: number;

  /** Minimum value */
  min: number;

  /** Maximum value */
  max: number;

  /** 50th percentile (same as median) */
  p50: number;

  /** 90th percentile */
  p90: number;

  /** 95th percentile */
  p95: number;

  /** 99th percentile */
  p99: number;

  /** Coefficient of variation (stddev/mean, lower is more stable) */
  cv: number;
}

/**
 * Benchmark result for a single export target.
 */
export interface TargetBenchmarkResult {
  /** Export target name */
  target: ExportTarget;

  /** Composition size tested (trait count) */
  compositionSize: number;

  /** Compilation time statistics (ms) */
  compilationTime: BenchmarkStatistics;

  /** Memory usage statistics (bytes, if collected) */
  memoryUsage?: BenchmarkStatistics;

  /** Output size statistics (bytes) */
  outputSize: BenchmarkStatistics;

  /** Throughput (compilations per second) */
  throughput: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Individual iteration results */
  iterations: IterationResult[];

  /** Whether a regression was detected against baseline */
  regressionDetected: boolean;

  /** Regression details (if detected) */
  regression?: {
    compilationTimeChange: number; // percentage
    memoryChange: number; // percentage
    baselineMean: number;
    currentMean: number;
  };
}

/**
 * Complete benchmark suite results.
 */
export interface BenchmarkSuiteResults {
  /** Suite run metadata */
  metadata: {
    startTime: string;
    endTime: string;
    totalDurationMs: number;
    config: BenchmarkConfig;
    platform: {
      runtime: string;
      arch: string;
      cpus: number;
      totalMemoryMB: number;
      nodeVersion?: string;
    };
    gitCommit?: string;
    gitBranch?: string;
  };

  /** Results per target */
  targetResults: TargetBenchmarkResult[];

  /** Aggregate statistics across all targets */
  aggregate: {
    totalTargets: number;
    passedTargets: number;
    failedTargets: number;
    regressedTargets: number;
    meanCompilationTimeMs: number;
    totalBenchmarkTimeMs: number;
    overallSuccessRate: number;
    fastestTarget: { target: ExportTarget; meanMs: number };
    slowestTarget: { target: ExportTarget; meanMs: number };
  };

  /** Summary judgment */
  verdict: 'pass' | 'fail' | 'warn';

  /** Human-readable summary */
  summary: string;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  warmupIterations: 3,
  measuredIterations: 20,
  timeoutMs: 30000,
  collectMemory: true,
  gcBetweenIterations: true,
  regressionThreshold: 15, // 15% regression
  compositionSizes: [1, 5, 10, 25],
  parallel: false,
  maxConcurrency: 4,
};

// =============================================================================
// STATISTICAL UTILITIES
// =============================================================================

function computeStatistics(values: number[]): BenchmarkStatistics {
  if (values.length === 0) {
    return {
      samples: 0,
      mean: 0,
      median: 0,
      stddev: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      cv: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
  const stddev = Math.sqrt(variance);

  const percentile = (p: number): number => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  return {
    samples: n,
    mean,
    median: percentile(50),
    stddev,
    min: sorted[0],
    max: sorted[n - 1],
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    cv: mean > 0 ? stddev / mean : 0,
  };
}

// =============================================================================
// SIMULATED COMPILATION (for benchmark framework validation)
// =============================================================================

/**
 * Simulates a compilation operation for a given target and composition size.
 * In production use, this would call the actual compiler.
 *
 * The simulation models realistic timing characteristics:
 * - Base cost varies by target complexity
 * - Scales sub-linearly with composition size (Amdahl's law)
 * - Adds realistic variance (log-normal distribution)
 */
function simulateCompilation(
  target: ExportTarget,
  compositionSize: number
): { timeMs: number; outputSizeBytes: number; success: boolean } {
  // Base cost per target (ms) - models relative complexity
  const baseCosts: Record<string, number> = {
    r3f: 12,
    babylon: 15,
    webgpu: 25,
    wasm: 40,
    unity: 35,
    unreal: 45,
    godot: 20,
    playcanvas: 18,
    openxr: 30,
    visionos: 38,
    android: 22,
    'android-xr': 28,
    ios: 25,
    ar: 20,
    vrchat: 32,
    urdf: 18,
    sdf: 16,
    usd: 28,
    usdz: 30,
    dtdl: 14,
    vrr: 22,
    tsl: 20,
    'multi-layer': 35,
    incremental: 8,
    state: 12,
    'trait-composition': 15,
    'a2a-agent-card': 10,
    nir: 50,
    'openxr-spatial-entities': 25,
  };

  const baseCost = baseCosts[target] || 20;

  // Sub-linear scaling with composition size
  const scaleFactor = Math.sqrt(compositionSize) * 1.5;

  // Add log-normal variance for realistic timing
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const variance = Math.exp(gaussian * 0.2); // ~20% coefficient of variation

  const timeMs = baseCost * scaleFactor * variance;

  // Output size scales linearly with composition
  const baseOutputSize = 1024 * (baseCosts[target] || 20);
  const outputSizeBytes = Math.floor(
    baseOutputSize * compositionSize * (0.8 + Math.random() * 0.4)
  );

  // Small failure probability for realism
  const failureProbability = 0.02; // 2%
  const success = Math.random() > failureProbability;

  return { timeMs, outputSizeBytes, success };
}

/**
 * Get memory usage in bytes (if available via process.memoryUsage).
 */
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  // Browser fallback: estimate from performance API
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize;
  }
  return 0;
}

/**
 * Attempt garbage collection (requires --expose-gc flag in Node.js).
 */
function tryGC(): void {
  if (typeof global !== 'undefined' && (global as any).gc) {
    (global as any).gc();
  }
}

// =============================================================================
// BENCHMARK RUNNER
// =============================================================================

/**
 * Benchmark runner for a single export target.
 */
export class TargetBenchmarkRunner {
  private readonly target: ExportTarget;
  private readonly config: BenchmarkConfig;

  constructor(target: ExportTarget, config: BenchmarkConfig) {
    this.target = target;
    this.config = config;
  }

  /**
   * Run benchmark for a specific composition size.
   */
  async run(
    compositionSize: number,
    baseline?: BenchmarkStatistics
  ): Promise<TargetBenchmarkResult> {
    const iterations: IterationResult[] = [];

    // Warmup phase
    for (let i = 0; i < this.config.warmupIterations; i++) {
      simulateCompilation(this.target, compositionSize);
    }

    // Measurement phase
    for (let i = 0; i < this.config.measuredIterations; i++) {
      if (this.config.gcBetweenIterations) {
        tryGC();
      }

      const memBefore = this.config.collectMemory ? getMemoryUsage() : 0;
      const t0 = performance.now();

      const result = simulateCompilation(this.target, compositionSize);

      const compilationTimeMs = performance.now() - t0 + result.timeMs; // Add simulated time
      const memAfter = this.config.collectMemory ? getMemoryUsage() : 0;
      const memoryUsedBytes = this.config.collectMemory
        ? Math.max(0, memAfter - memBefore)
        : undefined;

      iterations.push({
        iteration: i,
        compilationTimeMs,
        memoryUsedBytes,
        outputSizeBytes: result.outputSizeBytes,
        success: result.success,
        error: result.success ? undefined : `Simulated compilation failure for ${this.target}`,
      });
    }

    // Compute statistics
    const successfulIterations = iterations.filter((it) => it.success);
    const compilationTimes = successfulIterations.map((it) => it.compilationTimeMs);
    const outputSizes = successfulIterations.map((it) => it.outputSizeBytes);
    const compilationTime = computeStatistics(compilationTimes);
    const outputSize = computeStatistics(outputSizes);

    let memoryUsage: BenchmarkStatistics | undefined;
    if (this.config.collectMemory) {
      const memValues = successfulIterations
        .filter((it) => it.memoryUsedBytes !== undefined)
        .map((it) => it.memoryUsedBytes!);
      if (memValues.length > 0) {
        memoryUsage = computeStatistics(memValues);
      }
    }

    const successRate = iterations.length > 0 ? successfulIterations.length / iterations.length : 0;

    const throughput = compilationTime.mean > 0 ? 1000 / compilationTime.mean : 0;

    // Regression detection
    let regressionDetected = false;
    let regression: TargetBenchmarkResult['regression'];

    if (baseline) {
      const compilationTimeChange =
        baseline.mean > 0 ? ((compilationTime.mean - baseline.mean) / baseline.mean) * 100 : 0;

      const memoryChange =
        memoryUsage && baseline.mean > 0
          ? ((memoryUsage.mean - baseline.mean) / baseline.mean) * 100
          : 0;

      if (compilationTimeChange > this.config.regressionThreshold) {
        regressionDetected = true;
      }

      regression = {
        compilationTimeChange,
        memoryChange,
        baselineMean: baseline.mean,
        currentMean: compilationTime.mean,
      };
    }

    return {
      target: this.target,
      compositionSize,
      compilationTime,
      memoryUsage,
      outputSize,
      throughput,
      successRate,
      iterations,
      regressionDetected,
      regression,
    };
  }
}

// =============================================================================
// BENCHMARK SUITE
// =============================================================================

/**
 * Complete benchmark suite that runs all export targets.
 *
 * Usage:
 * ```typescript
 * const suite = new CircuitBreakerBenchmarkSuite();
 * const results = await suite.runAll();
 * console.log(CircuitBreakerBenchmarkSuite.formatReport(results));
 * ```
 */
export class CircuitBreakerBenchmarkSuite {
  private readonly config: BenchmarkConfig;
  private readonly targets: ExportTarget[];

  constructor(config: Partial<BenchmarkConfig> = {}, targets?: ExportTarget[]) {
    this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...config };
    this.targets = targets ?? ALL_EXPORT_TARGETS;
  }

  /**
   * Run benchmarks for all targets and composition sizes.
   */
  async runAll(baseline?: Map<ExportTarget, BenchmarkStatistics>): Promise<BenchmarkSuiteResults> {
    const startTime = new Date();
    const targetResults: TargetBenchmarkResult[] = [];

    for (const target of this.targets) {
      // Use the largest composition size for the primary benchmark
      const compositionSize =
        this.config.compositionSizes[this.config.compositionSizes.length - 1] || 10;

      const runner = new TargetBenchmarkRunner(target, this.config);
      const baselineStats = baseline?.get(target);

      try {
        const result = await runner.run(compositionSize, baselineStats);
        targetResults.push(result);
      } catch (error) {
        // Create a failed result entry
        targetResults.push({
          target,
          compositionSize,
          compilationTime: computeStatistics([]),
          outputSize: computeStatistics([]),
          throughput: 0,
          successRate: 0,
          iterations: [],
          regressionDetected: false,
        });
      }
    }

    const endTime = new Date();
    const totalDurationMs = endTime.getTime() - startTime.getTime();

    // Compute aggregates
    const successfulResults = targetResults.filter((r) => r.successRate > 0);
    const compilationTimes = successfulResults.map((r) => r.compilationTime.mean);
    const meanCompilationTimeMs =
      compilationTimes.length > 0
        ? compilationTimes.reduce((s, v) => s + v, 0) / compilationTimes.length
        : 0;

    const passedTargets = targetResults.filter(
      (r) => r.successRate >= 0.9 && !r.regressionDetected
    ).length;
    const failedTargets = targetResults.filter((r) => r.successRate < 0.9).length;
    const regressedTargets = targetResults.filter((r) => r.regressionDetected).length;

    // Find fastest and slowest
    const sortedByTime = [...successfulResults].sort(
      (a, b) => a.compilationTime.mean - b.compilationTime.mean
    );
    const fastestTarget =
      sortedByTime.length > 0
        ? { target: sortedByTime[0].target, meanMs: sortedByTime[0].compilationTime.mean }
        : { target: 'incremental' as ExportTarget, meanMs: 0 };
    const slowestTarget =
      sortedByTime.length > 0
        ? {
            target: sortedByTime[sortedByTime.length - 1].target,
            meanMs: sortedByTime[sortedByTime.length - 1].compilationTime.mean,
          }
        : { target: 'nir' as ExportTarget, meanMs: 0 };

    const overallSuccessRate =
      targetResults.length > 0
        ? targetResults.reduce((s, r) => s + r.successRate, 0) / targetResults.length
        : 0;

    // Determine verdict
    let verdict: 'pass' | 'fail' | 'warn';
    if (failedTargets > 0 || regressedTargets > 2) {
      verdict = 'fail';
    } else if (regressedTargets > 0) {
      verdict = 'warn';
    } else {
      verdict = 'pass';
    }

    const summary = this.generateSummary(
      verdict,
      passedTargets,
      failedTargets,
      regressedTargets,
      meanCompilationTimeMs,
      totalDurationMs
    );

    return {
      metadata: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        totalDurationMs,
        config: this.config,
        platform: {
          runtime: typeof process !== 'undefined' ? 'node' : 'browser',
          arch: typeof process !== 'undefined' ? process.arch : 'wasm',
          cpus:
            typeof navigator !== 'undefined'
              ? navigator.hardwareConcurrency || 1
              : typeof require !== 'undefined'
                ? require('os').cpus().length
                : 1,
          totalMemoryMB:
            typeof process !== 'undefined' && process.memoryUsage
              ? Math.round(process.memoryUsage().rss / 1024 / 1024)
              : 0,
          nodeVersion: typeof process !== 'undefined' ? process.version : undefined,
        },
      },
      targetResults,
      aggregate: {
        totalTargets: targetResults.length,
        passedTargets,
        failedTargets,
        regressedTargets,
        meanCompilationTimeMs,
        totalBenchmarkTimeMs: totalDurationMs,
        overallSuccessRate,
        fastestTarget,
        slowestTarget,
      },
      verdict,
      summary,
    };
  }

  /**
   * Run benchmarks for a single target across all composition sizes.
   * Returns scaling analysis data.
   */
  async runScalingAnalysis(target: ExportTarget): Promise<{
    target: ExportTarget;
    results: TargetBenchmarkResult[];
    scalingFactor: number; // How time scales with composition size
    isLinear: boolean;
    isSublinear: boolean;
  }> {
    const results: TargetBenchmarkResult[] = [];
    const runner = new TargetBenchmarkRunner(target, this.config);

    for (const size of this.config.compositionSizes) {
      const result = await runner.run(size);
      results.push(result);
    }

    // Compute scaling factor via log-log regression
    const logSizes = this.config.compositionSizes.map((s) => Math.log(s));
    const logTimes = results.map((r) => Math.log(Math.max(1, r.compilationTime.mean)));

    const n = logSizes.length;
    const sumX = logSizes.reduce((s, v) => s + v, 0);
    const sumY = logTimes.reduce((s, v) => s + v, 0);
    const sumXY = logSizes.reduce((s, v, i) => s + v * logTimes[i], 0);
    const sumX2 = logSizes.reduce((s, v) => s + v * v, 0);

    const scalingFactor = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 1;

    return {
      target,
      results,
      scalingFactor,
      isLinear: Math.abs(scalingFactor - 1) < 0.2,
      isSublinear: scalingFactor < 0.8,
    };
  }

  /**
   * Generate a summary string.
   */
  private generateSummary(
    verdict: string,
    passed: number,
    failed: number,
    regressed: number,
    meanTime: number,
    totalTime: number
  ): string {
    const lines: string[] = [];
    lines.push(`Verdict: ${verdict.toUpperCase()}`);
    lines.push(`Targets: ${passed} passed, ${failed} failed, ${regressed} regressed`);
    lines.push(`Mean compilation time: ${meanTime.toFixed(2)}ms`);
    lines.push(`Total benchmark time: ${(totalTime / 1000).toFixed(1)}s`);
    return lines.join('\n');
  }

  /**
   * Format results as a human-readable report.
   */
  static formatReport(results: BenchmarkSuiteResults): string {
    const lines: string[] = [];

    lines.push('================================================================');
    lines.push('  HOLOSCRIPT CIRCUIT BREAKER BENCHMARK REPORT');
    lines.push('================================================================');
    lines.push('');
    lines.push(`Verdict: ${results.verdict.toUpperCase()}`);
    lines.push(`Duration: ${(results.metadata.totalDurationMs / 1000).toFixed(1)}s`);
    lines.push(
      `Platform: ${results.metadata.platform.runtime} (${results.metadata.platform.arch})`
    );
    lines.push(`CPUs: ${results.metadata.platform.cpus}`);
    lines.push(`Memory: ${results.metadata.platform.totalMemoryMB}MB`);
    lines.push('');

    lines.push('--- Aggregate ---');
    lines.push(`Total Targets: ${results.aggregate.totalTargets}`);
    lines.push(`Passed: ${results.aggregate.passedTargets}`);
    lines.push(`Failed: ${results.aggregate.failedTargets}`);
    lines.push(`Regressed: ${results.aggregate.regressedTargets}`);
    lines.push(`Mean Compilation: ${results.aggregate.meanCompilationTimeMs.toFixed(2)}ms`);
    lines.push(`Success Rate: ${(results.aggregate.overallSuccessRate * 100).toFixed(1)}%`);
    lines.push(
      `Fastest: ${results.aggregate.fastestTarget.target} (${results.aggregate.fastestTarget.meanMs.toFixed(2)}ms)`
    );
    lines.push(
      `Slowest: ${results.aggregate.slowestTarget.target} (${results.aggregate.slowestTarget.meanMs.toFixed(2)}ms)`
    );
    lines.push('');

    lines.push('--- Per-Target Results ---');
    lines.push(
      'Target'.padEnd(25) +
        'Mean(ms)'.padStart(10) +
        'P95(ms)'.padStart(10) +
        'StdDev'.padStart(10) +
        'Success'.padStart(10) +
        'Regress'.padStart(10)
    );
    lines.push('-'.repeat(75));

    const sorted = [...results.targetResults].sort(
      (a, b) => a.compilationTime.mean - b.compilationTime.mean
    );

    for (const result of sorted) {
      const status = result.regressionDetected ? 'YES' : result.successRate < 0.9 ? 'FAIL' : 'no';
      lines.push(
        result.target.padEnd(25) +
          result.compilationTime.mean.toFixed(2).padStart(10) +
          result.compilationTime.p95.toFixed(2).padStart(10) +
          result.compilationTime.stddev.toFixed(2).padStart(10) +
          `${(result.successRate * 100).toFixed(0)}%`.padStart(10) +
          status.padStart(10)
      );
    }

    lines.push('');

    // Regression details
    const regressed = results.targetResults.filter((r) => r.regressionDetected);
    if (regressed.length > 0) {
      lines.push('--- Regression Details ---');
      for (const r of regressed) {
        if (r.regression) {
          lines.push(`  ${r.target}:`);
          lines.push(`    Time change: ${r.regression.compilationTimeChange.toFixed(1)}%`);
          lines.push(
            `    Baseline: ${r.regression.baselineMean.toFixed(2)}ms -> Current: ${r.regression.currentMean.toFixed(2)}ms`
          );
          if (r.regression.memoryChange !== 0) {
            lines.push(`    Memory change: ${r.regression.memoryChange.toFixed(1)}%`);
          }
        }
      }
      lines.push('');
    }

    lines.push('================================================================');

    return lines.join('\n');
  }

  /**
   * Serialize results to JSON for CI/CD artifact storage.
   */
  static serialize(results: BenchmarkSuiteResults): string {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Deserialize results from JSON.
   */
  static deserialize(json: string): BenchmarkSuiteResults {
    return JSON.parse(json) as BenchmarkSuiteResults;
  }

  /**
   * Compare two benchmark runs and produce a diff report.
   */
  static compareRuns(
    baseline: BenchmarkSuiteResults,
    current: BenchmarkSuiteResults,
    regressionThreshold: number = 15
  ): {
    improved: Array<{ target: ExportTarget; change: number }>;
    regressed: Array<{ target: ExportTarget; change: number }>;
    unchanged: Array<{ target: ExportTarget; change: number }>;
    overallChange: number;
  } {
    const improved: Array<{ target: ExportTarget; change: number }> = [];
    const regressed: Array<{ target: ExportTarget; change: number }> = [];
    const unchanged: Array<{ target: ExportTarget; change: number }> = [];

    for (const currentResult of current.targetResults) {
      const baselineResult = baseline.targetResults.find((r) => r.target === currentResult.target);

      if (!baselineResult || baselineResult.compilationTime.mean === 0) {
        unchanged.push({ target: currentResult.target, change: 0 });
        continue;
      }

      const change =
        ((currentResult.compilationTime.mean - baselineResult.compilationTime.mean) /
          baselineResult.compilationTime.mean) *
        100;

      if (change > regressionThreshold) {
        regressed.push({ target: currentResult.target, change });
      } else if (change < -regressionThreshold) {
        improved.push({ target: currentResult.target, change });
      } else {
        unchanged.push({ target: currentResult.target, change });
      }
    }

    const allChanges = [...improved, ...regressed, ...unchanged];
    const overallChange =
      allChanges.length > 0 ? allChanges.reduce((s, c) => s + c.change, 0) / allChanges.length : 0;

    return { improved, regressed, unchanged, overallChange };
  }
}
