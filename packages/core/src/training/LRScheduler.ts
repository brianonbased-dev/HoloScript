/**
 * LRScheduler - Learning Rate Scheduler with Warmup + Cosine Decay
 *
 * Implements the learning rate schedule described in training rule W.009:
 *   "Always use warmup (10% steps) + cosine decay."
 *
 * The schedule has two phases:
 * 1. **Linear Warmup**: LR ramps linearly from 0 to baseLR over the
 *    first warmupSteps (typically 10% of total steps).
 * 2. **Cosine Decay**: LR decays from baseLR to minLR following a
 *    cosine curve over the remaining steps.
 *
 * This prevents early divergence in deep networks and enables smooth
 * convergence. Pairs with W.006 base LR (2e-4 for SFT, 1e-6 for GRPO).
 *
 * @module training/LRScheduler
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the LR scheduler.
 */
export interface LRSchedulerConfig {
  /**
   * Base (peak) learning rate.
   * Per W.006: 2e-4 for SFT, 1e-6 for GRPO.
   */
  baseLR: number;

  /**
   * Total number of training steps.
   * Computed as: (dataset_size / effective_batch_size) * num_epochs.
   */
  totalSteps: number;

  /**
   * Warmup ratio: fraction of totalSteps used for linear warmup.
   * Per W.009: 10% warmup steps (warmupRatio = 0.1).
   * Must be in range [0, 1).
   */
  warmupRatio: number;

  /**
   * Minimum learning rate at the end of cosine decay.
   * Typically 0 or a very small value (e.g., 1e-7).
   * Must be in range [0, baseLR).
   */
  minLR: number;

  /**
   * Number of cosine annealing cycles.
   * Default: 1 (single cosine decay from peak to min).
   * Values > 1 create "cosine annealing with warm restarts" (SGDR).
   */
  numCycles: number;
}

/**
 * Snapshot of the LR scheduler state at a given step.
 */
export interface LRSchedulerSnapshot {
  /** Current training step */
  step: number;

  /** Current learning rate */
  learningRate: number;

  /** Current phase: 'warmup' or 'decay' */
  phase: 'warmup' | 'decay';

  /** Progress through current phase (0 to 1) */
  phaseProgress: number;

  /** Overall training progress (0 to 1) */
  overallProgress: number;
}

/**
 * Summary statistics for the full LR schedule.
 */
export interface LRScheduleStats {
  /** Peak learning rate (baseLR) */
  peakLR: number;

  /** Minimum learning rate (minLR or end-of-decay value) */
  minLR: number;

  /** Number of warmup steps */
  warmupSteps: number;

  /** Number of decay steps */
  decaySteps: number;

  /** Total training steps */
  totalSteps: number;

  /** Average learning rate across all steps */
  avgLR: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default LR scheduler configuration for HoloScript/Brittney SFT training.
 * Based on W.006 (baseLR=2e-4) and W.009 (warmupRatio=0.1, cosine decay).
 */
export const DEFAULT_LR_SCHEDULER_CONFIG: LRSchedulerConfig = {
  baseLR: 2e-4,
  totalSteps: 1000,
  warmupRatio: 0.1,
  minLR: 0,
  numCycles: 1,
};

/**
 * LR scheduler configuration for GRPO training.
 * Uses lower baseLR (1e-6) per GRPOConfig.ts.
 */
export const GRPO_LR_SCHEDULER_CONFIG: LRSchedulerConfig = {
  baseLR: 1e-6,
  totalSteps: 1000,
  warmupRatio: 0.1,
  minLR: 0,
  numCycles: 1,
};

// =============================================================================
// LR SCHEDULER CLASS
// =============================================================================

/**
 * Learning Rate Scheduler with warmup + cosine decay.
 *
 * Computes the learning rate at any given training step.
 * Stateless: does not track the current step internally. This makes it
 * safe to use in distributed training where multiple workers may query
 * different steps simultaneously.
 *
 * @example
 * ```ts
 * const scheduler = new LRScheduler({
 *   baseLR: 2e-4,
 *   totalSteps: 10000,
 *   warmupRatio: 0.1,
 *   minLR: 1e-7,
 *   numCycles: 1,
 * });
 *
 * // Step 0: LR = 0 (start of warmup)
 * scheduler.getLR(0);     // 0
 *
 * // Step 500: LR = 1e-4 (midway through warmup)
 * scheduler.getLR(500);   // ~0.0001
 *
 * // Step 1000: LR = 2e-4 (end of warmup, peak LR)
 * scheduler.getLR(1000);  // 0.0002
 *
 * // Step 5500: LR ~= 1e-4 (midway through cosine decay)
 * scheduler.getLR(5500);
 *
 * // Step 10000: LR ~= 1e-7 (end of training)
 * scheduler.getLR(10000); // ~0.0000001
 * ```
 */
export class LRScheduler {
  private config: LRSchedulerConfig;
  private warmupSteps: number;

  constructor(config: Partial<LRSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_LR_SCHEDULER_CONFIG, ...config };
    this.validateConfig();
    this.warmupSteps = Math.floor(this.config.totalSteps * this.config.warmupRatio);
  }

  /**
   * Get the learning rate at a given training step.
   *
   * @param step - Current training step (0-indexed)
   * @returns The learning rate at this step
   */
  getLR(step: number): number {
    const { baseLR, totalSteps, minLR, numCycles } = this.config;

    // Clamp step to valid range
    const clampedStep = Math.max(0, Math.min(step, totalSteps));

    // Phase 1: Linear warmup
    if (clampedStep < this.warmupSteps) {
      if (this.warmupSteps === 0) {
        return baseLR;
      }
      return baseLR * (clampedStep / this.warmupSteps);
    }

    // Phase 2: Cosine decay
    const decaySteps = totalSteps - this.warmupSteps;
    if (decaySteps <= 0) {
      return baseLR;
    }

    const decayProgress = (clampedStep - this.warmupSteps) / decaySteps;

    // Cosine annealing with optional warm restarts
    const cosineArg = Math.PI * numCycles * decayProgress;
    const cosineValue = (1 + Math.cos(cosineArg)) / 2;

    // Scale between minLR and baseLR
    return minLR + (baseLR - minLR) * cosineValue;
  }

  /**
   * Get a detailed snapshot of the scheduler state at a given step.
   *
   * @param step - Current training step (0-indexed)
   * @returns LRSchedulerSnapshot with full state information
   */
  getSnapshot(step: number): LRSchedulerSnapshot {
    const { totalSteps } = this.config;
    const clampedStep = Math.max(0, Math.min(step, totalSteps));
    const learningRate = this.getLR(step);

    const isWarmup = clampedStep < this.warmupSteps;
    const phase: 'warmup' | 'decay' = isWarmup ? 'warmup' : 'decay';

    let phaseProgress: number;
    if (isWarmup) {
      phaseProgress = this.warmupSteps === 0 ? 1 : clampedStep / this.warmupSteps;
    } else {
      const decaySteps = totalSteps - this.warmupSteps;
      phaseProgress = decaySteps <= 0 ? 1 : (clampedStep - this.warmupSteps) / decaySteps;
    }

    const overallProgress = totalSteps === 0 ? 1 : clampedStep / totalSteps;

    return {
      step: clampedStep,
      learningRate,
      phase,
      phaseProgress,
      overallProgress,
    };
  }

  /**
   * Compute summary statistics for the full LR schedule.
   * Samples every step to compute the average LR.
   *
   * For large totalSteps, this samples at most 10000 evenly-spaced points
   * for efficiency.
   */
  getStats(): LRScheduleStats {
    const { baseLR, minLR, totalSteps } = this.config;
    const decaySteps = totalSteps - this.warmupSteps;

    // Compute average LR by sampling
    let sumLR = 0;
    const sampleCount = Math.min(totalSteps + 1, 10000);
    const stepSize = totalSteps / Math.max(sampleCount - 1, 1);

    for (let i = 0; i < sampleCount; i++) {
      const step = Math.round(i * stepSize);
      sumLR += this.getLR(step);
    }

    const avgLR = sampleCount > 0 ? sumLR / sampleCount : 0;

    return {
      peakLR: baseLR,
      minLR,
      warmupSteps: this.warmupSteps,
      decaySteps: Math.max(0, decaySteps),
      totalSteps,
      avgLR,
    };
  }

  /**
   * Generate the full LR schedule as an array of [step, lr] pairs.
   * Useful for plotting or debugging.
   *
   * @param numPoints - Number of points to sample (default: 100)
   * @returns Array of [step, learningRate] tuples
   */
  getSchedule(numPoints: number = 100): Array<[number, number]> {
    const { totalSteps } = this.config;
    const points: Array<[number, number]> = [];
    const clampedPoints = Math.max(2, numPoints);

    for (let i = 0; i < clampedPoints; i++) {
      const step = Math.round((i / (clampedPoints - 1)) * totalSteps);
      points.push([step, this.getLR(step)]);
    }

    return points;
  }

  /**
   * Get the number of warmup steps.
   */
  getWarmupSteps(): number {
    return this.warmupSteps;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<LRSchedulerConfig> {
    return { ...this.config };
  }

  // ===========================================================================
  // INTERNAL METHODS
  // ===========================================================================

  /**
   * Validate configuration parameters.
   * @throws Error if configuration is invalid
   */
  private validateConfig(): void {
    const { baseLR, totalSteps, warmupRatio, minLR, numCycles } = this.config;

    if (baseLR <= 0) {
      throw new Error(`LRScheduler: baseLR must be > 0, got ${baseLR}`);
    }

    if (totalSteps < 0 || !Number.isInteger(totalSteps)) {
      throw new Error(`LRScheduler: totalSteps must be a non-negative integer, got ${totalSteps}`);
    }

    if (warmupRatio < 0 || warmupRatio >= 1) {
      throw new Error(`LRScheduler: warmupRatio must be in [0, 1), got ${warmupRatio}`);
    }

    if (minLR < 0 || minLR >= baseLR) {
      throw new Error(`LRScheduler: minLR must be in [0, baseLR), got ${minLR}`);
    }

    if (numCycles < 1 || !Number.isInteger(numCycles)) {
      throw new Error(`LRScheduler: numCycles must be a positive integer, got ${numCycles}`);
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an LR scheduler for SFT training with optional overrides.
 *
 * @example
 * ```ts
 * const scheduler = createSFTScheduler({ totalSteps: 5000 });
 * const lr = scheduler.getLR(100);
 * ```
 */
export function createSFTScheduler(config: Partial<LRSchedulerConfig> = {}): LRScheduler {
  return new LRScheduler({ ...DEFAULT_LR_SCHEDULER_CONFIG, ...config });
}

/**
 * Create an LR scheduler for GRPO training with optional overrides.
 *
 * @example
 * ```ts
 * const scheduler = createGRPOScheduler({ totalSteps: 2000 });
 * const lr = scheduler.getLR(100);
 * ```
 */
export function createGRPOScheduler(config: Partial<LRSchedulerConfig> = {}): LRScheduler {
  return new LRScheduler({ ...GRPO_LR_SCHEDULER_CONFIG, ...config });
}
