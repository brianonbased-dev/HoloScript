/**
 * PoolDiagnostics.ts
 *
 * Pool monitoring: usage metrics, fragmentation analysis,
 * leak detection, and health reporting.
 *
 * @module pooling
 */

import { ObjectPool, PoolStats } from './ObjectPool';

// =============================================================================
// TYPES
// =============================================================================

export interface PoolHealthReport {
  poolName: string;
  stats: PoolStats;
  utilization: number; // 0-1
  fragmentation: number; // 0-1 (free / total)
  possibleLeaks: number;
  isHealthy: boolean;
  warnings: string[];
}

export interface LeakEntry {
  poolName: string;
  acquireTime: number;
  age: number; // seconds since acquire
}

// =============================================================================
// POOL DIAGNOSTICS
// =============================================================================

export class PoolDiagnostics {
  private pools: Map<string, ObjectPool<unknown>> = new Map();
  private acquireTimes: Map<string, Map<unknown, number>> = new Map(); // pool → obj → timestamp
  private leakThreshold: number; // seconds before flagging as potential leak
  private history: Array<{ poolName: string; time: number; stats: PoolStats }> = [];
  private maxHistory = 1000;

  constructor(leakThreshold = 60) {
    this.leakThreshold = leakThreshold;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(name: string, pool: ObjectPool<unknown>): void {
    this.pools.set(name, pool);
    this.acquireTimes.set(name, new Map());
  }

  // ---------------------------------------------------------------------------
  // Tracking
  // ---------------------------------------------------------------------------

  trackAcquire(poolName: string, obj: unknown): void {
    this.acquireTimes.get(poolName)?.set(obj, Date.now());
  }

  trackRelease(poolName: string, obj: unknown): void {
    this.acquireTimes.get(poolName)?.delete(obj);
  }

  // ---------------------------------------------------------------------------
  // Health Report
  // ---------------------------------------------------------------------------

  getHealthReport(poolName: string): PoolHealthReport | null {
    const pool = this.pools.get(poolName);
    if (!pool) return null;

    const stats = pool.getStats();
    const total = stats.totalCreated || 1;
    const utilization = stats.currentActive / total;
    const fragmentation = stats.currentFree / total;
    const warnings: string[] = [];

    // Check potential leaks
    const acquires = this.acquireTimes.get(poolName);
    let possibleLeaks = 0;
    if (acquires) {
      const now = Date.now();
      for (const [, time] of acquires) {
        if ((now - time) / 1000 > this.leakThreshold) possibleLeaks++;
      }
    }

    if (utilization > 0.9) warnings.push('Pool near capacity (>90% utilized)');
    if (possibleLeaks > 0) warnings.push(`${possibleLeaks} possible leak(s) detected`);
    if (stats.expandCount > 5)
      warnings.push(`Pool expanded ${stats.expandCount} times — consider larger initial size`);
    if (fragmentation > 0.8)
      warnings.push('High fragmentation (>80% free) — pool may be oversized');

    return {
      poolName,
      stats,
      utilization,
      fragmentation,
      possibleLeaks,
      isHealthy: warnings.length === 0,
      warnings,
    };
  }

  getAllHealthReports(): PoolHealthReport[] {
    const reports: PoolHealthReport[] = [];
    for (const name of this.pools.keys()) {
      const report = this.getHealthReport(name);
      if (report) reports.push(report);
    }
    return reports;
  }

  // ---------------------------------------------------------------------------
  // Leak Detection
  // ---------------------------------------------------------------------------

  getLeaks(): LeakEntry[] {
    const leaks: LeakEntry[] = [];
    const now = Date.now();

    for (const [poolName, acquires] of this.acquireTimes) {
      for (const [, time] of acquires) {
        const age = (now - time) / 1000;
        if (age > this.leakThreshold) {
          leaks.push({ poolName, acquireTime: time, age });
        }
      }
    }

    return leaks;
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  snapshot(): void {
    const now = Date.now();
    for (const [name, pool] of this.pools) {
      this.history.push({ poolName: name, time: now, stats: pool.getStats() });
    }
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  getHistory(poolName?: string): typeof this.history {
    return poolName ? this.history.filter((h) => h.poolName === poolName) : [...this.history];
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  setLeakThreshold(seconds: number): void {
    this.leakThreshold = seconds;
  }
  getLeakThreshold(): number {
    return this.leakThreshold;
  }
}
