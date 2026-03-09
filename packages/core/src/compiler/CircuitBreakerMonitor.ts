/**
 * Circuit Breaker Monitoring and Dashboard
 *
 * Real-time monitoring system for circuit breaker metrics across all export targets.
 * Provides health checks, alerts, and performance analytics.
 *
 * Features:
 * - Real-time metrics aggregation
 * - Health scoring per target
 * - Alert thresholds and notifications
 * - Historical data tracking
 * - Performance analytics
 * - Export to monitoring systems (Prometheus, DataDog, etc.)
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type { ExportTarget, CircuitState, CircuitMetrics } from './CircuitBreaker';
import type { ExportManager } from './ExportManager';

// =============================================================================
// TYPES
// =============================================================================

export interface HealthStatus {
  target: ExportTarget;
  score: number; // 0-100
  status: 'healthy' | 'degraded' | 'critical' | 'down';
  circuitState: CircuitState;
  issues: string[];
  recommendations: string[];
}

export interface AlertConfig {
  /** Failure rate threshold (failures/hour) */
  failureRateThreshold: number;
  /** Degraded mode time threshold (ms) */
  degradedTimeThreshold: number;
  /** Consecutive failures threshold */
  consecutiveFailuresThreshold: number;
  /** Notify on circuit state changes */
  notifyOnStateChange: boolean;
}

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  id: string;
  target: ExportTarget;
  level: AlertLevel;
  message: string;
  timestamp: number;
  metrics: CircuitMetrics;
}

export type AlertHandler = (alert: Alert) => void;

export interface PerformanceMetrics {
  target: ExportTarget;
  avgExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  throughput: number; // requests/minute
  errorRate: number; // 0-1
  availabilityRate: number; // 0-1
}

export interface HistoricalDataPoint {
  timestamp: number;
  metrics: CircuitMetrics;
}

export interface DashboardData {
  timestamp: number;
  overallHealth: number; // 0-100
  totalTargets: number;
  healthyTargets: number;
  degradedTargets: number;
  criticalTargets: number;
  downTargets: number;
  activeAlerts: Alert[];
  targetHealth: HealthStatus[];
  performanceMetrics: PerformanceMetrics[];
  aggregatedMetrics: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    avgFailureRate: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
  };
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  failureRateThreshold: 10, // 10 failures/hour
  degradedTimeThreshold: 5 * 60 * 1000, // 5 minutes
  consecutiveFailuresThreshold: 3,
  notifyOnStateChange: true,
};

// =============================================================================
// CIRCUIT BREAKER MONITOR
// =============================================================================

export class CircuitBreakerMonitor {
  private exportManager: ExportManager;
  private alertConfig: AlertConfig;
  private alertHandlers: Set<AlertHandler> = new Set();
  private alerts: Map<string, Alert> = new Map();
  private historicalData: Map<ExportTarget, HistoricalDataPoint[]> = new Map();
  private performanceData: Map<ExportTarget, number[]> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(exportManager: ExportManager, alertConfig: Partial<AlertConfig> = {}) {
    this.exportManager = exportManager;
    this.alertConfig = { ...DEFAULT_ALERT_CONFIG, ...alertConfig };
  }

  /**
   * Start monitoring with automatic health checks
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.pollingInterval) {
      this.stopMonitoring();
    }

    this.pollingInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    // Initial health check
    this.performHealthCheck();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Perform health check across all targets
   */
  performHealthCheck(): DashboardData {
    const allMetrics = this.exportManager.getAllMetrics();
    const targetHealth: HealthStatus[] = [];
    let totalHealth = 0;

    // Analyze each target
    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      const health = this.analyzeTargetHealth(target as ExportTarget, metrics);
      targetHealth.push(health);
      totalHealth += health.score;

      // Check for alerts
      this.checkAlerts(target as ExportTarget, metrics, health);

      // Store historical data
      this.recordHistoricalData(target as ExportTarget, metrics);
    }

    const overallHealth = targetHealth.length > 0 ? totalHealth / targetHealth.length : 100;

    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics();

    // Count targets by status
    const healthyTargets = targetHealth.filter((h) => h.status === 'healthy').length;
    const degradedTargets = targetHealth.filter((h) => h.status === 'degraded').length;
    const criticalTargets = targetHealth.filter((h) => h.status === 'critical').length;
    const downTargets = targetHealth.filter((h) => h.status === 'down').length;

    return {
      timestamp: Date.now(),
      overallHealth,
      totalTargets: targetHealth.length,
      healthyTargets,
      degradedTargets,
      criticalTargets,
      downTargets,
      activeAlerts: Array.from(this.alerts.values()),
      targetHealth,
      performanceMetrics,
      aggregatedMetrics: {
        totalRequests: allMetrics.totalSuccesses + allMetrics.totalFailures,
        totalFailures: allMetrics.totalFailures,
        totalSuccesses: allMetrics.totalSuccesses,
        avgFailureRate: allMetrics.averageFailureRate,
        openCircuits: allMetrics.openCircuits,
        halfOpenCircuits: allMetrics.halfOpenCircuits,
        closedCircuits: allMetrics.closedCircuits,
      },
    };
  }

  /**
   * Get health status for a specific target
   */
  getTargetHealth(target: ExportTarget): HealthStatus {
    const metrics = this.exportManager.getMetrics(target);
    return this.analyzeTargetHealth(target, metrics);
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    return this.performHealthCheck();
  }

  /**
   * Get historical data for a target
   */
  getHistoricalData(target: ExportTarget, limit?: number): HistoricalDataPoint[] {
    const data = this.historicalData.get(target) || [];
    return limit ? data.slice(-limit) : data;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(target?: ExportTarget): Alert[] {
    const alerts = Array.from(this.alerts.values());
    return target ? alerts.filter((a) => a.target === target) : alerts;
  }

  /**
   * Clear alert
   */
  clearAlert(alertId: string): void {
    this.alerts.delete(alertId);
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    this.alerts.clear();
  }

  /**
   * Register alert handler
   */
  onAlert(handler: AlertHandler): void {
    this.alertHandlers.add(handler);
  }

  /**
   * Unregister alert handler
   */
  offAlert(handler: AlertHandler): void {
    this.alertHandlers.delete(handler);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const allMetrics = this.exportManager.getAllMetrics();
    const lines: string[] = [];

    // Overall metrics
    lines.push(
      '# HELP holoscript_circuit_breaker_state Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)'
    );
    lines.push('# TYPE holoscript_circuit_breaker_state gauge');

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      const stateValue = metrics.state === 'CLOSED' ? 0 : metrics.state === 'OPEN' ? 1 : 2;
      lines.push(`holoscript_circuit_breaker_state{target="${target}"} ${stateValue}`);
    }

    lines.push('# HELP holoscript_export_failures_total Total number of export failures');
    lines.push('# TYPE holoscript_export_failures_total counter');

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      lines.push(`holoscript_export_failures_total{target="${target}"} ${metrics.failureCount}`);
    }

    lines.push('# HELP holoscript_export_successes_total Total number of export successes');
    lines.push('# TYPE holoscript_export_successes_total counter');

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      lines.push(`holoscript_export_successes_total{target="${target}"} ${metrics.successCount}`);
    }

    lines.push('# HELP holoscript_circuit_breaker_failure_rate Failure rate (failures/hour)');
    lines.push('# TYPE holoscript_circuit_breaker_failure_rate gauge');

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      lines.push(
        `holoscript_circuit_breaker_failure_rate{target="${target}"} ${metrics.failureRate}`
      );
    }

    lines.push(
      '# HELP holoscript_circuit_breaker_degraded_time_ms Time spent in degraded mode (ms)'
    );
    lines.push('# TYPE holoscript_circuit_breaker_degraded_time_ms counter');

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      lines.push(
        `holoscript_circuit_breaker_degraded_time_ms{target="${target}"} ${metrics.timeInDegradedMode}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Export metrics in JSON format
   */
  exportJSONMetrics(): string {
    return JSON.stringify(this.getDashboardData(), null, 2);
  }

  // ─── PRIVATE METHODS ────────────────────────────────────────────────────────

  private analyzeTargetHealth(target: ExportTarget, metrics: CircuitMetrics): HealthStatus {
    let score = 100;
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Circuit state impact
    if (metrics.state === 'OPEN') {
      score -= 50;
      issues.push('Circuit breaker is OPEN');
      recommendations.push('Investigate root cause of failures and reset circuit when resolved');
    } else if (metrics.state === 'HALF_OPEN') {
      score -= 20;
      issues.push('Circuit breaker is testing recovery (HALF_OPEN)');
      recommendations.push('Monitor next few requests carefully');
    }

    // Failure rate impact
    if (metrics.failureRate > this.alertConfig.failureRateThreshold) {
      const impact = Math.min(
        30,
        (metrics.failureRate / this.alertConfig.failureRateThreshold) * 15
      );
      score -= impact;
      issues.push(`High failure rate: ${metrics.failureRate.toFixed(1)} failures/hour`);
      recommendations.push('Review recent error logs and consider scaling resources');
    }

    // Degraded time impact
    if (metrics.timeInDegradedMode > this.alertConfig.degradedTimeThreshold) {
      score -= 20;
      issues.push(
        `Extended degraded mode: ${(metrics.timeInDegradedMode / 1000 / 60).toFixed(1)} minutes`
      );
      recommendations.push(
        'Circuit has been open for extended period - manual intervention may be needed'
      );
    }

    // Recent failures
    const recentFailures = metrics.failureCount;
    if (recentFailures >= this.alertConfig.consecutiveFailuresThreshold) {
      score -= Math.min(15, recentFailures * 3);
      issues.push(`${recentFailures} consecutive failures detected`);
      recommendations.push('Check compiler implementation for bugs or configuration issues');
    }

    // Determine status
    let status: HealthStatus['status'];
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'degraded';
    } else if (score >= 40) {
      status = 'critical';
    } else {
      status = 'down';
    }

    return {
      target,
      score: Math.max(0, score),
      status,
      circuitState: metrics.state,
      issues,
      recommendations,
    };
  }

  private checkAlerts(target: ExportTarget, metrics: CircuitMetrics, health: HealthStatus): void {
    // Circuit state change alert
    if (this.alertConfig.notifyOnStateChange && metrics.state !== 'CLOSED') {
      const alertId = `${target}-state-${metrics.state}`;
      if (!this.alerts.has(alertId)) {
        const alert: Alert = {
          id: alertId,
          target,
          level: metrics.state === 'OPEN' ? 'critical' : 'warning',
          message: `Circuit breaker transitioned to ${metrics.state}`,
          timestamp: Date.now(),
          metrics,
        };
        this.alerts.set(alertId, alert);
        this.emitAlert(alert);
      }
    }

    // Failure rate alert
    if (metrics.failureRate > this.alertConfig.failureRateThreshold) {
      const alertId = `${target}-failure-rate`;
      if (!this.alerts.has(alertId)) {
        const alert: Alert = {
          id: alertId,
          target,
          level: 'error',
          message: `High failure rate: ${metrics.failureRate.toFixed(1)} failures/hour`,
          timestamp: Date.now(),
          metrics,
        };
        this.alerts.set(alertId, alert);
        this.emitAlert(alert);
      }
    }

    // Degraded time alert
    if (metrics.timeInDegradedMode > this.alertConfig.degradedTimeThreshold) {
      const alertId = `${target}-degraded-time`;
      if (!this.alerts.has(alertId)) {
        const alert: Alert = {
          id: alertId,
          target,
          level: 'warning',
          message: `Extended degraded mode: ${(metrics.timeInDegradedMode / 1000 / 60).toFixed(1)} minutes`,
          timestamp: Date.now(),
          metrics,
        };
        this.alerts.set(alertId, alert);
        this.emitAlert(alert);
      }
    }

    // Health status alert
    if (health.status === 'critical' || health.status === 'down') {
      const alertId = `${target}-health-${health.status}`;
      if (!this.alerts.has(alertId)) {
        const alert: Alert = {
          id: alertId,
          target,
          level: health.status === 'down' ? 'critical' : 'error',
          message: `Target health is ${health.status} (score: ${health.score})`,
          timestamp: Date.now(),
          metrics,
        };
        this.alerts.set(alertId, alert);
        this.emitAlert(alert);
      }
    }
  }

  private recordHistoricalData(target: ExportTarget, metrics: CircuitMetrics): void {
    if (!this.historicalData.has(target)) {
      this.historicalData.set(target, []);
    }

    const history = this.historicalData.get(target)!;
    history.push({
      timestamp: Date.now(),
      metrics: { ...metrics },
    });

    // Keep last 1000 data points per target
    if (history.length > 1000) {
      history.shift();
    }
  }

  private calculatePerformanceMetrics(): PerformanceMetrics[] {
    const allMetrics = this.exportManager.getAllMetrics();
    const performance: PerformanceMetrics[] = [];

    for (const [target, metrics] of Object.entries(allMetrics.targets)) {
      const history = this.historicalData.get(target as ExportTarget) || [];
      const execTimes = this.performanceData.get(target as ExportTarget) || [];

      // Calculate average execution time
      const avgExecTime =
        execTimes.length > 0 ? execTimes.reduce((sum, t) => sum + t, 0) / execTimes.length : 0;

      // Calculate p95 and p99
      const sorted = [...execTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);
      const p95ExecTime = sorted[p95Index] || 0;
      const p99ExecTime = sorted[p99Index] || 0;

      // Calculate throughput (requests/minute)
      const recentHistory = history.slice(-60); // Last 60 data points
      const totalRequests = metrics.totalRequests;
      const throughput = recentHistory.length > 0 ? (totalRequests / recentHistory.length) * 60 : 0;

      // Calculate error and availability rates
      const errorRate =
        metrics.totalRequests > 0 ? metrics.failedRequests / metrics.totalRequests : 0;
      const availabilityRate = 1 - errorRate;

      performance.push({
        target: target as ExportTarget,
        avgExecutionTime: avgExecTime,
        p95ExecutionTime: p95ExecTime,
        p99ExecutionTime: p99ExecTime,
        throughput,
        errorRate,
        availabilityRate,
      });
    }

    return performance;
  }

  private emitAlert(alert: Alert): void {
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('Error in alert handler:', error);
      }
    }
  }

  /**
   * Record execution time for performance metrics
   */
  recordExecutionTime(target: ExportTarget, timeMs: number): void {
    if (!this.performanceData.has(target)) {
      this.performanceData.set(target, []);
    }

    const times = this.performanceData.get(target)!;
    times.push(timeMs);

    // Keep last 1000 execution times
    if (times.length > 1000) {
      times.shift();
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create formatted health report
 */
export function formatHealthReport(dashboard: DashboardData): string {
  const lines: string[] = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('  HOLOSCRIPT CIRCUIT BREAKER HEALTH REPORT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Overall Health: ${dashboard.overallHealth.toFixed(1)}%`);
  lines.push(`Timestamp: ${new Date(dashboard.timestamp).toISOString()}`);
  lines.push('');
  lines.push('Target Status:');
  lines.push(`  Healthy: ${dashboard.healthyTargets}/${dashboard.totalTargets}`);
  lines.push(`  Degraded: ${dashboard.degradedTargets}/${dashboard.totalTargets}`);
  lines.push(`  Critical: ${dashboard.criticalTargets}/${dashboard.totalTargets}`);
  lines.push(`  Down: ${dashboard.downTargets}/${dashboard.totalTargets}`);
  lines.push('');
  lines.push('Circuit States:');
  lines.push(`  Closed: ${dashboard.aggregatedMetrics.closedCircuits}`);
  lines.push(`  Half-Open: ${dashboard.aggregatedMetrics.halfOpenCircuits}`);
  lines.push(`  Open: ${dashboard.aggregatedMetrics.openCircuits}`);
  lines.push('');
  lines.push('Aggregated Metrics:');
  lines.push(`  Total Requests: ${dashboard.aggregatedMetrics.totalRequests}`);
  lines.push(`  Successes: ${dashboard.aggregatedMetrics.totalSuccesses}`);
  lines.push(`  Failures: ${dashboard.aggregatedMetrics.totalFailures}`);
  lines.push(
    `  Avg Failure Rate: ${dashboard.aggregatedMetrics.avgFailureRate.toFixed(1)} failures/hour`
  );
  lines.push('');

  if (dashboard.activeAlerts.length > 0) {
    lines.push(`Active Alerts: ${dashboard.activeAlerts.length}`);
    for (const alert of dashboard.activeAlerts) {
      lines.push(`  [${alert.level.toUpperCase()}] ${alert.target}: ${alert.message}`);
    }
    lines.push('');
  }

  lines.push('Per-Target Health:');
  for (const health of dashboard.targetHealth.sort((a, b) => a.score - b.score)) {
    const statusEmoji =
      health.status === 'healthy'
        ? '✓'
        : health.status === 'degraded'
          ? '⚠'
          : health.status === 'critical'
            ? '⚠⚠'
            : '✗';
    lines.push(
      `  ${statusEmoji} ${health.target.padEnd(20)} | Score: ${health.score.toFixed(0).padStart(3)} | Circuit: ${health.circuitState}`
    );
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CircuitBreakerMonitor;
