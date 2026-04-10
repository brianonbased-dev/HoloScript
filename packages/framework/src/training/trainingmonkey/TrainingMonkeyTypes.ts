/**
 * TrainingMonkey Integration Types
 *
 * Type definitions for integrating HoloScript spatial reasoning training data
 * with the TrainingMonkey fine-tuning pipeline. Converts from the internal
 * SpatialTrainingJSONLEntry format to TrainingMonkey's Alpaca-style format
 * with SoftDedup (W.008) n-gram reweighting and train/validation splits.
 *
 * @module training/trainingmonkey/TrainingMonkeyTypes
 */

// =============================================================================
// ALPACA FORMAT (TrainingMonkey's Expected Input)
// =============================================================================

/**
 * Alpaca instruction-following format used by TrainingMonkey.
 *
 * TrainingMonkey's train_v43.py reads:
 *   - example.get("instruction", "")
 *   - example.get("output", "")
 *
 * The optional `input` field provides additional context (e.g., HoloScript scene).
 */
export interface AlpacaEntry {
  /** The instruction/question for the model */
  instruction: string;

  /** Optional additional input context (HoloScript scene source) */
  input: string;

  /** The expected output/response from the model */
  output: string;
}

/**
 * Extended Alpaca entry with SoftDedup sampling weight and metadata.
 * Used for weighted sampling during training.
 */
export interface WeightedAlpacaEntry extends AlpacaEntry {
  /** SoftDedup sampling weight (0.1 to 1.0). Higher = more likely to be sampled */
  sampling_weight: number;

  /** Original metadata preserved from the spatial reasoning dataset */
  metadata?: {
    id: string;
    relationship_type: string;
    is_positive: boolean;
    difficulty: string;
    tags: string[];
  };
}

// =============================================================================
// DATASET SPLIT RESULT
// =============================================================================

/**
 * Result of splitting a dataset into train/validation sets.
 */
export interface DatasetSplit {
  /** Training set entries */
  train: WeightedAlpacaEntry[];

  /** Validation set entries */
  validation: WeightedAlpacaEntry[];

  /** Split statistics */
  stats: SplitStats;
}

/**
 * Statistics about a train/validation split.
 */
export interface SplitStats {
  /** Total examples before split */
  totalExamples: number;

  /** Number of training examples */
  trainCount: number;

  /** Number of validation examples */
  validationCount: number;

  /** Actual train ratio (trainCount / totalExamples) */
  trainRatio: number;

  /** Actual validation ratio (validationCount / totalExamples) */
  validationRatio: number;

  /** Whether the split is stratified by difficulty/relationship type */
  stratified: boolean;
}

// =============================================================================
// TRAINING CONFIG OUTPUT
// =============================================================================

/**
 * TrainingMonkey-compatible training configuration.
 * Generated alongside the dataset for direct use with train_v43.py.
 */
export interface TrainingMonkeyConfig {
  /** Model configuration */
  model: {
    /** Model identifier (e.g., "qwen7b", "phi35") */
    name: string;
    /** Maximum sequence length */
    maxSeqLength: number;
  };

  /** Training hyperparameters (per W.006) */
  hyperparameters: {
    /** Learning rate. Per W.006: 2e-4 */
    learningRate: number;
    /** Number of epochs. Per W.006: 2 */
    epochs: number;
    /** Optimizer. Per W.006: paged_adamw_8bit */
    optimizer: string;
    /** Micro-batch size per device. Per W.007: 8-16 */
    microBatchSize: number;
    /** Gradient accumulation steps. Per W.007: 2-4 */
    gradientAccumulationSteps: number;
    /** Maximum gradient norm for clipping */
    maxGradNorm: number;
    /** Weight decay coefficient */
    weightDecay: number;
  };

  /** LR schedule (per W.009) */
  lrSchedule: {
    /** Warmup ratio (10% of total steps) */
    warmupRatio: number;
    /** Schedule type */
    type: 'cosine';
  };

  /** Dataset paths */
  dataset: {
    /** Path to training JSONL */
    trainPath: string;
    /** Path to validation JSONL */
    validationPath: string;
    /** Number of training examples */
    trainCount: number;
    /** Number of validation examples */
    validationCount: number;
    /** Total computed training steps */
    totalSteps: number;
  };

  /** SoftDedup statistics */
  softDedup: {
    /** Whether SoftDedup was applied */
    applied: boolean;
    /** Mean sampling weight */
    meanWeight: number;
    /** Effective dataset size after reweighting */
    effectiveSize: number;
    /** Reduction ratio */
    reductionRatio: number;
  };
}

// =============================================================================
// INTEGRATION CONFIGURATION
// =============================================================================

/**
 * Configuration for the TrainingMonkey integration pipeline.
 */
export interface TrainingMonkeyIntegrationConfig {
  /** Path to the input JSONL file */
  inputPath: string;

  /** Directory for output files */
  outputDir: string;

  /** Train/validation split ratio (default: 0.9 = 90% train) */
  trainRatio: number;

  /** Random seed for reproducible splits */
  seed: number;

  /** Whether to apply SoftDedup reweighting (default: true) */
  enableSoftDedup: boolean;

  /** Target model name for config generation (default: "qwen7b") */
  modelName: string;

  /** Whether to stratify the split by metadata fields (default: true) */
  stratify: boolean;
}

/**
 * Default configuration for TrainingMonkey integration.
 */
export const DEFAULT_INTEGRATION_CONFIG: TrainingMonkeyIntegrationConfig = {
  inputPath: '',
  outputDir: '',
  trainRatio: 0.9,
  seed: 42,
  enableSoftDedup: true,
  modelName: 'qwen7b',
  stratify: true,
};

// =============================================================================
// PIPELINE RESULT
// =============================================================================

/**
 * Complete result of running the TrainingMonkey integration pipeline.
 */
export interface IntegrationResult {
  /** The dataset split (train/validation) */
  split: DatasetSplit;

  /** Generated training configuration */
  config: TrainingMonkeyConfig;

  /** Serialized train JSONL content */
  trainJsonl: string;

  /** Serialized validation JSONL content */
  validationJsonl: string;

  /** Serialized config JSON content */
  configJson: string;
}
