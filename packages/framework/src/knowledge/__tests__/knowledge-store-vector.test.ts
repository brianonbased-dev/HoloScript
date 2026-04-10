/**
 * Tests for KnowledgeStore vector embedding pipeline (FW-0.5).
 *
 * Covers: embedAndStore(), semanticSearch(), hybrid search, error fallback.
 * Uses vi.fn() to mock global fetch — no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeStore } from '../knowledge-store';
import type { KnowledgeConfig, KnowledgeInsight } from '../../types';

// ── Helpers ──

function makeConfig(remote = true): KnowledgeConfig {
  return {
    persist: false,
    ...(remote
      ? {
          remoteUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app',
          remoteApiKey: 'test-api-key',
        }
      : {}),
  };
}

function makeInsight(overrides?: Partial<KnowledgeInsight>): KnowledgeInsight {
  return {
    type: 'wisdom',
    content: 'Always use strict TypeScript',
    domain: 'compilation',
    confidence: 0.9,
    source: 'test-agent',
    ...overrides,
  };
}

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFail() {
  return vi.fn().mockResolvedValue({ ok: false, status: 500 });
}

function mockFetchThrow() {
  return vi.fn().mockRejectedValue(new Error('Network error'));
}

// ── Tests ──

describe('KnowledgeStore — Vector Embedding Pipeline', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── embedAndStore ──

  describe('embedAndStore', () => {
    it('publishes locally and syncs to remote', async () => {
      const fetchMock = mockFetchOk({ synced: 1, ids: ['remote-001'] });
      globalThis.fetch = fetchMock;

      const store = new KnowledgeStore(makeConfig());
      const result = await store.embedAndStore(makeInsight(), 'agent-a');

      expect(result.entryId).toMatch(/^W\./);
      expect(result.synced).toBe(true);
      expect(result.remoteId).toBe('remote-001');
      expect(store.size).toBe(1);

      // Verify fetch was called with correct endpoint and payload
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toContain('/knowledge/sync');
      expect(opts.headers['x-mcp-api-key']).toBe('test-api-key');

      const body = JSON.parse(opts.body);
      expect(body.workspace_id).toBe('ai-ecosystem');
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].content).toBe('Always use strict TypeScript');
      expect(body.entries[0].metadata.domain).toBe('compilation');
    });

    it('publishes locally even when remote fails', async () => {
      globalThis.fetch = mockFetchFail();

      const store = new KnowledgeStore(makeConfig());
      const result = await store.embedAndStore(makeInsight(), 'agent-a');

      expect(result.entryId).toMatch(/^W\./);
      expect(result.synced).toBe(false);
      expect(result.remoteId).toBeUndefined();
      expect(store.size).toBe(1);
    });

    it('publishes locally even when fetch throws', async () => {
      globalThis.fetch = mockFetchThrow();

      const store = new KnowledgeStore(makeConfig());
      const result = await store.embedAndStore(makeInsight(), 'agent-a');

      expect(result.entryId).toMatch(/^W\./);
      expect(result.synced).toBe(false);
      expect(store.size).toBe(1);
    });

    it('skips remote when no remoteUrl configured', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      const store = new KnowledgeStore(makeConfig(false));
      const result = await store.embedAndStore(makeInsight(), 'agent-a');

      expect(result.entryId).toMatch(/^W\./);
      expect(result.synced).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deduplicates on repeated embed of same content', async () => {
      globalThis.fetch = mockFetchOk({ synced: 1 });

      const store = new KnowledgeStore(makeConfig());
      const r1 = await store.embedAndStore(makeInsight(), 'agent-a');
      const r2 = await store.embedAndStore(makeInsight(), 'agent-b');

      // Same content = same entry (dedup)
      expect(r1.entryId).toBe(r2.entryId);
      expect(store.size).toBe(1);
    });

    it('includes provenance metadata in remote sync', async () => {
      const fetchMock = mockFetchOk({ synced: 1 });
      globalThis.fetch = fetchMock;

      const store = new KnowledgeStore(makeConfig());
      await store.embedAndStore(makeInsight(), 'agent-a', {
        taskId: 'task-42',
        cycleId: 'cycle-7',
        provenanceHash: 'abc123',
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.entries[0].metadata.taskId).toBe('task-42');
      expect(body.entries[0].metadata.cycleId).toBe('cycle-7');
      expect(body.entries[0].provenanceHash).toBe('abc123');
    });
  });

  // ── semanticSearch ──

  describe('semanticSearch', () => {
    it('returns remote results when available', async () => {
      const remoteEntries = [
        {
          id: 'r1',
          type: 'wisdom',
          content: 'Use strict mode',
          metadata: { domain: 'compilation', confidence: 0.8 },
        },
        {
          id: 'r2',
          type: 'pattern',
          content: 'Pattern matching',
          metadata: { domain: 'compilation', confidence: 0.7 },
        },
      ];
      globalThis.fetch = mockFetchOk(remoteEntries);

      const store = new KnowledgeStore(makeConfig());
      const results = await store.semanticSearch('strict typescript');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('r1');
      expect(results[0].content).toBe('Use strict mode');
      expect(results[1].id).toBe('r2');
    });

    it('falls back to local keyword search when remote fails', async () => {
      globalThis.fetch = mockFetchFail();

      const store = new KnowledgeStore(makeConfig());
      store.publish(makeInsight({ content: 'TypeScript strict mode is essential' }), 'agent-a');
      store.publish(makeInsight({ content: 'Python type hints are optional' }), 'agent-b');

      const results = await store.semanticSearch('strict typescript');

      // Should find the local entry with matching keywords
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain('strict');
    });

    it('falls back to local when fetch throws', async () => {
      globalThis.fetch = mockFetchThrow();

      const store = new KnowledgeStore(makeConfig());
      store.publish(makeInsight({ content: 'TypeScript strict mode rocks' }), 'agent-a');

      const results = await store.semanticSearch('strict typescript');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to local when no remote configured', async () => {
      const store = new KnowledgeStore(makeConfig(false));
      store.publish(makeInsight({ content: 'TypeScript strict mode rocks' }), 'agent-a');

      const results = await store.semanticSearch('strict typescript');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by type when specified', async () => {
      const fetchMock = mockFetchOk([]);
      globalThis.fetch = fetchMock;

      const store = new KnowledgeStore(makeConfig());
      await store.semanticSearch('rendering', { type: 'gotcha' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('gotcha');
    });

    it('filters by minConfidence', async () => {
      const remoteEntries = [
        {
          id: 'r1',
          type: 'wisdom',
          content: 'High confidence',
          metadata: { confidence: 0.9, domain: 'general' },
        },
        {
          id: 'r2',
          type: 'wisdom',
          content: 'Low confidence',
          metadata: { confidence: 0.3, domain: 'general' },
        },
      ];
      globalThis.fetch = mockFetchOk(remoteEntries);

      const store = new KnowledgeStore(makeConfig());
      const results = await store.semanticSearch('confidence', { minConfidence: 0.5 });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('r1');
    });

    it('respects limit parameter', async () => {
      const remoteEntries = Array.from({ length: 20 }, (_, i) => ({
        id: `r${i}`,
        type: 'wisdom',
        content: `Entry ${i}`,
        metadata: { domain: 'general', confidence: 0.5 },
      }));
      globalThis.fetch = mockFetchOk(remoteEntries);

      const store = new KnowledgeStore(makeConfig());
      const results = await store.semanticSearch('entry', { limit: 5 });

      expect(results).toHaveLength(5);
    });

    it('hybrid search merges remote + local, deduped by ID', async () => {
      const remoteEntries = [
        {
          id: 'r1',
          type: 'wisdom',
          content: 'Remote only',
          metadata: { domain: 'general', confidence: 0.9 },
        },
        {
          id: 'shared',
          type: 'wisdom',
          content: 'Remote version',
          metadata: { domain: 'general', confidence: 0.8 },
        },
      ];
      globalThis.fetch = mockFetchOk(remoteEntries);

      const store = new KnowledgeStore(makeConfig());
      // Publish a local entry that has the same ID as a remote entry
      const local = store.publish(
        makeInsight({ content: 'Local entry about general topics' }),
        'agent-a'
      );

      const results = await store.semanticSearch('general topics', {
        hybridSearch: true,
        limit: 10,
      });

      // Should contain remote entries + local entries, no duplicate IDs
      const ids = results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);

      // Remote entries should be present
      expect(ids).toContain('r1');
    });

    it('hybrid search: remote wins on ID conflict', async () => {
      // Create a store with a local entry
      const store = new KnowledgeStore(makeConfig());
      store.publish(makeInsight({ content: 'Local version of knowledge' }), 'agent-a');
      const localId = store.all()[0].id;

      // Remote returns an entry with the same ID but different content
      const remoteEntries = [
        {
          id: localId,
          type: 'wisdom',
          content: 'Remote version of knowledge',
          metadata: { domain: 'compilation', confidence: 0.95 },
        },
      ];
      globalThis.fetch = mockFetchOk(remoteEntries);

      const results = await store.semanticSearch('knowledge', { hybridSearch: true });

      // The entry with localId should appear exactly once
      const matching = results.filter((r) => r.id === localId);
      expect(matching).toHaveLength(1);
      // Remote wins (appears first in merge)
      expect(matching[0].content).toBe('Remote version of knowledge');
    });
  });
});
