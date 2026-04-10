/**
 * Profiling Module
 *
 * Provides runtime profiling and performance analysis for HoloScript.
 * Supports Chrome DevTools trace export and performance recommendations.
 */

export {
  Profiler,
  profiler,
  type ProfileSample,
  type ProfileCategory,
  type ProfileResult,
  type MemorySnapshot,
  type ProfileSummary,
  type Hotspot,
  type ChromeTraceEvent,
  type ChromeTrace,
} from './Profiler';

export {
  Analyzer,
  analyzer,
  type Recommendation,
  type RecommendationSeverity,
  type RecommendationCategory,
  type PerformanceBudget,
  type BudgetViolation,
  type TrendData,
  type TrendAnalysis,
  type AnalysisResult,
  type CategoryAnalysis,
} from './Analyzer';
