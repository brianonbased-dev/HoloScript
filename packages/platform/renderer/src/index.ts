export {
  AdaptiveFrameRateManager,
  type ThermalState,
  type ThermalThresholds,
  type FrameSample,
  type AdaptiveFrameRateManagerOptions,
  DEFAULT_THRESHOLDS,
} from './AdaptiveFrameRateManager';

export {
  QualityManager,
  type LODPolicy,
  type GaussianBudget,
  type QualityPolicy,
  type RenderFeature,
  DEFAULT_QUALITY_POLICY,
} from './QualityManager';

export {
  HololandRenderer,
  type HololandRendererOptions,
} from './HololandRenderer';

export {
  RenderSafeInferenceReader,
  InferenceIsolationBarrier,
  FrameDeadlineEnforcer,
  InferencePriorityScheduler,
  type InferencePriority,
  type InferenceTask,
  type InferenceResult,
  type InferenceMetrics,
  type RenderSafeInferenceReaderOptions,
  type InferenceIsolationBarrierOptions,
  type FrameDeadlineEnforcerOptions,
  type InferencePrioritySchedulerOptions,
} from './RenderInferenceSeparation';

export {
  VRPerformanceBudget,
  type BudgetCategory,
  type BudgetConfig,
  type BudgetSnapshot,
  type FrameBudgetReport,
  type VRPerformanceBudgetOptions,
  DEFAULT_BUDGET_CONFIG,
} from './VRPerformanceBudget';
