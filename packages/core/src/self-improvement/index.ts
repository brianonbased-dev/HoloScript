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
