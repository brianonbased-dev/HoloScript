import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaManager, type QuotaConfig } from '../QuotaManager';

const config: QuotaConfig = {
  daily: { parseOperations: 10, compileOperations: 5, generateOperations: 3 },
  monthly: { totalBytes: 1000, apiCalls: 50 },
};

describe('QuotaManager', () => {
  let mgr: QuotaManager;

  beforeEach(() => { mgr = new QuotaManager(config); });

  it('getConfig returns config', () => {
    expect(mgr.getConfig().daily.parseOperations).toBe(10);
  });

  // Check
  it('checkQuota allowed for fresh key', () => {
    const r = mgr.checkQuota('u1', 'parseOperations');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(10);
  });

  it('checkQuota does not consume quota', () => {
    mgr.checkQuota('u1', 'parseOperations');
    const r = mgr.checkQuota('u1', 'parseOperations');
    expect(r.remaining).toBe(10);
  });

  // Record
  it('recordUsage decrements remaining', () => {
    const r = mgr.recordUsage('u1', 'parseOperations', 3);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(7);
  });

  it('recordUsage refuses when exceeding quota', () => {
    mgr.recordUsage('u1', 'parseOperations', 10);
    const r = mgr.recordUsage('u1', 'parseOperations', 1);
    expect(r.allowed).toBe(false);
  });

  it('recordUsage with count 0 is safe', () => {
    const r = mgr.recordUsage('u1', 'parseOperations', 0);
    expect(r.allowed).toBe(true);
  });

  // Monthly quota
  it('monthly totalBytes tracked', () => {
    mgr.recordUsage('u1', 'totalBytes', 500);
    const r = mgr.recordUsage('u1', 'totalBytes', 600);
    expect(r.allowed).toBe(false);
  });

  it('monthly apiCalls tracked', () => {
    for (let i = 0; i < 50; i++) mgr.recordUsage('u1', 'apiCalls');
    const r = mgr.recordUsage('u1', 'apiCalls');
    expect(r.allowed).toBe(false);
  });

  // Usage snapshot
  it('getUsage returns full snapshot', () => {
    mgr.recordUsage('u1', 'parseOperations', 2);
    const snap = mgr.getUsage('u1');
    expect(snap.key).toBe('u1');
    expect(snap.daily.parseOperations).toBe(2);
  });

  it('getUsage for unknown key returns zero snapshot', () => {
    const snap = mgr.getUsage('nobody');
    expect(snap.daily.parseOperations).toBe(0);
    expect(snap.monthly.apiCalls).toBe(0);
  });

  // Resets
  it('resetKey removes specific key', () => {
    mgr.recordUsage('u1', 'parseOperations', 5);
    mgr.resetKey('u1');
    const snap = mgr.getUsage('u1');
    expect(snap.daily.parseOperations).toBe(0);
  });

  it('resetAll removes everything', () => {
    mgr.recordUsage('u1', 'parseOperations');
    mgr.recordUsage('u2', 'compileOperations');
    mgr.resetAll();
    expect(mgr.size).toBe(0);
  });

  it('resetDaily resets daily counters', () => {
    mgr.recordUsage('u1', 'parseOperations', 5);
    mgr.resetDaily();
    const snap = mgr.getUsage('u1');
    expect(snap.daily.parseOperations).toBe(0);
  });

  it('resetMonthly resets monthly counters', () => {
    mgr.recordUsage('u1', 'apiCalls', 30);
    mgr.resetMonthly();
    const snap = mgr.getUsage('u1');
    expect(snap.monthly.apiCalls).toBe(0);
  });

  // Size
  it('size tracks active keys', () => {
    expect(mgr.size).toBe(0);
    mgr.recordUsage('a', 'parseOperations');
    mgr.recordUsage('b', 'compileOperations');
    expect(mgr.size).toBe(2);
  });

  // Unlimited (-1)
  it('unlimited quota always allows', () => {
    const unlimited = new QuotaManager({
      daily: { parseOperations: -1, compileOperations: -1, generateOperations: -1 },
      monthly: { totalBytes: -1, apiCalls: -1 },
    });
    for (let i = 0; i < 1000; i++) unlimited.recordUsage('u1', 'parseOperations');
    expect(unlimited.checkQuota('u1', 'parseOperations').allowed).toBe(true);
  });
});
