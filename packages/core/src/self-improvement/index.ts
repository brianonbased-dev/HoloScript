/**
 * Self-Improvement Module
 *
 * Captures failed HoloScript code generations and converts them
 * into training data for the TrainingMonkey system, creating
 * a self-improving feedback loop.
 *
 * Also provides:
 * - QualityScore: weighted multi-dimensional quality calculation
 * - ConvergenceDetector: detects when improvement has plateaued
 * - SelfImproveCommand: orchestrates absorb -> GraphRAG -> test -> commit loop
 * - GRPORewardFunctions: 5 reward functions for TRL GRPOTrainer
 * - GRPORewardOrchestrator: weighted composite reward with caching and stats
 * - GRPOConfig: recommended hyperparameters for GRPO training
 * - GRPOPromptExtractor: scans monorepo for diverse GRPO training prompts
 * - OPLoRAConfig: extended OPLoRA configuration with validation and Python export
 * - OPLoRAMonitor: tracks benchmark scores, constraint satisfaction, and alerts
 * - ForgettingDetector: sliding-window detection of catastrophic forgetting
 *
 * @module self-improvement
 */

export {
  SelfImprovementPipeline,
  type DifficultyLevel,
  type FailedGeneration,
  type FailureCategory,
  type PipelineConfig,
  type PipelineStats,
  type TrainingExample,
} from './SelfImprovementPipeline';

export {
  calculateQualityScore,
  QUALITY_WEIGHTS,
  type QualityMetrics,
  type QualityDimension,
  type QualityReport,
} from './QualityScore';

export {
  ConvergenceDetector,
  type ConvergenceConfig,
  type ConvergenceStatus,
  type ConvergenceSnapshot,
} from './ConvergenceDetector';

export {
  SelfImproveCommand,
  type SelfImproveIO,
  type SelfImproveConfig,
  type SelfImproveResult,
  type IterationRecord,
  type AbsorbResult,
  type UntestedTarget,
  type GeneratedTest,
  type VitestResult,
  type VitestSuiteResult,
  type LintResult,
} from './SelfImproveCommand';

export {
  SelfImproveHarvester,
  computeRougeL,
  createSyntaxValidatorFromParser,
  type HarvestRecord,
  type HarvestTrainingExample,
  type HarvesterConfig,
  type HarvesterStats,
  type FileWriter,
  type SyntaxValidator,
} from './SelfImproveHarvester';

export {
  FocusedDPOSplitter,
  type ASTSegment,
  type SegmentKind,
  type DPOPair,
  type DPOPairMetadata,
  type DegradationStrategy,
  type FocusedDPOConfig,
  type SplitterStats,
} from './FocusedDPOSplitter';

export {
  createGRPORewardFunctions,
  GRPO_REWARD_WEIGHTS,
  type GRPORewardFunction,
  type RewardFunctionOptions,
  type RewardEvaluation,
  type RewardToolRunner,
} from './GRPORewardFunctions';

export {
  GRPORewardOrchestrator,
  type GRPOOrchestratorConfig,
  type RewardStatistics,
  type RewardFunctionResult,
  type OrchestratorResult,
  type OrchestratorStats,
} from './GRPORewardOrchestrator';

export {
  RECOMMENDED_GRPO_CONFIG,
  buildGRPOConfig,
  exportGRPOConfigAsPython,
  type GRPOTrainingConfig,
  type GRPOHyperparameters,
  type VLLMConfig,
  type OPLoRAConfig,
  type TrainingSchedule,
  type HardwareConfig,
} from './GRPOConfig';

export {
  GRPOPromptExtractor,
  createNodeFS,
  inferDomainTags,
  estimateDifficulty,
  extractPackageName,
  type GRPOPrompt,
  type TRLPromptRecord,
  type PromptExtractorConfig,
  type ExtractionStats,
  type PromptExtractorFS,
  type PromptDifficulty,
  type PromptSource,
  type DomainTag,
} from './GRPOPromptExtractor';

export {
  DEFAULT_OPLORA_CONFIG,
  validateOPLoRAConfig,
  buildOPLoRAConfig,
  exportOPLoRAConfigAsPython,
  type ExtendedOPLoRAConfig,
  type ValidatedOPLoRAConfig,
  type OPLoRAValidationError,
} from './OPLoRAConfig';

export {
  OPLoRAMonitor,
  type BenchmarkName,
  type BenchmarkScore,
  type ModuleWeightRatio,
  type ConstraintSatisfaction,
  type AlertSeverity,
  type MonitorAlert,
  type OPLoRAMonitorConfig,
  type MonitorStats,
  type MonitorSnapshot,
} from './OPLoRAMonitor';

export {
  ForgettingDetector,
  type ForgettingDetectorConfig,
  type ForgettingSeverity,
  type ForgettingResult,
  type AggregateDetectionResult,
} from './ForgettingDetector';
