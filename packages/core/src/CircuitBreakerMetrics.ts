/**
 * Circuit Breaker Metrics System
 *
 * Comprehensive metrics collection and reporting for:
 * - Circuit state tracking per query
 * - Failure rate monitoring
 * - Cache hit rate during degraded mode
 * - Retry count histogram
 * - System health dashboard
 */

import { CircuitState, CircuitMetrics } from './CircuitBreaker';
import { GraphQLCircuitBreakerClient, CircuitBreakerStats } from './GraphQLCircuitBreakerClient';
import type { Extensible } from './types/utility-types';

export interface MetricsSnapshot {
  timestamp: Date;
  circuits: CircuitMetricsReport[];
  aggregate: AggregateMetrics;
  health: HealthScore;
}

export interface CircuitMetricsReport {
  operationName: string;
  state: CircuitState;
  metrics: {
    failureRate: number;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    consecutiveTimeouts: number;
    cacheHits: number;
    lastStateChange: Date;
  };
  retryHistogram: Map<number, number>;
}

export interface AggregateMetrics {
  totalCircuits: number;
  circuitsByState: {
    closed: number;
    open: number;
    halfOpen: number;
  };
  overallFailureRate: number;
  totalRequests: number;
  totalCacheHits: number;
  averageRetryDelay: number;
  p50RetryDelay: number;
  p95RetryDelay: number;
  p99RetryDelay: number;
}

export interface HealthScore {
  score: number; // 0-100
  status: 'healthy' | 'degraded' | 'critical';
  factors: {
    circuitHealth: number;
    failureRate: number;
    cacheEffectiveness: number;
  };
}

export interface MetricsExportOptions {
  format: 'json' | 'prometheus' | 'csv';
  includeHistograms?: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Metrics Collector and Reporter
 */
export class CircuitBreakerMetrics {
  private snapshots: MetricsSnapshot[] = [];
  private maxSnapshots: number = 1000;

  constructor(private client: GraphQLCircuitBreakerClient) {}

  /**
   * Capture current metrics snapshot
   */
  captureSnapshot(): MetricsSnapshot {
    const circuitStats = this.client.getCircuitStats();
    const systemHealth = this.client.getSystemHealth();

    const circuits: CircuitMetricsReport[] = circuitStats.map((stat) => {
      // @ts-expect-error During migration
      const circuitManager = (this.client as Extensible<GraphQLCircuitBreakerClient>).circuitManager as { getCircuit(name: string): { getMetrics(): CircuitMetrics } };
      const circuit = circuitManager.getCircuit(stat.operationName);
      const metrics = circuit.getMetrics();

      return {
        operationName: stat.operationName,
        state: stat.state,
        metrics: {
          failureRate: stat.failureRate,
          totalRequests: stat.totalRequests,
          totalFailures: metrics.totalFailures,
          totalSuccesses: metrics.totalSuccesses,
          consecutiveTimeouts: metrics.consecutiveTimeouts,
          cacheHits: stat.cacheHits,
          lastStateChange: metrics.lastStateChange,
        },
        retryHistogram: metrics.retryHistogram,
      };
    });

    const aggregate = this.calculateAggregateMetrics(circuits, systemHealth);
    const health = this.calculateHealthScore(aggregate);

    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      circuits,
      aggregate,
      health,
    };

    // Store snapshot
    this.snapshots.push(snapshot);

    // Maintain max snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Calculate aggregate metrics across all circuits
   */
  private calculateAggregateMetrics(
    circuits: CircuitMetricsReport[],
    systemHealth: { circuits: { byState: { closed: number; open: number; halfOpen: number } }; cache: { size: number; totalHits: number }; degradedMode: boolean }
  ): AggregateMetrics {
    const totalRequests = circuits.reduce((sum, c) => sum + c.metrics.totalRequests, 0);
    const totalFailures = circuits.reduce((sum, c) => sum + c.metrics.totalFailures, 0);
    const totalCacheHits = circuits.reduce((sum, c) => sum + c.metrics.cacheHits, 0);

    // Collect all retry delays from histograms
    const allDelays: number[] = [];
    for (const circuit of circuits) {
      for (const [delaySeconds, count] of circuit.retryHistogram) {
        for (let i = 0; i < count; i++) {
          allDelays.push(delaySeconds);
        }
      }
    }

    allDelays.sort((a, b) => a - b);

    const averageRetryDelay =
      allDelays.length > 0 ? allDelays.reduce((sum, d) => sum + d, 0) / allDelays.length : 0;

    const p50RetryDelay = this.percentile(allDelays, 0.5);
    const p95RetryDelay = this.percentile(allDelays, 0.95);
    const p99RetryDelay = this.percentile(allDelays, 0.99);

    return {
      totalCircuits: circuits.length,
      circuitsByState: systemHealth.circuits.byState,
      overallFailureRate: totalRequests > 0 ? totalFailures / totalRequests : 0,
      totalRequests,
      totalCacheHits,
      averageRetryDelay,
      p50RetryDelay,
      p95RetryDelay,
      p99RetryDelay,
    };
  }

  /**
   * Calculate system health score
   */
  private calculateHealthScore(aggregate: AggregateMetrics): HealthScore {
    // Circuit health: weighted by state
    const circuitHealthScore =
      aggregate.totalCircuits > 0
        ? ((aggregate.circuitsByState.closed * 1.0 +
            aggregate.circuitsByState.halfOpen * 0.5 +
            aggregate.circuitsByState.open * 0.0) /
            aggregate.totalCircuits) *
          100
        : 100;

    // Failure rate health: inverse of failure rate
    const failureRateScore = (1 - aggregate.overallFailureRate) * 100;

    // Cache effectiveness: cache hits vs open circuits
    const cacheEffectivenessScore =
      aggregate.circuitsByState.open > 0
        ? (aggregate.totalCacheHits / (aggregate.circuitsByState.open * 10)) * 100
        : 100;

    // Overall score: weighted average
    const score = Math.round(
      circuitHealthScore * 0.5 + failureRateScore * 0.3 + cacheEffectivenessScore * 0.2
    );

    let status: 'healthy' | 'degraded' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    return {
      score,
      status,
      factors: {
        circuitHealth: Math.round(circuitHealthScore),
        failureRate: Math.round(failureRateScore),
        cacheEffectiveness: Math.round(cacheEffectivenessScore),
      },
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Get metrics for specific time range
   */
  getMetricsInRange(start: Date, end: Date): MetricsSnapshot[] {
    return this.snapshots.filter(
      (snapshot) => snapshot.timestamp >= start && snapshot.timestamp <= end
    );
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): MetricsSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Get metrics for specific operation
   */
  getOperationMetrics(operationName: string): CircuitMetricsReport[] {
    return this.snapshots
      .map((snapshot) => snapshot.circuits.find((c) => c.operationName === operationName))
      .filter((c): c is CircuitMetricsReport => c !== undefined);
  }

  /**
   * Export metrics in various formats
   */
  export(options: MetricsExportOptions): string {
    const snapshot = this.getLatestSnapshot();
    if (!snapshot) {
      return '';
    }

    switch (options.format) {
      case 'json':
        return this.exportJSON(snapshot, options);
      case 'prometheus':
        return this.exportPrometheus(snapshot);
      case 'csv':
        return this.exportCSV(snapshot);
      default:
        return '';
    }
  }

  /**
   * Export as JSON
   */
  private exportJSON(snapshot: MetricsSnapshot, options: MetricsExportOptions): string {
    const data = options.includeHistograms
      ? snapshot
      : {
          ...snapshot,
          circuits: snapshot.circuits.map((c) => ({
            ...c,
            retryHistogram: undefined,
          })),
        };

    return JSON.stringify(
      data,
      (key, value) => {
        // Convert Map to object for JSON serialization
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      },
      2
    );
  }

  /**
   * Export as Prometheus format
   */
  private exportPrometheus(snapshot: MetricsSnapshot): string {
    let output = '';

    // Circuit state gauge
    output +=
      '# HELP circuit_breaker_state Circuit breaker state (0=closed, 1=half-open, 2=open)\n';
    output += '# TYPE circuit_breaker_state gauge\n';
    for (const circuit of snapshot.circuits) {
      const stateValue =
        circuit.state === CircuitState.CLOSED
          ? 0
          : circuit.state === CircuitState.HALF_OPEN
            ? 1
            : 2;
      output += `circuit_breaker_state{operation="${circuit.operationName}"} ${stateValue}\n`;
    }

    // Failure rate gauge
    output += '\n# HELP circuit_breaker_failure_rate Failure rate (0-1)\n';
    output += '# TYPE circuit_breaker_failure_rate gauge\n';
    for (const circuit of snapshot.circuits) {
      output += `circuit_breaker_failure_rate{operation="${circuit.operationName}"} ${circuit.metrics.failureRate.toFixed(4)}\n`;
    }

    // Total requests counter
    output += '\n# HELP circuit_breaker_requests_total Total requests\n';
    output += '# TYPE circuit_breaker_requests_total counter\n';
    for (const circuit of snapshot.circuits) {
      output += `circuit_breaker_requests_total{operation="${circuit.operationName}"} ${circuit.metrics.totalRequests}\n`;
    }

    // Cache hits counter
    output += '\n# HELP circuit_breaker_cache_hits_total Cache hits during open state\n';
    output += '# TYPE circuit_breaker_cache_hits_total counter\n';
    for (const circuit of snapshot.circuits) {
      output += `circuit_breaker_cache_hits_total{operation="${circuit.operationName}"} ${circuit.metrics.cacheHits}\n`;
    }

    // Health score gauge
    output += '\n# HELP circuit_breaker_health_score Overall health score (0-100)\n';
    output += '# TYPE circuit_breaker_health_score gauge\n';
    output += `circuit_breaker_health_score ${snapshot.health.score}\n`;

    return output;
  }

  /**
   * Export as CSV
   */
  private exportCSV(snapshot: MetricsSnapshot): string {
    const headers = [
      'Timestamp',
      'Operation',
      'State',
      'Failure Rate',
      'Total Requests',
      'Total Failures',
      'Total Successes',
      'Cache Hits',
      'Consecutive Timeouts',
    ];

    const rows = snapshot.circuits.map((circuit) => [
      snapshot.timestamp.toISOString(),
      circuit.operationName,
      circuit.state,
      circuit.metrics.failureRate.toFixed(4),
      circuit.metrics.totalRequests.toString(),
      circuit.metrics.totalFailures.toString(),
      circuit.metrics.totalSuccesses.toString(),
      circuit.metrics.cacheHits.toString(),
      circuit.metrics.consecutiveTimeouts.toString(),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  /**
   * Generate dashboard report
   */
  generateDashboard(): string {
    const snapshot = this.captureSnapshot();

    return `
╔════════════════════════════════════════════════════════════════╗
║           Circuit Breaker Metrics Dashboard                    ║
╚════════════════════════════════════════════════════════════════╝

📊 System Health: ${snapshot.health.status.toUpperCase()} (${snapshot.health.score}/100)

Circuit Health:        ${snapshot.health.factors.circuitHealth}/100
Failure Rate Health:   ${snapshot.health.factors.failureRate}/100
Cache Effectiveness:   ${snapshot.health.factors.cacheEffectiveness}/100

🔌 Circuit States:
  Closed (Healthy):    ${snapshot.aggregate.circuitsByState.closed}
  Half-Open (Testing): ${snapshot.aggregate.circuitsByState.halfOpen}
  Open (Failed):       ${snapshot.aggregate.circuitsByState.open}

📈 Aggregate Metrics:
  Total Circuits:      ${snapshot.aggregate.totalCircuits}
  Total Requests:      ${snapshot.aggregate.totalRequests}
  Overall Failure Rate: ${(snapshot.aggregate.overallFailureRate * 100).toFixed(2)}%
  Cache Hits:          ${snapshot.aggregate.totalCacheHits}

⏱️  Retry Delays (seconds):
  Average:             ${snapshot.aggregate.averageRetryDelay.toFixed(2)}s
  P50 (Median):        ${snapshot.aggregate.p50RetryDelay.toFixed(2)}s
  P95:                 ${snapshot.aggregate.p95RetryDelay.toFixed(2)}s
  P99:                 ${snapshot.aggregate.p99RetryDelay.toFixed(2)}s

🔍 Per-Circuit Details:
${snapshot.circuits
  .map(
    (c) => `
  ${c.operationName}:
    State: ${c.state}
    Failure Rate: ${(c.metrics.failureRate * 100).toFixed(2)}%
    Requests: ${c.metrics.totalRequests} (${c.metrics.totalSuccesses} ✓ / ${c.metrics.totalFailures} ✗)
    Cache Hits: ${c.metrics.cacheHits}
    Timeouts: ${c.metrics.consecutiveTimeouts}
`
  )
  .join('')}

Generated: ${snapshot.timestamp.toISOString()}
    `.trim();
  }

  /**
   * Clear all stored snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /**
   * Set maximum snapshots to retain
   */
  setMaxSnapshots(max: number): void {
    this.maxSnapshots = max;

    // Trim if necessary
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
  }
}

/**
 * Real-time metrics monitor with auto-capture
 */
export class MetricsMonitor {
  private metrics: CircuitBreakerMetrics;
  private interval?: NodeJS.Timeout;

  constructor(
    client: GraphQLCircuitBreakerClient,
    private captureIntervalMs: number = 10000 // 10 seconds
  ) {
    this.metrics = new CircuitBreakerMetrics(client);
  }

  /**
   * Start automatic metrics capture
   */
  start(): void {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      this.metrics.captureSnapshot();
    }, this.captureIntervalMs);
  }

  /**
   * Stop automatic metrics capture
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Get metrics collector
   */
  getMetrics(): CircuitBreakerMetrics {
    return this.metrics;
  }
}
