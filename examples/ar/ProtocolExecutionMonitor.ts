/**
 * ProtocolExecutionMonitor — Monitors uAA2++ protocol execution effectiveness
 *
 * The uAA2++ protocol runs in multi-phase cycles (Initialize, Discover, Execute,
 * Affirm + extended phases). This monitor tracks timing, completion rates,
 * quality metrics per phase, detects bottlenecks, and analyzes trends over
 * multiple execution cycles.
 *
 * Features:
 *   - Per-phase timing with start/end/duration tracking
 *   - Completion rate calculation (successful phases / total phases)
 *   - Quality metrics: accuracy, coverage, latency percentiles
 *   - Bottleneck detection using statistical thresholds
 *   - Trend analysis over sliding window of N cycles
 *   - Alert system for degraded performance
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/** uAA2++ protocol phases (standard 4 + extended) */
export type ProtocolPhase =
  | 'initialize'
  | 'discover'
  | 'execute'
  | 'affirm'
  | 'culture_sync'
  | 'knowledge_compress'
  | 'cross_reality'
  | 'reflection';

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'timeout';

/** Metrics collected for a single phase execution */
export interface PhaseMetrics {
  phase: ProtocolPhase;
  status: PhaseStatus;
  startedAt: number;
  completedAt?: number;
  durationMs: number;
  /** Quality score for this phase's output (0-1) */
  qualityScore: number;
  /** Number of items processed in this phase */
  itemsProcessed: number;
  /** Number of errors encountered */
  errorCount: number;
  /** Arbitrary key-value data specific to this phase */
  metadata: Record<string, number | string>;
}

/** A complete protocol execution cycle */
export interface ExecutionCycle {
  id: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs: number;
  phases: PhaseMetrics[];
  overallStatus: 'running' | 'completed' | 'failed' | 'partial';
  /** Aggregated quality across all phases */
  overallQuality: number;
  /** Total items processed across all phases */
  totalItemsProcessed: number;
  /** Trigger for this cycle (manual, scheduled, event-driven) */
  trigger: string;
  /** Agent or user that initiated */
  initiator: string;
}

/** Bottleneck detection result */
export interface Bottleneck {
  phase: ProtocolPhase;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  /** How many times slower than the median phase */
  slowdownFactor: number;
  /** Failure rate for this phase */
  failureRate: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/** Trend analysis over multiple cycles */
export interface TrendAnalysis {
  windowSize: number;
  cyclesAnalyzed: number;
  /** Per-phase trend data */
  phaseTrends: PhaseTrend[];
  /** Overall completion rate trend */
  completionRateTrend: TrendDirection;
  /** Overall quality trend */
  qualityTrend: TrendDirection;
  /** Overall throughput trend (items/second) */
  throughputTrend: TrendDirection;
  /** Detected bottlenecks */
  bottlenecks: Bottleneck[];
}

export interface PhaseTrend {
  phase: ProtocolPhase;
  avgDurationMs: number;
  durationTrend: TrendDirection;
  avgQuality: number;
  qualityTrend: TrendDirection;
  completionRate: number;
  sampleCount: number;
}

export type TrendDirection = 'improving' | 'stable' | 'degrading' | 'insufficient_data';

/** Alert for performance degradation */
export interface PerformanceAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  phase?: ProtocolPhase;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
}

/** Monitor configuration */
export interface MonitorConfig {
  /** Number of recent cycles to keep in memory */
  maxCycleHistory: number;
  /** Sliding window size for trend analysis */
  trendWindowSize: number;
  /** Duration threshold multiplier for bottleneck detection (x times median) */
  bottleneckMultiplier: number;
  /** Phase timeout in milliseconds */
  phaseTimeoutMs: number;
  /** Quality score threshold below which to alert */
  qualityAlertThreshold: number;
  /** Failure rate threshold for alerts */
  failureRateAlertThreshold: number;
  /** Callback for alerts */
  onAlert?: (alert: PerformanceAlert) => void;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: MonitorConfig = {
  maxCycleHistory: 100,
  trendWindowSize: 20,
  bottleneckMultiplier: 3.0,
  phaseTimeoutMs: 30_000,
  qualityAlertThreshold: 0.5,
  failureRateAlertThreshold: 0.25,
};

const ALL_PHASES: ProtocolPhase[] = [
  'initialize',
  'discover',
  'execute',
  'affirm',
  'culture_sync',
  'knowledge_compress',
  'cross_reality',
  'reflection',
];

// =============================================================================
// PROTOCOL EXECUTION MONITOR
// =============================================================================

export class ProtocolExecutionMonitor {
  private config: MonitorConfig;
  private cycles: ExecutionCycle[] = [];
  private activeCycle: ExecutionCycle | null = null;
  private alerts: PerformanceAlert[] = [];
  private alertIdCounter = 0;

  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Cycle Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start a new execution cycle.
   */
  startCycle(trigger: string = 'manual', initiator: string = 'system'): string {
    if (this.activeCycle) {
      this.endCycle('partial');
    }

    const id = `cycle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.activeCycle = {
      id,
      startedAt: Date.now(),
      totalDurationMs: 0,
      phases: [],
      overallStatus: 'running',
      overallQuality: 0,
      totalItemsProcessed: 0,
      trigger,
      initiator,
    };

    return id;
  }

  /**
   * Start a phase within the active cycle.
   */
  startPhase(phase: ProtocolPhase): void {
    if (!this.activeCycle) {
      throw new Error('No active cycle. Call startCycle() first.');
    }

    // Check for timeout on previous running phase
    const running = this.activeCycle.phases.find((p) => p.status === 'running');
    if (running) {
      const elapsed = Date.now() - running.startedAt;
      if (elapsed > this.config.phaseTimeoutMs) {
        running.status = 'timeout';
        running.completedAt = Date.now();
        running.durationMs = elapsed;
        this.emitAlert('warning', `Phase "${running.phase}" timed out after ${elapsed}ms`, 'duration', elapsed, this.config.phaseTimeoutMs, running.phase);
      }
    }

    const metrics: PhaseMetrics = {
      phase,
      status: 'running',
      startedAt: Date.now(),
      durationMs: 0,
      qualityScore: 0,
      itemsProcessed: 0,
      errorCount: 0,
      metadata: {},
    };

    this.activeCycle.phases.push(metrics);
  }

  /**
   * Complete a phase with results.
   */
  completePhase(
    phase: ProtocolPhase,
    result: {
      qualityScore?: number;
      itemsProcessed?: number;
      errorCount?: number;
      metadata?: Record<string, number | string>;
    } = {},
  ): void {
    if (!this.activeCycle) return;

    const phaseMetrics = this.activeCycle.phases.find(
      (p) => p.phase === phase && p.status === 'running',
    );
    if (!phaseMetrics) return;

    const now = Date.now();
    phaseMetrics.status = (result.errorCount ?? 0) > 0 ? 'failed' : 'completed';
    phaseMetrics.completedAt = now;
    phaseMetrics.durationMs = now - phaseMetrics.startedAt;
    phaseMetrics.qualityScore = result.qualityScore ?? 0;
    phaseMetrics.itemsProcessed = result.itemsProcessed ?? 0;
    phaseMetrics.errorCount = result.errorCount ?? 0;
    phaseMetrics.metadata = result.metadata ?? {};

    // Check quality threshold
    if (phaseMetrics.qualityScore < this.config.qualityAlertThreshold && phaseMetrics.qualityScore > 0) {
      this.emitAlert(
        'warning',
        `Phase "${phase}" quality (${phaseMetrics.qualityScore.toFixed(2)}) below threshold (${this.config.qualityAlertThreshold})`,
        'quality',
        phaseMetrics.qualityScore,
        this.config.qualityAlertThreshold,
        phase,
      );
    }
  }

  /**
   * Skip a phase (optional phases that were not needed).
   */
  skipPhase(phase: ProtocolPhase): void {
    if (!this.activeCycle) return;

    this.activeCycle.phases.push({
      phase,
      status: 'skipped',
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 0,
      qualityScore: 0,
      itemsProcessed: 0,
      errorCount: 0,
      metadata: {},
    });
  }

  /**
   * End the active cycle.
   */
  endCycle(status?: 'completed' | 'failed' | 'partial'): ExecutionCycle | null {
    if (!this.activeCycle) return null;

    const now = Date.now();
    this.activeCycle.completedAt = now;
    this.activeCycle.totalDurationMs = now - this.activeCycle.startedAt;

    // Determine overall status
    const completedPhases = this.activeCycle.phases.filter((p) => p.status === 'completed');
    const failedPhases = this.activeCycle.phases.filter((p) => p.status === 'failed');
    const totalNonSkipped = this.activeCycle.phases.filter((p) => p.status !== 'skipped').length;

    if (status) {
      this.activeCycle.overallStatus = status;
    } else if (failedPhases.length > 0) {
      this.activeCycle.overallStatus = 'failed';
    } else if (completedPhases.length === totalNonSkipped && totalNonSkipped > 0) {
      this.activeCycle.overallStatus = 'completed';
    } else {
      this.activeCycle.overallStatus = 'partial';
    }

    // Aggregate quality
    const qualityPhases = this.activeCycle.phases.filter(
      (p) => p.status === 'completed' && p.qualityScore > 0,
    );
    this.activeCycle.overallQuality =
      qualityPhases.length > 0
        ? qualityPhases.reduce((sum, p) => sum + p.qualityScore, 0) / qualityPhases.length
        : 0;

    // Aggregate items
    this.activeCycle.totalItemsProcessed = this.activeCycle.phases.reduce(
      (sum, p) => sum + p.itemsProcessed,
      0,
    );

    // Store and cleanup
    const completed = { ...this.activeCycle };
    this.cycles.push(completed);
    this.activeCycle = null;

    // Trim history
    if (this.cycles.length > this.config.maxCycleHistory) {
      this.cycles = this.cycles.slice(-this.config.maxCycleHistory);
    }

    return completed;
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  /**
   * Get completion rate across recent cycles.
   */
  getCompletionRate(windowSize?: number): number {
    const window = this.getWindow(windowSize);
    if (window.length === 0) return 0;

    const completed = window.filter((c) => c.overallStatus === 'completed').length;
    return completed / window.length;
  }

  /**
   * Get average quality across recent cycles.
   */
  getAverageQuality(windowSize?: number): number {
    const window = this.getWindow(windowSize);
    if (window.length === 0) return 0;

    const withQuality = window.filter((c) => c.overallQuality > 0);
    if (withQuality.length === 0) return 0;

    return withQuality.reduce((sum, c) => sum + c.overallQuality, 0) / withQuality.length;
  }

  /**
   * Detect bottleneck phases based on duration distribution.
   */
  detectBottlenecks(windowSize?: number): Bottleneck[] {
    const window = this.getWindow(windowSize);
    if (window.length < 3) return [];

    const phaseDurations = new Map<ProtocolPhase, number[]>();
    const phaseFailures = new Map<ProtocolPhase, number>();
    const phaseCounts = new Map<ProtocolPhase, number>();

    for (const cycle of window) {
      for (const pm of cycle.phases) {
        if (pm.status === 'skipped') continue;

        const durations = phaseDurations.get(pm.phase) ?? [];
        durations.push(pm.durationMs);
        phaseDurations.set(pm.phase, durations);

        const count = (phaseCounts.get(pm.phase) ?? 0) + 1;
        phaseCounts.set(pm.phase, count);

        if (pm.status === 'failed' || pm.status === 'timeout') {
          const failures = (phaseFailures.get(pm.phase) ?? 0) + 1;
          phaseFailures.set(pm.phase, failures);
        }
      }
    }

    // Calculate global median duration
    const allDurations: number[] = [];
    for (const durations of phaseDurations.values()) {
      allDurations.push(...durations);
    }
    const globalMedian = percentile(allDurations, 50);

    const bottlenecks: Bottleneck[] = [];

    for (const [phase, durations] of phaseDurations) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const med = percentile(durations, 50);
      const p95 = percentile(durations, 95);
      const count = phaseCounts.get(phase) ?? 1;
      const failures = phaseFailures.get(phase) ?? 0;
      const failureRate = failures / count;
      const slowdownFactor = globalMedian > 0 ? med / globalMedian : 1;

      const isBottleneck =
        slowdownFactor >= this.config.bottleneckMultiplier ||
        failureRate >= this.config.failureRateAlertThreshold;

      if (isBottleneck) {
        let severity: Bottleneck['severity'];
        if (failureRate > 0.5 || slowdownFactor > 10) severity = 'critical';
        else if (failureRate > 0.25 || slowdownFactor > 5) severity = 'high';
        else if (failureRate > 0.1 || slowdownFactor > 3) severity = 'medium';
        else severity = 'low';

        let recommendation: string;
        if (failureRate > 0.25) {
          recommendation = `Phase "${phase}" has a ${(failureRate * 100).toFixed(0)}% failure rate. Investigate error logs and add retry logic.`;
        } else if (slowdownFactor > 5) {
          recommendation = `Phase "${phase}" is ${slowdownFactor.toFixed(1)}x slower than median. Consider parallelization or caching.`;
        } else {
          recommendation = `Phase "${phase}" is slightly slow (${slowdownFactor.toFixed(1)}x median). Monitor for further degradation.`;
        }

        bottlenecks.push({
          phase,
          avgDurationMs: avg,
          medianDurationMs: med,
          p95DurationMs: p95,
          slowdownFactor,
          failureRate,
          severity,
          recommendation,
        });
      }
    }

    bottlenecks.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return bottlenecks;
  }

  /**
   * Perform trend analysis over the configured window.
   */
  analyzeTrends(windowSize?: number): TrendAnalysis {
    const window = this.getWindow(windowSize ?? this.config.trendWindowSize);

    if (window.length < 5) {
      return {
        windowSize: window.length,
        cyclesAnalyzed: window.length,
        phaseTrends: [],
        completionRateTrend: 'insufficient_data',
        qualityTrend: 'insufficient_data',
        throughputTrend: 'insufficient_data',
        bottlenecks: [],
      };
    }

    // Split window into first half and second half for trend detection
    const midpoint = Math.floor(window.length / 2);
    const firstHalf = window.slice(0, midpoint);
    const secondHalf = window.slice(midpoint);

    // Overall completion rate trend
    const firstCompletionRate = this.computeCompletionRate(firstHalf);
    const secondCompletionRate = this.computeCompletionRate(secondHalf);
    const completionRateTrend = detectTrend(firstCompletionRate, secondCompletionRate, 0.05);

    // Overall quality trend
    const firstQuality = this.computeAvgQuality(firstHalf);
    const secondQuality = this.computeAvgQuality(secondHalf);
    const qualityTrend = detectTrend(firstQuality, secondQuality, 0.03);

    // Throughput trend (items per second)
    const firstThroughput = this.computeThroughput(firstHalf);
    const secondThroughput = this.computeThroughput(secondHalf);
    const throughputTrend = detectTrend(firstThroughput, secondThroughput, 0.1);

    // Per-phase trends
    const phaseTrends: PhaseTrend[] = [];
    for (const phase of ALL_PHASES) {
      const firstPhaseMetrics = this.extractPhaseMetrics(firstHalf, phase);
      const secondPhaseMetrics = this.extractPhaseMetrics(secondHalf, phase);

      if (firstPhaseMetrics.length === 0 && secondPhaseMetrics.length === 0) continue;

      const allMetrics = [...firstPhaseMetrics, ...secondPhaseMetrics];
      const avgDuration = allMetrics.reduce((s, m) => s + m.durationMs, 0) / allMetrics.length;
      const avgQual =
        allMetrics.filter((m) => m.qualityScore > 0).reduce((s, m) => s + m.qualityScore, 0) /
          Math.max(1, allMetrics.filter((m) => m.qualityScore > 0).length);

      const firstAvgDur =
        firstPhaseMetrics.length > 0
          ? firstPhaseMetrics.reduce((s, m) => s + m.durationMs, 0) / firstPhaseMetrics.length
          : 0;
      const secondAvgDur =
        secondPhaseMetrics.length > 0
          ? secondPhaseMetrics.reduce((s, m) => s + m.durationMs, 0) / secondPhaseMetrics.length
          : 0;

      const firstAvgQual =
        firstPhaseMetrics.filter((m) => m.qualityScore > 0).length > 0
          ? firstPhaseMetrics.filter((m) => m.qualityScore > 0).reduce((s, m) => s + m.qualityScore, 0) /
            firstPhaseMetrics.filter((m) => m.qualityScore > 0).length
          : 0;
      const secondAvgQual =
        secondPhaseMetrics.filter((m) => m.qualityScore > 0).length > 0
          ? secondPhaseMetrics.filter((m) => m.qualityScore > 0).reduce((s, m) => s + m.qualityScore, 0) /
            secondPhaseMetrics.filter((m) => m.qualityScore > 0).length
          : 0;

      const completedCount = allMetrics.filter((m) => m.status === 'completed').length;
      const completionRate = allMetrics.length > 0 ? completedCount / allMetrics.length : 0;

      // For duration, lower is better (invert trend direction)
      const durationTrend = detectTrend(secondAvgDur, firstAvgDur, 0.1); // inverted: lower second = improving

      phaseTrends.push({
        phase,
        avgDurationMs: avgDuration,
        durationTrend,
        avgQuality: avgQual,
        qualityTrend: detectTrend(firstAvgQual, secondAvgQual, 0.03),
        completionRate,
        sampleCount: allMetrics.length,
      });
    }

    const bottlenecks = this.detectBottlenecks(windowSize);

    return {
      windowSize: window.length,
      cyclesAnalyzed: window.length,
      phaseTrends,
      completionRateTrend,
      qualityTrend,
      throughputTrend,
      bottlenecks,
    };
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Get all completed cycles. */
  getCycles(): ExecutionCycle[] {
    return [...this.cycles];
  }

  /** Get the currently active cycle, if any. */
  getActiveCycle(): ExecutionCycle | null {
    return this.activeCycle ? { ...this.activeCycle } : null;
  }

  /** Get all alerts. */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /** Clear alert history. */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Generate a summary report string.
   */
  generateSummary(): string {
    const trends = this.analyzeTrends();
    const lines: string[] = [
      'Protocol Execution Monitor — Summary',
      '=====================================',
      `Total cycles tracked: ${this.cycles.length}`,
      `Active cycle: ${this.activeCycle ? this.activeCycle.id : 'none'}`,
      `Completion rate: ${(this.getCompletionRate() * 100).toFixed(1)}%`,
      `Average quality: ${(this.getAverageQuality() * 100).toFixed(1)}%`,
      '',
      `Trends (window=${trends.windowSize}):`,
      `  Completion: ${trends.completionRateTrend}`,
      `  Quality: ${trends.qualityTrend}`,
      `  Throughput: ${trends.throughputTrend}`,
    ];

    if (trends.bottlenecks.length > 0) {
      lines.push('', 'Bottlenecks:');
      for (const b of trends.bottlenecks) {
        lines.push(`  [${b.severity.toUpperCase()}] ${b.phase}: ${b.recommendation}`);
      }
    }

    if (trends.phaseTrends.length > 0) {
      lines.push('', 'Phase Breakdown:');
      for (const pt of trends.phaseTrends) {
        lines.push(
          `  ${pt.phase}: avg=${pt.avgDurationMs.toFixed(0)}ms, quality=${(pt.avgQuality * 100).toFixed(0)}%, completion=${(pt.completionRate * 100).toFixed(0)}%, duration_trend=${pt.durationTrend}, quality_trend=${pt.qualityTrend}`,
        );
      }
    }

    if (this.alerts.length > 0) {
      lines.push('', `Recent Alerts (${this.alerts.length}):`);
      const recentAlerts = this.alerts.slice(-10);
      for (const a of recentAlerts) {
        lines.push(`  [${a.severity}] ${a.message}`);
      }
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getWindow(size?: number): ExecutionCycle[] {
    const n = size ?? this.config.trendWindowSize;
    return this.cycles.slice(-n);
  }

  private computeCompletionRate(cycles: ExecutionCycle[]): number {
    if (cycles.length === 0) return 0;
    return cycles.filter((c) => c.overallStatus === 'completed').length / cycles.length;
  }

  private computeAvgQuality(cycles: ExecutionCycle[]): number {
    const withQuality = cycles.filter((c) => c.overallQuality > 0);
    if (withQuality.length === 0) return 0;
    return withQuality.reduce((s, c) => s + c.overallQuality, 0) / withQuality.length;
  }

  private computeThroughput(cycles: ExecutionCycle[]): number {
    if (cycles.length === 0) return 0;
    const totalItems = cycles.reduce((s, c) => s + c.totalItemsProcessed, 0);
    const totalMs = cycles.reduce((s, c) => s + c.totalDurationMs, 0);
    return totalMs > 0 ? (totalItems / totalMs) * 1000 : 0;
  }

  private extractPhaseMetrics(cycles: ExecutionCycle[], phase: ProtocolPhase): PhaseMetrics[] {
    const result: PhaseMetrics[] = [];
    for (const cycle of cycles) {
      for (const pm of cycle.phases) {
        if (pm.phase === phase && pm.status !== 'skipped') {
          result.push(pm);
        }
      }
    }
    return result;
  }

  private emitAlert(
    severity: PerformanceAlert['severity'],
    message: string,
    metric: string,
    currentValue: number,
    threshold: number,
    phase?: ProtocolPhase,
  ): void {
    const alert: PerformanceAlert = {
      id: `alert-${++this.alertIdCounter}`,
      timestamp: Date.now(),
      severity,
      phase,
      message,
      metric,
      currentValue,
      threshold,
    };

    this.alerts.push(alert);

    // Trim alert history
    if (this.alerts.length > 500) {
      this.alerts = this.alerts.slice(-500);
    }

    if (this.config.onAlert) {
      this.config.onAlert(alert);
    }
  }
}

// =============================================================================
// STATISTICAL HELPERS
// =============================================================================

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

function detectTrend(
  firstValue: number,
  secondValue: number,
  threshold: number,
): TrendDirection {
  if (firstValue === 0 && secondValue === 0) return 'insufficient_data';
  const base = Math.max(firstValue, 0.001);
  const change = (secondValue - firstValue) / base;

  if (change > threshold) return 'improving';
  if (change < -threshold) return 'degrading';
  return 'stable';
}
