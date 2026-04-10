/**
 * ConvergenceDetector.ts
 *
 * Detects when the self-improvement pipeline has converged -- meaning
 * successive quality scores are no longer improving meaningfully.
 *
 * Convergence is declared when ALL of the following hold over the most
 * recent `windowSize` iterations:
 *
 *  1. The **absolute improvement** between consecutive scores stays below
 *     `epsilon` for every pair in the window.
 *  2. The **moving-average slope** over the window is below `slopeThreshold`
 *     (near-zero or negative gradient).
 *  3. At least `minIterations` total iterations have been recorded (prevents
 *     premature convergence on the first two identical scores).
 *
 * The detector also supports a **plateau counter**: if the score stays within
 * `plateauBand` of the best-seen score for `plateauPatience` consecutive
 * iterations, convergence is declared even if small oscillations exist.
 *
 * @module self-improvement
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ConvergenceConfig {
  /** Minimum number of score samples before convergence can be declared (default: 5) */
  minIterations: number;
  /** Sliding window size for slope/delta analysis (default: 5) */
  windowSize: number;
  /** Maximum absolute per-step delta to consider "converged" (default: 0.005) */
  epsilon: number;
  /** Maximum slope magnitude (per iteration) to consider converged (default: 0.002) */
  slopeThreshold: number;
  /** Width of the plateau band around the best score (default: 0.01) */
  plateauBand: number;
  /** Number of consecutive iterations within the plateau band to trigger convergence (default: 8) */
  plateauPatience: number;
}

export interface ConvergenceStatus {
  /** True when any convergence condition is met */
  converged: boolean;
  /** Which condition triggered convergence (or null) */
  reason: 'epsilon_window' | 'plateau' | null;
  /** Number of score samples recorded so far */
  iterations: number;
  /** Current quality score (most recent) */
  currentScore: number;
  /** Best quality score seen so far */
  bestScore: number;
  /** Average score over the sliding window */
  windowAverage: number;
  /** Estimated slope of scores over the sliding window (score/iteration) */
  windowSlope: number;
  /** How many consecutive iterations have stayed in the plateau band */
  plateauCount: number;
  /** Improvement from first recorded score to current */
  totalImprovement: number;
}

export interface ConvergenceSnapshot {
  /** All recorded scores */
  history: number[];
  /** Current status */
  status: ConvergenceStatus;
  /** Configuration used */
  config: ConvergenceConfig;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: ConvergenceConfig = {
  minIterations: 5,
  windowSize: 5,
  epsilon: 0.005,
  slopeThreshold: 0.002,
  plateauBand: 0.01,
  plateauPatience: 8,
};

// =============================================================================
// DETECTOR
// =============================================================================

export class ConvergenceDetector {
  private config: ConvergenceConfig;
  private scores: number[] = [];
  private bestScore: number = -Infinity;
  private plateauCount: number = 0;

  constructor(config: Partial<ConvergenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Record a new quality score and evaluate convergence.
   * Returns the updated convergence status.
   */
  record(score: number): ConvergenceStatus {
    this.scores.push(score);

    // Update best score
    if (score > this.bestScore) {
      this.bestScore = score;
      this.plateauCount = 0; // reset plateau on new best
    } else if (Math.abs(score - this.bestScore) <= this.config.plateauBand) {
      this.plateauCount++;
    } else {
      // Score dropped below plateau band -- reset
      this.plateauCount = 0;
    }

    return this.getStatus();
  }

  /**
   * Get current convergence status without recording a new score.
   */
  getStatus(): ConvergenceStatus {
    const n = this.scores.length;
    const currentScore = n > 0 ? this.scores[n - 1] : 0;
    const firstScore = n > 0 ? this.scores[0] : 0;

    const window = this.getWindow();
    const windowAvg = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;
    const windowSlope = this.computeSlope(window);

    let converged = false;
    let reason: ConvergenceStatus['reason'] = null;

    if (n >= this.config.minIterations) {
      // Condition 1: epsilon window -- all consecutive deltas below epsilon
      if (this.checkEpsilonWindow(window, windowSlope)) {
        converged = true;
        reason = 'epsilon_window';
      }

      // Condition 2: plateau patience
      if (this.plateauCount >= this.config.plateauPatience) {
        converged = true;
        reason = 'plateau';
      }
    }

    return {
      converged,
      reason,
      iterations: n,
      currentScore: round4(currentScore),
      bestScore: round4(this.bestScore === -Infinity ? 0 : this.bestScore),
      windowAverage: round4(windowAvg),
      windowSlope: round4(windowSlope),
      plateauCount: this.plateauCount,
      totalImprovement: round4(currentScore - firstScore),
    };
  }

  /**
   * Take a full snapshot of the detector state.
   */
  snapshot(): ConvergenceSnapshot {
    return {
      history: [...this.scores],
      status: this.getStatus(),
      config: { ...this.config },
    };
  }

  /**
   * Reset the detector to initial state.
   */
  reset(): void {
    this.scores = [];
    this.bestScore = -Infinity;
    this.plateauCount = 0;
  }

  /**
   * Get the full score history.
   */
  getHistory(): number[] {
    return [...this.scores];
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Extract the most recent `windowSize` scores */
  private getWindow(): number[] {
    const ws = this.config.windowSize;
    return this.scores.slice(-ws);
  }

  /**
   * Check the "epsilon window" convergence condition:
   *  - All consecutive deltas in the window are below epsilon
   *  - AND the slope is below slopeThreshold
   */
  private checkEpsilonWindow(window: number[], slope: number): boolean {
    if (window.length < 2) return false;

    // All consecutive deltas must be below epsilon
    for (let i = 1; i < window.length; i++) {
      const delta = Math.abs(window[i] - window[i - 1]);
      if (delta > this.config.epsilon) {
        return false;
      }
    }

    // Slope must be near-zero
    return Math.abs(slope) <= this.config.slopeThreshold;
  }

  /**
   * Compute the ordinary least-squares slope over a window of values.
   * Returns 0 for windows with fewer than 2 points.
   */
  private computeSlope(window: number[]): number {
    const n = window.length;
    if (n < 2) return 0;

    // x = 0, 1, 2, ..., n-1
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += window[i];
      sumXY += i * window[i];
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
