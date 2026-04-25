import { describe, it, expect, vi } from 'vitest';
import { ObjectPool } from '../pooling/ObjectPool';
import { PooledSpawner } from '../pooling/PooledSpawner';

// =============================================================================
// C204 — Object Pooling
// =============================================================================

describe('ObjectPool', () => {
  function makePool(
    opts: Partial<{
      initialSize: number;
      maxSize: number;
      autoExpand: boolean;
      expandAmount: number;
    }> = {}
  ) {
    const reset = vi.fn((obj: { value: number }) => {
      obj.value = 0;
    });
    const pool = new ObjectPool<{ value: number }>({
      factory: () => ({ value: 0 }),
      reset,
      initialSize: opts.initialSize ?? 3,
      maxSize: opts.maxSize ?? 10,
      autoExpand: opts.autoExpand ?? true,
      expandAmount: opts.expandAmount ?? 2,
    });
    return { pool, reset };
  }

  it('constructor pre-allocates initialSize objects', () => {
    const { pool } = makePool({ initialSize: 5 });
    expect(pool.getFreeCount()).toBe(5);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getTotalCount()).toBe(5);
  });

  it('acquire returns an object and updates counts', () => {
    const { pool } = makePool();
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(pool.getActiveCount()).toBe(1);
    expect(pool.getFreeCount()).toBe(2);
  });

  it('release returns object to free list and calls reset', () => {
    const { pool, reset } = makePool();
    const obj = pool.acquire()!;
    obj.value = 42;
    expect(pool.release(obj)).toBe(true);
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(3);
    expect(reset).toHaveBeenCalledWith(obj);
  });

  it('release returns false for unknown object', () => {
    const { pool } = makePool();
    expect(pool.release({ value: 99 })).toBe(false);
  });

  it('tracks peakActive in stats', () => {
    const { pool } = makePool({ initialSize: 5 });
    pool.acquire();
    pool.acquire();
    pool.acquire();
    const third = pool.acquire()!;
    expect(pool.getStats().peakActive).toBe(4);
    pool.release(third);
    expect(pool.getStats().peakActive).toBe(4); // peak unchanged
  });

  it('auto-expands when free list is empty', () => {
    const { pool } = makePool({ initialSize: 1, maxSize: 10, expandAmount: 3 });
    pool.acquire(); // takes the 1 pre-allocated
    const second = pool.acquire(); // triggers expand
    expect(second).not.toBeNull();
    expect(pool.getStats().expandCount).toBe(1);
    expect(pool.getTotalCount()).toBe(4); // 1 + 3 expanded
  });

  it('returns null when maxSize reached and autoExpand true', () => {
    const { pool } = makePool({ initialSize: 2, maxSize: 2, autoExpand: true });
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('returns null when autoExpand is false and pool empty', () => {
    const { pool } = makePool({ initialSize: 1, maxSize: 10, autoExpand: false });
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('releaseAll returns all active objects', () => {
    const { pool, reset } = makePool({ initialSize: 4 });
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(4);
    expect(reset).toHaveBeenCalledTimes(3);
  });

  it('forEach iterates only active objects', () => {
    const { pool } = makePool();
    const a = pool.acquire()!;
    a.value = 1;
    const b = pool.acquire()!;
    b.value = 2;
    const values: number[] = [];
    pool.forEach((obj) => values.push(obj.value));
    expect(values.sort()).toEqual([1, 2]);
  });

  it('clear empties both active and free', () => {
    const { pool } = makePool();
    pool.acquire();
    pool.clear();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(0);
  });

  it('warmUp respects maxSize', () => {
    const { pool } = makePool({ initialSize: 0, maxSize: 3 });
    pool.warmUp(100);
    expect(pool.getTotalCount()).toBe(3);
  });

  it('stats tracks acquireCount and releaseCount', () => {
    const { pool } = makePool();
    const a = pool.acquire()!;
    pool.acquire();
    pool.release(a);
    const s = pool.getStats();
    expect(s.acquireCount).toBe(2);
    expect(s.releaseCount).toBe(1);
  });
});

// =============================================================================
// PooledSpawner
// =============================================================================

describe('PooledSpawner', () => {
  function makeSpawner() {
    const spawner = new PooledSpawner();
    spawner.registerPrefab({
      id: 'bullet',
      poolSize: 5,
      maxInstances: 10,
      autoExpand: true,
      defaultLifetime: 2, // 2 seconds
    });
    return spawner;
  }

  it('spawn returns entity with correct prefabId', () => {
    const spawner = makeSpawner();
    const e = spawner.spawn('bullet');
    expect(e).not.toBeNull();
    expect(e!.prefabId).toBe('bullet');
    expect(e!.active).toBe(true);
  });

  it('spawn assigns position and rotation', () => {
    const spawner = makeSpawner();
    const e = spawner.spawn('bullet', [1, 2, 3], [0, 90, 0]);
    expect(e!.position).toEqual([1, 2, 3]);
    expect(e!.rotation).toEqual([0, 90, 0]);
  });

  it('spawn returns null for unregistered prefab', () => {
    const spawner = makeSpawner();
    expect(spawner.spawn('unknown')).toBeNull();
  });

  it('despawn removes entity and returns true', () => {
    const spawner = makeSpawner();
    const e = spawner.spawn('bullet')!;
    expect(spawner.despawn(e.id)).toBe(true);
    expect(spawner.getEntity(e.id)).toBeUndefined();
  });

  it('despawn returns false for unknown id', () => {
    const spawner = makeSpawner();
    expect(spawner.despawn('nope')).toBe(false);
  });

  it('update auto-despawns entities past lifetime', () => {
    const spawner = makeSpawner();
    const e = spawner.spawn('bullet')!;
    spawner.update(1.0); // 1s elapsed
    expect(spawner.getEntity(e.id)).toBeDefined();
    const expired = spawner.update(1.5); // 2.5s total ≥ 2s lifetime
    expect(expired).toContain(e.id);
    expect(spawner.getEntity(e.id)).toBeUndefined();
  });

  it('onSpawn and onDespawn hooks fire', () => {
    const onSpawn = vi.fn();
    const onDespawn = vi.fn();
    const spawner = new PooledSpawner();
    spawner.registerPrefab({
      id: 'fx',
      poolSize: 2,
      maxInstances: 5,
      autoExpand: false,
      defaultLifetime: 0,
      onSpawn,
      onDespawn,
    });
    const e = spawner.spawn('fx')!;
    expect(onSpawn).toHaveBeenCalledWith(e);
    spawner.despawn(e.id);
    expect(onDespawn).toHaveBeenCalled();
  });

  it('getActiveCount filters by prefabId', () => {
    const spawner = new PooledSpawner();
    spawner.registerPrefab({
      id: 'a',
      poolSize: 3,
      maxInstances: 5,
      autoExpand: false,
      defaultLifetime: 0,
    });
    spawner.registerPrefab({
      id: 'b',
      poolSize: 3,
      maxInstances: 5,
      autoExpand: false,
      defaultLifetime: 0,
    });
    spawner.spawn('a');
    spawner.spawn('a');
    spawner.spawn('b');
    expect(spawner.getActiveCount('a')).toBe(2);
    expect(spawner.getActiveCount('b')).toBe(1);
    expect(spawner.getActiveCount()).toBe(3);
  });
});
