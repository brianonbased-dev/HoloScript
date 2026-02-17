import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectPool } from '../ObjectPool';

function makePool(overrides = {}) {
  return new ObjectPool({
    factory: () => ({ value: 0 }),
    reset: (obj: any) => { obj.value = 0; },
    initialSize: 5,
    maxSize: 10,
    autoExpand: true,
    expandAmount: 3,
    ...overrides,
  });
}

describe('ObjectPool', () => {
  let pool: ObjectPool<{ value: number }>;

  beforeEach(() => { pool = makePool(); });

  // ---------------------------------------------------------------------------
  // Construction & Warm-up
  // ---------------------------------------------------------------------------

  it('pre-allocates initialSize objects', () => {
    expect(pool.getFreeCount()).toBe(5);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getTotalCount()).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Acquire
  // ---------------------------------------------------------------------------

  it('acquire returns an object', () => {
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(obj!.value).toBe(0);
  });

  it('acquire reduces free count and increases active', () => {
    pool.acquire();
    expect(pool.getFreeCount()).toBe(4);
    expect(pool.getActiveCount()).toBe(1);
  });

  it('acquire auto-expands when empty', () => {
    // Exhaust initial pool
    for (let i = 0; i < 5; i++) pool.acquire();
    expect(pool.getFreeCount()).toBe(0);
    // Next acquire should trigger expansion
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(pool.getStats().expandCount).toBe(1);
  });

  it('acquire returns null when at maxSize with no autoExpand', () => {
    const noExpand = makePool({ autoExpand: false, initialSize: 2, maxSize: 2 });
    noExpand.acquire();
    noExpand.acquire();
    expect(noExpand.acquire()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Release
  // ---------------------------------------------------------------------------

  it('release returns object to free pool', () => {
    const obj = pool.acquire()!;
    obj.value = 42;
    const released = pool.release(obj);
    expect(released).toBe(true);
    expect(pool.getFreeCount()).toBe(5);
    expect(pool.getActiveCount()).toBe(0);
  });

  it('release resets the object', () => {
    const obj = pool.acquire()!;
    obj.value = 42;
    pool.release(obj);
    // Re-acquire should get reset object
    const reacquired = pool.acquire()!;
    expect(reacquired.value).toBe(0);
  });

  it('release of non-active object returns false', () => {
    expect(pool.release({ value: 999 })).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Release All
  // ---------------------------------------------------------------------------

  it('releaseAll returns all active to free', () => {
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(pool.getActiveCount()).toBe(3);
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  it('getStats tracks peak active', () => {
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.getStats().peakActive).toBe(3);
  });

  it('getStats tracks acquire and release counts', () => {
    pool.acquire();
    const obj = pool.acquire()!;
    pool.release(obj);
    const stats = pool.getStats();
    expect(stats.acquireCount).toBe(2);
    expect(stats.releaseCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // forEach
  // ---------------------------------------------------------------------------

  it('forEach iterates over active objects', () => {
    pool.acquire()!.value = 1;
    pool.acquire()!.value = 2;
    const values: number[] = [];
    pool.forEach(obj => values.push(obj.value));
    expect(values).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear removes all objects', () => {
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(0);
  });
});
