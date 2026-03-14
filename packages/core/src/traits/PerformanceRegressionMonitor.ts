/**
 * usePerformanceRegression — VR Performance Regression Hook
 *
 * Monitors frame time via R3F's useFrame and automatically regresses
 * entities to draft mode when frame time exceeds a threshold.
 *
 * For VR at 90Hz, the frame budget is 11.1ms. With overhead, the
 * regression threshold defaults to 9ms — leaving 2ms for compositor
 * and OS overhead.
 *
 * @see P.084 — VR Performance Regression Pattern
 * @see W.080 — Draft primitives are cheapest rendering AND collision
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PerformanceRegressionConfig {
  /** Frame time threshold in ms to trigger regression (default: 9.0 for 90Hz VR) */
  thresholdMs: number;
  /** Number of consecutive frames above threshold before regressing (default: 5) */
  consecutiveFrames: number;
  /** Number of consecutive frames below recovery threshold to promote back (default: 30) */
  recoveryFrames: number;
  /** Recovery threshold — must be below this to promote back (default: 7.0ms) */
  recoveryThresholdMs: number;
  /** Enable/disable regression (default: true) */
  enabled: boolean;
}

export interface PerformanceRegressionState {
  /** Current average frame time in ms */
  avgFrameTimeMs: number;
  /** Whether we're currently in regression mode */
  isRegressed: boolean;
  /** Number of consecutive frames above threshold */
  aboveCount: number;
  /** Number of consecutive frames below recovery threshold */
  belowCount: number;
  /** Total regression events since mount */
  regressionCount: number;
  /** Total recovery events since mount */
  recoveryCount: number;
}

export const PERF_REGRESSION_DEFAULTS: PerformanceRegressionConfig = {
  thresholdMs: 9.0,        // 90Hz VR: 11.1ms budget, 2ms overhead
  consecutiveFrames: 5,     // 5 bad frames before regression
  recoveryFrames: 30,       // 30 good frames before recovery (~333ms at 90Hz)
  recoveryThresholdMs: 7.0, // Must sustain 7ms or better to recover
  enabled: true,
};

// ── Core Logic (framework-agnostic) ──────────────────────────────────────────

/**
 * Performance regression monitor. Call `tick(deltaMs)` each frame.
 * Returns whether regression is currently active.
 *
 * This is framework-agnostic so it can be used outside React/R3F
 * (e.g., in headless runtime, node CLI, or game loops).
 */
export class PerformanceRegressionMonitor {
  private config: PerformanceRegressionConfig;
  private state: PerformanceRegressionState;
  private frameTimes: number[] = [];
  private readonly windowSize = 10; // Rolling average window

  constructor(config: Partial<PerformanceRegressionConfig> = {}) {
    this.config = { ...PERF_REGRESSION_DEFAULTS, ...config };
    this.state = {
      avgFrameTimeMs: 0,
      isRegressed: false,
      aboveCount: 0,
      belowCount: 0,
      regressionCount: 0,
      recoveryCount: 0,
    };
  }

  /**
   * Call once per frame with the frame delta in milliseconds.
   * Returns the current regression state.
   */
  tick(deltaMs: number): PerformanceRegressionState {
    if (!this.config.enabled) return this.state;

    // Rolling average
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift();
    }
    const avg =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.state.avgFrameTimeMs = avg;

    if (!this.state.isRegressed) {
      // Check for regression
      if (avg > this.config.thresholdMs) {
        this.state.aboveCount++;
        this.state.belowCount = 0;
        if (this.state.aboveCount >= this.config.consecutiveFrames) {
          this.state.isRegressed = true;
          this.state.regressionCount++;
          this.state.aboveCount = 0;
        }
      } else {
        this.state.aboveCount = 0;
      }
    } else {
      // Check for recovery
      if (avg < this.config.recoveryThresholdMs) {
        this.state.belowCount++;
        this.state.aboveCount = 0;
        if (this.state.belowCount >= this.config.recoveryFrames) {
          this.state.isRegressed = false;
          this.state.recoveryCount++;
          this.state.belowCount = 0;
        }
      } else {
        this.state.belowCount = 0;
      }
    }

    return { ...this.state };
  }

  /** Get current state without ticking */
  getState(): PerformanceRegressionState {
    return { ...this.state };
  }

  /** Force regression (e.g., user-triggered draft mode) */
  forceRegress(): void {
    if (!this.state.isRegressed) {
      this.state.isRegressed = true;
      this.state.regressionCount++;
    }
  }

  /** Force recovery */
  forceRecover(): void {
    if (this.state.isRegressed) {
      this.state.isRegressed = false;
      this.state.recoveryCount++;
    }
  }

  /** Reset all state */
  reset(): void {
    this.frameTimes = [];
    this.state = {
      avgFrameTimeMs: 0,
      isRegressed: false,
      aboveCount: 0,
      belowCount: 0,
      regressionCount: 0,
      recoveryCount: 0,
    };
  }
}
