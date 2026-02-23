/**
 * RuntimeOptimization Production Tests
 *
 * Covers:
 *   ObjectPool: preallocate, acquire, release, acquireBatch, releaseBatch,
 *               getStats (available, inUse, peakUsage), clear.
 *   Lazy: get (computes once), reset (re-computes on next get), isComputed.
 *   memoize: returns cached result on repeated calls.
 *   LRUCache: get/set, miss, LRU eviction, clear, getStats.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ObjectPool,
  Lazy,
  memoize,
  LRUCache,
} from '../../runtime/RuntimeOptimization';

// ── ObjectPool ────────────────────────────────────────────────────────────────

describe('ObjectPool — acquire / release', () => {

  function makePool(capacity = 10) {
    let id = 0;
    return new ObjectPool<{ id: number; value: number }>(
      () => ({ id: ++id, value: 0 }),
      (obj) => { obj.value = 0; },
      capacity
    );
  }

  it('acquire returns an object', () => {
    const pool = makePool();
    const obj = pool.acquire();
    expect(obj).toBeDefined();
  });

  it('release returns object to available pool', () => {
    const pool = makePool();
    const obj = pool.acquire();
    pool.release(obj);
    const stats = pool.getStats();
    expect(stats.available).toBeGreaterThanOrEqual(1);
    expect(stats.inUse).toBe(0);
  });

  it('acquire reuses released objects', () => {
    const pool = makePool();
    const obj1 = pool.acquire();
    const id1 = obj1.id;
    pool.release(obj1);
    const obj2 = pool.acquire();
    // The previously released object should come back
    expect(obj2.id).toBe(id1);
  });

  it('releasing already-released object is idempotent (no double-free)', () => {
    const pool = makePool();
    const obj = pool.acquire();
    pool.release(obj);
    expect(() => pool.release(obj)).not.toThrow();
  });

  it('getStats tracks inUse count', () => {
    const pool = makePool();
    pool.acquire(); pool.acquire();
    const stats = pool.getStats();
    expect(stats.inUse).toBe(2);
  });

  it('peakUsage tracks maximum concurrent acquisitions', () => {
    const pool = makePool();
    const a = pool.acquire(); const b = pool.acquire(); const c = pool.acquire();
    pool.release(a);
    expect(pool.getStats().peakUsage).toBeGreaterThanOrEqual(3);
  });

  it('preallocate fills available pool', () => {
    const pool = makePool();
    pool.preallocate(5);
    expect(pool.getStats().available).toBeGreaterThanOrEqual(5);
  });

  it('clear empties available pool', () => {
    const pool = makePool();
    pool.preallocate(5);
    pool.clear();
    expect(pool.getStats().available).toBe(0);
  });
});

describe('ObjectPool — batch operations', () => {

  function makePool() {
    return new ObjectPool<{ v: number }>(
      () => ({ v: 0 }),
      (obj) => { obj.v = 0; }
    );
  }

  it('acquireBatch returns N objects', () => {
    const pool = makePool();
    const batch = pool.acquireBatch(5);
    expect(batch).toHaveLength(5);
  });

  it('releaseBatch returns all objects to pool', () => {
    const pool = makePool();
    const batch = pool.acquireBatch(4);
    pool.releaseBatch(batch);
    const stats = pool.getStats();
    expect(stats.inUse).toBe(0);
    expect(stats.available).toBeGreaterThanOrEqual(4);
  });
});

// ── Lazy ──────────────────────────────────────────────────────────────────────

describe('Lazy', () => {

  it('get computes value on first call', () => {
    const fn = vi.fn(() => 42);
    const lazy = new Lazy(fn);
    expect(lazy.get()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('get returns cached value on subsequent calls', () => {
    const fn = vi.fn(() => 42);
    const lazy = new Lazy(fn);
    lazy.get(); lazy.get(); lazy.get();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isComputed returns false before first get', () => {
    const lazy = new Lazy(() => 1);
    expect(lazy.isComputed()).toBe(false);
  });

  it('isComputed returns true after first get', () => {
    const lazy = new Lazy(() => 1);
    lazy.get();
    expect(lazy.isComputed()).toBe(true);
  });

  it('reset forces re-computation on next get', () => {
    let counter = 0;
    const lazy = new Lazy(() => ++counter);
    lazy.get(); // = 1
    lazy.reset();
    expect(lazy.get()).toBe(2);
    expect(lazy.isComputed()).toBe(true);
  });

  it('reset sets isComputed to false', () => {
    const lazy = new Lazy(() => 1);
    lazy.get();
    lazy.reset();
    expect(lazy.isComputed()).toBe(false);
  });
});

// ── memoize ───────────────────────────────────────────────────────────────────

describe('memoize', () => {

  it('returns same result for same args', () => {
    const fn = vi.fn((x: number, y: number) => x + y);
    const memo = memoize(fn as any);
    expect(memo(2, 3)).toBe(5);
    expect(memo(2, 3)).toBe(5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls fn again for different args', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memo = memoize(fn as any);
    memo(5); memo(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entry when maxSize exceeded (LRU-like)', () => {
    const fn = vi.fn((x: number) => x);
    const memo = memoize(fn as any, 3); // max 3
    memo(1); memo(2); memo(3); // fills cache
    memo(4); // should evict 1
    memo(1); // must recompute
    expect(fn).toHaveBeenCalledTimes(5); // 4 initial + 1 recompute
  });
});

// ── LRUCache ──────────────────────────────────────────────────────────────────

describe('LRUCache', () => {

  it('set and get returns stored value', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('get returns undefined for cache miss', () => {
    const cache = new LRUCache<string, number>(5);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts least recently used entry when over maxSize', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // access a → moves to front
    cache.set('d', 4); // b should be evicted (least recently used)
    expect(cache.get('b')).toBeUndefined();
  });

  it('accessing an entry keeps it from being evicted', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
    cache.get('a'); // touch a
    cache.set('d', 4); // evicts LRU (b)
    expect(cache.get('a')).toBe(1); // a should still be there
  });

  it('clear removes all entries', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1); cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('getStats reports size and maxSize', () => {
    const cache = new LRUCache<string, number>(10);
    cache.set('x', 42);
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(10);
  });

  it('overwriting existing key updates value', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('key', 10);
    cache.set('key', 99);
    expect(cache.get('key')).toBe(99);
  });
});
