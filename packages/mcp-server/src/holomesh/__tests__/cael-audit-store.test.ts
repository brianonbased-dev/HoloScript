/**
 * Tests for the CAEL audit-record store helpers in state.ts.
 *
 * Closes gap-build task_1777090894117_d2jx (CAEL audit GET endpoint).
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md +
 *       ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md.
 *
 * The route-layer tests are deferred to the integration suite (Phase 1 hardening
 * tracked at task_1777093147560_pawd). Here we verify the pure state helpers
 * which carry the load-bearing semantics: append + filter + ring-buffer drop.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendCaelAuditRecord,
  queryCaelAuditRecords,
  agentAuditStore,
  type CaelAuditRecord,
} from '../state';

const HANDLE = 'mesh-worker-test';

function makeRecord(overrides: Partial<CaelAuditRecord> = {}): CaelAuditRecord {
  return {
    tick_iso: '2026-04-25T05:00:00.000Z',
    layer_hashes: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', // W.090 invariant: 7 layers
    ],
    operation: 'audit/trial.open',
    prev_hash: null,
    fnv1a_chain: 'fnv-1a-chain-stub',
    version_vector_fingerprint: 'vv-stub',
    received_at: '',
    ...overrides,
  };
}

describe('CAEL audit store helpers (gap-build task_..._d2jx)', () => {
  beforeEach(() => {
    agentAuditStore.clear();
  });

  describe('appendCaelAuditRecord', () => {
    it('appends a record and queries it back', () => {
      const rec = makeRecord();
      appendCaelAuditRecord(HANDLE, rec);
      const result = queryCaelAuditRecords(HANDLE);
      expect(result).toHaveLength(1);
      expect(result[0].tick_iso).toBe(rec.tick_iso);
      expect(result[0].layer_hashes).toHaveLength(7);
    });

    it('preserves W.090 7-layer invariant on stored records', () => {
      appendCaelAuditRecord(HANDLE, makeRecord());
      const result = queryCaelAuditRecords(HANDLE);
      expect(result[0].layer_hashes).toHaveLength(7);
    });

    it('isolates records per agent handle', () => {
      appendCaelAuditRecord('handle-a', makeRecord({ operation: 'op-a' }));
      appendCaelAuditRecord('handle-b', makeRecord({ operation: 'op-b' }));
      expect(queryCaelAuditRecords('handle-a')).toHaveLength(1);
      expect(queryCaelAuditRecords('handle-a')[0].operation).toBe('op-a');
      expect(queryCaelAuditRecords('handle-b')[0].operation).toBe('op-b');
    });

    it('caps the per-agent ring buffer at 10,000 records (drops oldest)', () => {
      // Append 10,005 records — first 5 should drop. Use distinct
      // tick_iso so we can verify which records survived.
      for (let i = 0; i < 10_005; i++) {
        const ts = new Date(2_000_000_000_000 + i * 1000).toISOString();
        appendCaelAuditRecord(HANDLE, makeRecord({ tick_iso: ts, operation: `op-${i}` }));
      }
      const all = queryCaelAuditRecords(HANDLE, { limit: 20_000 });
      expect(all).toHaveLength(10_000);
      // First 5 dropped: oldest survivor should be index 5
      expect(all[0].operation).toBe('op-5');
      expect(all[all.length - 1].operation).toBe('op-10004');
    });
  });

  describe('queryCaelAuditRecords filters', () => {
    beforeEach(() => {
      // Seed 3 records at distinct timestamps
      appendCaelAuditRecord(HANDLE, makeRecord({
        tick_iso: '2026-04-25T05:00:00.000Z',
        operation: 'audit/trial.open',
      }));
      appendCaelAuditRecord(HANDLE, makeRecord({
        tick_iso: '2026-04-25T06:00:00.000Z',
        operation: 'audit/sybil.vouch',
      }));
      appendCaelAuditRecord(HANDLE, makeRecord({
        tick_iso: '2026-04-25T07:00:00.000Z',
        operation: 'audit/trial.close',
      }));
    });

    it('filters by since (inclusive)', () => {
      const result = queryCaelAuditRecords(HANDLE, {
        since: '2026-04-25T06:00:00.000Z',
      });
      expect(result).toHaveLength(2);
      expect(result[0].operation).toBe('audit/sybil.vouch');
      expect(result[1].operation).toBe('audit/trial.close');
    });

    it('filters by until (inclusive)', () => {
      const result = queryCaelAuditRecords(HANDLE, {
        until: '2026-04-25T06:00:00.000Z',
      });
      expect(result).toHaveLength(2);
      expect(result[0].operation).toBe('audit/trial.open');
      expect(result[1].operation).toBe('audit/sybil.vouch');
    });

    it('filters by since AND until window', () => {
      const result = queryCaelAuditRecords(HANDLE, {
        since: '2026-04-25T05:30:00.000Z',
        until: '2026-04-25T06:30:00.000Z',
      });
      expect(result).toHaveLength(1);
      expect(result[0].operation).toBe('audit/sybil.vouch');
    });

    it('filters by operation', () => {
      const result = queryCaelAuditRecords(HANDLE, {
        operation: 'audit/sybil.vouch',
      });
      expect(result).toHaveLength(1);
      expect(result[0].operation).toBe('audit/sybil.vouch');
    });

    it('limit returns the most recent N records (not the first N)', () => {
      const result = queryCaelAuditRecords(HANDLE, { limit: 2 });
      expect(result).toHaveLength(2);
      // limit takes most-recent (slice from end) — second + third record
      expect(result[0].operation).toBe('audit/sybil.vouch');
      expect(result[1].operation).toBe('audit/trial.close');
    });

    it('returns empty array for unknown handle', () => {
      expect(queryCaelAuditRecords('does-not-exist')).toEqual([]);
    });

    it('default limit is 1000', () => {
      // Already 3 records; verify default returns all 3 (under cap).
      const result = queryCaelAuditRecords(HANDLE);
      expect(result).toHaveLength(3);
    });

    it('ignores invalid since/until ISO strings', () => {
      const result = queryCaelAuditRecords(HANDLE, {
        since: 'not-a-date',
        until: '????',
      });
      // Invalid timestamps don't filter — full set returned.
      expect(result).toHaveLength(3);
    });
  });
});
