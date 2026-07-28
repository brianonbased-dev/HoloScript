/**
 * Tests for holo_memory_* MCP tool surface (Slice B1 — native memory substrate)
 *
 * Covers:
 *   - store → recall round-trip (keyword and semantic-fallback paths)
 *   - stats returns accurate counts
 *   - list with type/domain filter
 *   - farm clusters entries by tag+type
 *   - graduate emits a well-formed payload without writing to disk
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeStore } from '@holoscript/framework';
import { handleMemoryTool, memoryTools, _setStoreForTest } from '../memory-tools';

// ── Helpers ──────────────────────────────────────────────────────────────────

function freshStore(): KnowledgeStore {
  return new KnowledgeStore({ persist: false });
}

function assertSuccess(
  result: unknown
): asserts result is { success: true } & Record<string, unknown> {
  expect(result).toBeTruthy();
  expect((result as Record<string, unknown>).success).toBe(true);
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('memory-tools: tool definitions', () => {
  it('exports six holo_memory_* tool definitions', () => {
    const names = memoryTools.map((t) => t.name);
    expect(names).toContain('holo_memory_store');
    expect(names).toContain('holo_memory_recall');
    expect(names).toContain('holo_memory_list');
    expect(names).toContain('holo_memory_stats');
    expect(names).toContain('holo_memory_farm');
    expect(names).toContain('holo_memory_graduate');
    expect(names).toHaveLength(6);
  });

  it('every tool definition has a non-empty description and inputSchema', () => {
    for (const tool of memoryTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect((tool.inputSchema as { type: string }).type).toBe('object');
    }
  });
});

describe('holo_memory_store', () => {
  beforeEach(() => {
    _setStoreForTest(freshStore());
  });

  it('stores a W-type entry and returns success + id', async () => {
    const result = await handleMemoryTool('holo_memory_store', {
      content: 'Never hardcode ecosystem counts in docs; they change with every deploy.',
      type: 'W',
      domain: 'agents',
      confidence: 0.95,
      source: 'claude1',
      authorAgent: 'claude1',
    });

    assertSuccess(result);
    expect(typeof (result as Record<string, unknown>).id).toBe('string');
    expect((result as Record<string, unknown>).type).toBe('W');
    expect((result as Record<string, unknown>).insightType).toBe('wisdom');
    expect((result as Record<string, unknown>).status).toBe('stored_local');
  });

  it('stores a G-type (Gotcha) entry', async () => {
    const result = await handleMemoryTool('holo_memory_store', {
      content: 'parseHolo is TOLERANT — success does not mean valid; AND it with a content gate.',
      type: 'G',
    });

    assertSuccess(result);
    expect((result as Record<string, unknown>).type).toBe('G');
    expect((result as Record<string, unknown>).insightType).toBe('gotcha');
  });

  it('stores an F-type (Feedback) entry and maps to wisdom insight type', async () => {
    const result = await handleMemoryTool('holo_memory_store', {
      content: 'Describe-instead-of-do is a failure mode; fire skills, do not describe them.',
      type: 'F',
      domain: 'agents',
    });

    assertSuccess(result);
    expect((result as Record<string, unknown>).type).toBe('F');
    expect((result as Record<string, unknown>).insightType).toBe('wisdom');
  });

  it('stores a D-type (Direction) entry and maps to wisdom insight type', async () => {
    const result = await handleMemoryTool('holo_memory_store', {
      content:
        'Push DOES deploy — GitHub↔Railway is RECONNECTED; a broken commit ships immediately.',
      type: 'D',
    });

    assertSuccess(result);
    expect((result as Record<string, unknown>).type).toBe('D');
    expect((result as Record<string, unknown>).insightType).toBe('wisdom');
  });

  it('rejects missing content', async () => {
    const result = await handleMemoryTool('holo_memory_store', { type: 'W' });
    expect((result as Record<string, unknown>).success).toBe(false);
    expect(typeof (result as Record<string, unknown>).error).toBe('string');
  });

  it('deduplicates identical content', async () => {
    const content = 'Unique wisdom entry for dedup test.';
    const r1 = await handleMemoryTool('holo_memory_store', { content, type: 'W' });
    const r2 = await handleMemoryTool('holo_memory_store', { content, type: 'W' });
    assertSuccess(r1);
    assertSuccess(r2);
    // Same ID means deduplication fired
    expect((r1 as Record<string, unknown>).id).toBe((r2 as Record<string, unknown>).id);
  });
});

describe('holo_memory_recall — store → recall round-trip', () => {
  beforeEach(() => {
    _setStoreForTest(freshStore());
  });

  it('recalls an entry by keyword after storing it', async () => {
    await handleMemoryTool('holo_memory_store', {
      content:
        'The KnowledgeStore half-life decay ranks older entries lower in fast-decay domains.',
      type: 'W',
      domain: 'agents',
      confidence: 0.9,
      authorAgent: 'claude1',
    });

    const result = await handleMemoryTool('holo_memory_recall', {
      query: 'half-life decay',
    });

    assertSuccess(result);
    const r = result as { results: Array<{ content: string; id: string }> };
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0].content).toContain('half-life');
  });

  it('returns empty results for a query that matches nothing', async () => {
    const result = await handleMemoryTool('holo_memory_recall', {
      query: 'xyzzy_no_match_expected',
    });

    assertSuccess(result);
    const r = result as { results: unknown[]; total: number };
    expect(r.total).toBe(0);
    expect(r.results).toHaveLength(0);
  });

  it('filters by type (G) and excludes non-G entries', async () => {
    await handleMemoryTool('holo_memory_store', {
      content: 'Wisdom entry about the knowledge pipeline architecture.',
      type: 'W',
      domain: 'agents',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Gotcha: never use git add -A or dot in a multi-agent repo.',
      type: 'G',
      domain: 'agents',
      authorAgent: 'test',
    });

    const result = await handleMemoryTool('holo_memory_recall', {
      query: 'agent knowledge',
      type: 'G',
    });

    assertSuccess(result);
    const r = result as { results: Array<{ type: string }> };
    for (const entry of r.results) {
      expect(entry.type).toBe('G');
    }
  });

  it('falls back to keyword search when semantic=true but no remote configured', async () => {
    await handleMemoryTool('holo_memory_store', {
      content: 'Sovereign-first LLM resolution: HoloClaw/Brittney first, then fallback.',
      type: 'W',
      domain: 'agents',
      authorAgent: 'test',
    });

    // No HOLOSCRIPT_API_KEY in test env → falls back to local keyword search
    const result = await handleMemoryTool('holo_memory_recall', {
      query: 'sovereign llm',
      semantic: true,
    });

    assertSuccess(result);
    // May or may not find it depending on keyword match, but should not throw
    expect(Array.isArray((result as { results: unknown[] }).results)).toBe(true);
  });

  it('rejects missing query', async () => {
    const result = await handleMemoryTool('holo_memory_recall', {});
    expect((result as Record<string, unknown>).success).toBe(false);
  });
});

describe('holo_memory_stats', () => {
  beforeEach(() => {
    _setStoreForTest(freshStore());
  });

  it('returns zero counts on an empty store', async () => {
    const result = await handleMemoryTool('holo_memory_stats', {});
    assertSuccess(result);
    const r = result as { total: number; byType: Record<string, number> };
    expect(r.total).toBe(0);
    expect(r.byType.W).toBe(0);
    expect(r.byType.P).toBe(0);
    expect(r.byType.G).toBe(0);
  });

  it('counts entries correctly after stores', async () => {
    await handleMemoryTool('holo_memory_store', {
      content: 'Alpha wisdom.',
      type: 'W',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Beta pattern.',
      type: 'P',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Gamma gotcha.',
      type: 'G',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Delta feedback as wisdom.',
      type: 'F',
      authorAgent: 'test',
    });

    const result = await handleMemoryTool('holo_memory_stats', {});
    assertSuccess(result);
    const r = result as { total: number; byType: Record<string, number> };
    // F maps to wisdom, so W count is 2
    expect(r.total).toBe(4);
    expect(r.byType.W).toBe(2);
    expect(r.byType.P).toBe(1);
    expect(r.byType.G).toBe(1);
  });

  it('includes hotBufferByDomain and coldStoreByDomain arrays', async () => {
    const result = await handleMemoryTool('holo_memory_stats', {});
    assertSuccess(result);
    const r = result as { hotBufferByDomain: unknown[]; coldStoreByDomain: unknown[] };
    expect(Array.isArray(r.hotBufferByDomain)).toBe(true);
    expect(Array.isArray(r.coldStoreByDomain)).toBe(true);
  });
});

describe('holo_memory_list', () => {
  beforeEach(async () => {
    _setStoreForTest(freshStore());
    // Seed the store
    await handleMemoryTool('holo_memory_store', {
      content: 'Pattern for async tool registration.',
      type: 'P',
      domain: 'compilation',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Security gotcha: never store secrets in plain text.',
      type: 'G',
      domain: 'security',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Agent wisdom: validate before push.',
      type: 'W',
      domain: 'agents',
      authorAgent: 'test',
    });
  });

  it('lists all entries without filter', async () => {
    const result = await handleMemoryTool('holo_memory_list', {});
    assertSuccess(result);
    const r = result as { total: number; entries: unknown[] };
    expect(r.total).toBe(3);
    expect(r.entries).toHaveLength(3);
  });

  it('filters by type P', async () => {
    const result = await handleMemoryTool('holo_memory_list', { type: 'P' });
    assertSuccess(result);
    const r = result as { entries: Array<{ type: string }> };
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].type).toBe('P');
  });

  it('filters by domain security', async () => {
    const result = await handleMemoryTool('holo_memory_list', { domain: 'security' });
    assertSuccess(result);
    const r = result as { entries: Array<{ domain: string }> };
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].domain).toBe('security');
  });

  it('paginates correctly', async () => {
    const result = await handleMemoryTool('holo_memory_list', { page: 1, pageSize: 2 });
    assertSuccess(result);
    const r = result as { total: number; entries: unknown[]; page: number; pageSize: number };
    expect(r.total).toBe(3);
    expect(r.entries).toHaveLength(2);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(2);
  });
});

describe('holo_memory_farm', () => {
  beforeEach(async () => {
    _setStoreForTest(freshStore());
    // Seed entries with overlapping tags/domains to form clusters
    for (let i = 0; i < 3; i++) {
      await handleMemoryTool('holo_memory_store', {
        content: `Agent lifecycle wisdom entry ${i}: always claim before working.`,
        type: 'W',
        domain: 'agents',
        authorAgent: 'test',
      });
    }
    await handleMemoryTool('holo_memory_store', {
      content: 'Compilation pattern: compile_to_* tools dispatch against registered compilers.',
      type: 'P',
      domain: 'compilation',
      authorAgent: 'test',
    });
    await handleMemoryTool('holo_memory_store', {
      content: 'Security gotcha: always audit secrets before commit.',
      type: 'G',
      domain: 'security',
      authorAgent: 'test',
    });
  });

  it('returns clusters with correct shape', async () => {
    const result = await handleMemoryTool('holo_memory_farm', { minClusterSize: 1 });
    assertSuccess(result);
    const r = result as {
      clusters: Array<{ theme: string; entryIds: string[]; entryCount: number }>;
    };
    expect(Array.isArray(r.clusters)).toBe(true);
    expect(r.clusters.length).toBeGreaterThan(0);
    for (const cluster of r.clusters) {
      expect(typeof cluster.theme).toBe('string');
      expect(Array.isArray(cluster.entryIds)).toBe(true);
      expect(cluster.entryCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('clusters the three agents:wisdom entries together', async () => {
    const result = await handleMemoryTool('holo_memory_farm', {
      minClusterSize: 2,
      domain: 'agents',
    });
    assertSuccess(result);
    const r = result as { clusters: Array<{ entryCount: number; domain: string }> };
    const agentClusters = r.clusters.filter((c) => c.domain === 'agents');
    expect(agentClusters.length).toBeGreaterThan(0);
    expect(agentClusters[0].entryCount).toBeGreaterThanOrEqual(3);
  });

  it('respects minClusterSize filter', async () => {
    const result = await handleMemoryTool('holo_memory_farm', { minClusterSize: 3 });
    assertSuccess(result);
    const r = result as { clusters: Array<{ entryCount: number }> };
    for (const cluster of r.clusters) {
      expect(cluster.entryCount).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('holo_memory_graduate', () => {
  beforeEach(async () => {
    _setStoreForTest(freshStore());
  });

  it('emits a well-formed GraduationPayload for known entry IDs', async () => {
    const storeResult = await handleMemoryTool('holo_memory_store', {
      content: 'The GOLD vault is git-tracked at D:/GOLD; counts via python farm.py status.',
      type: 'W',
      domain: 'agents',
      authorAgent: 'claude1',
    });
    assertSuccess(storeResult);
    const entryId = (storeResult as { id: string }).id;

    const result = await handleMemoryTool('holo_memory_graduate', {
      entryIds: [entryId],
      title: 'GOLD Vault Location Wisdom',
      rationale: 'Cross-session knowledge; always needed at session start.',
      tier: 'Silver',
    });

    assertSuccess(result);
    const r = result as {
      graduationId: string;
      candidateIds: string[];
      resolvedCount: number;
      missingIds: string[];
      tier: string;
      payload: {
        schemaVersion: string;
        entries: Array<{ id: string; content: string }>;
        instructions: string;
      };
    };

    expect(r.graduationId).toMatch(/^grad_/);
    expect(r.candidateIds).toContain(entryId);
    expect(r.resolvedCount).toBe(1);
    expect(r.missingIds).toHaveLength(0);
    expect(r.tier).toBe('Silver');
    expect(r.payload.schemaVersion).toBe('holo_memory.graduation.v1');
    expect(r.payload.entries).toHaveLength(1);
    expect(r.payload.entries[0].id).toBe(entryId);
    expect(r.payload.instructions).toContain('GOLD vault');
  });

  it('reports missing IDs without crashing', async () => {
    const result = await handleMemoryTool('holo_memory_graduate', {
      entryIds: ['W.NONEXIST.001', 'W.NONEXIST.002'],
      title: 'Partial test',
      rationale: 'Testing missing-ID handling.',
    });

    assertSuccess(result);
    const r = result as { resolvedCount: number; missingIds: string[]; status: string };
    expect(r.resolvedCount).toBe(0);
    expect(r.missingIds).toHaveLength(2);
    expect(r.status).toBe('partial_match_check_missing_ids');
  });

  it('rejects empty entryIds', async () => {
    const result = await handleMemoryTool('holo_memory_graduate', {
      entryIds: [],
      title: 'Test',
      rationale: 'Test',
    });
    expect((result as Record<string, unknown>).success).toBe(false);
  });

  it('rejects missing title', async () => {
    const result = await handleMemoryTool('holo_memory_graduate', {
      entryIds: ['W.TEST.001'],
      rationale: 'Test',
    });
    expect((result as Record<string, unknown>).success).toBe(false);
  });

  it('defaults tier to Silver when not specified', async () => {
    const storeResult = await handleMemoryTool('holo_memory_store', {
      content: 'Tier default test entry.',
      type: 'P',
      authorAgent: 'test',
    });
    assertSuccess(storeResult);
    const entryId = (storeResult as { id: string }).id;

    const result = await handleMemoryTool('holo_memory_graduate', {
      entryIds: [entryId],
      title: 'Tier default test',
      rationale: 'Confirm Silver is the default tier.',
    });

    assertSuccess(result);
    expect((result as { tier: string }).tier).toBe('Silver');
  });
});

describe('handleMemoryTool: unknown tool name', () => {
  it('returns null for unrecognised tool names', async () => {
    const result = await handleMemoryTool('holo_memory_unknown_xyz', {});
    expect(result).toBeNull();
  });
});
