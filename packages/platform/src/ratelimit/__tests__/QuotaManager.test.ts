import { describe, it, expect } from 'vitest';
import { QuotaManager } from '@holoscript/core';

function makeManager() {
  return new QuotaManager({
    daily: { parseOperations: 100, compileOperations: 50, generateOperations: 20 },
    monthly: { totalBytes: 1_000_000, apiCalls: 10_000 },
  });
}

describe('QuotaManager', () => {
  it('getConfig returns config copy', () => {
    const qm = makeManager();
    const c = qm.getConfig();
    expect(c.daily.parseOperations).toBe(100);
    expect(c.monthly.totalBytes).toBe(1_000_000);
  });

  it('checkQuota does not record usage', () => {
    const qm = makeManager();
    const r = qm.checkQuota('user1', 'parseOperations', 10);
    expect(r.allowed).toBe(true);
    expect(r.currentUsage).toBe(0);
    expect(r.remaining).toBe(100);
  });

  it('recordUsage tracks consumption', () => {
    const qm = makeManager();
    const r = qm.recordUsage('user1', 'parseOperations', 30);
    expect(r.allowed).toBe(true);
    expect(r.currentUsage).toBe(30);
    expect(r.remaining).toBe(70);
  });

  it('recordUsage rejects over-limit', () => {
    const qm = makeManager();
    qm.recordUsage('user1', 'compileOperations', 50); // at limit
    const r = qm.recordUsage('user1', 'compileOperations', 1);
    expect(r.allowed).toBe(false);
    expect(r.currentUsage).toBe(50); // not incremented
  });

  it('monthly quota tracks apiCalls', () => {
    const qm = makeManager();
    qm.recordUsage('user1', 'apiCalls', 5000);
    const r = qm.recordUsage('user1', 'apiCalls', 5000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
    const r2 = qm.recordUsage('user1', 'apiCalls', 1);
    expect(r2.allowed).toBe(false);
  });

  it('unlimited quota (-1) always allows', () => {
    const qm = new QuotaManager({
      daily: { parseOperations: -1, compileOperations: -1, generateOperations: -1 },
      monthly: { totalBytes: -1, apiCalls: -1 },
    });
    const r = qm.recordUsage('user1', 'parseOperations', 999999);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
  });

  it('per-key isolation', () => {
    const qm = makeManager();
    qm.recordUsage('A', 'parseOperations', 100);
    const r = qm.recordUsage('B', 'parseOperations', 1);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(99);
  });

  it('getUsage returns snapshot', () => {
    const qm = makeManager();
    qm.recordUsage('user1', 'parseOperations', 10);
    qm.recordUsage('user1', 'totalBytes', 500);
    const snap = qm.getUsage('user1');
    expect(snap.key).toBe('user1');
    expect(snap.daily.parseOperations).toBe(10);
    expect(snap.monthly.totalBytes).toBe(500);
  });

  it('getUsage for unknown key returns zeros', () => {
    const qm = makeManager();
    const snap = qm.getUsage('nobody');
    expect(snap.daily.parseOperations).toBe(0);
    expect(snap.monthly.apiCalls).toBe(0);
  });

  it('resetKey clears specific key', () => {
    const qm = makeManager();
    qm.recordUsage('user1', 'parseOperations', 50);
    qm.resetKey('user1');
    expect(qm.size).toBe(0);
  });

  it('resetAll clears everything', () => {
    const qm = makeManager();
    qm.recordUsage('A', 'parseOperations', 1);
    qm.recordUsage('B', 'parseOperations', 1);
    qm.resetAll();
    expect(qm.size).toBe(0);
  });

  it('size tracks key count', () => {
    const qm = makeManager();
    expect(qm.size).toBe(0);
    qm.recordUsage('A', 'parseOperations', 1);
    qm.recordUsage('B', 'compileOperations', 1);
    expect(qm.size).toBe(2);
  });

  it('resetsAt field is a valid ISO string', () => {
    const qm = makeManager();
    const r = qm.checkQuota('user1', 'parseOperations');
    expect(new Date(r.resetsAt).toISOString()).toBe(r.resetsAt);
  });

  it('getDayStart returns UTC midnight', () => {
    const ts = new Date('2026-02-17T15:30:00Z').getTime();
    const dayStart = QuotaManager.getDayStart(ts);
    expect(new Date(dayStart).toISOString()).toBe('2026-02-17T00:00:00.000Z');
  });

  it('getMonthStart returns 1st of month UTC', () => {
    const ts = new Date('2026-02-17T15:30:00Z').getTime();
    const monthStart = QuotaManager.getMonthStart(ts);
    expect(new Date(monthStart).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
