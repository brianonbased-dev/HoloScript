/**
 * MetricsCollector — Aggregates metrics for OpenTelemetry integration.
 *
 * Supports three metric types:
 * - Counter: increment-only cumulative values
 * - Histogram: distribution tracking with percentile computation
 * - Gauge: latest-value point-in-time measurements
 *
 * Exports to Prometheus text format and OTLP JSON format.
 *
 * @module telemetry/MetricsCollector
 */

export interface MetricEntry {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface HistogramStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

interface CounterState {
  type: 'counter';
  value: number;
}

interface HistogramState {
  type: 'histogram';
  values: number[];
}

interface GaugeState {
  type: 'gauge';
  value: number;
}

type MetricState = CounterState | HistogramState | GaugeState;

/**
 * Serialized label key for metric lookup.
 * Format: `metricName{label1="val1",label2="val2"}`
 */
function serializeKey(name: string, labels: Record<string, string>): string {
  const sortedKeys = Object.keys(labels).sort();
  if (sortedKeys.length === 0) return name;
  const labelStr = sortedKeys.map((k) => `${k}="${labels[k]}"`).join(',');
  return `${name}{${labelStr}}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export class MetricsCollector {
  private readonly metrics = new Map<string, MetricState>();
  private readonly metricNames = new Map<string, 'counter' | 'histogram' | 'gauge'>();
  private readonly metricLabels = new Map<string, Record<string, string>>();
  private readonly recorded: MetricEntry[] = [];

  /**
   * Increment a counter metric by the given delta (default 1).
   */
  incrementCounter(name: string, delta = 1, labels: Record<string, string> = {}): void {
    const key = serializeKey(name, labels);
    let state = this.metrics.get(key);
    if (!state) {
      state = { type: 'counter', value: 0 };
      this.metrics.set(key, state);
      this.metricNames.set(key, 'counter');
      this.metricLabels.set(key, labels);
    }
    if (state.type !== 'counter') return;
    state.value += delta;

    this.recorded.push({
      name,
      type: 'counter',
      value: state.value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a value in a histogram metric.
   */
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = serializeKey(name, labels);
    let state = this.metrics.get(key);
    if (!state) {
      state = { type: 'histogram', values: [] };
      this.metrics.set(key, state);
      this.metricNames.set(key, 'histogram');
      this.metricLabels.set(key, labels);
    }
    if (state.type !== 'histogram') return;
    state.values.push(value);

    this.recorded.push({
      name,
      type: 'histogram',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Set a gauge metric to the given value.
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = serializeKey(name, labels);
    let state = this.metrics.get(key);
    if (!state) {
      state = { type: 'gauge', value: 0 };
      this.metrics.set(key, state);
      this.metricNames.set(key, 'gauge');
      this.metricLabels.set(key, labels);
    }
    if (state.type !== 'gauge') return;
    state.value = value;

    this.recorded.push({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Get histogram statistics for a given metric + labels.
   */
  getHistogramStats(name: string, labels: Record<string, string> = {}): HistogramStats | null {
    const key = serializeKey(name, labels);
    const state = this.metrics.get(key);
    if (!state || state.type !== 'histogram' || state.values.length === 0) return null;

    const sorted = [...state.values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
      count: sorted.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    };
  }

  /**
   * Get the current value of a counter metric.
   */
  getCounterValue(name: string, labels: Record<string, string> = {}): number {
    const key = serializeKey(name, labels);
    const state = this.metrics.get(key);
    if (!state || state.type !== 'counter') return 0;
    return state.value;
  }

  /**
   * Get the current value of a gauge metric.
   */
  getGaugeValue(name: string, labels: Record<string, string> = {}): number {
    const key = serializeKey(name, labels);
    const state = this.metrics.get(key);
    if (!state || state.type !== 'gauge') return 0;
    return state.value;
  }

  /**
   * Return all recorded metric entries.
   */
  getAllEntries(): MetricEntry[] {
    return [...this.recorded];
  }

  /**
   * Export metrics in Prometheus text exposition format.
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];
    const processed = new Set<string>();

    for (const [key, state] of this.metrics.entries()) {
      const labels = this.metricLabels.get(key) ?? {};
      const type = this.metricNames.get(key)!;

      // Extract metric name (strip labels suffix)
      const name = key.includes('{') ? key.slice(0, key.indexOf('{')) : key;

      // Write TYPE line once per metric name
      if (!processed.has(name)) {
        const promType =
          type === 'counter' ? 'counter' : type === 'histogram' ? 'histogram' : 'gauge';
        lines.push(`# TYPE ${name} ${promType}`);
        processed.add(name);
      }

      const labelStr =
        Object.keys(labels).length > 0
          ? `{${Object.entries(labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',')}}`
          : '';

      if (state.type === 'counter') {
        lines.push(`${name}${labelStr} ${state.value}`);
      } else if (state.type === 'gauge') {
        lines.push(`${name}${labelStr} ${state.value}`);
      } else if (state.type === 'histogram') {
        const stats = this.getHistogramStats(name, labels);
        if (stats) {
          lines.push(`${name}_count${labelStr} ${stats.count}`);
          lines.push(`${name}_sum${labelStr} ${stats.sum}`);
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.005"}')} ${state.values.filter((v) => v <= 0.005).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.01"}')} ${state.values.filter((v) => v <= 0.01).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.025"}')} ${state.values.filter((v) => v <= 0.025).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.05"}')} ${state.values.filter((v) => v <= 0.05).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.1"}')} ${state.values.filter((v) => v <= 0.1).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.25"}')} ${state.values.filter((v) => v <= 0.25).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="0.5"}')} ${state.values.filter((v) => v <= 0.5).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="1"}')} ${state.values.filter((v) => v <= 1).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="2.5"}')} ${state.values.filter((v) => v <= 2.5).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="5"}')} ${state.values.filter((v) => v <= 5).length}`
          );
          lines.push(
            `${name}_bucket${labelStr.replace('}', ',le="10"}')} ${state.values.filter((v) => v <= 10).length}`
          );
          lines.push(`${name}_bucket${labelStr.replace('}', ',le="+Inf"}')} ${stats.count}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Export metrics in OTLP JSON format for the /v1/metrics endpoint.
   */
  toOTLP(serviceName = 'holoscript'): object {
    const resourceMetrics: object[] = [];
    const scopeMetrics: object[] = [];

    for (const [key, state] of this.metrics.entries()) {
      const labels = this.metricLabels.get(key) ?? {};
      const name = key.includes('{') ? key.slice(0, key.indexOf('{')) : key;
      const attributes = Object.entries(labels).map(([k, v]) => ({
        key: k,
        value: { stringValue: v },
      }));

      if (state.type === 'counter') {
        scopeMetrics.push({
          name,
          sum: {
            dataPoints: [
              {
                attributes,
                asInt: state.value,
                timeUnixNano: String(Date.now() * 1_000_000),
              },
            ],
            aggregationTemporality: 2, // CUMULATIVE
            isMonotonic: true,
          },
        });
      } else if (state.type === 'gauge') {
        scopeMetrics.push({
          name,
          gauge: {
            dataPoints: [
              {
                attributes,
                asDouble: state.value,
                timeUnixNano: String(Date.now() * 1_000_000),
              },
            ],
          },
        });
      } else if (state.type === 'histogram') {
        const sorted = [...state.values].sort((a, b) => a - b);
        const sum = sorted.reduce((s, v) => s + v, 0);
        const boundaries = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
        const bucketCounts = boundaries.map((b) => sorted.filter((v) => v <= b).length);
        bucketCounts.push(sorted.length); // +Inf bucket

        scopeMetrics.push({
          name,
          histogram: {
            dataPoints: [
              {
                attributes,
                count: sorted.length,
                sum,
                bucketCounts,
                explicitBounds: boundaries,
                timeUnixNano: String(Date.now() * 1_000_000),
              },
            ],
            aggregationTemporality: 2, // CUMULATIVE
          },
        });
      }
    }

    resourceMetrics.push({
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
      },
      scopeMetrics: [
        {
          scope: { name: 'holoscript-telemetry', version: '1.0.0' },
          metrics: scopeMetrics,
        },
      ],
    });

    return { resourceMetrics };
  }

  /**
   * Clear all collected metrics.
   */
  reset(): void {
    this.metrics.clear();
    this.metricNames.clear();
    this.metricLabels.clear();
    this.recorded.length = 0;
  }
}
