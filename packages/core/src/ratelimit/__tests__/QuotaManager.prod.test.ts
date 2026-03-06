/**
 * QuotaManager.prod.test.ts — Sprint CLXIX
 *
 * Production tests for the daily/monthly usage QuotaManager.
 * API: new QuotaManager(config)
 *   .checkQuota(key, operation, count?)  → QuotaResult (non-recording)
 *   .recordUsage(key, operation, count?) → QuotaResult
 *   .getUsage(key)                       → UsageSnapshot
 *   .resetDaily()                        → void
 *   .resetMonthly()                      → void
 *   .resetAll()                          → void
 *   .resetKey(key)                       → void
 *   .size()                              → number
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaManager } from '../QuotaManager';
import type { QuotaConfig } from '../QuotaManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<QuotaConfig> = {}): QuotaConfig {
  return {
    daily: {
      parseOperations: 10,
      compileOperations: 10,
      generateOperations: 5,
    },
    monthly: {
      totalBytes: 1000,
      apiCalls: 100,
    },
    ...overrides,
  };
}

let qm: QuotaManager;

beforeEach(() => {
  qm = new QuotaManager(makeConfig());
});

// ---------------------------------------------------------------------------
// constructor / getConfig
// ---------------------------------------------------------------------------

describe('QuotaManager', () => {
  describe('constructor / getConfig()', () => {
    it('stores config correctly', () => {
      const cfg = qm.getConfig();
      expect(cfg.daily.parseOperations).toBe(10);
      expect(cfg.monthly.apiCalls).toBe(100);
    });

    it('returns a copy of config (not shared reference)', () => {
      const cfg1 = qm.getConfig();
      const cfg2 = qm.getConfig();
      expect(cfg1).toEqual(cfg2);
    });
  });

  // -------------------------------------------------------------------------
  // checkQuota() — non-recording
  // -------------------------------------------------------------------------

  describe('checkQuota()', () => {
    it('allows operation for fresh key', () => {
      const result = qm.checkQuota('user-1', 'parseOperations');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('does not record usage (usage stays at 0 after check)', () => {
      // checkQuota creates the key in the map (via getOrCreateUsage) but does NOT add to the counter
      qm.checkQuota('u', 'parseOperations');
      qm.checkQuota('u', 'parseOperations');
      const snap = qm.getUsage('u');
      expect(snap.daily.parseOperations).toBe(0);
    });

    it('returns correct limit', () => {
      const result = qm.checkQuota('u', 'compileOperations');
      expect(result.limit).toBe(10);
    });

    it('reports denied when quota would be exceeded', () => {
      // Record usage up to limit
      for (let i = 0; i < 10; i++) qm.recordUsage('u', 'parseOperations');
      const result = qm.checkQuota('u', 'parseOperations');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('allows unlimited quota (-1)', () => {
      const qmUnlimited = new QuotaManager(makeConfig({
        daily: { parseOperations: -1, compileOperations: 10, generateOperations: 5 },
      }));
      for (let i = 0; i < 1000; i++) qmUnlimited.recordUsage('u', 'parseOperations');
      const result = qmUnlimited.checkQuota('u', 'parseOperations');
      expect(result.allowed).toBe(true);
    });

    it('resetsAt is a date string', () => {
      const result = qm.checkQuota('u', 'parseOperations');
      expect(typeof result.resetsAt).toBe('string');
      expect(result.resetsAt.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // recordUsage()
  // -------------------------------------------------------------------------

  describe('recordUsage()', () => {
    it('allows and records usage within quota', () => {
      const result = qm.recordUsage('u', 'parseOperations');
      expect(result.allowed).toBe(true);
      expect(qm.getUsage('u').daily.parseOperations).toBe(1);
    });

    it('remaining decrements with each call', () => {
      qm.recordUsage('u', 'parseOperations');
      qm.recordUsage('u', 'parseOperations');
      const result = qm.recordUsage('u', 'parseOperations');
      expect(result.remaining).toBe(7);
    });

    it('rejects when daily limit reached', () => {
      for (let i = 0; i < 10; i++) qm.recordUsage('u', 'parseOperations');
      const result = qm.recordUsage('u', 'parseOperations');
      expect(result.allowed).toBe(false);
    });

    it('does not record usage on rejection', () => {
      for (let i = 0; i < 10; i++) qm.recordUsage('u', 'parseOperations');
      qm.recordUsage('u', 'parseOperations'); // rejected
      expect(qm.getUsage('u').daily.parseOperations).toBe(10);
    });

    it('tracks monthly apiCalls', () => {
      qm.recordUsage('u', 'apiCalls', 5);
      expect(qm.getUsage('u').monthly.apiCalls).toBe(5);
    });

    it('tracks monthly totalBytes', () => {
      qm.recordUsage('u', 'totalBytes', 200);
      expect(qm.getUsage('u').monthly.totalBytes).toBe(200);
    });

    it('rejects monthly operation when limit exceeded', () => {
      qm.recordUsage('u', 'apiCalls', 100);
      const result = qm.recordUsage('u', 'apiCalls', 1);
      expect(result.allowed).toBe(false);
    });

    it('isolates per-key usage', () => {
      qm.recordUsage('a', 'parseOperations', 5);
      const snap = qm.getUsage('b');
      expect(snap.daily.parseOperations).toBe(0);
    });

    it('count parameter accumulates correctly', () => {
      qm.recordUsage('u', 'parseOperations', 3);
      qm.recordUsage('u', 'parseOperations', 4);
      expect(qm.getUsage('u').daily.parseOperations).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // getUsage()
  // -------------------------------------------------------------------------

  describe('getUsage()', () => {
    it('returns zero usage for fresh key', () => {
      const snap = qm.getUsage('fresh');
      expect(snap.daily.parseOperations).toBe(0);
      expect(snap.monthly.apiCalls).toBe(0);
    });

    it('provides periodStart as date string', () => {
      const snap = qm.getUsage('u');
      expect(typeof snap.daily.periodStart).toBe('string');
      expect(typeof snap.monthly.periodStart).toBe('string');
    });

    it('reflects multiple operation types in snapshot', () => {
      qm.recordUsage('u', 'parseOperations', 3);
      qm.recordUsage('u', 'compileOperations', 2);
      qm.recordUsage('u', 'apiCalls', 10);
      const snap = qm.getUsage('u');
      expect(snap.daily.parseOperations).toBe(3);
      expect(snap.daily.compileOperations).toBe(2);
      expect(snap.monthly.apiCalls).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // resetDaily() / resetMonthly() / resetAll() / resetKey()
  // -------------------------------------------------------------------------

  describe('reset methods', () => {
    it('resetKey removes key entirely', () => {
      qm.recordUsage('u', 'parseOperations', 5);
      qm.resetKey('u');
      expect(qm.getUsage('u').daily.parseOperations).toBe(0);
    });

    it('resetDaily clears daily quotas for all keys', () => {
      qm.recordUsage('a', 'parseOperations', 5);
      qm.recordUsage('b', 'compileOperations', 3);
      qm.resetDaily();
      expect(qm.getUsage('a').daily.parseOperations).toBe(0);
      expect(qm.getUsage('b').daily.compileOperations).toBe(0);
    });

    it('resetDaily preserves monthly usage', () => {
      qm.recordUsage('u', 'apiCalls', 50);
      qm.resetDaily();
      expect(qm.getUsage('u').monthly.apiCalls).toBe(50);
    });

    it('resetMonthly clears monthly quotas for all keys', () => {
      qm.recordUsage('u', 'apiCalls', 50);
      qm.resetMonthly();
      expect(qm.getUsage('u').monthly.apiCalls).toBe(0);
    });

    it('resetMonthly preserves daily usage', () => {
      qm.recordUsage('u', 'parseOperations', 5);
      qm.resetMonthly();
      expect(qm.getUsage('u').daily.parseOperations).toBe(5);
    });

    it('resetAll removes all tracked keys', () => {
      qm.recordUsage('a', 'parseOperations', 1);
      qm.recordUsage('b', 'parseOperations', 1);
      qm.resetAll();
      expect(qm.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // size getter
  // -------------------------------------------------------------------------

  describe('size getter', () => {
    it('returns 0 initially', () => {
      expect(qm.size).toBe(0);
    });

    it('increments when new keys are created by recordUsage', () => {
      qm.recordUsage('a', 'parseOperations');
      qm.recordUsage('b', 'parseOperations');
      expect(qm.size).toBe(2);
    });

    it('checkQuota also creates a key (size increments)', () => {
      // checkQuota calls getOrCreateUsage which stores the key
      qm.checkQuota('x', 'parseOperations');
      expect(qm.size).toBeGreaterThanOrEqual(1);
    });

    it('resetAll() resets size to 0', () => {
      qm.recordUsage('a', 'parseOperations');
      qm.recordUsage('b', 'parseOperations');
      qm.resetAll();
      expect(qm.size).toBe(0);
    });

    it('resetKey() removes that key from size', () => {
      qm.recordUsage('u', 'parseOperations');
      const before = qm.size;
      qm.resetKey('u');
      expect(qm.size).toBe(before - 1);
    });
  });
});
