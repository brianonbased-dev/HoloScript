/**
 * TrainingPipelineConfig - Unified Training Pipeline Configuration
 *
 * Integrates all training pipeline components:
 * - Quality Scoring (W.010): Multi-dimensional quality filtering
 * - Hard Dedup (W.004): Exact/near-duplicate removal (external)
 * - SoftDedup (W.008): N-gram commonness-based reweighting
 * - LR Schedule (W.009): Warmup + cosine decay
 * - Hyperparameters (W.006, W.007): Learning rate, batch size, epochs
 *
 * Pipeline order: Quality Filter -> Hard Dedup -> SoftDedup -> Training
 *
 * @module training/TrainingPipelineConfig
 */

import type { SoftDedupConfig } from './SoftDedup';
import type { LRSchedulerConfig } from './LRScheduler';
import type { QualityScoringConfig } from './QualityScoringPipeline';
import { DEFAULT_SOFTDEDUP_CONFIG } from './SoftDedup';
import { DEFAULT_LR_SCHEDULER_CONFIG } from './LRScheduler';
import { DEFAULT_SCORING_CONFIG } from './QualityScoringPipeline';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Complete training pipeline configuration.
 *
 * Encompasses all stages from data preparation through training execution.
 */
export interface TrainingPipelineConfig {
  /** Data quality filtering configuration (W.010) */
  qualityScoring: QualityScoringConfig;

  /** Soft deduplication configuration (W.008) */
  softDedup: SoftDedupConfig;

  /** Learning rate schedule configuration (W.009) */
  lrSchedule: LRSchedulerConfig;

  /** Core training hyperparameters (W.006, W.007) */
  hyperparameters: TrainingHyperparameters;

  /** Pipeline-level settings */
  pipeline: PipelineSettings;
}

/**
 * Core training hyperparameters per W.006 and W.007.
 */
export interface TrainingHyperparameters {
  /**
   * Base learning rate.
   * Per W.006: 2e-4 for SFT (NOT 2e-5).
   */
  learningRate: number;

  /**
   * Number of training epochs.
   * Per W.006: 2 epochs (NOT 3). "Loss converges in 1-2 epochs."
   */
  epochs: number;

  /**
   * Optimizer.
   * Per W.006: paged_adamw_8bit (NOT adamw_torch).
   */
  optimizer: 'paged_adamw_8bit' | 'adamw_torch' | 'adafactor';

  /**
   * Micro-batch size per device.
   * Per W.007: 8-16 for 7B models.
   */
  microBatchSize: number;

  /**
   * Gradient accumulation steps.
   * Per W.007: 2-4 steps for effective batch 32-512.
   */
  gradientAccumulationSteps: number;

  /**
   * Maximum gradient norm for clipping.
   */
  maxGradNorm: number;

  /**
   * Weight decay coefficient.
   */
  weightDecay: number;
}

/**
 * Pipeline-level settings controlling the data preparation flow.
 */
export interface PipelineSettings {
  /**
   * Whether to apply quality scoring filter before training.
   * Per W.010: Apply BEFORE deduplication to avoid wasting compute on junk.
   */
  enableQualityFilter: boolean;

  /**
   * Whether to apply SoftDedup after hard dedup.
   * Per W.008: Apply AFTER hard dedup (W.004), not instead of it.
   */
  enableSoftDedup: boolean;

  /**
   * Whether to use the LR scheduler (warmup + cosine decay).
   * Per W.009: Always use.
   */
  enableLRSchedule: boolean;

  /**
   * Seed for reproducibility.
   */
  seed?: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default training pipeline configuration.
 *
 * Implements the full optimization pipeline:
 * - Quality Filter (W.010) -> Hard Dedup (W.004) -> SoftDedup (W.008)
 * - LR Schedule: warmup 10% + cosine decay (W.009)
 * - Hyperparameters: LR=2e-4, epochs=2, paged_adamw_8bit (W.006)
 * - Batch: micro=8, accumulation=4, effective=32 (W.007)
 */
export const DEFAULT_TRAINING_PIPELINE_CONFIG: TrainingPipelineConfig = {
  qualityScoring: DEFAULT_SCORING_CONFIG,
  softDedup: DEFAULT_SOFTDEDUP_CONFIG,
  lrSchedule: DEFAULT_LR_SCHEDULER_CONFIG,
  hyperparameters: {
    learningRate: 2e-4,
    epochs: 2,
    optimizer: 'paged_adamw_8bit',
    microBatchSize: 8,
    gradientAccumulationSteps: 4,
    maxGradNorm: 1.0,
    weightDecay: 0.01,
  },
  pipeline: {
    enableQualityFilter: true,
    enableSoftDedup: true,
    enableLRSchedule: true,
  },
};

// =============================================================================
// CONFIG BUILDER
// =============================================================================

/** Deep partial utility type */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Build a TrainingPipelineConfig with custom overrides.
 *
 * @example
 * ```ts
 * const config = buildTrainingPipelineConfig({
 *   hyperparameters: { learningRate: 1e-4, epochs: 3 },
 *   softDedup: { temperature: 0.5 },
 *   lrSchedule: { totalSteps: 5000 },
 * });
 * ```
 */
export function buildTrainingPipelineConfig(
  overrides: DeepPartial<TrainingPipelineConfig> = {},
): TrainingPipelineConfig {
  return {
    qualityScoring: {
      ...DEFAULT_TRAINING_PIPELINE_CONFIG.qualityScoring,
      ...(overrides.qualityScoring as Partial<QualityScoringConfig> | undefined),
    },
    softDedup: {
      ...DEFAULT_TRAINING_PIPELINE_CONFIG.softDedup,
      ...(overrides.softDedup as Partial<SoftDedupConfig> | undefined),
    },
    lrSchedule: {
      ...DEFAULT_TRAINING_PIPELINE_CONFIG.lrSchedule,
      ...(overrides.lrSchedule as Partial<LRSchedulerConfig> | undefined),
    },
    hyperparameters: {
      ...DEFAULT_TRAINING_PIPELINE_CONFIG.hyperparameters,
      ...(overrides.hyperparameters as Partial<TrainingHyperparameters> | undefined),
    },
    pipeline: {
      ...DEFAULT_TRAINING_PIPELINE_CONFIG.pipeline,
      ...(overrides.pipeline as Partial<PipelineSettings> | undefined),
    },
  };
}

/**
 * Compute the total training steps from dataset size and hyperparameters.
 *
 * @param datasetSize - Number of training examples (after dedup)
 * @param config - Training pipeline configuration
 * @returns Total number of training steps
 */
export function computeTotalSteps(
  datasetSize: number,
  config: TrainingPipelineConfig,
): number {
  const { microBatchSize, gradientAccumulationSteps, epochs } =
    config.hyperparameters;
  const effectiveBatchSize = microBatchSize * gradientAccumulationSteps;
  const stepsPerEpoch = Math.ceil(datasetSize / effectiveBatchSize);
  return stepsPerEpoch * epochs;
}
