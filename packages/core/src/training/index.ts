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

export {
  SparsityMonitor,
  createSparsityMonitor,
} from './SparsityMonitor';

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
export {
  SoftDedup,
  createSoftDedup,
  DEFAULT_SOFTDEDUP_CONFIG,
} from './SoftDedup';

export type {
  SoftDedupConfig,
  SoftDedupResult,
  NgramStats,
  SoftDedupStats,
} from './SoftDedup';

// LR Scheduler (W.009): Warmup + cosine decay
export {
  LRScheduler,
  createSFTScheduler,
  createGRPOScheduler,
  DEFAULT_LR_SCHEDULER_CONFIG,
  GRPO_LR_SCHEDULER_CONFIG,
} from './LRScheduler';

export type {
  LRSchedulerConfig,
  LRSchedulerSnapshot,
  LRScheduleStats,
} from './LRScheduler';

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
export {
  QualityScoringPipeline,
  DEFAULT_SCORING_CONFIG,
} from './QualityScoringPipeline';

export type {
  QualityScore,
  QualityDetail,
  QualityScoringConfig,
} from './QualityScoringPipeline';
