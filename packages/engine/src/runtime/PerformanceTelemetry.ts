/**
 * @holoscript/core Performance Telemetry
 *
 * Real-time performance monitoring, profiling, and metrics collection
 * Exports metrics to analytics platforms and provides performance budgets
 */

export type MetricType = 'gauge' | 'counter' | 'histogram' | 'timer';
export type SeverityLevel = 'info' | 'warning' | 'critical';

/**
 * Performance metric
 */
export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: string;
}

/**
 * Performance budget threshold
 */
export interface PerformanceBudget {
  metricName: string;
  maxValue: number;
  severity: SeverityLevel;
  enabled: boolean;
}

/**
 * Frame timing information
 */
export interface FrameTiming {
  frameNumber: number;
  fps: number;
  frameDuration: number; // ms
  cpuTime: number; // ms
  gpuTime: number; // ms
  renderTime: number; // ms
  logicTime: number; // ms
  timestamp: number;
}

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  objectCount: number;
  gcEventsSinceLastSnapshot: number;
  timestamp: number;
}

/**
 * Performance analytics exporter
 */
export interface AnalyticsExporter {
  export(metrics: Metric[]): Promise<void>;
  flush(): Promise<void>;
}

/**
 * PerformanceTelemetry - Monitor and analyze runtime performance
 */
export class PerformanceTelemetry {
  private metrics: Metric[] = [];
  private budgets: Map<string, PerformanceBudget> = new Map();
  private frameTimings: FrameTiming[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private exporters: AnalyticsExporter[] = [];

  private frameCounter: number = 0;
  private lastFrameTime: number = Date.now();
  private frameTimes: number[] = [];
  private maxFrameHistory: number = 300; // ~5s at 60fps

  private monitoringEnabled: boolean = false;
  private exportInterval: ReturnType<typeof setInterval> | null = null;
  private exportIntervalMs: number = 10000; // Export every 10s

  constructor() {
    this.initializeDefaultBudgets();
  }

  /**
   * Initialize default performance budgets
   */
  private initializeDefaultBudgets(): void {
    // Frame budget: 16.67ms target (60fps)
    this.setBudget({
      metricName: 'frame_duration',
      maxValue: 16.67,
      severity: 'warning',
      enabled: true,
    });

    // Memory budget: 100MB
    this.setBudget({
      metricName: 'heap_used',
      maxValue: 100 * 1024 * 1024,
      severity: 'warning',
      enabled: true,
    });

    // Render time budget: 10ms
    this.setBudget({
      metricName: 'render_time',
      maxValue: 10,
      severity: 'warning',
      enabled: true,
    });
  }

  /**
   * Start performance monitoring
   */
  public startMonitoring(): void {
    if (this.monitoringEnabled) return;

    this.monitoringEnabled = true;
    this.lastFrameTime = performance.now();

    // Setup auto-export
    if (this.exporters.length > 0) {
      this.exportInterval = setInterval(() => {
        this.exportMetrics();
      }, this.exportIntervalMs);
    }

  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (!this.monitoringEnabled) return;

    this.monitoringEnabled = false;

    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
    }

  }

  /**
   * Record frame timing
   */
  public recordFrame(
    cpuTime: number,
    gpuTime: number,
    renderTime: number,
    logicTime: number
  ): void {
    if (!this.monitoringEnabled) return;

    const now = performance.now();
    const frameDuration = now - this.lastFrameTime;
    const fps = Math.round(1000 / frameDuration);

    this.frameTimes.push(frameDuration);
    if (this.frameTimes.length > this.maxFrameHistory) {
      this.frameTimes.shift();
    }

    const timing: FrameTiming = {
      frameNumber: this.frameCounter++,
      fps,
      frameDuration,
      cpuTime,
      gpuTime,
      renderTime,
      logicTime,
      timestamp: now,
    };

    this.frameTimings.push(timing);

    // Record metrics
    this.recordMetric({
      name: 'frame_duration',
      type: 'gauge',
      value: frameDuration,
      unit: 'ms',
      timestamp: now,
    });

    this.recordMetric({
      name: 'fps',
      type: 'gauge',
      value: fps,
      timestamp: now,
    });

    this.recordMetric({
      name: 'render_time',
      type: 'gauge',
      value: renderTime,
      unit: 'ms',
      timestamp: now,
    });

    this.checkBudgets(timing);
    this.lastFrameTime = now;
  }

  /**
   * Record custom metric
   */
  public recordMetric(metric: Omit<Metric, 'timestamp'> & { timestamp?: number }): void {
    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp ?? Date.now(),
    });
  }

  /**
   * Record memory snapshot
   */
  public recordMemorySnapshot(): void {
    if (!this.monitoringEnabled) return;

    const perf = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;

    if (!perf) {
      console.warn('Memory profiling not available');
      return;
    }

    const snapshot: MemorySnapshot = {
      usedJSHeapSize: perf.usedJSHeapSize,
      totalJSHeapSize: perf.totalJSHeapSize,
      jsHeapSizeLimit: perf.jsHeapSizeLimit,
      objectCount: 0, // Would require additional instrumentation
      gcEventsSinceLastSnapshot: 0,
      timestamp: Date.now(),
    };

    this.memorySnapshots.push(snapshot);

    // Record as metrics
    this.recordMetric({
      name: 'heap_used',
      type: 'gauge',
      value: snapshot.usedJSHeapSize,
      unit: 'bytes',
      timestamp: snapshot.timestamp,
    });

    this.recordMetric({
      name: 'heap_total',
      type: 'gauge',
      value: snapshot.totalJSHeapSize,
      unit: 'bytes',
      timestamp: snapshot.timestamp,
    });

    // Check memory budget
    const budget = this.budgets.get('heap_used');
    if (budget && budget.enabled && snapshot.usedJSHeapSize > budget.maxValue) {
      this.emitBudgetViolation(
        'heap_used',
        snapshot.usedJSHeapSize,
        budget.maxValue,
        budget.severity
      );
    }
  }

  /**
   * Check frame metrics against budgets
   */
  private checkBudgets(timing: FrameTiming): void {
    // Check frame duration budget
    const frameBudget = this.budgets.get('frame_duration');
    if (frameBudget && frameBudget.enabled && timing.frameDuration > frameBudget.maxValue) {
      this.emitBudgetViolation(
        'frame_duration',
        timing.frameDuration,
        frameBudget.maxValue,
        frameBudget.severity
      );
    }

    // Check render time budget
    const renderBudget = this.budgets.get('render_time');
    if (renderBudget && renderBudget.enabled && timing.renderTime > renderBudget.maxValue) {
      this.emitBudgetViolation(
        'render_time',
        timing.renderTime,
        renderBudget.maxValue,
        renderBudget.severity
      );
    }
  }

  /**
   * Emit budget violation warning
   */
  private emitBudgetViolation(
    metric: string,
    actual: number,
    budget: number,
    severity: SeverityLevel
  ): void {
    const message = `Budget violation: ${metric} = ${actual.toFixed(2)} (budget: ${budget.toFixed(2)})`;

    if (severity === 'critical') {
      console.error(`❌ ${message}`);
    } else if (severity === 'warning') {
      console.warn(`⚠️ ${message}`);
    } else {
      console.log(`ℹ️ ${message}`);
    }
  }

  /**
   * Set or update performance budget
   */
  public setBudget(budget: PerformanceBudget): void {
    this.budgets.set(budget.metricName, budget);
  }

  /**
   * Get average FPS over recent frames
   */
  public getAverageFPS(): number {
    if (this.frameTimes.length === 0) return 0;

    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1000 / avgFrameTime);
  }

  /**
   * Get memory usage stats
   */
  public getMemoryStats(): {
    used: number;
    total: number;
    limit: number;
    percentage: number;
  } {
    if (this.memorySnapshots.length === 0) {
      return { used: 0, total: 0, limit: 0, percentage: 0 };
    }

    const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
    return {
      used: latest.usedJSHeapSize,
      total: latest.totalJSHeapSize,
      limit: latest.jsHeapSizeLimit,
      percentage: (latest.usedJSHeapSize / latest.jsHeapSizeLimit) * 100,
    };
  }

  /**
   * Get recent frame timings
   */
  public getRecentFrameTimings(count: number = 60): FrameTiming[] {
    return this.frameTimings.slice(-count);
  }

  /**
   * Add analytics exporter
   */
  public addExporter(exporter: AnalyticsExporter): void {
    this.exporters.push(exporter);
  }

  /**
   * Export all metrics to registered exporters
   */
  public async exportMetrics(): Promise<void> {
    if (this.metrics.length === 0) return;

    const metricsToExport = [...this.metrics];
    this.metrics = []; // Clear after export

    for (const exporter of this.exporters) {
      try {
        await exporter.export(metricsToExport);
      } catch (error) {
        console.error('Failed to export metrics:', error);
      }
    }
  }

  /**
   * Generate performance report
   */
  public generateReport(): string {
    const avgFps = this.getAverageFPS();
    const memStats = this.getMemoryStats();
    const recentFrames = this.getRecentFrameTimings(60);

    let report = '=== Performance Report ===\n\n';

    report += `Average FPS: ${avgFps}\n`;
    report += `Recent Frame Count: ${recentFrames.length}\n`;

    if (recentFrames.length > 0) {
      const avgFrameTime =
        recentFrames.reduce((sum, f) => sum + f.frameDuration, 0) / recentFrames.length;
      const maxFrameTime = Math.max(...recentFrames.map((f) => f.frameDuration));
      const minFrameTime = Math.min(...recentFrames.map((f) => f.frameDuration));

      report += `Frame Time: min=${minFrameTime.toFixed(2)}ms, avg=${avgFrameTime.toFixed(2)}ms, max=${maxFrameTime.toFixed(2)}ms\n`;
    }

    report += `\nMemory Usage:\n`;
    report += `  Used: ${(memStats.used / 1024 / 1024).toFixed(2)} MB\n`;
    report += `  Total: ${(memStats.total / 1024 / 1024).toFixed(2)} MB\n`;
    report += `  Limit: ${(memStats.limit / 1024 / 1024).toFixed(2)} MB\n`;
    report += `  Percentage: ${memStats.percentage.toFixed(1)}%\n`;

    report += `\nMetrics Recorded: ${this.metrics.length}\n`;
    report += `Memory Snapshots: ${this.memorySnapshots.length}\n`;

    return report;
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.stopMonitoring();
    this.metrics = [];
    this.frameTimings = [];
    this.memorySnapshots = [];
    this.frameTimes = [];
    this.budgets.clear();
    this.exporters = [];
  }
}

/**
 * Singleton instance
 */
let telemetryInstance: PerformanceTelemetry | null = null;

/**
 * Get or create telemetry instance
 */
export function getPerformanceTelemetry(): PerformanceTelemetry {
  if (!telemetryInstance) {
    telemetryInstance = new PerformanceTelemetry();
  }
  return telemetryInstance;
}

