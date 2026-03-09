import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPool, type PoolConfig } from '../pooling/ObjectPool';

// =============================================================================
// C305 — ObjectPool
// =============================================================================

function makeConfig(
  overrides: Partial<PoolConfig<{ value: number }>> = {}
): PoolConfig<{ value: number }> {
  return {
    factory: () => ({ value: 0 }),
    reset: (obj) => {
      obj.value = 0;
    },
    initialSize: 3,
    maxSize: 10,
    autoExpand: true,
    expandAmount: 2,
    ...overrides,
  };
}

describe('ObjectPool', () => {
  it('pre-allocates initialSize objects', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 5 }));
    expect(pool.getFreeCount()).toBe(5);
    expect(pool.getTotalCount()).toBe(5);
  });

  it('acquire returns an object and tracks active count', () => {
    const pool = new ObjectPool(makeConfig());
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(pool.getActiveCount()).toBe(1);
    expect(pool.getFreeCount()).toBe(2);
  });

  it('release returns object to pool and calls reset', () => {
    const reset = vi.fn();
    const pool = new ObjectPool(makeConfig({ reset }));
    const obj = pool.acquire()!;
    obj.value = 42;
    pool.release(obj);
    expect(reset).toHaveBeenCalledWith(obj);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(3);
  });

  it('auto-expands when pool is empty', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 1, expandAmount: 3 }));
    pool.acquire(); // Takes the 1 initial object
    const obj2 = pool.acquire(); // Triggers expand
    expect(obj2).not.toBeNull();
    expect(pool.getStats().expandCount).toBe(1);
    expect(pool.getTotalCount()).toBe(4); // 1 initial + 3 expanded
  });

  it('returns null when maxSize reached and no autoExpand', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 2, maxSize: 2, autoExpand: false }));
    pool.acquire();
    pool.acquire();
    const obj = pool.acquire();
    expect(obj).toBeNull();
  });

  it('peakActive tracks high-water mark', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 5 }));
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const c = pool.acquire()!;
    pool.release(a);
    pool.release(b);
    expect(pool.getStats().peakActive).toBe(3);
  });

  it('releaseAll returns all active objects', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 5 }));
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(5);
  });

  it('release rejects unknown objects', () => {
    const pool = new ObjectPool(makeConfig());
    const result = pool.release({ value: 99 });
    expect(result).toBe(false);
  });

  it('forEach iterates active objects', () => {
    const pool = new ObjectPool(makeConfig());
    const a = pool.acquire()!;
    a.value = 10;
    const b = pool.acquire()!;
    b.value = 20;
    const values: number[] = [];
    pool.forEach((obj) => values.push(obj.value));
    expect(values.sort()).toEqual([10, 20]);
  });

  it('clear removes all objects', () => {
    const pool = new ObjectPool(makeConfig());
    pool.acquire();
    pool.clear();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(0);
  });

  it('warmUp respects maxSize ceiling', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 0, maxSize: 5 }));
    pool.warmUp(100);
    expect(pool.getTotalCount()).toBe(5);
  });
});
