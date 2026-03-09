/**
 * OPLoRAConfig.ts
 *
 * Extended OPLoRA (Orthogonal Projection LoRA) configuration for catastrophic
 * forgetting prevention during GRPO training of the Brittney 7B model.
 *
 * OPLoRA constrains LoRA weight updates to the null space of pre-trained weight
 * matrices' dominant singular directions. This prevents the model from degrading
 * general coding ability while improving on HoloScript-specific tasks.
 *
 * The key insight: standard LoRA adds low-rank updates to weight matrices
 * without regard for what the original weights "know". OPLoRA computes the SVD
 * of each target module's pre-trained weights, identifies the top-k singular
 * directions (the "knowledge subspace"), and projects LoRA updates to be
 * orthogonal to that subspace. This preserves base model capabilities while
 * still allowing learning in the complementary null space.
 *
 * References:
 *   - LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)
 *   - OPLoRA concept: Orthogonal projection to prevent catastrophic forgetting
 *   - HoloScript training rules W.006, W.007, W.009
 *
 * @module self-improvement
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extended OPLoRA configuration with orthogonal projection parameters.
 *
 * This extends the basic OPLoRAConfig in GRPOConfig.ts with the full set of
 * parameters needed for SVD-based null space projection and constraint
 * monitoring.
 */
export interface ExtendedOPLoRAConfig {
  /**
   * LoRA rank (r).
   * Number of low-rank dimensions for the adapter matrices.
   * Higher rank = more capacity but more memory and compute.
   * r=16 is a good balance for 7B models.
   */
  rank: number;

  /**
   * LoRA alpha (scaling factor).
   * Effective learning rate scaling: effective_lr = alpha / rank * lr.
   * alpha=32 with rank=16 gives a scaling factor of 2.
   */
  alpha: number;

  /**
   * Number of dominant singular values to protect from the pre-trained
   * weight matrices. These define the "knowledge subspace" that LoRA
   * updates must remain orthogonal to.
   *
   * Default: rank * 2 = 32. Higher values protect more of the base
   * model's capabilities but leave less room for new learning.
   *
   * Trade-off:
   *   - Low projectionRank (e.g., 16): More learning freedom, higher forgetting risk
   *   - High projectionRank (e.g., 64): Less forgetting, slower adaptation
   */
  projectionRank: number;

  /**
   * Target modules for LoRA injection.
   * For LLaMA-style architectures, all attention and MLP projections
   * are targeted for maximum coverage.
   */
  targetModules: string[];

  /**
   * LoRA dropout rate.
   * Regularisation on the low-rank adapter matrices.
   * 0.05 provides mild regularisation without over-constraining.
   */
  loraDropout: number;

  /**
   * Strength of the orthogonal constraint penalty term.
   * This is the lambda coefficient in the loss function:
   *   L_total = L_grpo + orthogonalWeight * L_orthogonal
   *
   * Where L_orthogonal measures how much the LoRA updates overlap
   * with the protected singular directions.
   *
   * - 0.0: No orthogonal constraint (standard LoRA)
   * - 1.0: Strong constraint (recommended default)
   * - 2.0+: Very aggressive protection (may slow learning)
   */
  orthogonalWeight: number;

  /**
   * Number of training steps between SVD recomputation.
   * The SVD of pre-trained weights is expensive to compute, so it
   * is cached and only recomputed periodically.
   *
   * - 100: Good balance (recommended for 7B models)
   * - 50: More frequent updates, better accuracy, 2x compute cost
   * - 500: Cheaper but may miss drift in the projection basis
   *
   * Set to 0 to compute SVD only once at initialisation.
   */
  svdRecomputeInterval: number;
}

/**
 * Validated configuration ready for use. All fields have been checked
 * for validity and are guaranteed to be within acceptable ranges.
 */
export interface ValidatedOPLoRAConfig extends ExtendedOPLoRAConfig {
  /** Marker to distinguish validated configs at the type level */
  readonly __validated: true;
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default OPLoRA configuration optimised for Brittney 7B GRPO training.
 */
export const DEFAULT_OPLORA_CONFIG: ExtendedOPLoRAConfig = {
  rank: 16,
  alpha: 32,
  projectionRank: 32, // rank * 2
  targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
  loraDropout: 0.05,
  orthogonalWeight: 1.0,
  svdRecomputeInterval: 100,
};

// =============================================================================
// VALIDATION
// =============================================================================

/** Validation error with field path and message */
export interface OPLoRAValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Validate an OPLoRA configuration object.
 *
 * Returns an array of validation errors. An empty array means the config
 * is valid.
 *
 * @param config - The configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateOPLoRAConfig(
  config: Partial<ExtendedOPLoRAConfig>
): OPLoRAValidationError[] {
  const errors: OPLoRAValidationError[] = [];

  // rank
  if (config.rank !== undefined) {
    if (!Number.isInteger(config.rank) || config.rank < 1) {
      errors.push({
        field: 'rank',
        message: 'rank must be a positive integer (>= 1)',
        value: config.rank,
      });
    } else if (config.rank > 256) {
      errors.push({
        field: 'rank',
        message: 'rank should not exceed 256 for practical use',
        value: config.rank,
      });
    }
  }

  // alpha
  if (config.alpha !== undefined) {
    if (typeof config.alpha !== 'number' || config.alpha <= 0) {
      errors.push({
        field: 'alpha',
        message: 'alpha must be a positive number',
        value: config.alpha,
      });
    }
  }

  // projectionRank
  if (config.projectionRank !== undefined) {
    if (!Number.isInteger(config.projectionRank) || config.projectionRank < 1) {
      errors.push({
        field: 'projectionRank',
        message: 'projectionRank must be a positive integer (>= 1)',
        value: config.projectionRank,
      });
    }
  }

  // Cross-field: projectionRank should generally be >= rank
  if (
    config.projectionRank !== undefined &&
    config.rank !== undefined &&
    config.projectionRank < config.rank
  ) {
    errors.push({
      field: 'projectionRank',
      message:
        'projectionRank should be >= rank to protect at least as many directions as the adapter rank',
      value: config.projectionRank,
    });
  }

  // targetModules
  if (config.targetModules !== undefined) {
    if (!Array.isArray(config.targetModules) || config.targetModules.length === 0) {
      errors.push({
        field: 'targetModules',
        message: 'targetModules must be a non-empty array of strings',
        value: config.targetModules,
      });
    } else {
      for (let i = 0; i < config.targetModules.length; i++) {
        if (typeof config.targetModules[i] !== 'string' || config.targetModules[i].length === 0) {
          errors.push({
            field: `targetModules[${i}]`,
            message: 'Each target module must be a non-empty string',
            value: config.targetModules[i],
          });
        }
      }
    }
  }

  // loraDropout
  if (config.loraDropout !== undefined) {
    if (
      typeof config.loraDropout !== 'number' ||
      config.loraDropout < 0 ||
      config.loraDropout >= 1
    ) {
      errors.push({
        field: 'loraDropout',
        message: 'loraDropout must be a number in [0, 1)',
        value: config.loraDropout,
      });
    }
  }

  // orthogonalWeight
  if (config.orthogonalWeight !== undefined) {
    if (typeof config.orthogonalWeight !== 'number' || config.orthogonalWeight < 0) {
      errors.push({
        field: 'orthogonalWeight',
        message: 'orthogonalWeight must be a non-negative number',
        value: config.orthogonalWeight,
      });
    }
  }

  // svdRecomputeInterval
  if (config.svdRecomputeInterval !== undefined) {
    if (!Number.isInteger(config.svdRecomputeInterval) || config.svdRecomputeInterval < 0) {
      errors.push({
        field: 'svdRecomputeInterval',
        message: 'svdRecomputeInterval must be a non-negative integer (0 = compute once)',
        value: config.svdRecomputeInterval,
      });
    }
  }

  return errors;
}

/**
 * Build a validated OPLoRA config from partial overrides.
 *
 * Merges overrides into DEFAULT_OPLORA_CONFIG, validates the result,
 * and throws if invalid.
 *
 * @param overrides - Partial config overrides
 * @returns Validated configuration
 * @throws Error if validation fails
 */
export function buildOPLoRAConfig(
  overrides: Partial<ExtendedOPLoRAConfig> = {}
): ValidatedOPLoRAConfig {
  const config: ExtendedOPLoRAConfig = {
    ...DEFAULT_OPLORA_CONFIG,
    ...overrides,
    // Deep-copy targetModules to avoid mutation
    targetModules: overrides.targetModules
      ? [...overrides.targetModules]
      : [...DEFAULT_OPLORA_CONFIG.targetModules],
  };

  const errors = validateOPLoRAConfig(config);
  if (errors.length > 0) {
    const messages = errors.map((e) => `  ${e.field}: ${e.message} (got: ${e.value})`);
    throw new Error(`Invalid OPLoRA configuration:\n${messages.join('\n')}`);
  }

  return Object.assign(config, { __validated: true as const });
}

// =============================================================================
// PYTHON EXPORT
// =============================================================================

/**
 * Export the OPLoRA config as a Python-compatible string for PEFT integration.
 *
 * This generates a Python snippet that can be used with the oplora_wrapper.py
 * script and PEFT's LoraConfig.
 *
 * @param config - The validated OPLoRA configuration
 * @returns Python code string
 */
export function exportOPLoRAConfigAsPython(config: ExtendedOPLoRAConfig): string {
  const lines: string[] = [
    '"""',
    'OPLoRA Configuration for HoloScript GRPO Training',
    'Auto-generated from OPLoRAConfig.ts',
    '"""',
    '',
    'from peft import LoraConfig',
    '',
    '# Standard LoRA configuration',
    'lora_config = LoraConfig(',
    `    r=${config.rank},`,
    `    lora_alpha=${config.alpha},`,
    `    lora_dropout=${config.loraDropout},`,
    `    target_modules=${JSON.stringify(config.targetModules)},`,
    '    bias="none",',
    '    task_type="CAUSAL_LM",',
    ')',
    '',
    '# OPLoRA orthogonal projection parameters',
    'oplora_params = {',
    `    "projection_rank": ${config.projectionRank},`,
    `    "orthogonal_weight": ${config.orthogonalWeight},`,
    `    "svd_recompute_interval": ${config.svdRecomputeInterval},`,
    `    "target_modules": ${JSON.stringify(config.targetModules)},`,
    '}',
  ];

  return lines.join('\n');
}
