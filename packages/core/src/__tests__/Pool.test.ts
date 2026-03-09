import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../pooling/ObjectPool';
import { PooledSpawner } from '../pooling/PooledSpawner';
import { PoolDiagnostics } from '../pooling/PoolDiagnostics';

describe('Cycle 143: Object Pooling', () => {
  // -------------------------------------------------------------------------
  // ObjectPool
  // -------------------------------------------------------------------------

  it('should pre-allocate and acquire/release objects', () => {
    const pool = new ObjectPool<{ value: number }>({
      factory: () => ({ value: 0 }),
      reset: (obj) => {
        obj.value = 0;
      },
      initialSize: 5,
      maxSize: 10,
      autoExpand: false,
      expandAmount: 1,
    });

    expect(pool.getFreeCount()).toBe(5);

    const obj1 = pool.acquire()!;
    obj1.value = 42;
    expect(pool.getActiveCount()).toBe(1);

    pool.release(obj1);
    expect(obj1.value).toBe(0); // Reset was called
    expect(pool.getFreeCount()).toBe(5);
  });

  it('should auto-expand when empty and track stats', () => {
    const pool = new ObjectPool<{ id: number }>({
      factory: () => ({ id: 0 }),
      initialSize: 2,
      maxSize: 10,
      autoExpand: true,
      expandAmount: 3,
    });

    pool.acquire();
    pool.acquire();
    expect(pool.getFreeCount()).toBe(0);

    const obj = pool.acquire(); // Triggers expand
    expect(obj).not.toBeNull();

    const stats = pool.getStats();
    expect(stats.expandCount).toBe(1);
    expect(stats.totalCreated).toBe(5); // 2 initial + 3 expanded
    expect(stats.peakActive).toBe(3);
  });

  it('should return null when max size reached without auto-expand', () => {
    const pool = new ObjectPool<object>({
      factory: () => ({}),
      initialSize: 1,
      maxSize: 1,
      autoExpand: false,
      expandAmount: 1,
    });

    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // PooledSpawner
  // -------------------------------------------------------------------------

  it('should spawn and despawn prefab entities', () => {
    const spawner = new PooledSpawner();
    let spawnCount = 0;

    spawner.registerPrefab({
      id: 'bullet',
      poolSize: 10,
      maxInstances: 50,
      autoExpand: true,
      defaultLifetime: 0,
      onSpawn: () => spawnCount++,
    });

    const e = spawner.spawn('bullet', { x: 10, y: 0, z: 5 })!;
    expect(e).not.toBeNull();
    expect(e.position.x).toBe(10);
    expect(spawnCount).toBe(1);

    spawner.despawn(e.id);
    expect(spawner.getActiveCount('bullet')).toBe(0);
  });

  it('should auto-despawn expired entities', () => {
    const spawner = new PooledSpawner();
    spawner.registerPrefab({
      id: 'particle',
      poolSize: 5,
      maxInstances: 20,
      autoExpand: false,
      defaultLifetime: 2,
    });

    spawner.spawn('particle');
    spawner.spawn('particle');
    expect(spawner.getActiveCount()).toBe(2);

    const expired = spawner.update(3); // 3 seconds — both should expire
    expect(expired.length).toBe(2);
    expect(spawner.getActiveCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // PoolDiagnostics
  // -------------------------------------------------------------------------

  it('should generate health reports', () => {
    const pool = new ObjectPool<object>({
      factory: () => ({}),
      initialSize: 10,
      maxSize: 10,
      autoExpand: false,
      expandAmount: 1,
    });

    const diag = new PoolDiagnostics(1);
    diag.register('test', pool as ObjectPool<unknown>);

    // Acquire all 10 — at full capacity
    for (let i = 0; i < 10; i++) pool.acquire();

    const report = diag.getHealthReport('test')!;
    expect(report.utilization).toBeCloseTo(1.0, 1);
    expect(report.warnings.some((w) => w.includes('capacity'))).toBe(true);
  });

  it('should detect potential leaks', () => {
    const pool = new ObjectPool<object>({
      factory: () => ({}),
      initialSize: 5,
      maxSize: 5,
      autoExpand: false,
      expandAmount: 1,
    });

    const diag = new PoolDiagnostics(0.001); // 1ms threshold
    diag.register('leaky', pool as ObjectPool<unknown>);

    const obj = pool.acquire()!;
    diag.trackAcquire('leaky', obj);

    // Wait a tiny bit for the threshold to pass
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    const leaks = diag.getLeaks();
    expect(leaks.length).toBe(1);
    expect(leaks[0].poolName).toBe('leaky');
  });
});
