/**
 * ObjectPool.ts
 *
 * Generic object pool: pre-allocation, auto-expand,
 * warm-up, usage statistics, and lifecycle hooks.
 *
 * @module pooling
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PoolConfig<T> {
  factory: () => T;
  reset?: (obj: T) => void;
  initialSize: number;
  maxSize: number;
  autoExpand: boolean;
  expandAmount: number;
}

export interface PoolStats {
  totalCreated: number;
  currentActive: number;
  currentFree: number;
  peakActive: number;
  acquireCount: number;
  releaseCount: number;
  expandCount: number;
}

// =============================================================================
// OBJECT POOL
// =============================================================================

export class ObjectPool<T> {
  private free: T[] = [];
  private active: Set<T> = new Set();
  private config: PoolConfig<T>;
  private stats: PoolStats = {
    totalCreated: 0,
    currentActive: 0,
    currentFree: 0,
    peakActive: 0,
    acquireCount: 0,
    releaseCount: 0,
    expandCount: 0,
  };

  constructor(config: PoolConfig<T>) {
    this.config = config;
    this.warmUp(config.initialSize);
  }

  // ---------------------------------------------------------------------------
  // Warm-up
  // ---------------------------------------------------------------------------

  warmUp(count: number): void {
    const toCreate = Math.min(count, this.config.maxSize - this.stats.totalCreated);
    for (let i = 0; i < toCreate; i++) {
      this.free.push(this.config.factory());
      this.stats.totalCreated++;
    }
    this.stats.currentFree = this.free.length;
  }

  // ---------------------------------------------------------------------------
  // Acquire / Release
  // ---------------------------------------------------------------------------

  acquire(): T | null {
    this.stats.acquireCount++;

    if (this.free.length === 0) {
      if (!this.config.autoExpand || this.stats.totalCreated >= this.config.maxSize) {
        return null;
      }
      const expandBy = Math.min(
        this.config.expandAmount,
        this.config.maxSize - this.stats.totalCreated
      );
      for (let i = 0; i < expandBy; i++) {
        this.free.push(this.config.factory());
        this.stats.totalCreated++;
      }
      this.stats.expandCount++;
    }

    const obj = this.free.pop()!;
    this.active.add(obj);
    this.stats.currentActive = this.active.size;
    this.stats.currentFree = this.free.length;
    this.stats.peakActive = Math.max(this.stats.peakActive, this.active.size);
    return obj;
  }

  release(obj: T): boolean {
    if (!this.active.has(obj)) return false;

    this.active.delete(obj);
    if (this.config.reset) this.config.reset(obj);
    this.free.push(obj);

    this.stats.releaseCount++;
    this.stats.currentActive = this.active.size;
    this.stats.currentFree = this.free.length;
    return true;
  }

  releaseAll(): void {
    for (const obj of this.active) {
      if (this.config.reset) this.config.reset(obj);
      this.free.push(obj);
      this.stats.releaseCount++;
    }
    this.active.clear();
    this.stats.currentActive = 0;
    this.stats.currentFree = this.free.length;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getStats(): PoolStats {
    return { ...this.stats };
  }
  getActiveCount(): number {
    return this.active.size;
  }
  getFreeCount(): number {
    return this.free.length;
  }
  getTotalCount(): number {
    return this.stats.totalCreated;
  }

  forEach(callback: (obj: T) => void): void {
    for (const obj of this.active) callback(obj);
  }

  clear(): void {
    this.active.clear();
    this.free = [];
    this.stats.currentActive = 0;
    this.stats.currentFree = 0;
  }
}
