/**
 * Analytics & Observability Traits
 *
 * Trait names for scene performance metrics, user engagement tracking,
 * A/B testing, OpenTelemetry trace export, and real-time dashboard pipelines.
 *
 * @version 1.0.0
 */
export const ANALYTICS_OBSERVABILITY_TRAITS = [
  // Scene performance metrics collection
  'analytics',
  'perf_monitor',
  'frame_profiler',

  // A/B testing framework
  'abtest',
  'ab_variant',
  'experiment',

  // User engagement (privacy-respecting)
  'engagement_tracker',
  'session_monitor',
  'interaction_heatmap',
  'scene_completion',

  // OpenTelemetry-compatible observability
  'otel_trace',
  'otel_span',
  'otel_metric',

  // Real-time metrics dashboard pipeline
  'metrics_dashboard',
  'metrics_sink',
  'metrics_aggregator',
] as const;

export type AnalyticsObservabilityTraitName =
  (typeof ANALYTICS_OBSERVABILITY_TRAITS)[number];
