export interface MetricMeasurement {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface MetricSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; avg: number; max: number }>;
  gauges: Record<string, number>;
}

/**
 * TelemetryRegistry
 *
 * A Prometheus-style metrics exporter for tracking SLO violations,
 * execution latency, and scale bottlenecks autonomously.
 */
class TelemetryRegistry {
  private measurements: MetricMeasurement[] = [];
  private maxHistory = 10000;

  /**
   * Increments a monotonic counter (e.g., total_nodes_executed)
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>) {
    this.measurements.push({
      name,
      type: 'counter',
      value,
      labels,
      timestamp: Date.now(),
    });
    if (this.measurements.length > this.maxHistory) this.measurements.shift();
  }

  /**
   * Records an instantaneous value (e.g., active_agents)
   */
  setGauge(name: string, value: number, labels?: Record<string, string>) {
    this.measurements.push({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
    if (this.measurements.length > this.maxHistory) this.measurements.shift();
  }

  /**
   * Wraps an async function and records its execution latency into a histogram.
   */
  async measureLatency<T>(
    name: string,
    fn: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.measurements.push({
        name,
        type: 'histogram',
        value: duration,
        labels,
        timestamp: Date.now(),
      });
      if (this.measurements.length > this.maxHistory) this.measurements.shift();

      // SLA alert for severe lag - emit as metric instead of console logging
      if (duration > 500) {
        this.measurements.push({
          name: 'slo_violation_count',
          type: 'counter',
          value: 1,
          labels: { ...labels, metric_name: name, threshold: '500ms' },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Snapshots current aggregations for dashboard export.
   */
  getSnapshot(): MetricSnapshot {
    const snapshot: MetricSnapshot = { counters: {}, histograms: {}, gauges: {} };
    const histAggregations: Record<string, { count: number; sum: number; max: number }> = {};

    for (const m of this.measurements) {
      const key = m.labels ? `${m.name}{${JSON.stringify(m.labels)}}` : m.name;

      if (m.type === 'counter') {
        snapshot.counters[key] = (snapshot.counters[key] || 0) + m.value;
      } else if (m.type === 'gauge') {
        snapshot.gauges[key] = m.value; // Last read wins
      } else if (m.type === 'histogram') {
        if (!histAggregations[key]) histAggregations[key] = { count: 0, sum: 0, max: 0 };
        histAggregations[key].count++;
        histAggregations[key].sum += m.value;
        if (m.value > histAggregations[key].max) histAggregations[key].max = m.value;
      }
    }

    for (const [key, agg] of Object.entries(histAggregations)) {
      snapshot.histograms[key] = {
        count: agg.count,
        sum: agg.sum,
        avg: agg.count > 0 ? agg.sum / agg.count : 0,
        max: agg.max,
      };
    }

    return snapshot;
  }
}

export const telemetry = new TelemetryRegistry();
