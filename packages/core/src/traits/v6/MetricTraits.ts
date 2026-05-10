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

// ── Metric Adapter ─────────────────────────────────────────────────────────────

class MetricAdapter {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private labels = new Map<string, Record<string, string>>();

  increment(name: string, value = 1, lbls?: Record<string, string>) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
    if (lbls) this.labels.set(`counter:${name}`, lbls);
  }

  gauge(name: string, value: number, lbls?: Record<string, string>) {
    this.gauges.set(name, value);
    if (lbls) this.labels.set(`gauge:${name}`, lbls);
  }

  observe(name: string, value: number, lbls?: Record<string, string>) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name)!.push(value);
    if (lbls) this.labels.set(`histogram:${name}`, lbls);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, vals]) => {
          const count = vals.length;
          const sum = vals.reduce((a, b) => a + b, 0);
          return [name, { count, sum, avg: count ? sum / count : 0, max: count ? Math.max(...vals) : 0 }];
        })
      ),
      labels: Object.fromEntries(this.labels),
    };
  }
}

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

interface MetricState {
  adapter: MetricAdapter;
  config: MetricConfig;
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
  onAttach(node: HSPlusNode, config: MetricConfig, context: TraitContext) {
    const adapter = new MetricAdapter();
    node.__metricState = { adapter, config };
    context.emit?.('metric_attached', {
      nodeId: node.id,
      name: config.name,
      type: config.type,
      description: config.description,
    });
  },
  onDetach(node: HSPlusNode, _config: MetricConfig, context: TraitContext) {
    const state = node.__metricState as MetricState | undefined;
    if (!state) return;
    const snapshot = state.adapter.snapshot();
    context.emit?.('metric_detached', { nodeId: node.id, snapshot });
    delete node.__metricState;
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

interface TraceState {
  config: TraceConfig;
  spans: Array<{ name: string; start: number; attributes: Record<string, unknown> }>;
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
  onAttach(node: HSPlusNode, config: TraceConfig, context: TraitContext) {
    node.__traceState = { config, spans: [] };
    context.emit?.('trace_attached', { nodeId: node.id, service: config.service, sampler: config.sampler });
  },
  onDetach(node: HSPlusNode, _config: TraceConfig, context: TraitContext) {
    const state = node.__traceState as TraceState | undefined;
    if (!state) return;
    context.emit?.('trace_detached', { nodeId: node.id, spanCount: state.spans.length });
    delete node.__traceState;
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

interface LogState {
  config: LogConfig;
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

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
  onAttach(node: HSPlusNode, config: LogConfig, context: TraitContext) {
    const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
      if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.level]) return;
      const entry = {
        logger: config.name || node.id,
        level,
        message,
        ...config.fields,
        ...meta,
        timestamp: new Date().toISOString(),
      };
      context.emit?.('log_entry', entry);
      // Fallback to console for visibility during development
      if (config.destination === 'stdout') {
        // eslint-disable-next-line no-console
        console.log(`[${entry.logger}] ${level}: ${message}`, meta ?? '');
      }
    };
    node.__logState = { config, log };
    context.emit?.('log_attached', { nodeId: node.id, name: config.name, level: config.level });
  },
  onDetach(node: HSPlusNode, _config: LogConfig, context: TraitContext) {
    const state = node.__logState as LogState | undefined;
    if (!state) return;
    context.emit?.('log_detached', { nodeId: node.id });
    delete node.__logState;
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

interface HealthCheckState {
  config: HealthCheckConfig;
  registry: Map<string, () => { healthy: boolean; message?: string }>;
  results: Map<string, { healthy: boolean; message?: string; checkedAt: number }>;
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
  onAttach(node: HSPlusNode, config: HealthCheckConfig, context: TraitContext) {
    node.__healthCheckState = {
      config,
      registry: new Map(),
      results: new Map(),
    };
    context.emit?.('health_check_attached', {
      nodeId: node.id,
      path: config.path,
      interval: config.interval,
      probeType: config.probe_type,
    });
  },
  onDetach(node: HSPlusNode, _config: HealthCheckConfig, context: TraitContext) {
    const state = node.__healthCheckState as HealthCheckState | undefined;
    if (!state) return;
    const snapshot = Object.fromEntries(state.results);
    context.emit?.('health_check_detached', { nodeId: node.id, results: snapshot });
    delete node.__healthCheckState;
  },
};
