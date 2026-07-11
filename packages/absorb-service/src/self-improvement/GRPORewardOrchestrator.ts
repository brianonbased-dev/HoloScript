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
 *        [+ w_V * V(x)] [+ w_Zm * Z_m(x)]     (optional, flag-gated, default off)
 *
 * The optional terms are the reward-spine unification (2026-07-09):
 * provenance-validity V and faithful-calibration Z_m from
 * ProvenanceCalibrationRewards.ts.
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
import {
  faithfulCalibrationReward,
  provenanceValidityReward,
} from './ProvenanceCalibrationRewards';
import {
  agentBenefitReward,
  assertDialSumsToOne,
  composeBeneficiaryReward,
  humanBenefitReward,
} from './BeneficiaryRewards';
import type { BeneficiaryComposeConfig, BeneficiaryReceipt } from './BeneficiaryRewards';

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
    /** Weight for the provenance-validity (V) term. Requires enableProvenanceValidity. */
    provenanceValidityReward?: number;
    /** Weight for the faithful-calibration (Z_m) term. Requires enableFaithfulCalibration. */
    faithfulCalibrationReward?: number;
  };
  /**
   * Enable the provenance-validity (V) reward term. Default: false.
   * When enabled, weights.provenanceValidityReward must be provided and the
   * full weight set (base 5 + enabled extras) must sum to 1.0.
   */
  enableProvenanceValidity?: boolean;
  /**
   * Enable the faithful-calibration (Z_m) reward term. Default: false.
   * When enabled, weights.faithfulCalibrationReward must be provided and the
   * full weight set (base 5 + enabled extras) must sum to 1.0.
   */
  enableFaithfulCalibration?: boolean;
  /**
   * Enable the multi-beneficiary HOLARCHY composition. When set (non-null) the
   * composite reward is NO LONGER the flat weighted sum: R_self (the existing
   * weighted self-terms) is composed with R_agents and R_humans via a nested
   * {self ⊂ agents ⊂ humans} holarchy with a HARD, non-tradeable human floor
   * (composeBeneficiaryReward). The agent-benefit and human-benefit terms run
   * automatically — their gold comes from kwargs.agentBenefit / kwargs.humanBenefit —
   * and a BeneficiaryReceipt is attached per completion. Cache is bypassed
   * (rewards depend on batch context). Default: null (flat sum, unchanged).
   */
  beneficiaryHolarchy?: BeneficiaryComposeConfig | null;
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
  /**
   * Per-completion beneficiary receipts (who an action served + which floor
   * bit). Present only when beneficiaryHolarchy is enabled.
   */
  beneficiaryReceipts?: BeneficiaryReceipt[];
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
  enableProvenanceValidity: false,
  enableFaithfulCalibration: false,
  beneficiaryHolarchy: null,
};

/** All reward-term weights, extended terms resolved to 0 when disabled. */
type ResolvedWeights = { [K in keyof typeof GRPO_REWARD_WEIGHTS]: number } & {
  provenanceValidityReward: number;
  faithfulCalibrationReward: number;
};

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export class GRPORewardOrchestrator {
  private readonly config: Required<GRPOOrchestratorConfig>;
  private readonly resolvedWeights: ResolvedWeights;
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

    // Resolve extended-term weights against their enable flags: enabling a
    // term without a weight (or weighting a disabled term) is a config error,
    // not something to silently default.
    const w = this.config.weights;
    if (this.config.enableProvenanceValidity && w.provenanceValidityReward === undefined) {
      throw new Error(
        'enableProvenanceValidity requires weights.provenanceValidityReward (full set must sum to 1.0)'
      );
    }
    if (this.config.enableFaithfulCalibration && w.faithfulCalibrationReward === undefined) {
      throw new Error(
        'enableFaithfulCalibration requires weights.faithfulCalibrationReward (full set must sum to 1.0)'
      );
    }
    if (!this.config.enableProvenanceValidity && (w.provenanceValidityReward ?? 0) !== 0) {
      throw new Error('weights.provenanceValidityReward requires enableProvenanceValidity: true');
    }
    if (!this.config.enableFaithfulCalibration && (w.faithfulCalibrationReward ?? 0) !== 0) {
      throw new Error('weights.faithfulCalibrationReward requires enableFaithfulCalibration: true');
    }

    // Validate weights sum to 1.0
    this.resolvedWeights = {
      testPassReward: w.testPassReward ?? GRPO_REWARD_WEIGHTS.testPassReward,
      typeCheckReward: w.typeCheckReward ?? GRPO_REWARD_WEIGHTS.typeCheckReward,
      lintReward: w.lintReward ?? GRPO_REWARD_WEIGHTS.lintReward,
      coverageReward: w.coverageReward ?? GRPO_REWARD_WEIGHTS.coverageReward,
      circuitBreakerReward: w.circuitBreakerReward ?? GRPO_REWARD_WEIGHTS.circuitBreakerReward,
      provenanceValidityReward: this.config.enableProvenanceValidity
        ? (w.provenanceValidityReward as number)
        : 0,
      faithfulCalibrationReward: this.config.enableFaithfulCalibration
        ? (w.faithfulCalibrationReward as number)
        : 0,
    };

    const weightSum = Object.values(this.resolvedWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 1e-6) {
      throw new Error(`Orchestrator weights must sum to 1.0 but got ${weightSum}`);
    }

    // In holarchy mode the self-term weights above define R_self; cross-beneficiary
    // weighting comes from the dial, which must itself sum to 1.0.
    if (this.config.beneficiaryHolarchy) {
      assertDialSumsToOne(this.config.beneficiaryHolarchy.dial);
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
    if (this.config.enableProvenanceValidity) fnNames.push('provenanceValidityReward');
    if (this.config.enableFaithfulCalibration) fnNames.push('faithfulCalibrationReward');
    if (this.config.beneficiaryHolarchy) fnNames.push('agentBenefitReward', 'humanBenefitReward');
    for (const name of fnNames) {
      this.stats.set(name, createEmptyStats());
    }
    this.compositeStats = createEmptyStats();
  }

  /**
   * Extended terms make the reward depend on batch context (atoms/bound,
   * per-index F_gold), so a completion-string-keyed cache would return stale
   * rewards across contexts — bypass it whenever either term is enabled.
   */
  private cacheUsable(): boolean {
    return (
      this.config.cacheEnabled &&
      !this.config.enableProvenanceValidity &&
      !this.config.enableFaithfulCalibration &&
      !this.config.beneficiaryHolarchy
    );
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
    const useCache = this.cacheUsable();
    let cacheHits = 0;
    const cachedResults: (number | null)[] = completions.map((c) => {
      if (useCache && this.cache.has(c)) {
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
    if (this.config.enableProvenanceValidity) {
      rewardEntries.push({
        name: 'provenanceValidityReward',
        fn: provenanceValidityReward,
        weight: this.resolvedWeights.provenanceValidityReward,
      });
    }
    if (this.config.enableFaithfulCalibration) {
      rewardEntries.push({
        name: 'faithfulCalibrationReward',
        fn: faithfulCalibrationReward,
        weight: this.resolvedWeights.faithfulCalibrationReward,
      });
    }
    // Holarchy mode runs the two beneficiary terms at weight 0 — they produce the
    // raw R_agents / R_humans used by composeBeneficiaryReward below, but never
    // enter the flat weighted sum (which therefore stays exactly R_self).
    if (this.config.beneficiaryHolarchy) {
      rewardEntries.push({ name: 'agentBenefitReward', fn: agentBenefitReward, weight: 0 });
      rewardEntries.push({ name: 'humanBenefitReward', fn: humanBenefitReward, weight: 0 });
    }

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
    const holarchy = this.config.beneficiaryHolarchy;
    const agentFr = holarchy
      ? functionResults.find((f) => f.name === 'agentBenefitReward')
      : undefined;
    const humanFr = holarchy
      ? functionResults.find((f) => f.name === 'humanBenefitReward')
      : undefined;
    const uncachedComposites: number[] = [];
    const uncachedReceipts: BeneficiaryReceipt[] = [];
    for (let i = 0; i < uncachedCompletions.length; i++) {
      // Flat weighted sum. In holarchy mode the two beneficiary terms carry
      // weight 0, so this sum is exactly R_self (the self-regarding composite).
      let composite = 0;
      for (const fr of functionResults) {
        if (fr.rewards.length > i) {
          composite += fr.weightedRewards[i];
        }
      }
      composite = clamp(composite, 0, 1);

      if (holarchy) {
        const rAgents = agentFr && agentFr.rewards.length > i ? agentFr.rewards[i] : 0;
        const rHumans = humanFr && humanFr.rewards.length > i ? humanFr.rewards[i] : 0;
        const receipt = composeBeneficiaryReward({ rSelf: composite, rAgents, rHumans }, holarchy);
        uncachedReceipts.push(receipt);
        composite = receipt.reward;
      }

      uncachedComposites.push(composite);

      // Store in cache (never reached in holarchy mode — cache is bypassed there)
      if (useCache) {
        this.addToCache(uncachedCompletions[i], composite);
      }
    }

    // Merge cached and uncached results into final composite rewards
    const compositeRewards: number[] = new Array(completions.length);
    const beneficiaryReceipts: BeneficiaryReceipt[] | undefined = holarchy
      ? new Array(completions.length)
      : undefined;
    let uncachedIdx = 0;
    for (let i = 0; i < completions.length; i++) {
      if (cachedResults[i] !== null) {
        compositeRewards[i] = cachedResults[i]!;
      } else {
        compositeRewards[i] = uncachedComposites[uncachedIdx];
        if (beneficiaryReceipts) beneficiaryReceipts[i] = uncachedReceipts[uncachedIdx];
        uncachedIdx++;
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
      ...(beneficiaryReceipts ? { beneficiaryReceipts } : {}),
    };
  }

  /**
   * Get the individual reward functions for direct use with TRL's
   * `reward_funcs` parameter (which expects a list of callables).
   *
   * Returns the 5 functions as an array matching TRL's expected format.
   */
  getRewardFuncsArray(): GRPORewardFunction[] {
    const fns: GRPORewardFunction[] = [
      this.rewardFns.testPassReward,
      this.rewardFns.typeCheckReward,
      this.rewardFns.lintReward,
      this.rewardFns.coverageReward,
      this.rewardFns.circuitBreakerReward,
    ];
    if (this.config.enableProvenanceValidity) fns.push(provenanceValidityReward);
    if (this.config.enableFaithfulCalibration) fns.push(faithfulCalibrationReward);
    if (this.config.beneficiaryHolarchy) fns.push(agentBenefitReward, humanBenefitReward);
    return fns;
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
   * Get the resolved weights being used. Extended-term weights appear only
   * when their term is enabled (disabled terms are not part of the composite).
   */
  getWeights(): { [K in keyof typeof GRPO_REWARD_WEIGHTS]: number } & {
    provenanceValidityReward?: number;
    faithfulCalibrationReward?: number;
  } {
    const { provenanceValidityReward: pv, faithfulCalibrationReward: fc, ...base } =
      this.resolvedWeights;
    return {
      ...base,
      ...(this.config.enableProvenanceValidity ? { provenanceValidityReward: pv } : {}),
      ...(this.config.enableFaithfulCalibration ? { faithfulCalibrationReward: fc } : {}),
    };
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
