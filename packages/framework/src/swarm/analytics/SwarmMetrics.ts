/**
 * SwarmMetrics - Real-time swarm performance metrics
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Collects and aggregates metrics for swarm monitoring
 */

/**
 * Metric value with timestamp
 */
export interface IMetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Histogram buckets
 */
export interface IHistogramBuckets {
  boundaries: number[];
  counts: number[];
  sum: number;
  count: number;
}

/**
 * Summary percentiles
 */
export interface ISummaryPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
  sum: number;
}

/**
 * Metric definition
 */
export interface IMetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels?: string[];
}

/**
 * Aggregated metric stats
 */
export interface IMetricStats {
  name: string;
  type: MetricType;
  currentValue: number;
  min: number;
  max: number;
  avg: number;
  count: number;
  lastUpdate: number;
}

/**
 * SwarmMetrics - Metrics collector for swarm monitoring
 */
export class SwarmMetrics {
  private metrics: Map<string, IMetricDefinition> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, IMetricValue[]> = new Map();
  private histograms: Map<string, IHistogramBuckets> = new Map();
  private summaries: Map<string, number[]> = new Map();
  private retentionPeriod: number;
  private maxSamples: number;

  constructor(config?: {
    retentionPeriod?: number; // ms
    maxSamples?: number;
  }) {
    this.retentionPeriod = config?.retentionPeriod ?? 300000; // 5 minutes
    this.maxSamples = config?.maxSamples ?? 1000;
  }

  /**
   * Register a new metric
   */
  register(definition: IMetricDefinition): void {
    this.metrics.set(definition.name, definition);

    switch (definition.type) {
      case 'counter':
        this.counters.set(definition.name, 0);
        break;
      case 'gauge':
        this.gauges.set(definition.name, []);
        break;
      case 'histogram':
        this.histograms.set(definition.name, {
          boundaries: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
          counts: new Array(10).fill(0),
          sum: 0,
          count: 0,
        });
        break;
      case 'summary':
        this.summaries.set(definition.name, []);
        break;
    }
  }

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, _labels?: Record<string, string>): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    let values = this.gauges.get(name);
    if (!values) {
      values = [];
      this.gauges.set(name, values);
    }

    values.push({ value, timestamp: Date.now(), labels });
    this.pruneGauge(name);
  }

  /**
   * Observe a value for histogram
   */
  observeHistogram(name: string, value: number): void {
    const hist = this.histograms.get(name);
    if (!hist) return;

    // Find bucket
    let bucketIdx = hist.boundaries.length;
    for (let i = 0; i < hist.boundaries.length; i++) {
      if (value <= hist.boundaries[i]) {
        bucketIdx = i;
        break;
      }
    }

    hist.counts[bucketIdx]++;
    hist.sum += value;
    hist.count++;
  }

  /**
   * Set histogram boundaries
   */
  setHistogramBoundaries(name: string, boundaries: number[]): void {
    const hist = this.histograms.get(name);
    if (hist) {
      hist.boundaries = boundaries;
      hist.counts = new Array(boundaries.length + 1).fill(0);
    }
  }

  /**
   * Observe a value for summary
   */
  observeSummary(name: string, value: number): void {
    let values = this.summaries.get(name);
    if (!values) {
      values = [];
      this.summaries.set(name, values);
    }

    values.push(value);

    // Trim to max samples
    if (values.length > this.maxSamples) {
      values.shift();
    }
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /**
   * Get current gauge value
   */
  getGauge(name: string): number | undefined {
    const values = this.gauges.get(name);
    if (!values || values.length === 0) return undefined;
    return values[values.length - 1].value;
  }

  /**
   * Get gauge history
   */
  getGaugeHistory(name: string, since?: number): IMetricValue[] {
    const values = this.gauges.get(name) ?? [];
    if (since) {
      return values.filter((v) => v.timestamp >= since);
    }
    return [...values];
  }

  /**
   * Get histogram buckets
   */
  getHistogram(name: string): IHistogramBuckets | undefined {
    return this.histograms.get(name);
  }

  /**
   * Get summary percentiles
   */
  getSummary(name: string): ISummaryPercentiles | undefined {
    const values = this.summaries.get(name);
    if (!values || values.length === 0) return undefined;

    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p75: sorted[Math.floor(len * 0.75)],
      p90: sorted[Math.floor(len * 0.9)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      count: len,
      sum: values.reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Get metric statistics
   */
  getStats(name: string): IMetricStats | undefined {
    const def = this.metrics.get(name);
    if (!def) return undefined;

    let currentValue = 0;
    let min = Infinity;
    let max = -Infinity;
    let avg = 0;
    let count = 0;
    let lastUpdate = 0;

    switch (def.type) {
      case 'counter':
        currentValue = this.counters.get(name) ?? 0;
        min = max = avg = currentValue;
        count = 1;
        break;

      case 'gauge': {
        const values = this.gauges.get(name) ?? [];
        if (values.length > 0) {
          currentValue = values[values.length - 1].value;
          for (const v of values) {
            min = Math.min(min, v.value);
            max = Math.max(max, v.value);
            avg += v.value;
            lastUpdate = Math.max(lastUpdate, v.timestamp);
          }
          count = values.length;
          avg /= count;
        }
        break;
      }

      case 'histogram': {
        const hist = this.histograms.get(name);
        if (hist) {
          currentValue = hist.count > 0 ? hist.sum / hist.count : 0;
          count = hist.count;
          avg = currentValue;
          // Min/max approximated from buckets
        }
        break;
      }

      case 'summary': {
        const vals = this.summaries.get(name) ?? [];
        if (vals.length > 0) {
          min = Math.min(...vals);
          max = Math.max(...vals);
          currentValue = vals[vals.length - 1];
          count = vals.length;
          avg = vals.reduce((a, b) => a + b, 0) / count;
        }
        break;
      }
    }

    return {
      name,
      type: def.type,
      currentValue,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
      avg,
      count,
      lastUpdate,
    };
  }

  /**
   * Get all registered metrics
   */
  getRegistered(): IMetricDefinition[] {
    return [...this.metrics.values()];
  }

  /**
   * Reset a metric
   */
  reset(name: string): void {
    const def = this.metrics.get(name);
    if (!def) return;

    switch (def.type) {
      case 'counter':
        this.counters.set(name, 0);
        break;
      case 'gauge':
        this.gauges.set(name, []);
        break;
      case 'histogram':
        const hist = this.histograms.get(name);
        if (hist) {
          hist.counts.fill(0);
          hist.sum = 0;
          hist.count = 0;
        }
        break;
      case 'summary':
        this.summaries.set(name, []);
        break;
    }
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    for (const name of this.metrics.keys()) {
      this.reset(name);
    }
  }

  /**
   * Get all stats as object
   */
  getAllStats(): Record<string, IMetricStats> {
    const result: Record<string, IMetricStats> = {};
    for (const name of this.metrics.keys()) {
      const stats = this.getStats(name);
      if (stats) {
        result[name] = stats;
      }
    }
    return result;
  }

  /**
   * Prune old gauge values
   */
  private pruneGauge(name: string): void {
    const values = this.gauges.get(name);
    if (!values) return;

    const cutoff = Date.now() - this.retentionPeriod;

    // Remove old values
    while (values.length > 0 && values[0].timestamp < cutoff) {
      values.shift();
    }

    // Trim to max samples
    while (values.length > this.maxSamples) {
      values.shift();
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const def of this.metrics.values()) {
      lines.push(`# HELP ${def.name} ${def.description}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);

      switch (def.type) {
        case 'counter':
          lines.push(`${def.name} ${this.counters.get(def.name) ?? 0}`);
          break;
        case 'gauge': {
          const value = this.getGauge(def.name);
          if (value !== undefined) {
            lines.push(`${def.name} ${value}`);
          }
          break;
        }
        case 'histogram': {
          const hist = this.histograms.get(def.name);
          if (hist) {
            let cumulative = 0;
            for (let i = 0; i < hist.boundaries.length; i++) {
              cumulative += hist.counts[i];
              lines.push(`${def.name}_bucket{le="${hist.boundaries[i]}"} ${cumulative}`);
            }
            cumulative += hist.counts[hist.boundaries.length];
            lines.push(`${def.name}_bucket{le="+Inf"} ${cumulative}`);
            lines.push(`${def.name}_sum ${hist.sum}`);
            lines.push(`${def.name}_count ${hist.count}`);
          }
          break;
        }
        case 'summary': {
          const summary = this.getSummary(def.name);
          if (summary) {
            lines.push(`${def.name}{quantile="0.5"} ${summary.p50}`);
            lines.push(`${def.name}{quantile="0.75"} ${summary.p75}`);
            lines.push(`${def.name}{quantile="0.9"} ${summary.p90}`);
            lines.push(`${def.name}{quantile="0.95"} ${summary.p95}`);
            lines.push(`${def.name}{quantile="0.99"} ${summary.p99}`);
            lines.push(`${def.name}_sum ${summary.sum}`);
            lines.push(`${def.name}_count ${summary.count}`);
          }
          break;
        }
      }
    }

    return lines.join('\n');
  }
}
