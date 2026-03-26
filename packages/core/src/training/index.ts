/**
 * Training Data Pipeline
 *
 * Generates labeled spatial reasoning training examples from
 * HoloScript compositions with spatial constraints, monitors
 * SNN sparsity for energy-efficient neural computation, and provides
 * training data optimization via SoftDedup and LR scheduling.
 *
 * Pipeline order (per training rules):
 *   Quality Filter (W.010) -> Hard Dedup (W.004) -> SoftDedup (W.008) -> Training
 *
 * @module training
 */

export {
  SpatialTrainingDataGenerator,
  createSpatialTrainingDataGenerator,
} from './SpatialTrainingDataGenerator';

export type {
  SpatialDifficulty,
  SpatialRelationshipType,
  SceneObject,
  SpatialRelationship,
  SpatialScene,
  SpatialTrainingExample,
  SpatialGeneratorConfig,
  SpatialGeneratorStats,
  SpatialTrainingJSONLEntry,
  SpatialRelationshipParams,
} from './SpatialTrainingDataTypes';

export { SparsityMonitor, createSparsityMonitor } from './SparsityMonitor';

export type { LayerActivityInput } from './SparsityMonitor';

export type {
  SNNLayerMetrics,
  SparsitySnapshot,
  EnergyEfficiencyMetrics,
  SparsityViolation,
  SparsityMonitorConfig,
  SparsityMonitorStats,
  SparsityQualityHistoryEntry,
} from './SparsityMonitorTypes';

// SoftDedup (W.008): N-gram commonness-based reweighting
export { SoftDedup, createSoftDedup, DEFAULT_SOFTDEDUP_CONFIG } from './SoftDedup';

export type { SoftDedupConfig, SoftDedupResult, NgramStats, SoftDedupStats } from './SoftDedup';

// LR Scheduler (W.009): Warmup + cosine decay
export {
  LRScheduler,
  createSFTScheduler,
  createGRPOScheduler,
  DEFAULT_LR_SCHEDULER_CONFIG,
  GRPO_LR_SCHEDULER_CONFIG,
} from './LRScheduler';

export type { LRSchedulerConfig, LRSchedulerSnapshot, LRScheduleStats } from './LRScheduler';

// Unified Training Pipeline Configuration
export {
  DEFAULT_TRAINING_PIPELINE_CONFIG,
  buildTrainingPipelineConfig,
  computeTotalSteps,
} from './TrainingPipelineConfig';

export type {
  TrainingPipelineConfig,
  TrainingHyperparameters,
  PipelineSettings,
} from './TrainingPipelineConfig';

// Quality Scoring Pipeline
export { QualityScoringPipeline, DEFAULT_SCORING_CONFIG } from './QualityScoringPipeline';

export type { QualityScore, QualityDetail, QualityScoringConfig } from './QualityScoringPipeline';

// TrainingMonkey Integration: Spatial reasoning data -> Alpaca format pipeline
export {
  TrainingMonkeyIntegration,
  createTrainingMonkeyIntegration,
  DEFAULT_INTEGRATION_CONFIG,
} from './trainingmonkey';

export type {
  AlpacaEntry,
  WeightedAlpacaEntry,
  DatasetSplit,
  SplitStats,
  TrainingMonkeyConfig,
  TrainingMonkeyIntegrationConfig,
  IntegrationResult,
} from './trainingmonkey';

// ============================================================================
// Canonical Training Constants (Gap 1: Extracted from TrainingMonkey)
// ============================================================================

// Constants (zero-dependency module)
export {
  TRAINING_CATEGORIES,
  DIFFICULTY_LEVELS,
  QUALITY_THRESHOLDS,
  DEFAULT_GENERATOR_THRESHOLDS,
  RULEFORGE_DOMAINS,
  getQualityTier,
  isValidCategory,
  isValidDifficulty,
  type TrainingCategory,
  type DifficultyLevel,
  type QualityTier,
  type RuleForgeDomain,
} from './constants';

// Training Data Schema (JSONL-compatible)
export {
  validateTrainingExample,
  type TrainingExample,
  type TrainingExampleMetadata,
  type TrainingQualityScore,
  type TrainingValidationResult,
  type TrainingValidationError,
  type CompressionResult as TrainingCompressionResult,
  type GeneratorMetrics,
} from './schema';

// Trait Mappings (TM <-> HS)
export {
  TM_REGISTERED_TRAITS,
  validateTraitName,
  generateValidationReport,
  type TrainingMetadata,
  type TraitMapping,
  type TraitValidationReport,
} from './trait-mappings';
