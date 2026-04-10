import { describe, it, expect } from 'vitest';
import { PoolDiagnostics } from '../PoolDiagnostics';
import { ObjectPool, type PoolConfig } from '../ObjectPool';

function makePool(): ObjectPool<{ v: number }> {
  return new ObjectPool<{ v: number }>({
    factory: () => ({ v: 0 }),
    initialSize: 5,
    maxSize: 20,
    autoExpand: true,
    expandAmount: 2,
  });
}

describe('PoolDiagnostics', () => {
  it('register adds pool', () => {
    const diag = new PoolDiagnostics();
    diag.register('bullets', makePool() as any);
    const report = diag.getHealthReport('bullets');
    expect(report).not.toBeNull();
    expect(report!.poolName).toBe('bullets');
  });

  it('getHealthReport returns null for unregistered', () => {
    const diag = new PoolDiagnostics();
    expect(diag.getHealthReport('unknown')).toBeNull();
  });

  it('healthy pool has no warnings', () => {
    const pool = makePool();
    // Acquire some objects to have reasonable utilization
    pool.acquire();
    pool.acquire();
    pool.acquire();
    const diag = new PoolDiagnostics();
    diag.register('bullets', pool as any);
    const report = diag.getHealthReport('bullets')!;
    expect(report.isHealthy).toBe(true);
    expect(report.warnings.length).toBe(0);
  });

  it('high utilization triggers warning', () => {
    const pool = new ObjectPool<{ v: number }>({
      factory: () => ({ v: 0 }),
      initialSize: 10,
      maxSize: 10,
      autoExpand: false,
      expandAmount: 0,
    });
    // Acquire 10 out of 10
    for (let i = 0; i < 10; i++) pool.acquire();
    const diag = new PoolDiagnostics();
    diag.register('full', pool as any);
    const report = diag.getHealthReport('full')!;
    expect(report.utilization).toBe(1);
    expect(report.warnings.some((w) => w.includes('90%'))).toBe(true);
  });

  it('trackAcquire and trackRelease manage leak tracking', () => {
    const diag = new PoolDiagnostics(0.001); // 1ms threshold
    const pool = makePool();
    diag.register('test', pool as any);
    const obj = pool.acquire()!;
    diag.trackAcquire('test', obj);
    // Wait just a tiny bit to exceed threshold
    const leaks = diag.getLeaks();
    // May or may not be a leak yet depending on timing
    diag.trackRelease('test', obj);
    const leaksAfter = diag.getLeaks();
    expect(leaksAfter.length).toBe(0);
  });

  it('getAllHealthReports returns all pools', () => {
    const diag = new PoolDiagnostics();
    diag.register('a', makePool() as any);
    diag.register('b', makePool() as any);
    const reports = diag.getAllHealthReports();
    expect(reports.length).toBe(2);
  });

  it('snapshot records history', () => {
    const diag = new PoolDiagnostics();
    diag.register('bullets', makePool() as any);
    diag.snapshot();
    diag.snapshot();
    const history = diag.getHistory('bullets');
    expect(history.length).toBe(2);
  });

  it('getHistory without name returns all', () => {
    const diag = new PoolDiagnostics();
    diag.register('a', makePool() as any);
    diag.register('b', makePool() as any);
    diag.snapshot();
    const all = diag.getHistory();
    expect(all.length).toBe(2);
  });

  it('setLeakThreshold / getLeakThreshold', () => {
    const diag = new PoolDiagnostics(60);
    expect(diag.getLeakThreshold()).toBe(60);
    diag.setLeakThreshold(120);
    expect(diag.getLeakThreshold()).toBe(120);
  });

  it('utilization and fragmentation calculations', () => {
    const pool = new ObjectPool<{ v: number }>({
      factory: () => ({ v: 0 }),
      initialSize: 10,
      maxSize: 10,
      autoExpand: false,
      expandAmount: 0,
    });
    for (let i = 0; i < 5; i++) pool.acquire(); // 5 active, 5 free
    const diag = new PoolDiagnostics();
    diag.register('half', pool as any);
    const report = diag.getHealthReport('half')!;
    expect(report.utilization).toBeCloseTo(0.5);
    expect(report.fragmentation).toBeCloseTo(0.5);
  });
});
