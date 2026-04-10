/**
 * @holoscript/core Runtime Optimization
 *
 * Object pooling, lazy evaluation, memoization, caching
 */

/**
 * Generic object pool for efficient memory reuse
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private peakUsage: number = 0;

  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
    private _capacity: number = 100
  ) {
    this.preallocate(this._capacity);
  }

  /**
   * Pre-allocate objects
   */
  private preallocate(count: number): void {
    for (let i = 0; i < count; i++) {
      this.available.push(this.factory());
    }
  }

  /**
   * Acquire object from pool
   */
  acquire(): T {
    let obj = this.available.pop();

    if (!obj) {
      obj = this.factory();
    }

    this.inUse.add(obj);
    this.peakUsage = Math.max(this.peakUsage, this.inUse.size);

    return obj;
  }

  /**
   * Release object back to pool
   */
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      console.warn('Releasing object not from this pool');
      return;
    }

    this.inUse.delete(obj);
    this.reset(obj);
    this.available.push(obj);
  }

  /**
   * Batch acquire
   */
  acquireBatch(count: number): T[] {
    const batch: T[] = [];
    for (let i = 0; i < count; i++) {
      batch.push(this.acquire());
    }
    return batch;
  }

  /**
   * Batch release
   */
  releaseBatch(objects: T[]): void {
    for (const obj of objects) {
      this.release(obj);
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      peakUsage: this.peakUsage,
      utilization: this.inUse.size / (this.inUse.size + this.available.length),
    };
  }

  /**
   * Clear pool
   */
  clear(): void {
    this.available = [];
    this.inUse.clear();
    this.peakUsage = 0;
  }
}

/**
 * Lazy evaluated value
 */
export class Lazy<T> {
  private value: T | undefined;
  private computed: boolean = false;

  constructor(private compute: () => T) {}

  /**
   * Get value (compute if needed)
   */
  get(): T {
    if (!this.computed) {
      this.value = this.compute();
      this.computed = true;
    }
    return this.value!;
  }

  /**
   * Force re-computation
   */
  reset(): void {
    this.computed = false;
    this.value = undefined;
  }

  /**
   * Check if computed
   */
  isComputed(): boolean {
    return this.computed;
  }
}

/**
 * Memoization decorator
 */
export function memoize<T extends (...args: any[]) => any>(fn: T, maxSize: number = 100): T {
  const cache = new Map<string, any>();

  return ((...args: any[]) => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);

    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }

    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Memoized property decorator
 */
export function MemoizedProperty() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalGetter = descriptor.get;
    const cache = new Map<any, any>();

    descriptor.get = function () {
      if (!cache.has(this)) {
        const val = originalGetter ? originalGetter.call(this) : undefined;
        cache.set(this, val);
      }
      return cache.get(this);
    };

    return descriptor;
  };
}

/**
 * Method memoization decorator
 */
export function MethodMemoize(maxSize: number = 100) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cache = new Map<string, any>();

    descriptor.value = function (...args: any[]) {
      const key = JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key);
      }

      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }

      const result = originalMethod.apply(this, args);
      cache.set(key, result);
      return result;
    };

    return descriptor;
  };
}

/**
 * LRU Cache with maximum size
 */
export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private accessOrder: K[] = [];

  constructor(private maxSize: number = 100) {}

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);

      return this.cache.get(key);
    }
    return undefined;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    } else if (this.cache.size >= this.maxSize) {
      // Evict LRU
      const lruKey = this.accessOrder.shift()!;
      this.cache.delete(lruKey);
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: this.cache.size / this.maxSize,
    };
  }
}

/**
 * Batch processing for efficient bulk operations
 */
export class Batcher<T, R> {
  private queue: T[] = [];
  private processingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private processor: (batch: T[]) => Promise<R[]>,
    private batchSize: number = 100,
    private flushIntervalMs: number = 16 // ~1 frame at 60fps
  ) {}

  /**
   * Add item to batch
   */
  async add(item: T): Promise<R> {
    return new Promise((resolve) => {
      this.queue.push(item);

      if (this.queue.length >= this.batchSize) {
        this.flush().then((results) => {
          resolve(results[results.length - 1]);
        });
      } else if (!this.processingTimeout) {
        this.processingTimeout = setTimeout(() => {
          this.flush();
        }, this.flushIntervalMs);
      }
    });
  }

  /**
   * Flush batch
   */
  private async flush(): Promise<R[]> {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    if (this.queue.length === 0) {
      return [];
    }

    const batch = this.queue.splice(0, this.batchSize);
    return await this.processor(batch);
  }

  /**
   * Manually flush remaining items
   */
  async flushAll(): Promise<R[]> {
    const results: R[] = [];

    while (this.queue.length > 0) {
      const batchResults = await this.flush();
      results.push(...batchResults);
    }

    return results;
  }
}

/**
 * Performance profiler with hot path tracking
 */
export class PerformanceProfiler {
  private measurements: Map<
    string,
    { count: number; totalTime: number; minTime: number; maxTime: number }
  > = new Map();
  private activeTimers: Map<string, number> = new Map();

  /**
   * Start timing a function
   */
  startTimer(label: string): void {
    this.activeTimers.set(label, performance.now());
  }

  /**
   * End timing
   */
  endTimer(label: string): number {
    const startTime = this.activeTimers.get(label);
    if (!startTime) {
      console.warn(`No timer started for ${label}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.activeTimers.delete(label);

    // Update statistics
    const stats = this.measurements.get(label) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: -Infinity,
    };

    stats.count++;
    stats.totalTime += duration;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);

    this.measurements.set(label, stats);

    return duration;
  }

  /**
   * Measure function execution
   */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.startTimer(label);
    try {
      return await fn();
    } finally {
      this.endTimer(label);
    }
  }

  /**
   * Get profiling report
   */
  getReport(): string {
    let report = '=== Performance Profile ===\n\n';

    const sorted = Array.from(this.measurements.entries()).sort(
      (a, b) => b[1].totalTime - a[1].totalTime
    );

    for (const [label, stats] of sorted) {
      const avgTime = stats.totalTime / stats.count;
      report += `${label}:\n`;
      report += `  Calls: ${stats.count}\n`;
      report += `  Total: ${stats.totalTime.toFixed(2)}ms\n`;
      report += `  Avg: ${avgTime.toFixed(2)}ms\n`;
      report += `  Min/Max: ${stats.minTime.toFixed(2)}ms / ${stats.maxTime.toFixed(2)}ms\n\n`;
    }

    return report;
  }

  /**
   * Reset measurements
   */
  reset(): void {
    this.measurements.clear();
    this.activeTimers.clear();
  }

  /**
   * Get hottest paths
   */
  getHotPaths(topN: number = 5): Array<[string, number]> {
    return Array.from(this.measurements.entries())
      .sort((a, b) => b[1].totalTime - a[1].totalTime)
      .slice(0, topN)
      .map(([label, stats]) => [label, stats.totalTime]);
  }
}

/**
 * Global optimizer instance
 */
let globalProfiler: PerformanceProfiler | null = null;

export function getGlobalProfiler(): PerformanceProfiler {
  if (!globalProfiler) {
    globalProfiler = new PerformanceProfiler();
  }
  return globalProfiler;
}
