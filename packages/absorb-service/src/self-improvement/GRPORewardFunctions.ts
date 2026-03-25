/**
 * GRPORewardFunctions.ts
 *
 * Implements 5 individual reward functions for TRL's GRPOTrainer that map
 * directly to the QualityScore dimensions used by HoloScript's
 * self-improvement pipeline.
 *
 * Each reward function follows TRL's callable signature:
 *   (completions: string[], kwargs?) => number[]
 *
 * The self-improve loop IS the GRPO training loop: these reward functions
 * bridge the HoloScript quality scoring system to GRPO's `reward_funcs`
 * parameter, enabling the model to be trained on signals from real tool
 * execution (vitest, tsc, eslint, circuit breaker health).
 *
 * Weights (GRPO-optimised, different from QualityScore weights):
 *   testPassReward:        0.40  (tests are the strongest signal)
 *   typeCheckReward:       0.20  (binary type safety gate)
 *   lintReward:            0.15  (code quality)
 *   coverageReward:        0.15  (coverage breadth)
 *   circuitBreakerReward:  0.10  (system health)
 *
 * @module self-improvement
 */

// =============================================================================
// TYPES
// =============================================================================

/** Options passed to reward functions via kwargs */
export interface RewardFunctionOptions {
  /** Working directory for tool execution */
  workDir?: string;
  /** Timeout in milliseconds for each completion evaluation */
  timeout?: number;
  /** Maximum lint issues before score is 0 */
  maxLintIssues?: number;
  /** File extension for generated code files */
  fileExtension?: string;
  /** Whether to clean up temporary files after evaluation */
  cleanup?: boolean;
}

/**
 * TRL GRPOTrainer-compatible reward function signature.
 *
 * Takes an array of completion strings (the model's generated outputs)
 * and returns an array of numeric rewards in [0, 1].
 */
export type GRPORewardFunction = (
  completions: string[],
  kwargs?: RewardFunctionOptions
) => Promise<number[]>;

/** Result from a single reward function evaluation */
export interface RewardEvaluation {
  /** The reward value [0, 1] */
  reward: number;
  /** Whether the evaluation succeeded (false = fallback to 0) */
  success: boolean;
  /** Duration of evaluation in milliseconds */
  durationMs: number;
  /** Error message if evaluation failed */
  error?: string;
  /** Raw output from the tool (truncated for storage) */
  rawOutput?: string;
}

/**
 * Abstraction over external tool execution.
 *
 * All side-effects (file I/O, process spawning) are injected through this
 * interface so reward functions remain unit-testable with pure stubs.
 */
export interface RewardToolRunner {
  /** Write a temporary file and return its path */
  writeTempFile(content: string, extension: string): Promise<string>;

  /** Delete a temporary file */
  deleteTempFile(filePath: string): Promise<void>;

  /**
   * Run vitest on a file. Returns { passed, total, coveragePercent }.
   * coveragePercent is only populated when `withCoverage` is true.
   */
  runVitest(
    filePath: string,
    options?: { withCoverage?: boolean; timeout?: number }
  ): Promise<{
    passed: number;
    total: number;
    coveragePercent?: number;
    output: string;
  }>;

  /** Run tsc --noEmit on a file. Returns true if no type errors. */
  runTypeCheck(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{
    passed: boolean;
    output: string;
  }>;

  /** Run eslint on a file. Returns the number of issues found. */
  runLint(
    filePath: string,
    options?: { timeout?: number }
  ): Promise<{
    issueCount: number;
    output: string;
  }>;

  /**
   * Get circuit breaker health score (0-100).
   * Reads from CircuitBreakerMetrics if available, returns 100 as fallback.
   */
  getCircuitBreakerHealth(): Promise<number>;
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<RewardFunctionOptions> = {
  workDir: '.',
  timeout: 30_000,
  maxLintIssues: 20,
  fileExtension: '.ts',
  cleanup: true,
};

function resolveOptions(kwargs?: RewardFunctionOptions): Required<RewardFunctionOptions> {
  return { ...DEFAULT_OPTIONS, ...kwargs };
}

// =============================================================================
// GRPO REWARD WEIGHTS
// =============================================================================

/**
 * GRPO-optimised weights for the 5 reward dimensions.
 *
 * These differ from QualityScore weights because GRPO reward signals
 * need stronger gradients on the most actionable dimensions:
 * - testPassRate is 0.40 (vs 0.30 in QualityScore) because passing tests
 *   is the single strongest training signal
 * - coverage is 0.15 (vs 0.25) because coverage alone doesn't guarantee correctness
 */
export const GRPO_REWARD_WEIGHTS = {
  testPassReward: 0.4,
  typeCheckReward: 0.2,
  lintReward: 0.15,
  coverageReward: 0.15,
  circuitBreakerReward: 0.1,
} as const;

// Compile-time weight sum validation
const _grpoWeightSum =
  GRPO_REWARD_WEIGHTS.testPassReward +
  GRPO_REWARD_WEIGHTS.typeCheckReward +
  GRPO_REWARD_WEIGHTS.lintReward +
  GRPO_REWARD_WEIGHTS.coverageReward +
  GRPO_REWARD_WEIGHTS.circuitBreakerReward;

if (Math.abs(_grpoWeightSum - 1.0) > 1e-9) {
  throw new Error(`GRPO reward weights must sum to 1.0 but got ${_grpoWeightSum}`);
}

// =============================================================================
// REWARD FUNCTION FACTORY
// =============================================================================

/**
 * Creates all 5 GRPO reward functions bound to a specific tool runner.
 *
 * This factory pattern ensures that reward functions share the same
 * tool runner instance, enabling connection pooling and resource reuse.
 *
 * @example
 * ```ts
 * const runner: RewardToolRunner = createNodeToolRunner();
 * const rewards = createGRPORewardFunctions(runner);
 *
 * // Use with TRL GRPOTrainer (via Python bridge)
 * const testRewards = await rewards.testPassReward(completions);
 * const typeRewards = await rewards.typeCheckReward(completions);
 * ```
 */
export function createGRPORewardFunctions(runner: RewardToolRunner) {
  // -------------------------------------------------------------------------
  // 1. Test Pass Reward (weight: 0.40)
  // -------------------------------------------------------------------------

  /**
   * Runs vitest on each completion and returns the test pass rate [0, 1].
   *
   * The completion is written to a temp file, vitest is invoked on it,
   * and the reward is `passed / total`. If vitest fails entirely (e.g.
   * syntax error prevents loading), the reward is 0.
   */
  const testPassReward: GRPORewardFunction = async (
    completions: string[],
    kwargs?: RewardFunctionOptions
  ): Promise<number[]> => {
    const opts = resolveOptions(kwargs);
    const rewards: number[] = [];

    for (const completion of completions) {
      const eval_ = await evaluateWithTimeout(async (): Promise<number> => {
        const filePath = await runner.writeTempFile(completion, opts.fileExtension);
        try {
          const result = await runner.runVitest(filePath, { timeout: opts.timeout });
          if (result.total === 0) return 0;
          return clamp(result.passed / result.total, 0, 1);
        } finally {
          if (opts.cleanup) {
            await runner.deleteTempFile(filePath).catch(() => {});
          }
        }
      }, opts.timeout);
      rewards.push(eval_);
    }

    return rewards;
  };

  // -------------------------------------------------------------------------
  // 2. Type Check Reward (weight: 0.20)
  // -------------------------------------------------------------------------

  /**
   * Runs tsc --noEmit on each completion. Returns 1.0 (pass) or 0.0 (fail).
   *
   * This is a binary gate: either the code type-checks cleanly or it does
   * not. There is no partial credit for "almost" type-safe code.
   */
  const typeCheckReward: GRPORewardFunction = async (
    completions: string[],
    kwargs?: RewardFunctionOptions
  ): Promise<number[]> => {
    const opts = resolveOptions(kwargs);
    const rewards: number[] = [];

    for (const completion of completions) {
      const eval_ = await evaluateWithTimeout(async (): Promise<number> => {
        const filePath = await runner.writeTempFile(completion, opts.fileExtension);
        try {
          const result = await runner.runTypeCheck(filePath, { timeout: opts.timeout });
          return result.passed ? 1.0 : 0.0;
        } finally {
          if (opts.cleanup) {
            await runner.deleteTempFile(filePath).catch(() => {});
          }
        }
      }, opts.timeout);
      rewards.push(eval_);
    }

    return rewards;
  };

  // -------------------------------------------------------------------------
  // 3. Lint Reward (weight: 0.15)
  // -------------------------------------------------------------------------

  /**
   * Runs eslint on each completion and returns 1 - (issues / maxIssues).
   *
   * The score degrades linearly from 1.0 (no issues) to 0.0 (maxIssues or
   * more issues). The `maxLintIssues` option controls the saturation point.
   */
  const lintReward: GRPORewardFunction = async (
    completions: string[],
    kwargs?: RewardFunctionOptions
  ): Promise<number[]> => {
    const opts = resolveOptions(kwargs);
    const rewards: number[] = [];

    for (const completion of completions) {
      const eval_ = await evaluateWithTimeout(async (): Promise<number> => {
        const filePath = await runner.writeTempFile(completion, opts.fileExtension);
        try {
          const result = await runner.runLint(filePath, { timeout: opts.timeout });
          const maxIssues = Math.max(1, opts.maxLintIssues);
          return clamp(1 - result.issueCount / maxIssues, 0, 1);
        } finally {
          if (opts.cleanup) {
            await runner.deleteTempFile(filePath).catch(() => {});
          }
        }
      }, opts.timeout);
      rewards.push(eval_);
    }

    return rewards;
  };

  // -------------------------------------------------------------------------
  // 4. Coverage Reward (weight: 0.15)
  // -------------------------------------------------------------------------

  /**
   * Runs vitest with --coverage on each completion and returns coverage/100.
   *
   * This measures how much of the generated code is actually exercised by
   * tests. A completion that generates both code and tests covering it
   * will score highly.
   */
  const coverageReward: GRPORewardFunction = async (
    completions: string[],
    kwargs?: RewardFunctionOptions
  ): Promise<number[]> => {
    const opts = resolveOptions(kwargs);
    const rewards: number[] = [];

    for (const completion of completions) {
      const eval_ = await evaluateWithTimeout(async (): Promise<number> => {
        const filePath = await runner.writeTempFile(completion, opts.fileExtension);
        try {
          const result = await runner.runVitest(filePath, {
            withCoverage: true,
            timeout: opts.timeout,
          });
          const coverage = result.coveragePercent ?? 0;
          return clamp(coverage / 100, 0, 1);
        } finally {
          if (opts.cleanup) {
            await runner.deleteTempFile(filePath).catch(() => {});
          }
        }
      }, opts.timeout);
      rewards.push(eval_);
    }

    return rewards;
  };

  // -------------------------------------------------------------------------
  // 5. Circuit Breaker Reward (weight: 0.10)
  // -------------------------------------------------------------------------

  /**
   * Checks CircuitBreakerManager health and returns health/100.
   *
   * Unlike the other 4 reward functions, this is not per-completion but
   * reflects the overall system health. Every completion in the batch
   * receives the same reward. This signal encourages the model to avoid
   * generating code that destabilises the system.
   */
  const circuitBreakerReward: GRPORewardFunction = async (
    completions: string[],
    _kwargs?: RewardFunctionOptions
  ): Promise<number[]> => {
    try {
      const health = await runner.getCircuitBreakerHealth();
      const reward = clamp(health / 100, 0, 1);
      return completions.map(() => reward);
    } catch {
      // Circuit breaker unavailable = assume healthy (no penalty)
      return completions.map(() => 1.0);
    }
  };

  return {
    testPassReward,
    typeCheckReward,
    lintReward,
    coverageReward,
    circuitBreakerReward,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Execute an async evaluation with a timeout.
 * Returns 0 if the evaluation times out or throws.
 */
async function evaluateWithTimeout(fn: () => Promise<number>, timeoutMs: number): Promise<number> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('Reward evaluation timed out')), timeoutMs)
      ),
    ]);
    return result;
  } catch {
    return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
