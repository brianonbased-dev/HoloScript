import { describe, it, expect, beforeEach } from 'vitest';
import { PoolDiagnostics } from '../PoolDiagnostics';
import { ObjectPool } from '../ObjectPool';

function createPool(size = 5): ObjectPool<{ id: number }> {
  return new ObjectPool({
    factory: () => ({ id: 0 }),
    reset: (o) => { o.id = 0; },
    initialSize: size,
    maxSize: 50,
    autoExpand: true,
    expandAmount: 5,
  });
}

describe('PoolDiagnostics', () => {
  let diag: PoolDiagnostics;
  let pool: ObjectPool<{ id: number }>;

  beforeEach(() => {
    diag = new PoolDiagnostics(0.01); // very short threshold for testing
    pool = createPool();
    diag.register('main', pool as unknown as ObjectPool<unknown>);
  });

  it('register and getHealthReport', () => {
    const report = diag.getHealthReport('main');
    expect(report).not.toBeNull();
    expect(report!.poolName).toBe('main');
    expect(report!.stats).toBeDefined();
  });

  it('returns null for unknown pool', () => {
    expect(diag.getHealthReport('nope')).toBeNull();
  });

  it('utilization reflects active objects', () => {
    pool.acquire();
    pool.acquire();
    const report = diag.getHealthReport('main')!;
    expect(report.utilization).toBeGreaterThan(0);
  });

  it('getAllHealthReports returns all registered pools', () => {
    const pool2 = createPool(3);
    diag.register('secondary', pool2 as unknown as ObjectPool<unknown>);
    const reports = diag.getAllHealthReports();
    expect(reports.length).toBe(2);
  });

  it('trackAcquire and getLeaks detects leaks', async () => {
    const obj = pool.acquire()!;
    diag.trackAcquire('main', obj);
    // Wait a bit beyond the 10ms threshold
    await new Promise(r => setTimeout(r, 30));
    const leaks = diag.getLeaks();
    expect(leaks.length).toBeGreaterThanOrEqual(1);
    expect(leaks[0].poolName).toBe('main');
  });

  it('trackRelease removes from leak tracking', async () => {
    const obj = pool.acquire()!;
    diag.trackAcquire('main', obj);
    diag.trackRelease('main', obj);
    await new Promise(r => setTimeout(r, 30));
    expect(diag.getLeaks()).toHaveLength(0);
  });

  it('health report warns on possible leaks', async () => {
    const obj = pool.acquire()!;
    diag.trackAcquire('main', obj);
    await new Promise(r => setTimeout(r, 30));
    const report = diag.getHealthReport('main')!;
    expect(report.possibleLeaks).toBeGreaterThanOrEqual(1);
    expect(report.isHealthy).toBe(false);
  });

  it('snapshot stores history', () => {
    diag.snapshot();
    const history = diag.getHistory('main');
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it('getHistory without filter returns all', () => {
    diag.snapshot();
    const history = diag.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it('setLeakThreshold / getLeakThreshold', () => {
    diag.setLeakThreshold(120);
    expect(diag.getLeakThreshold()).toBe(120);
  });
});
