/**
 * @holoscript/core - Prometheus Metrics Registry
 *
 * Structured metrics collection with Prometheus exposition text format output.
 * Supports counters, gauges, and histograms. Auto-records from
 * TelemetryCollector events when linked.
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import type { TelemetryCollector } from './TelemetryCollector';

// =============================================================================
// TYPES
// =============================================================================

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricLabels {
  [key: string]: string;
}

interface CounterMetric {
  type: 'counter';
  help: string;
  values: Map<string, number>; // serializedLabels -> value
  labels: Map<string, MetricLabels>;
}

interface GaugeMetric {
  type: 'gauge';
  help: string;
  values: Map<string, number>;
  labels: Map<string, MetricLabels>;
}

interface HistogramMetric {
  type: 'histogram';
  help: string;
  buckets: number[];
  observations: Map<string, { bucketCounts: number[]; sum: number; count: number }>;
  labels: Map<string, MetricLabels>;
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

// =============================================================================
// PROMETHEUS METRICS REGISTRY
// =============================================================================

export class PrometheusMetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private prefix: string;

  constructor(prefix: string = 'holoscript') {
    this.prefix = prefix;
  }

  // ===========================================================================
  // COUNTER OPERATIONS
  // ===========================================================================

  /**
   * Register a counter metric.
   */
  registerCounter(name: string, help: string): void {
    const fullName = `${this.prefix}_${name}`;
    if (this.metrics.has(fullName)) return;
    this.metrics.set(fullName, {
      type: 'counter',
      help,
      values: new Map([['', 0]]),
      labels: new Map([['', {}]]),
    });
  }

  /**
   * Increment a counter.
   */
  incCounter(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== 'counter') return;

    const key = this.serializeLabels(labels);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current + value);
    metric.labels.set(key, labels);
  }

  // ===========================================================================
  // GAUGE OPERATIONS
  // ===========================================================================

  /**
   * Register a gauge metric.
   */
  registerGauge(name: string, help: string): void {
    const fullName = `${this.prefix}_${name}`;
    if (this.metrics.has(fullName)) return;
    this.metrics.set(fullName, {
      type: 'gauge',
      help,
      values: new Map([['', 0]]),
      labels: new Map([['', {}]]),
    });
  }

  /**
   * Set a gauge value.
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== 'gauge') return;

    const key = this.serializeLabels(labels);
    metric.values.set(key, value);
    metric.labels.set(key, labels);
  }

  /**
   * Increment a gauge.
   */
  incGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== 'gauge') return;

    const key = this.serializeLabels(labels);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current + value);
    metric.labels.set(key, labels);
  }

  /**
   * Decrement a gauge.
   */
  decGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    this.incGauge(name, labels, -value);
  }

  // ===========================================================================
  // HISTOGRAM OPERATIONS
  // ===========================================================================

  /**
   * Register a histogram metric with custom buckets.
   */
  registerHistogram(
    name: string,
    help: string,
    buckets: number[] = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
  ): void {
    const fullName = `${this.prefix}_${name}`;
    if (this.metrics.has(fullName)) return;
    const sortedBuckets = [...buckets].sort((a, b) => a - b);
    this.metrics.set(fullName, {
      type: 'histogram',
      help,
      buckets: sortedBuckets,
      observations: new Map(),
      labels: new Map(),
    });
  }

  /**
   * Observe a value for a histogram.
   */
  observe(name: string, value: number, labels: MetricLabels = {}): void {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== 'histogram') return;

    const key = this.serializeLabels(labels);
    metric.labels.set(key, labels);

    let obs = metric.observations.get(key);
    if (!obs) {
      obs = {
        bucketCounts: new Array(metric.buckets.length + 1).fill(0), // +1 for +Inf
        sum: 0,
        count: 0,
      };
      metric.observations.set(key, obs);
    }

    obs.sum += value;
    obs.count += 1;

    // Increment all bucket counts where value <= bucket bound
    for (let i = 0; i < metric.buckets.length; i++) {
      if (value <= metric.buckets[i]) {
        obs.bucketCounts[i]++;
      }
    }
    // +Inf bucket always incremented
    obs.bucketCounts[metric.buckets.length]++;
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get the current value of a counter or gauge.
   */
  getValue(name: string, labels: MetricLabels = {}): number | undefined {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type === 'histogram') return undefined;
    return metric.values.get(this.serializeLabels(labels));
  }

  /**
   * Get histogram observation data.
   */
  getHistogram(
    name: string,
    labels: MetricLabels = {}
  ): { bucketCounts: number[]; sum: number; count: number } | undefined {
    const fullName = `${this.prefix}_${name}`;
    const metric = this.metrics.get(fullName);
    if (!metric || metric.type !== 'histogram') return undefined;
    return metric.observations.get(this.serializeLabels(labels));
  }

  /**
   * Get all registered metric names.
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  // ===========================================================================
  // PROMETHEUS EXPOSITION FORMAT
  // ===========================================================================

  /**
   * Serialize all metrics to Prometheus exposition text format.
   */
  toPrometheusText(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);

      if (metric.type === 'counter' || metric.type === 'gauge') {
        for (const [key, value] of metric.values) {
          const labelStr = this.formatLabels(metric.labels.get(key) ?? {});
          lines.push(`${name}${labelStr} ${value}`);
        }
      } else if (metric.type === 'histogram') {
        for (const [key, obs] of metric.observations) {
          const baseLabels = metric.labels.get(key) ?? {};

          for (let i = 0; i < metric.buckets.length; i++) {
            const bucketLabels = { ...baseLabels, le: String(metric.buckets[i]) };
            lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${obs.bucketCounts[i]}`);
          }

          // +Inf bucket
          const infLabels = { ...baseLabels, le: '+Inf' };
          lines.push(
            `${name}_bucket${this.formatLabels(infLabels)} ${obs.bucketCounts[metric.buckets.length]}`
          );

          const labelStr = this.formatLabels(baseLabels);
          lines.push(`${name}_sum${labelStr} ${obs.sum}`);
          lines.push(`${name}_count${labelStr} ${obs.count}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // TELEMETRY INTEGRATION
  // ===========================================================================

  /**
   * Link to a TelemetryCollector and auto-record metrics from events.
   *
   * Registers default metrics and listens for span/event emissions.
   */
  linkTelemetry(collector: TelemetryCollector): void {
    // Register default metrics
    this.registerCounter('delegation_total', 'Total task delegations');
    this.registerCounter('delegation_errors_total', 'Total delegation errors');
    this.registerGauge('active_spans', 'Currently active trace spans');
    this.registerGauge('registry_size', 'Number of registered agents');
    this.registerHistogram(
      'delegation_duration_ms',
      'Duration of task delegations in milliseconds',
      [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
    );
    this.registerCounter('events_total', 'Total telemetry events recorded');
    this.registerCounter('spans_total', 'Total trace spans created');
    this.registerGauge('buffer_size', 'Current telemetry event buffer size');

    // Listen for events
    collector.on('event', (event: { type: string; agentId: string; severity: string }) => {
      this.incCounter('events_total', { type: event.type, agent: event.agentId });

      if (event.type === 'task_completed') {
        this.incCounter('delegation_total', { status: 'completed' });
      } else if (event.type === 'task_failed') {
        this.incCounter('delegation_total', { status: 'failed' });
        this.incCounter('delegation_errors_total', { agent: event.agentId });
      }
    });

    collector.on('spanStart', () => {
      this.incCounter('spans_total');
      this.incGauge('active_spans');
    });

    collector.on('spanEnd', (span: { duration: number }) => {
      this.decGauge('active_spans');
      this.observe('delegation_duration_ms', span.duration);
    });
  }

  // ===========================================================================
  // RESET
  // ===========================================================================

  /**
   * Reset all metrics to zero/initial state.
   */
  reset(): void {
    this.metrics.clear();
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private serializeLabels(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '';
    return keys.map((k) => `${k}=${labels[k]}`).join(',');
  }

  private formatLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const inner = entries.map(([k, v]) => `${k}="${this.escapeValue(v)}"`).join(',');
    return `{${inner}}`;
  }

  private escapeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultRegistry: PrometheusMetricsRegistry | null = null;

/**
 * Get or create the default PrometheusMetricsRegistry instance.
 */
export function getPrometheusMetrics(prefix?: string): PrometheusMetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PrometheusMetricsRegistry(prefix);
  }
  return defaultRegistry;
}

/**
 * Reset the default metrics registry (for testing).
 */
export function resetPrometheusMetrics(): void {
  if (defaultRegistry) {
    defaultRegistry.reset();
  }
  defaultRegistry = null;
}
