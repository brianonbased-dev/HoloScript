/**
 * ForgettingDetector.ts
 *
 * Implements a specialised detection algorithm for catastrophic forgetting
 * during OPLoRA-constrained GRPO training. Uses a sliding window over
 * benchmark scores with configurable alert thresholds and trend analysis
 * via linear regression.
 *
 * Unlike the OPLoRAMonitor (which is a comprehensive metrics dashboard),
 * ForgettingDetector is a focused, real-time algorithm designed to be called
 * after every evaluation step in the training loop. It provides:
 *
 *   1. Sliding window analysis over benchmark scores
 *   2. Configurable absolute and relative drop thresholds
 *   3. Linear regression slope for early warning detection
 *   4. Early warning when trend is negative even if thresholds not crossed
 *   5. Multi-benchmark aggregation with independent tracking per benchmark
 *
 * @module self-improvement
 */

// =============================================================================
// TYPES
// =============================================================================

/** Configuration for the forgetting detector */
export interface ForgettingDetectorConfig {
  /**
   * Size of the sliding window for trend analysis.
   * Default: 10 evaluation steps.
   */
  windowSize: number;

  /**
   * Absolute score drop threshold.
   * Alert when: baseline - current > absoluteThreshold.
   * Default: 2.0 (for percentage-based benchmarks like HumanEval).
   */
  absoluteThreshold: number;

  /**
   * Relative score drop threshold (fraction of baseline).
   * Alert when: (baseline - current) / baseline > relativeThreshold.
   * Default: 0.05 (5% relative drop).
   */
  relativeThreshold: number;

  /**
   * Minimum number of data points before trend analysis activates.
   * Prevents spurious early warnings from insufficient data.
   * Default: 3.
   */
  minDataPoints: number;

  /**
   * Slope threshold for early warning.
   * If the linear regression slope is more negative than this value,
   * an early warning is raised even if absolute/relative thresholds
   * have not been crossed.
   * Default: -0.05 (score dropping 0.05 per evaluation step).
   */
  earlyWarningSlopeThreshold: number;
}

/** Severity level of a forgetting detection */
export type ForgettingSeverity = 'none' | 'early_warning' | 'warning' | 'critical';

/** Result of a forgetting detection check for a single benchmark */
export interface ForgettingResult {
  /** The benchmark being checked */
  benchmark: string;
  /** Severity of forgetting detected */
  severity: ForgettingSeverity;
  /** Current score */
  currentScore: number;
  /** Baseline score */
  baselineScore: number;
  /** Absolute drop from baseline */
  absoluteDrop: number;
  /** Relative drop from baseline (fraction) */
  relativeDrop: number;
  /** Linear regression slope over the sliding window */
  slope: number;
  /** Number of data points in the sliding window */
  windowSize: number;
  /** Recommended corrective action (empty string if severity is 'none') */
  recommendation: string;
}

/** Aggregate detection result across all benchmarks */
export interface AggregateDetectionResult {
  /** Worst severity across all benchmarks */
  worstSeverity: ForgettingSeverity;
  /** Per-benchmark results */
  results: ForgettingResult[];
  /** Step number */
  step: number;
  /** Whether any forgetting is detected (severity > 'none') */
  forgettingDetected: boolean;
}

/** Internal tracker state for a single benchmark */
interface BenchmarkTracker {
  baseline: number;
  scores: number[];
  steps: number[];
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: ForgettingDetectorConfig = {
  windowSize: 10,
  absoluteThreshold: 2.0,
  relativeThreshold: 0.05,
  minDataPoints: 3,
  earlyWarningSlopeThreshold: -0.05,
};

// =============================================================================
// SEVERITY ORDERING
// =============================================================================

const SEVERITY_ORDER: Record<ForgettingSeverity, number> = {
  none: 0,
  early_warning: 1,
  warning: 2,
  critical: 3,
};

function maxSeverity(a: ForgettingSeverity, b: ForgettingSeverity): ForgettingSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// =============================================================================
// DETECTOR
// =============================================================================

/**
 * Sliding-window forgetting detector with trend analysis.
 *
 * @example
 * ```ts
 * const detector = new ForgettingDetector();
 *
 * // Set baselines (pre-training evaluation)
 * detector.setBaseline('humaneval', 65.0);
 * detector.setBaseline('mbpp', 72.0);
 *
 * // After each evaluation step in training:
 * detector.record('humaneval', 64.8, step);
 * detector.record('mbpp', 71.5, step);
 *
 * // Check for forgetting
 * const result = detector.detect(step);
 * if (result.forgettingDetected) {
 *   console.log('Forgetting detected!', result.worstSeverity);
 *   for (const r of result.results) {
 *     if (r.severity !== 'none') {
 *       console.log(`  ${r.benchmark}: ${r.recommendation}`);
 *     }
 *   }
 * }
 * ```
 */
export class ForgettingDetector {
  private config: ForgettingDetectorConfig;
  private trackers: Map<string, BenchmarkTracker> = new Map();

  constructor(config: Partial<ForgettingDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Get the current configuration */
  getConfig(): ForgettingDetectorConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Baseline management
  // ---------------------------------------------------------------------------

  /**
   * Set the baseline score for a benchmark.
   * This must be called before training begins.
   */
  setBaseline(benchmark: string, score: number): void {
    const tracker = this.getOrCreateTracker(benchmark);
    tracker.baseline = score;
  }

  /**
   * Get the baseline for a benchmark.
   * Returns undefined if no baseline has been set.
   */
  getBaseline(benchmark: string): number | undefined {
    const tracker = this.trackers.get(benchmark);
    return tracker?.baseline;
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /**
   * Record a new benchmark score at a training step.
   */
  record(benchmark: string, score: number, step: number): void {
    const tracker = this.getOrCreateTracker(benchmark);
    tracker.scores.push(score);
    tracker.steps.push(step);

    // Trim to window size (keep extra for stability but bound memory)
    const maxHistory = this.config.windowSize * 3;
    if (tracker.scores.length > maxHistory) {
      const excess = tracker.scores.length - maxHistory;
      tracker.scores.splice(0, excess);
      tracker.steps.splice(0, excess);
    }
  }

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------

  /**
   * Run forgetting detection across all tracked benchmarks.
   *
   * @param step - Current training step (for reporting)
   * @returns Aggregate detection result
   */
  detect(step: number): AggregateDetectionResult {
    const results: ForgettingResult[] = [];
    let worstSeverity: ForgettingSeverity = 'none';

    for (const [benchmark, tracker] of this.trackers) {
      const result = this.detectForBenchmark(benchmark, tracker, step);
      results.push(result);
      worstSeverity = maxSeverity(worstSeverity, result.severity);
    }

    return {
      worstSeverity,
      results,
      step,
      forgettingDetected: worstSeverity !== 'none',
    };
  }

  /**
   * Run forgetting detection for a single benchmark.
   */
  detectBenchmark(benchmark: string, step: number): ForgettingResult | undefined {
    const tracker = this.trackers.get(benchmark);
    if (!tracker) return undefined;
    return this.detectForBenchmark(benchmark, tracker, step);
  }

  // ---------------------------------------------------------------------------
  // Internal detection logic
  // ---------------------------------------------------------------------------

  private detectForBenchmark(
    benchmark: string,
    tracker: BenchmarkTracker,
    step: number
  ): ForgettingResult {
    const n = tracker.scores.length;
    const currentScore = n > 0 ? tracker.scores[n - 1] : tracker.baseline;
    const baselineScore = tracker.baseline;

    const absoluteDrop = baselineScore - currentScore;
    const relativeDrop = baselineScore > 0 ? absoluteDrop / baselineScore : 0;

    // Compute slope over sliding window
    const window = tracker.scores.slice(-this.config.windowSize);
    const slope = window.length >= this.config.minDataPoints ? this.computeSlope(window) : 0;

    // Determine severity
    let severity: ForgettingSeverity = 'none';
    let recommendation = '';

    // Critical: absolute drop exceeds threshold
    if (absoluteDrop > this.config.absoluteThreshold * 1.5) {
      severity = 'critical';
      recommendation =
        `CRITICAL: ${benchmark} has dropped ${round4(absoluteDrop)} points from baseline. ` +
        'Immediately increase orthogonalWeight by 1.0, reduce LR by 75%, ' +
        'or stop training and evaluate. Consider reverting to the last checkpoint ' +
        'where general ability was preserved.';
    }
    // Warning: absolute drop exceeds threshold
    else if (absoluteDrop > this.config.absoluteThreshold) {
      severity = 'warning';
      recommendation =
        `WARNING: ${benchmark} has dropped ${round4(absoluteDrop)} points from baseline. ` +
        'Increase orthogonalWeight by 0.5, reduce LR by 50%, ' +
        'or increase projectionRank to protect more singular directions.';
    }
    // Warning: relative drop exceeds threshold
    else if (relativeDrop > this.config.relativeThreshold) {
      severity = 'warning';
      recommendation =
        `WARNING: ${benchmark} has dropped ${round4(relativeDrop * 100)}% relative to baseline. ` +
        'Increase orthogonalWeight by 0.25 and monitor for 100 more steps.';
    }
    // Early warning: negative trend detected
    else if (
      window.length >= this.config.minDataPoints &&
      slope < this.config.earlyWarningSlopeThreshold
    ) {
      severity = 'early_warning';
      recommendation =
        `EARLY WARNING: ${benchmark} shows negative trend (slope: ${round4(slope)} per step). ` +
        'No threshold crossed yet, but trend suggests forgetting may occur. ' +
        'Consider preemptively increasing orthogonalWeight by 0.1.';
    }

    return {
      benchmark,
      severity,
      currentScore: round4(currentScore),
      baselineScore: round4(baselineScore),
      absoluteDrop: round4(absoluteDrop),
      relativeDrop: round4(relativeDrop),
      slope: round4(slope),
      windowSize: window.length,
      recommendation,
    };
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  /** Get all tracked benchmark names */
  getTrackedBenchmarks(): string[] {
    return Array.from(this.trackers.keys());
  }

  /** Get the score history for a benchmark */
  getHistory(benchmark: string): number[] {
    const tracker = this.trackers.get(benchmark);
    return tracker ? [...tracker.scores] : [];
  }

  /** Reset all tracking state */
  reset(): void {
    this.trackers.clear();
  }

  /** Reset tracking for a specific benchmark (preserves baseline) */
  resetBenchmark(benchmark: string): void {
    const tracker = this.trackers.get(benchmark);
    if (tracker) {
      const baseline = tracker.baseline;
      tracker.scores = [];
      tracker.steps = [];
      tracker.baseline = baseline;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getOrCreateTracker(benchmark: string): BenchmarkTracker {
    let tracker = this.trackers.get(benchmark);
    if (!tracker) {
      tracker = { baseline: 0, scores: [], steps: [] };
      this.trackers.set(benchmark, tracker);
    }
    return tracker;
  }

  /**
   * Compute OLS slope over an array of values.
   * x = 0, 1, ..., n-1
   */
  private computeSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
