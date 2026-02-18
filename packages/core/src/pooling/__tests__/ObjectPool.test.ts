import { describe, it, expect, vi } from 'vitest';
import { ObjectPool, type PoolConfig } from '../ObjectPool';

function makeConfig(overrides: Partial<PoolConfig<{ id: number }>> = {}): PoolConfig<{ id: number }> {
  let counter = 0;
  return {
    factory: () => ({ id: counter++ }),
    reset: (obj) => { obj.id = -1; },
    initialSize: 3,
    maxSize: 10,
    autoExpand: true,
    expandAmount: 2,
    ...overrides,
  };
}

describe('ObjectPool', () => {
  it('pre-allocates initialSize objects', () => {
    const pool = new ObjectPool(makeConfig());
    expect(pool.getFreeCount()).toBe(3);
    expect(pool.getTotalCount()).toBe(3);
    expect(pool.getActiveCount()).toBe(0);
  });

  it('acquire returns object and tracks active count', () => {
    const pool = new ObjectPool(makeConfig());
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(pool.getActiveCount()).toBe(1);
    expect(pool.getFreeCount()).toBe(2);
  });

  it('release returns object to free list', () => {
    const pool = new ObjectPool(makeConfig());
    const obj = pool.acquire()!;
    expect(pool.release(obj)).toBe(true);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(3);
  });

  it('release calls reset function', () => {
    const resetFn = vi.fn();
    const pool = new ObjectPool(makeConfig({ reset: resetFn }));
    const obj = pool.acquire()!;
    pool.release(obj);
    expect(resetFn).toHaveBeenCalledWith(obj);
  });

  it('release returns false for unknown object', () => {
    const pool = new ObjectPool(makeConfig());
    expect(pool.release({ id: 999 })).toBe(false);
  });

  it('auto-expands when free list is empty', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 1, expandAmount: 2 }));
    pool.acquire(); // uses the 1 pre-allocated
    const obj2 = pool.acquire(); // triggers expand
    expect(obj2).not.toBeNull();
    expect(pool.getTotalCount()).toBe(3); // 1 initial + 2 expanded
  });

  it('returns null when maxSize reached without autoExpand', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 1, maxSize: 1, autoExpand: false }));
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('returns null when maxSize reached with autoExpand', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 2, maxSize: 2, autoExpand: true }));
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('releaseAll returns all active to free', () => {
    const pool = new ObjectPool(makeConfig());
    pool.acquire(); pool.acquire(); pool.acquire();
    expect(pool.getActiveCount()).toBe(3);
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(3);
  });

  it('peakActive tracks high-water mark', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 5 }));
    pool.acquire(); pool.acquire(); pool.acquire();
    const stats = pool.getStats();
    expect(stats.peakActive).toBe(3);
  });

  it('getStats returns complete statistics', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 2 }));
    pool.acquire();
    pool.acquire();
    const stats = pool.getStats();
    expect(stats.totalCreated).toBe(2);
    expect(stats.acquireCount).toBe(2);
    expect(stats.currentActive).toBe(2);
    expect(stats.currentFree).toBe(0);
  });

  it('forEach iterates active objects only', () => {
    const pool = new ObjectPool(makeConfig());
    pool.acquire(); pool.acquire();
    const visited: number[] = [];
    pool.forEach(obj => visited.push(obj.id));
    expect(visited.length).toBe(2);
  });

  it('clear removes all objects', () => {
    const pool = new ObjectPool(makeConfig());
    pool.acquire();
    pool.clear();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(0);
  });

  it('warmUp respects maxSize', () => {
    const pool = new ObjectPool(makeConfig({ initialSize: 0, maxSize: 5 }));
    pool.warmUp(100);
    expect(pool.getTotalCount()).toBe(5);
  });
});
