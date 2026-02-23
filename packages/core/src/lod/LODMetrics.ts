/**
 * @holoscript/core LOD Performance Metrics
 *
 * Real-time performance tracking and profiling for LOD system.
 * Provides detailed metrics for optimization and debugging.
 *
 * v3.5 Performance Optimization
 */

// ============================================================================
// Types
// ============================================================================

export interface LODLevelHistogram {
  level: number;
  objectCount: number;
  triangleCount: number;
  memoryBytes: number;
  percentage: number;
}

export interface TransitionCostAnalysis {
  entityId: string;
  fromLevel: number;
  toLevel: number;
  costMs: number;
  timestamp: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  frameTimeMs: number;
  lodSelectionTimeMs: number;
  transitionTimeMs: number;
  totalObjects: number;
  activeTransitions: number;
  memoryUsageMB: number;
  averageLODLevel: number;
}

export interface ProfilingData {
  name: string;
  durationMs: number;
  callCount: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
}

// ============================================================================
// LOD Performance Metrics
// ============================================================================

/**
 * Real-time performance tracking for LOD system
 */
export class LODPerformanceMetrics {
  private histogram: Map<number, LODLevelHistogram> = new Map();
  private transitionCosts: TransitionCostAnalysis[] = [];
  private snapshots: PerformanceSnapshot[] = [];
  private profilingData: Map<string, ProfilingData> = new Map();
  private maxHistorySize: number = 1000;
  private maxTransitionHistory: number = 100;
  private enabled: boolean = true;

  // Counters
  private totalTransitions: number = 0;
  private totalSelections: number = 0;
  private totalFrames: number = 0;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  // ==========================================================================
  // Histogram Tracking
  // ==========================================================================

  /**
   * Update LOD level histogram
   */
  updateHistogram(objectsPerLevel: Map<number, number>, trianglesPerLevel: Map<number, number>): void {
    if (!this.enabled) return;

    this.histogram.clear();

    let totalObjects = 0;
    for (const count of objectsPerLevel.values()) {
      totalObjects += count;
    }

    for (const [level, count] of objectsPerLevel) {
      const triangles = trianglesPerLevel.get(level) || 0;
      const percentage = totalObjects > 0 ? (count / totalObjects) * 100 : 0;

      this.histogram.set(level, {
        level,
        objectCount: count,
        triangleCount: triangles,
        memoryBytes: 0, // Would be calculated from actual geometry
        percentage
      });
    }
  }

  /**
   * Get LOD level histogram
   */
  getHistogram(): LODLevelHistogram[] {
    return Array.from(this.histogram.values()).sort((a, b) => a.level - b.level);
  }

  /**
   * Get formatted histogram
   */
  getFormattedHistogram(): string {
    const histogram = this.getHistogram();
    let output = 'LOD Level Distribution:\n';

    for (const entry of histogram) {
      const bar = '█'.repeat(Math.round(entry.percentage / 2));
      output += `  L${entry.level}: ${bar} ${entry.objectCount} objects (${entry.percentage.toFixed(1)}%)\n`;
    }

    return output;
  }

  // ==========================================================================
  // Transition Cost Analysis
  // ==========================================================================

  /**
   * Record transition cost
   */
  recordTransitionCost(entityId: string, fromLevel: number, toLevel: number, costMs: number): void {
    if (!this.enabled) return;

    const analysis: TransitionCostAnalysis = {
      entityId,
      fromLevel,
      toLevel,
      costMs,
      timestamp: Date.now()
    };

    this.transitionCosts.push(analysis);

    // Keep only recent history
    if (this.transitionCosts.length > this.maxTransitionHistory) {
      this.transitionCosts.shift();
    }

    this.totalTransitions++;
  }

  /**
   * Get transition cost statistics
   */
  getTransitionCostStats(): {
    average: number;
    min: number;
    max: number;
    total: number;
    count: number;
  } {
    if (this.transitionCosts.length === 0) {
      return { average: 0, min: 0, max: 0, total: 0, count: 0 };
    }

    const costs = this.transitionCosts.map(t => t.costMs);
    const total = costs.reduce((sum, cost) => sum + cost, 0);
    const average = total / costs.length;
    const min = Math.min(...costs);
    const max = Math.max(...costs);

    return {
      average,
      min,
      max,
      total,
      count: costs.length
    };
  }

  /**
   * Get recent transition costs
   */
  getRecentTransitions(count: number = 10): TransitionCostAnalysis[] {
    return this.transitionCosts.slice(-count);
  }

  // ==========================================================================
  // Performance Snapshots
  // ==========================================================================

  /**
   * Record performance snapshot
   */
  recordSnapshot(
    frameTimeMs: number,
    lodSelectionTimeMs: number,
    transitionTimeMs: number,
    totalObjects: number,
    activeTransitions: number,
    memoryUsageMB: number,
    averageLODLevel: number
  ): void {
    if (!this.enabled) return;

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      frameTimeMs,
      lodSelectionTimeMs,
      transitionTimeMs,
      totalObjects,
      activeTransitions,
      memoryUsageMB,
      averageLODLevel
    };

    this.snapshots.push(snapshot);

    // Keep only recent history
    if (this.snapshots.length > this.maxHistorySize) {
      this.snapshots.shift();
    }

    this.totalFrames++;
  }

  /**
   * Get performance snapshots
   */
  getSnapshots(count?: number): PerformanceSnapshot[] {
    if (count) {
      return this.snapshots.slice(-count);
    }
    return [...this.snapshots];
  }

  /**
   * Get average performance over recent snapshots
   */
  getAveragePerformance(sampleCount: number = 60): {
    frameTimeMs: number;
    lodSelectionTimeMs: number;
    transitionTimeMs: number;
    fps: number;
  } {
    const samples = this.snapshots.slice(-sampleCount);

    if (samples.length === 0) {
      return { frameTimeMs: 0, lodSelectionTimeMs: 0, transitionTimeMs: 0, fps: 0 };
    }

    let totalFrameTime = 0;
    let totalSelectionTime = 0;
    let totalTransitionTime = 0;

    for (const snapshot of samples) {
      totalFrameTime += snapshot.frameTimeMs;
      totalSelectionTime += snapshot.lodSelectionTimeMs;
      totalTransitionTime += snapshot.transitionTimeMs;
    }

    const count = samples.length;
    const avgFrameTime = totalFrameTime / count;

    return {
      frameTimeMs: avgFrameTime,
      lodSelectionTimeMs: totalSelectionTime / count,
      transitionTimeMs: totalTransitionTime / count,
      fps: avgFrameTime > 0 ? 1000 / avgFrameTime : 0
    };
  }

  // ==========================================================================
  // Profiling Hooks
  // ==========================================================================

  /**
   * Start profiling a code section
   */
  startProfile(name: string): number {
    if (!this.enabled) return 0;
    return performance.now();
  }

  /**
   * End profiling and record result
   */
  endProfile(name: string, startTime: number): void {
    if (!this.enabled) return;

    const duration = performance.now() - startTime;

    let data = this.profilingData.get(name);

    if (!data) {
      data = {
        name,
        durationMs: 0,
        callCount: 0,
        averageMs: 0,
        minMs: duration,
        maxMs: duration
      };
      this.profilingData.set(name, data);
    }

    data.callCount++;
    data.durationMs += duration;
    data.averageMs = data.durationMs / data.callCount;
    data.minMs = Math.min(data.minMs, duration);
    data.maxMs = Math.max(data.maxMs, duration);
  }

  /**
   * Get profiling data
   */
  getProfilingData(): ProfilingData[] {
    return Array.from(this.profilingData.values());
  }

  /**
   * Get profiling data by name
   */
  getProfilingDataByName(name: string): ProfilingData | undefined {
    return this.profilingData.get(name);
  }

  /**
   * Reset profiling data
   */
  resetProfiling(): void {
    this.profilingData.clear();
  }

  // ==========================================================================
  // Telemetry Export
  // ==========================================================================

  /**
   * Export metrics to telemetry system
   */
  exportToTelemetry(): {
    histogram: LODLevelHistogram[];
    transitionStats: ReturnType<typeof this.getTransitionCostStats>;
    averagePerformance: ReturnType<typeof this.getAveragePerformance>;
    profiling: ProfilingData[];
    counters: {
      totalTransitions: number;
      totalSelections: number;
      totalFrames: number;
    };
  } {
    return {
      histogram: this.getHistogram(),
      transitionStats: this.getTransitionCostStats(),
      averagePerformance: this.getAveragePerformance(),
      profiling: this.getProfilingData(),
      counters: {
        totalTransitions: this.totalTransitions,
        totalSelections: this.totalSelections,
        totalFrames: this.totalFrames
      }
    };
  }

  /**
   * Export to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.exportToTelemetry(), null, 2);
  }

  // ==========================================================================
  // Debug UI Hooks
  // ==========================================================================

  /**
   * Get formatted debug output
   */
  getDebugOutput(): string {
    const transitionStats = this.getTransitionCostStats();
    const avgPerf = this.getAveragePerformance();

    return `
=== LOD Performance Metrics ===

Frame Performance:
  FPS: ${avgPerf.fps.toFixed(1)}
  Frame Time: ${avgPerf.frameTimeMs.toFixed(2)} ms
  LOD Selection: ${avgPerf.lodSelectionTimeMs.toFixed(2)} ms
  Transitions: ${avgPerf.transitionTimeMs.toFixed(2)} ms

Transition Costs:
  Average: ${transitionStats.average.toFixed(2)} ms
  Min: ${transitionStats.min.toFixed(2)} ms
  Max: ${transitionStats.max.toFixed(2)} ms
  Total Transitions: ${this.totalTransitions}

${this.getFormattedHistogram()}

Profiling Data:
${this.getProfilingData().map(p =>
  `  ${p.name}: ${p.averageMs.toFixed(2)} ms avg (${p.callCount} calls)`
).join('\n')}
    `.trim();
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Enable metrics collection
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable metrics collection
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if metrics are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.histogram.clear();
    this.transitionCosts = [];
    this.snapshots = [];
    this.profilingData.clear();
    this.totalTransitions = 0;
    this.totalSelections = 0;
    this.totalFrames = 0;
  }

  /**
   * Set maximum history size
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(1, size);
  }

  /**
   * Get total transition count
   */
  getTotalTransitions(): number {
    return this.totalTransitions;
  }

  /**
   * Get total selection count
   */
  getTotalSelections(): number {
    return this.totalSelections;
  }

  /**
   * Get total frame count
   */
  getTotalFrames(): number {
    return this.totalFrames;
  }

  /**
   * Increment selection counter
   */
  incrementSelections(): void {
    this.totalSelections++;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create LOD performance metrics tracker
 */
export function createLODPerformanceMetrics(enabled: boolean = true): LODPerformanceMetrics {
  return new LODPerformanceMetrics(enabled);
}
