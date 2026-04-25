/**
 * ObjectPool — Production Test Suite
 *
 * Covers: warmUp, acquire, release, releaseAll, stats (totalCreated,
 * currentActive, peakActive, counts), autoExpand, maxSize cap,
 * reset hook, duplicate release, forEach, clear.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectPool } from '../ObjectPool';

interface Particle {
  x: number;
  y: number;
  alive: boolean;
}

function makePool(
  opts: { initial?: number; max?: number; autoExpand?: boolean; expandAmount?: number } = {}
) {
  return new ObjectPool<Particle>({
    factory: () => ({ x: 0, y: 0, alive: false }),
    reset: (p) => {
      p[0] = 0;
      p[1] = 0;
      p.alive = false;
    },
    initialSize: opts.initial ?? 5,
    maxSize: opts.max ?? 20,
    autoExpand: opts.autoExpand ?? true,
    expandAmount: opts.expandAmount ?? 5,
  });
}

describe('ObjectPool — Production', () => {
  let pool: ObjectPool<Particle>;

  beforeEach(() => {
    pool = makePool();
  });

  // ─── Construction ─────────────────────────────────────────────────
  it('warmUp creates initialSize objects', () => {
    expect(pool.getTotalCount()).toBe(5);
    expect(pool.getFreeCount()).toBe(5);
    expect(pool.getActiveCount()).toBe(0);
  });

  // ─── Acquire ──────────────────────────────────────────────────────
  it('acquire returns an object', () => {
    const p = pool.acquire();
    expect(p).not.toBeNull();
  });

  it('acquire decrements free and increments active', () => {
    pool.acquire();
    expect(pool.getFreeCount()).toBe(4);
    expect(pool.getActiveCount()).toBe(1);
  });

  it('acquire tracks acquireCount in stats', () => {
    pool.acquire();
    pool.acquire();
    expect(pool.getStats().acquireCount).toBe(2);
  });

  it('acquire tracks peakActive', () => {
    const p1 = pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.release(p1!);
    // Peak was 3
    expect(pool.getStats().peakActive).toBe(3);
  });

  // ─── Auto-expand ──────────────────────────────────────────────────
  it('autoExpand creates more objects when pool is empty', () => {
    const p = makePool({ initial: 0, max: 20, autoExpand: true, expandAmount: 3 });
    const obj = p.acquire();
    expect(obj).not.toBeNull();
    expect(p.getTotalCount()).toBeGreaterThan(0);
  });

  it('acquire returns null when maxSize reached and no autoExpand', () => {
    const p = makePool({ initial: 2, max: 2, autoExpand: false });
    p.acquire();
    p.acquire();
    const result = p.acquire();
    expect(result).toBeNull();
  });

  it('acquire returns null when maxSize reached with autoExpand', () => {
    const p = makePool({ initial: 2, max: 2, autoExpand: true, expandAmount: 5 });
    p.acquire();
    p.acquire();
    const result = p.acquire();
    expect(result).toBeNull();
  });

  it('stats expandCount increments on auto-expand', () => {
    const p = makePool({ initial: 0, max: 20, autoExpand: true, expandAmount: 5 });
    p.acquire(); // triggers expand
    expect(p.getStats().expandCount).toBe(1);
  });

  // ─── Release ──────────────────────────────────────────────────────
  it('release returns true for active object', () => {
    const obj = pool.acquire()!;
    expect(pool.release(obj)).toBe(true);
  });

  it('release returns false for non-active object', () => {
    const fake: Particle = { x: 0, y: 0, alive: false };
    expect(pool.release(fake)).toBe(false);
  });

  it('release restores counts', () => {
    const obj = pool.acquire()!;
    pool.release(obj);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(5);
  });

  it('reset hook is called on release', () => {
    const resets: number[] = [];
    const p = new ObjectPool<{ val: number }>({
      factory: () => ({ val: 0 }),
      reset: (o) => {
        o.val = -1;
        resets.push(1);
      },
      initialSize: 2,
      maxSize: 10,
      autoExpand: false,
      expandAmount: 0,
    });
    const obj = p.acquire()!;
    obj.val = 99;
    p.release(obj);
    expect(resets.length).toBe(1);
    expect(obj.val).toBe(-1);
  });

  it('duplicate release is rejected', () => {
    const obj = pool.acquire()!;
    pool.release(obj);
    expect(pool.release(obj)).toBe(false);
  });

  // ─── releaseAll ───────────────────────────────────────────────────
  it('releaseAll returns all objects to free pool', () => {
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(5);
  });

  // ─── Stats ────────────────────────────────────────────────────────
  it('getStats returns a snapshot', () => {
    const s = pool.getStats();
    expect(typeof s.totalCreated).toBe('number');
    expect(typeof s.currentFree).toBe('number');
    expect(typeof s.releaseCount).toBe('number');
  });

  // ─── forEach ──────────────────────────────────────────────────────
  it('forEach iterates active objects', () => {
    pool.acquire();
    pool.acquire();
    let count = 0;
    pool.forEach(() => count++);
    expect(count).toBe(2);
  });

  it('forEach on empty active set is safe', () => {
    pool.forEach(() => {
      throw new Error('should not run');
    });
  });

  // ─── clear ────────────────────────────────────────────────────────
  it('clear drops all references', () => {
    pool.acquire();
    pool.clear();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(0);
  });
});
