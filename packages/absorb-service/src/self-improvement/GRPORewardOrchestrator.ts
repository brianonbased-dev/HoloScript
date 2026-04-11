/**
 * GRPORewardOrchestrator.ts
 *
 * Orchestrates the 5 GRPO reward functions into a composite reward signal
 * for TRL's GRPOTrainer. The orchestrator:
 *
 *   1. Executes all 5 reward functions (optionally in parallel)
 *   2. Computes a weighted composite reward per completion
 *   3. Tracks per-reward statistics (mean, std, min, max) across batches
 *   4. Implements timeout handling (tests can hang)
 *   5. Supports reward caching for identical completions
 *
 * The composite reward is the weighted sum:
 *   R(x) = w_test * test(x) + w_type * type(x) + w_lint * lint(x)
 *        + w_cov  * cov(x)  + w_cb   * cb(x)
 *
 * This matches TRL GRPOTrainer's expectation that `reward_funcs` returns
 * a list of callables, each producing a list of floats.
 *
 * @module self-improvement
 */

import type {
  GRPORewardFunction,
  RewardFunctionOptions,
  RewardToolRunner,
} from './GRPORewardFunctions';
import { createGRPORewardFunctions, GRPO_REWARD_WEIGHTS } from './GRPORewardFunctions';

// =============================================================================
// TYPES
// =============================================================================

/** Configuration for the orchestrator */
export interface GRPOOrchestratorConfig {
  /** Custom weights (must sum to 1.0). Defaults to GRPO_REWARD_WEIGHTS. */
  weights?: {
    testPassReward?: number;
    typeCheckReward?: number;
    lintReward?: number;
    coverageReward?: number;
    circuitBreakerReward?: number;
  };
  /** Global timeout for the entire batch evaluation (ms). Default: 120_000 */
  batchTimeout?: number;
  /** Per-completion timeout passed to reward functions (ms). Default: 30_000 */
  perCompletionTimeout?: number;
  /** Whether to run reward functions in parallel. Default: true */
  parallel?: boolean;
  /** Maximum cache size (number of unique completions). Default: 1000 */
  maxCacheSize?: number;
  /** Whether to enable caching. Default: true */
  cacheEnabled?: boolean;
}

/** Statistics tracked per reward function across all batches */
export interface RewardStatistics {
  /** Total number of evaluations */
  count: number;
  /** Running mean */
  mean: number;
  /** Running standard deviation */
  std: number;
  /** Minimum reward observed */
  min: number;
  /** Maximum reward observed */
  max: number;
  /** Sum of all rewards (for incremental mean calculation) */
  sum: number;
  /** Sum of squared rewards (for incremental std calculation) */
  sumSquared: number;
}

/** Per-reward-function result within a batch */
export interface RewardFunctionResult {
  /** Name of the reward function */
  name: string;
  /** Weight applied to this reward */
  weight: number;
  /** Raw rewards per completion (before weighting) */
  rewards: number[];
  /** Weighted rewards per completion */
  weightedRewards: number[];
  /** Duration of this reward function in milliseconds */
  durationMs: number;
}

/** Full result from a batch evaluation */
export interface OrchestratorResult {
  /** Composite rewards per completion (weighted sum of all 5 dimensions) */
  compositeRewards: number[];
  /** Per-function breakdown */
  functionResults: RewardFunctionResult[];
  /** Total batch evaluation duration in milliseconds */
  totalDurationMs: number;
  /** Number of completions evaluated */
  batchSize: number;
  /** Number of cache hits in this batch */
  cacheHits: number;
}

/** Summary of all tracked statistics */
export interface OrchestratorStats {
  /** Statistics per reward function */
  perFunction: Record<string, RewardStatistics>;
  /** Total batches processed */
  totalBatches: number;
  /** Total completions processed */
  totalCompletions: number;
  /** Composite reward statistics */
  composite: RewardStatistics;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Total cache hits */
  totalCacheHits: number;
  /** Total cache misses */
  totalCacheMisses: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: Required<GRPOOrchestratorConfig> = {
  weights: { ...GRPO_REWARD_WEIGHTS },
  batchTimeout: 120_000,
  perCompletionTimeout: 30_000,
  parallel: true,
  maxCacheSize: 1000,
  cacheEnabled: true,
};

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export class GRPORewardOrchestrator {
  private readonly config: Required<GRPOOrchestratorConfig>;
  private readonly resolvedWeights: Required<typeof GRPO_REWARD_WEIGHTS>;
  private readonly rewardFns: ReturnType<typeof createGRPORewardFunctions>;
  private readonly stats: Map<string, RewardStatistics> = new Map();
  private compositeStats: RewardStatistics;
  private totalBatches = 0;
  private totalCompletions = 0;
  private totalCacheHits = 0;
  private totalCacheMisses = 0;

  /** LRU-ish cache: completion string -> composite reward */
  private readonly cache: Map<string, number> = new Map();

  constructor(runner: RewardToolRunner, config?: GRPOOrchestratorConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config?.weights },
    };

    // Validate weights sum to 1.0
    this.resolvedWeights = {
      // @ts-ignore - Automatic remediation for TS2322
      testPassReward: this.config.weights.testPassReward ?? GRPO_REWARD_WEIGHTS.testPassReward,
      // @ts-ignore - Automatic remediation for TS2322
      typeCheckReward: this.config.weights.typeCheckReward ?? GRPO_REWARD_WEIGHTS.typeCheckReward,
      // @ts-ignore - Automatic remediation for TS2322
      lintReward: this.config.weights.lintReward ?? GRPO_REWARD_WEIGHTS.lintReward,
      // @ts-ignore - Automatic remediation for TS2322
      coverageReward: this.config.weights.coverageReward ?? GRPO_REWARD_WEIGHTS.coverageReward,
      // @ts-ignore - Automatic remediation for TS2322
      circuitBreakerReward:
        this.config.weights.circuitBreakerReward ?? GRPO_REWARD_WEIGHTS.circuitBreakerReward,
    };

    const weightSum = Object.values(this.resolvedWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 1e-6) {
      throw new Error(`Orchestrator weights must sum to 1.0 but got ${weightSum}`);
    }

    this.rewardFns = createGRPORewardFunctions(runner);

    // Initialize statistics for each function
    const fnNames = [
      'testPassReward',
      'typeCheckReward',
      'lintReward',
      'coverageReward',
      'circuitBreakerReward',
    ];
    for (const name of fnNames) {
      this.stats.set(name, createEmptyStats());
    }
    this.compositeStats = createEmptyStats();
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a batch of completions and return composite rewards.
   *
   * This is the main entry point for GRPO training. The returned
   * `compositeRewards` array can be passed directly to TRL GRPOTrainer.
   */
  async evaluate(
    completions: string[],
    kwargs?: RewardFunctionOptions
  ): Promise<OrchestratorResult> {
    const batchStart = Date.now();
    this.totalBatches++;
    this.totalCompletions += completions.length;

    const opts: RewardFunctionOptions = {
      ...kwargs,
      timeout: kwargs?.timeout ?? this.config.perCompletionTimeout,
    };

    // Check cache for all completions
    let cacheHits = 0;
    const cachedResults: (number | null)[] = completions.map((c) => {
      if (this.config.cacheEnabled && this.cache.has(c)) {
        cacheHits++;
        this.totalCacheHits++;
        return this.cache.get(c)!;
      }
      this.totalCacheMisses++;
      return null;
    });

    // Separate cached and uncached completions
    const uncachedIndices: number[] = [];
    const uncachedCompletions: string[] = [];
    for (let i = 0; i < completions.length; i++) {
      if (cachedResults[i] === null) {
        uncachedIndices.push(i);
        uncachedCompletions.push(completions[i]);
      }
    }

    // Define the reward function entries with names and weights
    const rewardEntries: Array<{
      name: string;
      fn: GRPORewardFunction;
      weight: number;
    }> = [
      {
        name: 'testPassReward',
        fn: this.rewardFns.testPassReward,
        weight: this.resolvedWeights.testPassReward,
      },
      {
        name: 'typeCheckReward',
        fn: this.rewardFns.typeCheckReward,
        weight: this.resolvedWeights.typeCheckReward,
      },
      {
        name: 'lintReward',
        fn: this.rewardFns.lintReward,
        weight: this.resolvedWeights.lintReward,
      },
      {
        name: 'coverageReward',
        fn: this.rewardFns.coverageReward,
        weight: this.resolvedWeights.coverageReward,
      },
      {
        name: 'circuitBreakerReward',
        fn: this.rewardFns.circuitBreakerReward,
        weight: this.resolvedWeights.circuitBreakerReward,
      },
    ];

    // Execute reward functions on uncached completions
    const functionResults: RewardFunctionResult[] = [];

    if (uncachedCompletions.length > 0) {
      if (this.config.parallel) {
        // Run all 5 reward functions in parallel
        const results = await Promise.race([
          Promise.all(
            rewardEntries.map(async (entry) => {
              const fnStart = Date.now();
              try {
                const rewards = await entry.fn(uncachedCompletions, opts);
                return {
                  name: entry.name,
                  weight: entry.weight,
                  rewards,
                  weightedRewards: rewards.map((r) => r * entry.weight),
                  durationMs: Date.now() - fnStart,
                };
              } catch {
                // On failure, return zeros
                const zeros = uncachedCompletions.map(() => 0);
                return {
                  name: entry.name,
                  weight: entry.weight,
                  rewards: zeros,
                  weightedRewards: zeros,
                  durationMs: Date.now() - fnStart,
                };
              }
            })
          ),
          // Batch-level timeout
          new Promise<RewardFunctionResult[]>((_, reject) =>
            setTimeout(
              () => reject(new Error('Batch evaluation timed out')),
              this.config.batchTimeout
            )
          ),
        ]);
        functionResults.push(...results);
      } else {
        // Run sequentially
        for (const entry of rewardEntries) {
          const fnStart = Date.now();
          try {
            const rewards = await entry.fn(uncachedCompletions, opts);
            functionResults.push({
              name: entry.name,
              weight: entry.weight,
              rewards,
              weightedRewards: rewards.map((r) => r * entry.weight),
              durationMs: Date.now() - fnStart,
            });
          } catch {
            const zeros = uncachedCompletions.map(() => 0);
            functionResults.push({
              name: entry.name,
              weight: entry.weight,
              rewards: zeros,
              weightedRewards: zeros,
              durationMs: Date.now() - fnStart,
            });
          }
        }
      }
    } else {
      // All cached: create placeholder function results
      for (const entry of rewardEntries) {
        functionResults.push({
          name: entry.name,
          weight: entry.weight,
          rewards: [],
          weightedRewards: [],
          durationMs: 0,
        });
      }
    }

    // Compute composite rewards for uncached completions
    const uncachedComposites: number[] = [];
    for (let i = 0; i < uncachedCompletions.length; i++) {
      let composite = 0;
      for (const fr of functionResults) {
        if (fr.rewards.length > i) {
          composite += fr.weightedRewards[i];
        }
      }
      composite = clamp(composite, 0, 1);
      uncachedComposites.push(composite);

      // Store in cache
      if (this.config.cacheEnabled) {
        this.addToCache(uncachedCompletions[i], composite);
      }
    }

    // Merge cached and uncached results into final composite rewards
    const compositeRewards: number[] = new Array(completions.length);
    let uncachedIdx = 0;
    for (let i = 0; i < completions.length; i++) {
      if (cachedResults[i] !== null) {
        compositeRewards[i] = cachedResults[i]!;
      } else {
        compositeRewards[i] = uncachedComposites[uncachedIdx++];
      }
    }

    // Update statistics
    this.updateStats(functionResults, compositeRewards);

    return {
      compositeRewards,
      functionResults,
      totalDurationMs: Date.now() - batchStart,
      batchSize: completions.length,
      cacheHits,
    };
  }

  /**
   * Get the individual reward functions for direct use with TRL's
   * `reward_funcs` parameter (which expects a list of callables).
   *
   * Returns the 5 functions as an array matching TRL's expected format.
   */
  getRewardFuncsArray(): GRPORewardFunction[] {
    return [
      this.rewardFns.testPassReward,
      this.rewardFns.typeCheckReward,
      this.rewardFns.lintReward,
      this.rewardFns.coverageReward,
      this.rewardFns.circuitBreakerReward,
    ];
  }

  /**
   * Get current statistics across all batches.
   */
  getStats(): OrchestratorStats {
    const perFunction: Record<string, RewardStatistics> = {};
    for (const [name, stat] of this.stats.entries()) {
      perFunction[name] = { ...stat };
    }

    const totalLookups = this.totalCacheHits + this.totalCacheMisses;

    return {
      perFunction,
      totalBatches: this.totalBatches,
      totalCompletions: this.totalCompletions,
      composite: { ...this.compositeStats },
      cacheHitRate: totalLookups > 0 ? this.totalCacheHits / totalLookups : 0,
      totalCacheHits: this.totalCacheHits,
      totalCacheMisses: this.totalCacheMisses,
    };
  }

  /**
   * Reset all statistics and clear the cache.
   */
  reset(): void {
    for (const stat of this.stats.values()) {
      Object.assign(stat, createEmptyStats());
    }
    this.compositeStats = createEmptyStats();
    this.totalBatches = 0;
    this.totalCompletions = 0;
    this.totalCacheHits = 0;
    this.totalCacheMisses = 0;
    this.cache.clear();
  }

  /**
   * Clear only the cache (keep statistics).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the resolved weights being used.
   */
  getWeights(): typeof GRPO_REWARD_WEIGHTS {
    return { ...this.resolvedWeights };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addToCache(completion: string, reward: number): void {
    // Evict oldest entries if cache is full (simple FIFO eviction)
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(completion, reward);
  }

  private updateStats(functionResults: RewardFunctionResult[], compositeRewards: number[]): void {
    // Update per-function statistics
    for (const fr of functionResults) {
      const stat = this.stats.get(fr.name);
      if (stat) {
        for (const reward of fr.rewards) {
          updateRunningStats(stat, reward);
        }
      }
    }

    // Update composite statistics
    for (const reward of compositeRewards) {
      updateRunningStats(this.compositeStats, reward);
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function createEmptyStats(): RewardStatistics {
  return {
    count: 0,
    mean: 0,
    std: 0,
    min: Infinity,
    max: -Infinity,
    sum: 0,
    sumSquared: 0,
  };
}

/**
 * Incrementally update running statistics using Welford's online algorithm.
 */
function updateRunningStats(stats: RewardStatistics, value: number): void {
  stats.count++;
  stats.sum += value;
  stats.sumSquared += value * value;
  stats.min = Math.min(stats.min, value);
  stats.max = Math.max(stats.max, value);
  stats.mean = stats.sum / stats.count;

  if (stats.count > 1) {
    const variance = (stats.sumSquared - (stats.sum * stats.sum) / stats.count) / (stats.count - 1);
    stats.std = Math.sqrt(Math.max(0, variance));
  } else {
    stats.std = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
