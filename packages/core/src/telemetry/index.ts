/**
 * Telemetry Module — OpenTelemetry integration for HoloScript.
 *
 * Provides distributed tracing, metric collection, and OTLP export
 * for monitoring HoloScript parse, compile, runtime, and network operations.
 *
 * @module telemetry
 */

// Main telemetry provider
export {
  HoloScriptTelemetry,
  type TelemetryConfig,
  type Span,
  type SpanEvent,
  type Metric,
} from './TelemetryProvider';

// Span factory for creating nested spans
export { SpanFactory, createSpanObject, generateTraceId, generateSpanId } from './SpanFactory';

// Metrics collector with Prometheus and OTLP export
export { MetricsCollector, type MetricEntry, type HistogramStats } from './MetricsCollector';
