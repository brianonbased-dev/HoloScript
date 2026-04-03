/**
 * @holoscript/core v6 Universal Metric & Observability Traits
 *
 * Trait handlers for metrics collection, distributed tracing,
 * structured logging, and health monitoring.
 *
 * @example
 * ```hsplus
 * object "Monitoring" {
 *   @metric {
 *     name: "request_duration"
 *     type: "histogram"
 *     buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
 *   }
 *
 *   @trace {
 *     service: "user-api"
 *     sampler: "probabilistic"
 *     sample_rate: 0.1
 *   }
 *
 *   @health_check {
 *     path: "/health"
 *     interval: 30000
 *     checks: ["db", "cache", "queue"]
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Metric Trait ───────────────────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricConfig {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Metric description */
  description: string;
  /** Label names */
  labels: string[];
  /** Histogram buckets (for histogram type) */
  buckets: number[];
  /** Export format */
  export_format: 'prometheus' | 'opentelemetry' | 'statsd' | 'datadog';
  /** Collection interval (ms, for gauge polling) */
  interval: number;
}

export const metricHandler: TraitHandler<MetricConfig> = {
  name: 'metric',
  defaultConfig: {
    name: '',
    type: 'counter',
    description: '',
    labels: [],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    export_format: 'prometheus',
    interval: 0,
  },
  onAttach(_node: HSPlusNode, _config: MetricConfig, _context: TraitContext) {
    // v6 stub: metric registration
  },
};

// ── Trace Trait ────────────────────────────────────────────────────────────────

export type TraceSampler = 'always' | 'never' | 'probabilistic' | 'rate_limiting';

export interface TraceConfig {
  /** Service name for tracing */
  service: string;
  /** Trace sampler strategy */
  sampler: TraceSampler;
  /** Sample rate (0.0 - 1.0, for probabilistic sampler) */
  sample_rate: number;
  /** Trace exporter endpoint */
  exporter_endpoint: string;
  /** Trace exporter format */
  exporter: 'otlp' | 'jaeger' | 'zipkin';
  /** Propagation format */
  propagation: 'w3c' | 'b3' | 'jaeger';
  /** Max attributes per span */
  max_attributes: number;
}

export const traceHandler: TraitHandler<TraceConfig> = {
  name: 'trace',
  defaultConfig: {
    service: '',
    sampler: 'probabilistic',
    sample_rate: 0.1,
    exporter_endpoint: '',
    exporter: 'otlp',
    propagation: 'w3c',
    max_attributes: 128,
  },
  onAttach(_node: HSPlusNode, _config: TraceConfig, _context: TraitContext) {
    // v6 stub: tracing setup
  },
};

// ── Log Trait ──────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogConfig {
  /** Logger name */
  name: string;
  /** Minimum log level */
  level: LogLevel;
  /** Output format */
  format: 'json' | 'text' | 'pretty';
  /** Log destination */
  destination: 'stdout' | 'file' | 'syslog' | 'loki';
  /** Log file path (when destination = file) */
  file_path: string;
  /** Include caller info */
  caller: boolean;
  /** Static fields added to every log entry */
  fields: Record<string, string>;
}

export const logHandler: TraitHandler<LogConfig> = {
  name: 'log',
  defaultConfig: {
    name: '',
    level: 'info',
    format: 'json',
    destination: 'stdout',
    file_path: '',
    caller: false,
    fields: {},
  },
  onAttach(_node: HSPlusNode, _config: LogConfig, _context: TraitContext) {
    // v6 stub: logger setup
  },
};

// ── Health Check Trait ─────────────────────────────────────────────────────────

export interface HealthCheckConfig {
  /** Health endpoint path */
  path: string;
  /** Check interval (ms) */
  interval: number;
  /** Health check timeout (ms) */
  timeout: number;
  /** Dependency checks to include */
  checks: string[];
  /** Readiness vs liveness probe */
  probe_type: 'liveness' | 'readiness' | 'startup';
  /** Failure threshold before marking unhealthy */
  failure_threshold: number;
}

export const healthCheckHandler: TraitHandler<HealthCheckConfig> = {
  name: 'health_check',
  defaultConfig: {
    path: '/health',
    interval: 30000,
    timeout: 5000,
    checks: [],
    probe_type: 'liveness',
    failure_threshold: 3,
  },
  onAttach(_node: HSPlusNode, _config: HealthCheckConfig, _context: TraitContext) {
    // v6 stub: health check endpoint registration
  },
};
