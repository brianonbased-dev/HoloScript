import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectPool, Lazy, memoize, LRUCache, Batcher, PerformanceProfiler, getGlobalProfiler } from '../RuntimeOptimization';

// =============================================================================
// ObjectPool
// =============================================================================

describe('ObjectPool', () => {
  let pool: ObjectPool<{ value: number }>;

  beforeEach(() => {
    pool = new ObjectPool(
      () => ({ value: 0 }),
      (obj) => { obj.value = 0; },
      5 // capacity = 5, preallocates 5
    );
  });

  it('acquire returns an object', () => {
    const obj = pool.acquire();
    expect(obj).toBeDefined();
    expect(obj.value).toBe(0);
  });

  it('release and re-acquire reuses object with reset', () => {
    const obj = pool.acquire();
    obj.value = 42;
    pool.release(obj);
    const reused = pool.acquire();
    expect(reused.value).toBe(0); // reset applied
  });

  it('acquireBatch returns N objects', () => {
    const batch = pool.acquireBatch(3);
    expect(batch).toHaveLength(3);
  });

  it('releaseBatch returns all objects', () => {
    const batch = pool.acquireBatch(3);
    pool.releaseBatch(batch);
    const stats = pool.getStats();
    expect(stats.inUse).toBe(0);
  });

  it('getStats tracks inUse count', () => {
    pool.acquireBatch(3);
    const stats = pool.getStats();
    expect(stats.inUse).toBe(3);
    expect(stats.peakUsage).toBeGreaterThanOrEqual(3);
  });

  it('getStats tracks peak usage', () => {
    pool.acquireBatch(5);
    const s1 = pool.getStats();
    expect(s1.peakUsage).toBe(5);
    // Release them all
    const items = pool.acquireBatch(0);
    expect(s1.peakUsage).toBe(5); // peak persists
  });

  it('clear resets pool', () => {
    pool.acquireBatch(3);
    pool.clear();
    const stats = pool.getStats();
    expect(stats.available).toBe(0);
    expect(stats.inUse).toBe(0);
  });

  it('release of untracked object warns and does not add', () => {
    const foreign = { value: 99 };
    // Should not add to pool (returns early with warning)
    pool.release(foreign);
    // Pool available count should be same as initial (5 preallocated minus 0 acquired)
    const stats = pool.getStats();
    expect(stats.available).toBe(5); // unchanged
  });

  it('acquire creates new object if pool exhausted', () => {
    // Exhaust pool (capacity = 5)
    pool.acquireBatch(5);
    // Acquire one more — should create a new object
    const extra = pool.acquire();
    expect(extra).toBeDefined();
    expect(pool.getStats().inUse).toBe(6);
  });
});

// =============================================================================
// Lazy
// =============================================================================

describe('Lazy', () => {
  it('defers computation until first get', () => {
    const compute = vi.fn(() => 42);
    const lazy = new Lazy(compute);
    expect(compute).not.toHaveBeenCalled();
    expect(lazy.get()).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('caches value after first computation', () => {
    const compute = vi.fn(() => Math.random());
    const lazy = new Lazy(compute);
    const first = lazy.get();
    const second = lazy.get();
    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('isComputed returns false before get, true after', () => {
    const lazy = new Lazy(() => 'hello');
    expect(lazy.isComputed()).toBe(false);
    lazy.get();
    expect(lazy.isComputed()).toBe(true);
  });

  it('reset forces re-computation', () => {
    let counter = 0;
    const lazy = new Lazy(() => ++counter);
    expect(lazy.get()).toBe(1);
    lazy.reset();
    expect(lazy.isComputed()).toBe(false);
    expect(lazy.get()).toBe(2);
  });
});

// =============================================================================
// memoize
// =============================================================================

describe('memoize', () => {
  it('caches results for same arguments', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memoized = memoize(fn);
    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computes for different arguments', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn);
    expect(memoized(3)).toBe(6);
    expect(memoized(4)).toBe(8);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects maxSize limit', () => {
    const fn = vi.fn((x: number) => x);
    const memoized = memoize(fn, 3);
    memoized(1);
    memoized(2);
    memoized(3);
    memoized(4); // should evict oldest (1)
    memoized(1); // should recompute
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

// =============================================================================
// LRUCache
// =============================================================================

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  it('set and get a value', () => {
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts LRU entry when full', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // evicts 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
  });

  it('accessing a key refreshes its position', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // refresh 'a'
    cache.set('d', 4); // should evict 'b' (not 'a')
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('clear removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });

  it('getStats returns size and maxSize', () => {
    cache.set('x', 1);
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(3);
  });

  it('overwriting a key updates value', () => {
    cache.set('a', 1);
    cache.set('a', 99);
    expect(cache.get('a')).toBe(99);
    expect(cache.getStats().size).toBe(1);
  });
});

// =============================================================================
// Batcher
// =============================================================================

describe('Batcher', () => {
  it('flushAll processes all queued items', async () => {
    const processor = vi.fn(async (batch: number[]) => batch.map(x => x + 1));
    const batcher = new Batcher(processor, 100, 10000); // large batch + long timeout

    // Add items (won't auto-flush since batchSize=100)
    batcher.add(10);
    batcher.add(20);

    const flushed = await batcher.flushAll();
    expect(flushed).toEqual([11, 21]);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it('flushAll on empty queue returns empty', async () => {
    const processor = vi.fn(async (batch: number[]) => batch);
    const batcher = new Batcher(processor);
    const result = await batcher.flushAll();
    expect(result).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });
});

// =============================================================================
// PerformanceProfiler
// =============================================================================

describe('PerformanceProfiler', () => {
  let profiler: PerformanceProfiler;

  beforeEach(() => {
    profiler = new PerformanceProfiler();
  });

  it('startTimer + endTimer records measurement', () => {
    profiler.startTimer('test');
    const duration = profiler.endTimer('test');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('endTimer without start returns 0', () => {
    expect(profiler.endTimer('nope')).toBe(0);
  });

  it('measure executes fn and records timing', async () => {
    const result = await profiler.measure('task', async () => 42);
    expect(result).toBe(42);
    const report = profiler.getReport();
    expect(report).toContain('task');
  });

  it('getReport includes all measurements', () => {
    profiler.startTimer('a');
    profiler.endTimer('a');
    profiler.startTimer('b');
    profiler.endTimer('b');
    const report = profiler.getReport();
    expect(report).toContain('a:');
    expect(report).toContain('b:');
  });

  it('reset clears all measurements', () => {
    profiler.startTimer('x');
    profiler.endTimer('x');
    profiler.reset();
    const report = profiler.getReport();
    expect(report).not.toContain('x:');
  });

  it('getHotPaths returns top N by total time', () => {
    profiler.startTimer('fast');
    profiler.endTimer('fast');
    profiler.startTimer('slow');
    // busy wait ~5ms
    const start = performance.now();
    while (performance.now() - start < 5) {}
    profiler.endTimer('slow');
    const hot = profiler.getHotPaths(1);
    expect(hot).toHaveLength(1);
    expect(hot[0][0]).toBe('slow');
  });

  it('getGlobalProfiler returns singleton', () => {
    const a = getGlobalProfiler();
    const b = getGlobalProfiler();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(PerformanceProfiler);
  });
});
