/**
 * Performance Tracker - Monitors parser performance over time
 * Tracks baseline metrics and alerts on degradation >5%
 * Generates reports for CI/CD integration
 *
 * Browser-compatible: Uses in-memory storage when file system unavailable
 */

import { readJson } from '../errors/safeJsonParse';

// Environment detection - safe for both browser and Node
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

export interface PerformanceMetric {
  name: string;
  timing: number; // milliseconds
  opsPerSec: number;
  timestamp: string;
  environment?: string;
}

export interface PerformanceBaseline {
  version: string;
  timestamp: string;
  metrics: Record<string, PerformanceMetric>;
}

export interface PerformanceReport {
  timestamp: string;
  baseline: PerformanceBaseline | null;
  current: PerformanceMetric[];
  comparisons: PerformanceComparison[];
  status: 'PASS' | 'WARN' | 'FAIL';
  alerts: string[];
}

export interface PerformanceComparison {
  name: string;
  baseline?: number;
  current: number;
  changePercent?: number;
  status: 'OK' | 'WARN' | 'FAIL';
}

const DEGRADATION_THRESHOLD = 5; // percent
const STORAGE_KEY_BASELINE = 'holoscript_perf_baseline';
const STORAGE_KEY_HISTORY = 'holoscript_perf_history';

// Storage abstraction for browser/Node compatibility
interface StorageProvider {
  exists(key: string): boolean;
  read(key: string): string | null;
  write(key: string, value: string): void;
  ensureDir(): void;
}

// In-memory fallback storage (works everywhere)
class MemoryStorage implements StorageProvider {
  private data: Map<string, string> = new Map();

  exists(key: string): boolean {
    return this.data.has(key);
  }

  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.data.set(key, value);
  }

  ensureDir(): void {
    // No-op for memory storage
  }
}

// Browser localStorage storage (if available)
class LocalStorage implements StorageProvider {
  exists(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage not available or quota exceeded
    }
  }

  ensureDir(): void {
    // No-op for localStorage
  }
}

// Create storage provider based on environment
function createStorage(): StorageProvider {
  // Try localStorage first in browser
  if (isBrowser) {
    try {
      // Test if localStorage is available
      const testKey = '__holoscript_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return new LocalStorage();
    } catch {
      // localStorage not available, fall through to memory
    }
  }

  // Default to memory storage
  return new MemoryStorage();
}

export class PerformanceTracker {
  private baseline: PerformanceBaseline | null = null;
  private currentMetrics: PerformanceMetric[] = [];
  private storage: StorageProvider;
  private nodeStorage: NodeStorageProvider | null = null;

  constructor() {
    this.storage = createStorage();
    this.storage.ensureDir();
    this.loadBaseline();

    // Try to initialize Node.js file storage if available
    this.initNodeStorage();
  }

  private async initNodeStorage(): Promise<void> {
    if (isBrowser) return;

    try {
      // Dynamic import for Node.js modules - won't execute in browser bundles
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const metricsDir = path.join(__dirname, '../../../.perf-metrics');

      this.nodeStorage = new NodeStorageProvider(fs, path, metricsDir);
      this.nodeStorage.ensureDir();

      // Reload baseline from file system if available
      const fileBaseline = this.nodeStorage.read('baseline.json');
      if (fileBaseline) {
        try {
          this.baseline = readJson(fileBaseline) as PerformanceBaseline;
        } catch {
          // Keep existing baseline
        }
      }
    } catch {
      // Not in Node.js environment, use existing storage
    }
  }

  private loadBaseline(): void {
    const content = this.storage.read(STORAGE_KEY_BASELINE);
    if (content) {
      try {
        this.baseline = readJson(content) as PerformanceBaseline;
      } catch (e) {
        console.warn('Failed to load baseline metrics:', e);
      }
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, timing: number, opsPerSec: number): void {
    // Get environment safely (works in browser and Node)
    let env = 'unknown';
    if (!isBrowser && typeof process !== 'undefined' && process.env) {
      env = process.env.NODE_ENV || 'test';
    } else if (isBrowser) {
      env = 'browser';
    }

    this.currentMetrics.push({
      name,
      timing,
      opsPerSec,
      timestamp: new Date().toISOString(),
      environment: env,
    });
  }

  /**
   * Compare current metrics against baseline
   */
  compare(): PerformanceComparison[] {
    const comparisons: PerformanceComparison[] = [];

    for (const metric of this.currentMetrics) {
      const baselineMetric = this.baseline?.metrics[metric.name];

      const comparison: PerformanceComparison = {
        name: metric.name,
        current: metric.timing,
        baseline: baselineMetric?.timing,
        status: 'OK',
      };

      if (baselineMetric) {
        const changePercent =
          ((metric.timing - baselineMetric.timing) / baselineMetric.timing) * 100;
        comparison.changePercent = Math.round(changePercent * 100) / 100;

        if (changePercent > DEGRADATION_THRESHOLD) {
          comparison.status = 'FAIL';
        } else if (changePercent > DEGRADATION_THRESHOLD / 2) {
          comparison.status = 'WARN';
        }
      }

      comparisons.push(comparison);
    }

    return comparisons;
  }

  /**
   * Generate a comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const comparisons = this.compare();
    const alerts: string[] = [];
    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';

    for (const comp of comparisons) {
      if (comp.status === 'FAIL') {
        status = 'FAIL';
        alerts.push(
          `PERFORMANCE DEGRADATION: ${comp.name} ${comp.changePercent}% slower (${comp.current?.toFixed(3)}ms vs baseline ${comp.baseline?.toFixed(3)}ms)`
        );
      } else if (comp.status === 'WARN') {
        status = status === 'FAIL' ? 'FAIL' : 'WARN';
        alerts.push(
          `PERFORMANCE TREND: ${comp.name} ${comp.changePercent}% slower (${comp.current?.toFixed(3)}ms)`
        );
      }
    }

    return {
      timestamp: new Date().toISOString(),
      baseline: this.baseline,
      current: this.currentMetrics,
      comparisons,
      status,
      alerts,
    };
  }

  /**
   * Save current metrics as new baseline
   */
  saveAsBaseline(version: string = 'current'): void {
    const baseline: PerformanceBaseline = {
      version,
      timestamp: new Date().toISOString(),
      metrics: {},
    };

    for (const metric of this.currentMetrics) {
      baseline.metrics[metric.name] = metric;
    }

    this.baseline = baseline;
    const json = JSON.stringify(baseline, null, 2);

    // Save to primary storage
    this.storage.write(STORAGE_KEY_BASELINE, json);

    // Also save to file system if available
    if (this.nodeStorage) {
      this.nodeStorage.write('baseline.json', json);
    }
  }

  /**
   * Append to history for tracking trends
   */
  archiveToHistory(label: string = ''): void {
    let history: Array<{ label: string; timestamp: string; metrics: PerformanceMetric[] }> = [];

    const content = this.storage.read(STORAGE_KEY_HISTORY);
    if (content) {
      try {
        history = readJson(content) as Array<{ label: string; timestamp: string; metrics: PerformanceMetric[] }>;
      } catch (e) {
        console.warn('Failed to load history:', e);
      }
    }

    history.push({
      label: label || new Date().toISOString(),
      timestamp: new Date().toISOString(),
      metrics: this.currentMetrics,
    });

    // Keep only last 50 entries
    if (history.length > 50) {
      history = history.slice(-50);
    }

    const json = JSON.stringify(history, null, 2);
    this.storage.write(STORAGE_KEY_HISTORY, json);

    // Also save to file system if available
    if (this.nodeStorage) {
      this.nodeStorage.write('history.json', json);
    }
  }

  /**
   * Print report to console
   */
  printReport(report: PerformanceReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('PERFORMANCE REPORT');
    console.log('='.repeat(60));

    console.log(`\nStatus: ${report.status}`);
    console.log(`Timestamp: ${report.timestamp}`);

    if (report.baseline) {
      console.log(`Baseline Version: ${report.baseline.version} (${report.baseline.timestamp})`);
    }

    console.log('\nMetrics:');
    for (const comp of report.comparisons) {
      const change =
        comp.changePercent !== undefined
          ? ` (${comp.changePercent > 0 ? '+' : ''}${comp.changePercent}%)`
          : '';
      console.log(`  ${comp.status}: ${comp.name}: ${comp.current?.toFixed(3)}ms${change}`);
    }

    if (report.alerts.length > 0) {
      console.log('\nAlerts:');
      for (const alert of report.alerts) {
        console.log(`  ${alert}`);
      }
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Get all metrics grouped by name
   */
  getAllMetrics(): Map<string, number[]> {
    const grouped = new Map<string, number[]>();
    for (const metric of this.currentMetrics) {
      if (!grouped.has(metric.name)) {
        grouped.set(metric.name, []);
      }
      grouped.get(metric.name)!.push(metric.timing);
    }
    return grouped;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalMetrics: number;
    avgTiming: number;
    minTiming: number;
    maxTiming: number;
    hasBaseline: boolean;
    percentWithinThreshold: number;
  } {
    if (this.currentMetrics.length === 0) {
      return {
        totalMetrics: 0,
        avgTiming: 0,
        minTiming: 0,
        maxTiming: 0,
        hasBaseline: !!this.baseline,
        percentWithinThreshold: 0,
      };
    }

    const timings = this.currentMetrics.map((m) => m.timing);
    const comparisons = this.compare();
    const withinThreshold = comparisons.filter(
      (c) => c.status === 'OK' || c.status === 'WARN'
    ).length;

    return {
      totalMetrics: this.currentMetrics.length,
      avgTiming: timings.reduce((a, b) => a + b, 0) / timings.length,
      minTiming: Math.min(...timings),
      maxTiming: Math.max(...timings),
      hasBaseline: !!this.baseline,
      percentWithinThreshold: (withinThreshold / comparisons.length) * 100,
    };
  }

  /**
   * Clear all recorded metrics (useful for testing)
   */
  clearMetrics(): void {
    this.currentMetrics = [];
  }
}

// Node.js file system storage provider (only used when in Node environment)
class NodeStorageProvider implements StorageProvider {
  constructor(
    private fs: typeof import('fs'),
    private path: typeof import('path'),
    private metricsDir: string
  ) {}

  exists(key: string): boolean {
    return this.fs.existsSync(this.path.join(this.metricsDir, key));
  }

  read(key: string): string | null {
    const filePath = this.path.join(this.metricsDir, key);
    if (this.fs.existsSync(filePath)) {
      try {
        return this.fs.readFileSync(filePath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  }

  write(key: string, value: string): void {
    this.fs.writeFileSync(this.path.join(this.metricsDir, key), value);
  }

  ensureDir(): void {
    if (!this.fs.existsSync(this.metricsDir)) {
      this.fs.mkdirSync(this.metricsDir, { recursive: true });
    }
  }
}

/**
 * Global singleton instance
 */
export const performanceTracker = new PerformanceTracker();
