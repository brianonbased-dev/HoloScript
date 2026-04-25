/**
 * Tests for Phase 1 persistence of CAEL audit + defense state.
 *
 * Closes Phase 1 hardening of task_..._d2jx + task_..._8bav (filed under
 * task_1777093147560_pawd). Verifies that records + defense configs are
 * written to <HOLOMESH_DATA_DIR>/audit/<handle>.jsonl and
 * <HOLOMESH_DATA_DIR>/defense/<handle>.json, and that loadCaelAuditFromDisk
 * + loadAgentDefenseFromDisk rehydrate the in-memory stores on startup.
 *
 * Test isolation: uses a temp HOLOMESH_DATA_DIR via env override at
 * import time. Module mutates global state.HOLOMESH_DATA_DIR via env, so
 * we set it BEFORE importing state.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set temp data dir before importing state.ts so it picks up the override.
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'holomesh-state-persist-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;

const stateModule = await import('../state');
const {
  agentAuditStore,
  agentDefenseStore,
  appendCaelAuditRecord,
  setAgentDefense,
  loadCaelAuditFromDisk,
  loadAgentDefenseFromDisk,
} = stateModule;

const HANDLE = 'mesh-worker-persist-test';

describe('Phase 1 persistence (gap-build pawd)', () => {
  beforeEach(() => {
    agentAuditStore.clear();
    agentDefenseStore.clear();
  });

  afterEach(() => {
    // Don't rm the temp dir between tests — let rehydrate tests see what
    // earlier tests wrote. Final cleanup happens in afterAll.
  });

  describe('CAEL audit JSONL persistence', () => {
    it('writes append to <HOLOMESH_DATA_DIR>/audit/<handle>.jsonl', () => {
      const handle = `${HANDLE}-cael-1`;
      const record = {
        tick_iso: '2026-04-25T05:00:00.000Z',
        layer_hashes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
        operation: 'audit/test.persist',
        prev_hash: null,
        fnv1a_chain: 'abc',
        version_vector_fingerprint: 'vv',
        received_at: '',
      };
      appendCaelAuditRecord(handle, record);
      const expectedPath = join(TEMP_DIR, 'audit', `${handle}.jsonl`);
      expect(existsSync(expectedPath)).toBe(true);
      const lines = readFileSync(expectedPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.tick_iso).toBe('2026-04-25T05:00:00.000Z');
      expect(parsed.layer_hashes).toHaveLength(7);
    });

    it('appends multiple records as separate lines', () => {
      const handle = `${HANDLE}-cael-2`;
      for (let i = 0; i < 5; i++) {
        appendCaelAuditRecord(handle, {
          tick_iso: `2026-04-25T05:0${i}:00.000Z`,
          layer_hashes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
          operation: `audit/op-${i}`,
          prev_hash: null,
          fnv1a_chain: 'abc',
          version_vector_fingerprint: 'vv',
          received_at: '',
        });
      }
      const expectedPath = join(TEMP_DIR, 'audit', `${handle}.jsonl`);
      const lines = readFileSync(expectedPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(5);
      expect(JSON.parse(lines[0]).operation).toBe('audit/op-0');
      expect(JSON.parse(lines[4]).operation).toBe('audit/op-4');
    });

    it('rehydrates in-memory store from JSONL on loadCaelAuditFromDisk', () => {
      const handle = `${HANDLE}-cael-3`;
      // Write 3 records to disk
      for (let i = 0; i < 3; i++) {
        appendCaelAuditRecord(handle, {
          tick_iso: `2026-04-25T06:0${i}:00.000Z`,
          layer_hashes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
          operation: `audit/rehydrate-${i}`,
          prev_hash: null,
          fnv1a_chain: 'abc',
          version_vector_fingerprint: 'vv',
          received_at: '',
        });
      }
      // Clear in-memory then rehydrate
      agentAuditStore.clear();
      expect(agentAuditStore.get(handle)).toBeUndefined();
      loadCaelAuditFromDisk();
      const rehydrated = agentAuditStore.get(handle);
      expect(rehydrated).toBeDefined();
      expect(rehydrated).toHaveLength(3);
      expect(rehydrated![0].operation).toBe('audit/rehydrate-0');
    });

    it('sanitizes handle for filesystem path (no path-traversal)', () => {
      const dangerousHandle = `../../../escape/${HANDLE}`;
      appendCaelAuditRecord(dangerousHandle, {
        tick_iso: '2026-04-25T05:00:00.000Z',
        layer_hashes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
        operation: 'audit/sanitize',
        prev_hash: null,
        fnv1a_chain: 'abc',
        version_vector_fingerprint: 'vv',
        received_at: '',
      });
      // Should not have created a file outside the audit dir.
      const escapedPath = join(TEMP_DIR, '..', 'escape', `${HANDLE}.jsonl`);
      expect(existsSync(escapedPath)).toBe(false);
      // Should have sanitized to a flat filename within the audit dir.
      const sanitizedHandle = dangerousHandle.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safePath = join(TEMP_DIR, 'audit', `${sanitizedHandle}.jsonl`);
      expect(existsSync(safePath)).toBe(true);
    });
  });

  describe('Defense state JSON persistence', () => {
    it('writes setAgentDefense to <HOLOMESH_DATA_DIR>/defense/<handle>.json', () => {
      const handle = `${HANDLE}-defense-1`;
      setAgentDefense(handle, 'decay-on-anomaly', null, 'agent_caller');
      const expectedPath = join(TEMP_DIR, 'defense', `${handle}.json`);
      expect(existsSync(expectedPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(expectedPath, 'utf8'));
      expect(parsed.state).toBe('decay-on-anomaly');
      expect(parsed.setBy).toBe('agent_caller');
    });

    it('overwrites file on second set', () => {
      const handle = `${HANDLE}-defense-2`;
      setAgentDefense(handle, 'none', null, 'caller-1');
      setAgentDefense(handle, 'all-three', null, 'caller-2');
      const parsed = JSON.parse(readFileSync(join(TEMP_DIR, 'defense', `${handle}.json`), 'utf8'));
      expect(parsed.state).toBe('all-three');
      expect(parsed.setBy).toBe('caller-2');
    });

    it('rehydrates from disk on loadAgentDefenseFromDisk', () => {
      const handle = `${HANDLE}-defense-3`;
      setAgentDefense(handle, 'replay-audit', null, 'caller');
      agentDefenseStore.clear();
      expect(agentDefenseStore.get(handle)).toBeUndefined();
      loadAgentDefenseFromDisk();
      const rehydrated = agentDefenseStore.get(handle);
      expect(rehydrated).toBeDefined();
      expect(rehydrated!.state).toBe('replay-audit');
    });
  });
});
