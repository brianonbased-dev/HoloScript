/**
 * Heap Budget Monitor
 *
 * Tracks component state size, Redux store size, and cache size using Chrome DevTools Memory API.
 * Alerts at 70% heap utilization and triggers state pruning or cache eviction.
 *
 * Target: Zero memory leak incidents, responsive UI maintained
 */

export interface HeapMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  utilizationPercentage: number;
  timestamp: number;
}

export interface ComponentStateMetrics {
  componentName: string;
  stateSize: number;
  propsSize: number;
  timestamp: number;
}

export interface ReduxStoreMetrics {
  totalSize: number;
  slicesSizes: Record<string, number>;
  timestamp: number;
}

export interface CacheMetrics {
  totalSize: number;
  entries: number;
  timestamp: number;
}

export interface MonitorConfig {
  /** Threshold percentage (0-100) to trigger alerts */
  alertThreshold: number;
  /** Interval in ms to check heap metrics */
  checkInterval: number;
  /** Enable automatic state pruning */
  enableAutoPruning: boolean;
  /** Enable automatic cache eviction */
  enableAutoCacheEviction: boolean;
  /** Maximum history entries to keep */
  maxHistorySize: number;
  /** Callback when threshold exceeded */
  onThresholdExceeded?: (metrics: HeapMetrics) => void;
  /** Callback after pruning */
  onPruningComplete?: (freedBytes: number) => void;
}

export class HeapBudgetMonitor {
  private config: MonitorConfig;
  private metricsHistory: HeapMetrics[] = [];
  private componentStateHistory: Map<string, ComponentStateMetrics[]> = new Map();
  private checkIntervalId: number | null = null;
  private isMonitoring = false;

  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = {
      alertThreshold: config.alertThreshold ?? 70,
      checkInterval: config.checkInterval ?? 5000,
      enableAutoPruning: config.enableAutoPruning ?? true,
      enableAutoCacheEviction: config.enableAutoCacheEviction ?? true,
      maxHistorySize: config.maxHistorySize ?? 100,
      onThresholdExceeded: config.onThresholdExceeded,
      onPruningComplete: config.onPruningComplete,
    };
  }

  /**
   * Start monitoring heap usage
   */
  start(): void {
    if (this.isMonitoring) {
      console.warn('[HeapBudgetMonitor] Already monitoring');
      return;
    }

    if (!this.isMemoryAPIAvailable()) {
      console.error('[HeapBudgetMonitor] Memory API not available. Enable with --enable-precise-memory-info flag.');
      return;
    }

    this.isMonitoring = true;
    this.checkIntervalId = window.setInterval(() => {
      this.checkHeapUsage();
    }, this.config.checkInterval);

    console.log('[HeapBudgetMonitor] Started monitoring', {
      threshold: `${this.config.alertThreshold}%`,
      interval: `${this.config.checkInterval}ms`,
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkIntervalId !== null) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    this.isMonitoring = false;
    console.log('[HeapBudgetMonitor] Stopped monitoring');
  }

  /**
   * Check if Memory API is available
   */
  private isMemoryAPIAvailable(): boolean {
    return !!(performance as any).memory;
  }

  /**
   * Get current heap metrics
   */
  getHeapMetrics(): HeapMetrics | null {
    if (!this.isMemoryAPIAvailable()) {
      return null;
    }

    const memory = (performance as any).memory;
    const utilizationPercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      utilizationPercentage,
      timestamp: Date.now(),
    };
  }

  /**
   * Check heap usage and trigger alerts if needed
   */
  private checkHeapUsage(): void {
    const metrics = this.getHeapMetrics();
    if (!metrics) return;

    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.config.maxHistorySize) {
      this.metricsHistory.shift();
    }

    // Check threshold
    if (metrics.utilizationPercentage >= this.config.alertThreshold) {
      console.warn('[HeapBudgetMonitor] Threshold exceeded', {
        current: `${metrics.utilizationPercentage.toFixed(2)}%`,
        threshold: `${this.config.alertThreshold}%`,
        usedMB: (metrics.usedJSHeapSize / 1024 / 1024).toFixed(2),
        limitMB: (metrics.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
      });

      // Trigger callback
      this.config.onThresholdExceeded?.(metrics);

      // Auto-remediation
      if (this.config.enableAutoPruning || this.config.enableAutoCacheEviction) {
        this.performAutomaticCleanup(metrics);
      }
    }
  }

  /**
   * Perform automatic cleanup when threshold exceeded
   */
  private async performAutomaticCleanup(beforeMetrics: HeapMetrics): Promise<void> {
    console.log('[HeapBudgetMonitor] Starting automatic cleanup');

    const beforeSize = beforeMetrics.usedJSHeapSize;

    // Trigger cache eviction
    if (this.config.enableAutoCacheEviction) {
      this.evictCaches();
    }

    // Trigger state pruning (notify listeners)
    if (this.config.enableAutoPruning) {
      this.notifyPruningRequired();
    }

    // Force garbage collection if available (Chrome DevTools)
    if ((window as any).gc) {
      (window as any).gc();
    }

    // Wait a bit for cleanup to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));

    const afterMetrics = this.getHeapMetrics();
    if (afterMetrics) {
      const freedBytes = beforeSize - afterMetrics.usedJSHeapSize;
      console.log('[HeapBudgetMonitor] Cleanup complete', {
        freedMB: (freedBytes / 1024 / 1024).toFixed(2),
        newUtilization: `${afterMetrics.utilizationPercentage.toFixed(2)}%`,
      });

      this.config.onPruningComplete?.(freedBytes);
    }
  }

  /**
   * Evict browser caches
   */
  private evictCaches(): void {
    // Clear session storage non-critical items
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (key.startsWith('cache_') || key.startsWith('temp_')) {
        sessionStorage.removeItem(key);
      }
    });

    // Dispatch event for application-level cache eviction
    window.dispatchEvent(new CustomEvent('heap-monitor:cache-eviction-required'));

    console.log('[HeapBudgetMonitor] Cache eviction triggered');
  }

  /**
   * Notify application that state pruning is required
   */
  private notifyPruningRequired(): void {
    window.dispatchEvent(new CustomEvent('heap-monitor:state-pruning-required'));
    console.log('[HeapBudgetMonitor] State pruning notification dispatched');
  }

  /**
   * Track component state size
   */
  trackComponentState(componentName: string, state: any, props: any): void {
    const stateSize = this.estimateSize(state);
    const propsSize = this.estimateSize(props);

    const metrics: ComponentStateMetrics = {
      componentName,
      stateSize,
      propsSize,
      timestamp: Date.now(),
    };

    if (!this.componentStateHistory.has(componentName)) {
      this.componentStateHistory.set(componentName, []);
    }

    const history = this.componentStateHistory.get(componentName)!;
    history.push(metrics);

    if (history.length > this.config.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Track Redux store size
   */
  trackReduxStore(store: any): ReduxStoreMetrics {
    const state = store.getState();
    const totalSize = this.estimateSize(state);
    const slicesSizes: Record<string, number> = {};

    for (const [key, value] of Object.entries(state)) {
      slicesSizes[key] = this.estimateSize(value);
    }

    return {
      totalSize,
      slicesSizes,
      timestamp: Date.now(),
    };
  }

  /**
   * Track cache size
   */
  trackCache(cache: Map<any, any> | Cache): CacheMetrics {
    let totalSize = 0;
    let entries = 0;

    if (cache instanceof Map) {
      entries = cache.size;
      cache.forEach((value, key) => {
        totalSize += this.estimateSize(key) + this.estimateSize(value);
      });
    }

    return {
      totalSize,
      entries,
      timestamp: Date.now(),
    };
  }

  /**
   * Estimate object size in bytes (rough approximation)
   */
  private estimateSize(obj: any): number {
    const seen = new WeakSet();

    const calculateSize = (value: any): number => {
      if (value === null || value === undefined) return 0;

      // Primitives
      if (typeof value === 'boolean') return 4;
      if (typeof value === 'number') return 8;
      if (typeof value === 'string') return value.length * 2; // UTF-16

      // Avoid circular references
      if (typeof value === 'object') {
        if (seen.has(value)) return 0;
        seen.add(value);

        let size = 0;

        if (Array.isArray(value)) {
          size += value.length * 8; // array overhead
          for (const item of value) {
            size += calculateSize(item);
          }
        } else {
          for (const [key, val] of Object.entries(value)) {
            size += key.length * 2; // key size
            size += calculateSize(val);
          }
        }

        return size;
      }

      return 0;
    };

    return calculateSize(obj);
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): HeapMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Get component state history
   */
  getComponentStateHistory(componentName?: string): Map<string, ComponentStateMetrics[]> | ComponentStateMetrics[] {
    if (componentName) {
      return this.componentStateHistory.get(componentName) || [];
    }
    return new Map(this.componentStateHistory);
  }

  /**
   * Get top memory-consuming components
   */
  getTopMemoryComponents(limit = 10): Array<{ componentName: string; avgStateSize: number }> {
    const componentStats: Array<{ componentName: string; avgStateSize: number }> = [];

    this.componentStateHistory.forEach((history, componentName) => {
      if (history.length === 0) return;

      const avgStateSize = history.reduce((sum, m) => sum + m.stateSize, 0) / history.length;
      componentStats.push({ componentName, avgStateSize });
    });

    return componentStats
      .sort((a, b) => b.avgStateSize - a.avgStateSize)
      .slice(0, limit);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metricsHistory = [];
    this.componentStateHistory.clear();
    console.log('[HeapBudgetMonitor] Metrics reset');
  }

  /**
   * Get current status
   */
  getStatus() {
    const currentMetrics = this.getHeapMetrics();
    const topComponents = this.getTopMemoryComponents(5);

    return {
      isMonitoring: this.isMonitoring,
      currentMetrics,
      topComponents,
      historySize: this.metricsHistory.length,
      config: this.config,
    };
  }
}

// Export singleton instance
export const heapMonitor = new HeapBudgetMonitor();
