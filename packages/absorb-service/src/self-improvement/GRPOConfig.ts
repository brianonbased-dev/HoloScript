/**
 * GRPOConfig.ts
 *
 * Recommended hyperparameters for training HoloScript models with TRL's
 * GRPOTrainer. These settings are derived from:
 *
 *   1. DeepSeek-R1 paper (GRPO fundamentals, group-based advantage)
 *   2. TRL GRPOTrainer documentation (vLLM integration, reward_funcs API)
 *   3. HoloScript training rules (W.006, W.007, W.009 from TRAINING_RULES.md)
 *   4. Empirical findings from Brittney v3 training runs
 *
 * Key insight: The self-improve loop IS the GRPO training loop.
 * HoloScript's QualityScore dimensions become GRPO reward functions,
 * and the ConvergenceDetector maps to GRPO's KL divergence monitoring.
 *
 * @module self-improvement
 */

import { GRPO_REWARD_WEIGHTS } from './GRPORewardFunctions';

// =============================================================================
// TYPES
// =============================================================================

/** Complete GRPO training configuration */
export interface GRPOTrainingConfig {
  /** Core GRPO hyperparameters */
  grpo: GRPOHyperparameters;
  /** vLLM generation parameters */
  vllm: VLLMConfig;
  /** OPLoRA configuration for catastrophic forgetting prevention */
  oplora: OPLoRAConfig;
  /** Reward function weights (from GRPORewardFunctions) */
  rewardWeights: typeof GRPO_REWARD_WEIGHTS;
  /** Training schedule */
  schedule: TrainingSchedule;
  /** Hardware-specific settings */
  hardware: HardwareConfig;
}

/** Core GRPO hyperparameters */
export interface GRPOHyperparameters {
  /**
   * Learning rate.
   * Lower than standard fine-tuning (2e-4) because GRPO uses policy
   * gradient updates which are noisier than supervised loss.
   */
  learningRate: number;

  /**
   * KL divergence coefficient (beta).
   * Controls how much the policy can diverge from the reference model.
   * Higher beta = more conservative updates = less forgetting.
   * DeepSeek-R1 uses 0.04; we match this for stability.
   */
  beta: number;

  /**
   * Group size (G) -- number of completions sampled per prompt.
   * GRPO computes advantages within each group, so larger G gives
   * better advantage estimates but costs more compute.
   * G=8 is the sweet spot for 7B models on single-GPU setups.
   */
  groupSize: number;

  /**
   * Sampling temperature for generation.
   * Lower than typical chat (0.7-1.0) because we want focused code
   * generation, not creative prose. 0.6 balances diversity with quality.
   */
  temperature: number;

  /**
   * Top-p (nucleus sampling) threshold.
   * Combined with temperature=0.6, this constrains the output
   * distribution to high-probability code tokens.
   */
  topP: number;

  /**
   * Maximum completion length in tokens.
   * HoloScript compositions rarely exceed 2048 tokens;
   * 4096 provides headroom for complex multi-object scenes.
   */
  maxCompletionLength: number;

  /**
   * Maximum prompt length in tokens.
   * Ensures prompts don't consume too much context window.
   */
  maxPromptLength: number;

  /**
   * Number of training epochs.
   * Per W.006: "Loss converges in 1-2 epochs." GRPO is even faster
   * because the reward signal is more informative than supervised loss.
   */
  numEpochs: number;

  /**
   * Per-device batch size.
   * Per W.007: micro-batch 8-16 for 7B models.
   */
  perDeviceBatchSize: number;

  /**
   * Gradient accumulation steps.
   * Effective batch = perDeviceBatchSize * gradientAccumulationSteps.
   * Per W.007: accumulation 2-4 for effective batch 32-512.
   */
  gradientAccumulationSteps: number;

  /**
   * Maximum gradient norm for clipping.
   * Prevents training instability from large reward variance.
   */
  maxGradNorm: number;

  /**
   * Weight decay coefficient.
   * Mild regularisation to prevent overfitting to reward exploitation.
   */
  weightDecay: number;

  /**
   * Number of reward functions.
   * Must match the number of functions returned by
   * GRPORewardOrchestrator.getRewardFuncsArray().
   */
  numRewardFunctions: number;
}

/** vLLM configuration for efficient generation */
export interface VLLMConfig {
  /**
   * vLLM execution mode.
   * "colocate" runs vLLM on the same GPU as training (memory-efficient).
   * "offload" uses a separate GPU for generation.
   */
  mode: 'colocate' | 'offload';

  /**
   * Enable vLLM sleep mode between generation phases.
   * When true, vLLM frees GPU memory during the training phase,
   * allowing the full GPU to be used for gradient computation.
   * Critical for single-GPU setups with 7B+ models.
   */
  enableSleepMode: boolean;

  /**
   * GPU memory utilisation for vLLM (0-1).
   * 0.5 = use half the GPU memory for generation, leaving half for training.
   * Only relevant in "colocate" mode.
   */
  gpuMemoryUtilisation: number;

  /**
   * Tensor parallel size for vLLM.
   * 1 = single GPU. Increase for multi-GPU generation.
   */
  tensorParallelSize: number;

  /**
   * Data type for vLLM inference.
   * "bfloat16" is recommended for A100/H100; "float16" for older GPUs.
   */
  dtype: 'bfloat16' | 'float16' | 'auto';

  /**
   * Maximum number of sequences to generate in parallel.
   * Higher = more throughput but more memory.
   */
  maxNumSeqs: number;
}

/** OPLoRA configuration for catastrophic forgetting prevention */
export interface OPLoRAConfig {
  /**
   * Whether to enable OPLoRA.
   * OPLoRA (Orthogonal Projection LoRA) constrains weight updates
   * to the orthogonal complement of the pretrained weight space,
   * preventing catastrophic forgetting of base model capabilities.
   */
  enabled: boolean;

  /**
   * LoRA rank (r).
   * Higher rank = more capacity but more memory and compute.
   * r=16 is a good balance for 7B models.
   */
  rank: number;

  /**
   * LoRA alpha.
   * Scaling factor: effective_lr = alpha / rank * lr.
   * alpha=32 with rank=16 gives scaling factor of 2.
   */
  alpha: number;

  /**
   * LoRA dropout.
   * Regularisation on the low-rank matrices.
   */
  dropout: number;

  /**
   * Target modules for LoRA injection.
   * For most LLMs, applying to attention layers is sufficient.
   */
  targetModules: string[];

  /**
   * Whether to use orthogonal projection.
   * This is the "OP" in OPLoRA -- projects gradient updates
   * onto the null space of pretrained weights.
   */
  useOrthogonalProjection: boolean;
}

/** Training schedule (warmup + cosine decay per W.009) */
export interface TrainingSchedule {
  /**
   * Learning rate scheduler type.
   * Per W.009: "Always use warmup + cosine decay."
   */
  schedulerType: 'cosine' | 'linear' | 'constant';

  /**
   * Warmup ratio (fraction of total steps for warmup).
   * Per W.009: 10% warmup steps.
   */
  warmupRatio: number;

  /**
   * Logging frequency (steps).
   */
  loggingSteps: number;

  /**
   * Checkpoint save frequency (steps).
   */
  saveSteps: number;

  /**
   * Evaluation frequency (steps).
   */
  evalSteps: number;
}

/** Hardware-specific configuration */
export interface HardwareConfig {
  /**
   * Optimizer.
   * Per W.006: Use paged_adamw_8bit (NOT adamw_torch).
   * 8-bit optimizer uses 2x less memory than FP32.
   */
  optimizer: 'paged_adamw_8bit' | 'adamw_torch' | 'adafactor';

  /**
   * Whether to use gradient checkpointing.
   * Trades compute for memory: 30% slower but 60% less memory.
   * Essential for 7B+ models on consumer GPUs.
   */
  gradientCheckpointing: boolean;

  /**
   * Mixed precision training mode.
   * bf16 preferred on Ampere+ GPUs; fp16 on older hardware.
   */
  mixedPrecision: 'bf16' | 'fp16' | 'no';

  /**
   * Flash Attention 2 support.
   * 2-3x faster attention computation on Ampere+ GPUs.
   */
  flashAttention: boolean;
}

// =============================================================================
// RECOMMENDED CONFIGURATION
// =============================================================================

/**
 * Recommended GRPO training configuration for HoloScript 7B models.
 *
 * Validated against:
 * - DeepSeek-R1 GRPO paper findings
 * - HoloScript training rules W.006, W.007, W.009
 * - Brittney v3 empirical results (920K examples, 83.93% quality)
 *
 * @example
 * ```python
 * # Python usage with TRL GRPOTrainer:
 * from trl import GRPOConfig, GRPOTrainer
 *
 * config = GRPOConfig(
 *     learning_rate=1e-6,
 *     beta=0.04,
 *     num_generations=8,
 *     temperature=0.6,
 *     max_completion_length=4096,
 *     # ... see RECOMMENDED_GRPO_CONFIG for all values
 * )
 * ```
 */
export const RECOMMENDED_GRPO_CONFIG: GRPOTrainingConfig = {
  grpo: {
    learningRate: 1e-6,
    beta: 0.04,
    groupSize: 8,
    temperature: 0.6,
    topP: 0.95,
    maxCompletionLength: 4096,
    maxPromptLength: 1024,
    numEpochs: 2,
    perDeviceBatchSize: 4,
    gradientAccumulationSteps: 4,
    maxGradNorm: 1.0,
    weightDecay: 0.01,
    numRewardFunctions: 5,
  },
  vllm: {
    mode: 'colocate',
    enableSleepMode: true,
    gpuMemoryUtilisation: 0.5,
    tensorParallelSize: 1,
    dtype: 'bfloat16',
    maxNumSeqs: 8,
  },
  oplora: {
    enabled: true,
    rank: 16,
    alpha: 32,
    dropout: 0.05,
    targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    useOrthogonalProjection: true,
  },
  rewardWeights: { ...GRPO_REWARD_WEIGHTS },
  schedule: {
    schedulerType: 'cosine',
    warmupRatio: 0.1,
    loggingSteps: 10,
    saveSteps: 200,
    evalSteps: 100,
  },
  hardware: {
    optimizer: 'paged_adamw_8bit',
    gradientCheckpointing: true,
    mixedPrecision: 'bf16',
    flashAttention: true,
  },
};

// =============================================================================
// CONFIG BUILDER
// =============================================================================

/**
 * Build a GRPOTrainingConfig with custom overrides.
 *
 * Deeply merges overrides into the recommended defaults.
 *
 * @example
 * ```ts
 * const config = buildGRPOConfig({
 *   grpo: { learningRate: 5e-7, groupSize: 16 },
 *   hardware: { mixedPrecision: 'fp16' },
 * });
 * ```
 */
export function buildGRPOConfig(
  overrides: DeepPartial<GRPOTrainingConfig> = {}
): GRPOTrainingConfig {
  return {
    grpo: { ...RECOMMENDED_GRPO_CONFIG.grpo, ...overrides.grpo },
    vllm: { ...RECOMMENDED_GRPO_CONFIG.vllm, ...overrides.vllm },
    // @ts-ignore - Automatic remediation for TS2322
    oplora: { ...RECOMMENDED_GRPO_CONFIG.oplora, ...overrides.oplora },
    rewardWeights: {
      ...RECOMMENDED_GRPO_CONFIG.rewardWeights,
      ...overrides.rewardWeights,
    },
    schedule: { ...RECOMMENDED_GRPO_CONFIG.schedule, ...overrides.schedule },
    hardware: { ...RECOMMENDED_GRPO_CONFIG.hardware, ...overrides.hardware },
  };
}

/**
 * Export the config as a Python-compatible dictionary string.
 *
 * This can be used to generate a Python config file for TRL GRPOTrainer.
 */
export function exportGRPOConfigAsPython(config: GRPOTrainingConfig): string {
  const lines: string[] = [
    '"""',
    'GRPO Training Configuration for HoloScript',
    'Auto-generated from GRPOConfig.ts',
    '"""',
    '',
    'from trl import GRPOConfig',
    'from peft import LoraConfig',
    '',
    '# Core GRPO configuration',
    'grpo_config = GRPOConfig(',
    `    learning_rate=${config.grpo.learningRate},`,
    `    beta=${config.grpo.beta},`,
    `    num_generations=${config.grpo.groupSize},`,
    `    temperature=${config.grpo.temperature},`,
    `    top_p=${config.grpo.topP},`,
    `    max_completion_length=${config.grpo.maxCompletionLength},`,
    `    max_prompt_length=${config.grpo.maxPromptLength},`,
    `    num_train_epochs=${config.grpo.numEpochs},`,
    `    per_device_train_batch_size=${config.grpo.perDeviceBatchSize},`,
    `    gradient_accumulation_steps=${config.grpo.gradientAccumulationSteps},`,
    `    max_grad_norm=${config.grpo.maxGradNorm},`,
    `    weight_decay=${config.grpo.weightDecay},`,
    `    # vLLM settings`,
    `    use_vllm=${config.vllm.mode === 'colocate' ? 'True' : 'False'},`,
    `    vllm_mode="${config.vllm.mode}",`,
    `    vllm_gpu_memory_utilization=${config.vllm.gpuMemoryUtilisation},`,
    `    vllm_enable_sleep_mode=${config.vllm.enableSleepMode ? 'True' : 'False'},`,
    `    vllm_dtype="${config.vllm.dtype}",`,
    `    vllm_max_num_seqs=${config.vllm.maxNumSeqs},`,
    `    # Schedule`,
    `    lr_scheduler_type="${config.schedule.schedulerType}",`,
    `    warmup_ratio=${config.schedule.warmupRatio},`,
    `    logging_steps=${config.schedule.loggingSteps},`,
    `    save_steps=${config.schedule.saveSteps},`,
    `    eval_steps=${config.schedule.evalSteps},`,
    `    # Hardware`,
    `    optim="${config.hardware.optimizer}",`,
    `    gradient_checkpointing=${config.hardware.gradientCheckpointing ? 'True' : 'False'},`,
    `    bf16=${config.hardware.mixedPrecision === 'bf16' ? 'True' : 'False'},`,
    `    fp16=${config.hardware.mixedPrecision === 'fp16' ? 'True' : 'False'},`,
    ')',
    '',
  ];

  if (config.oplora.enabled) {
    lines.push(
      '# OPLoRA configuration for catastrophic forgetting prevention',
      'lora_config = LoraConfig(',
      `    r=${config.oplora.rank},`,
      `    lora_alpha=${config.oplora.alpha},`,
      `    lora_dropout=${config.oplora.dropout},`,
      `    target_modules=${JSON.stringify(config.oplora.targetModules)},`,
      '    bias="none",',
      '    task_type="CAUSAL_LM",',
      ')',
      ''
    );
  }

  lines.push(
    '# Reward function weights',
    'REWARD_WEIGHTS = {',
    `    "test_pass": ${config.rewardWeights.testPassReward},`,
    `    "type_check": ${config.rewardWeights.typeCheckReward},`,
    `    "lint": ${config.rewardWeights.lintReward},`,
    `    "coverage": ${config.rewardWeights.coverageReward},`,
    `    "circuit_breaker": ${config.rewardWeights.circuitBreakerReward},`,
    '}'
  );

  return lines.join('\n');
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Deep partial utility type for nested config overrides */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
