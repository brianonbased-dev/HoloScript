/**
 * AgentMemoryTrait.test.ts — v4.0
 * Tests for AgentMemoryTrait: store, recall, forget, compress, list, stats, TTL, edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentMemoryHandler } from '../AgentMemoryTrait';
import type { AgentMemoryConfig } from '../AgentMemoryTrait';

// ─── Harness ─────────────────────────────────────────────────────────────────

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    last: () => events[events.length - 1],
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

function makeNode() {
  return {} as any;
}

const BASE_CONFIG: AgentMemoryConfig = {
  max_memories: 100,
  default_ttl: null,
  embedding_model: 'none',
  embedding_dim: 4,
  auto_compress: false,
  compress_prompt: 'Summarize:',
  sync_to_postgres: false,
  postgres_url: '',
  db_name: 'test-agent-memory',
};

async function attachNode(extraConfig: Partial<AgentMemoryConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extraConfig };
  await agentMemoryHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — onAttach', () => {
  it('emits memory_ready on attach', async () => {
    const { ctx } = await attachNode();
    expect(ctx.of('memory_ready').length).toBe(1);
    expect((ctx.of('memory_ready')[0].payload as any).count).toBe(0);
  });

  it('initializes empty state', async () => {
    const { node } = await attachNode();
    expect(node.__agentMemoryState.memories.size).toBe(0);
    expect(node.__agentMemoryState.isReady).toBe(true);
  });
});

// ─── Store ────────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — store', () => {
  it('stores a memory and emits memory_stored', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'scene_color', content: 'The scene is neon blue', tags: ['scene', 'color'] },
    });
    const stored = ctx.of('memory_stored');
    expect(stored.length).toBe(1);
    const m = (stored[0].payload as any).memory;
    expect(m.key).toBe('scene_color');
    expect(m.content).toBe('The scene is neon blue');
    expect(m.tags).toContain('color');
    expect(node.__agentMemoryState.memories.size).toBe(1);
  });

  it('overwrites existing memory with same key', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'k', content: 'v1' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'k', content: 'v2' },
    });
    expect(node.__agentMemoryState.memories.get('k')?.content).toBe('v2');
    expect(node.__agentMemoryState.memories.size).toBe(1);
  });

  it('ignores store without key or content', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, { type: 'memory_store', payload: { key: '' } });
    expect(ctx.of('memory_stored').length).toBe(0);
    expect(node.__agentMemoryState.memories.size).toBe(0);
  });

  it('stores embedding when provided', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'vec', content: 'test', embedding: [0.1, 0.2, 0.3, 0.4] },
    });
    const m = node.__agentMemoryState.memories.get('vec');
    expect(m?.embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('respects TTL config', async () => {
    const { node, ctx, config } = await attachNode({ default_ttl: 5000 });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'ttl-k', content: 'will expire' },
    });
    const m = node.__agentMemoryState.memories.get('ttl-k');
    expect(m?.ttl).toBe(5000);
  });

  it('stores multiple memories with different keys', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 10; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `key_${i}`, content: `content_${i}` },
      });
    }
    expect(node.__agentMemoryState.memories.size).toBe(10);
  });
});

// ─── Recall ───────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — recall', () => {
  it('recalls by keyword match', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'city', content: 'neon cyberpunk city' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'forest', content: 'dark misty forest' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'cyberpunk' },
    });
    const recalled = ctx.of('memory_recalled');
    expect(recalled.length).toBe(1);
    const results = (recalled[0].payload as any).results;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.key).toBe('city');
  });

  it('recalls by cosine similarity with embedding', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'v1', content: 'alpha', embedding: [1, 0, 0, 0] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'v2', content: 'beta', embedding: [0, 1, 0, 0] },
    });
    // Query close to v1
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'q', embedding: [0.9, 0.1, 0, 0] },
    });
    const results = (ctx.of('memory_recalled')[0].payload as any).results;
    expect(results[0].memory.key).toBe('v1');
    expect(results[0].score).toBeGreaterThan(results[1]?.score ?? -1);
  });

  it('filters by tags', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'a', content: 'first', tags: ['scene'] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'b', content: 'second', tags: ['agent'] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: '', tags: ['scene'] },
    });
    const results = (ctx.of('memory_recalled')[0].payload as any).results;
    expect(results.every((r: any) => r.memory.tags.includes('scene'))).toBe(true);
  });

  it('respects top_k limit', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 20; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `k${i}`, content: 'hello world items' },
      });
    }
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'hello', top_k: 5 },
    });
    const results = (ctx.of('memory_recalled')[0].payload as any).results;
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('returns empty results when no match', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'x', content: 'totally unrelated' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'zzzzz_no_match_zzzzz' },
    });
    const results = (ctx.of('memory_recalled')[0].payload as any).results;
    expect(results.length).toBe(0);
  });

  it('increments access count on recall', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'cnt', content: 'memory accessed' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'memory accessed' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_recall',
      payload: { query: 'memory accessed' },
    });
    const m = node.__agentMemoryState.memories.get('cnt');
    expect(m?.accessCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── Forget ───────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — forget', () => {
  it('forgets by key', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'del-me', content: 'bye' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_forget',
      payload: { key: 'del-me' },
    });
    expect(node.__agentMemoryState.memories.has('del-me')).toBe(false);
    expect(ctx.of('memory_forgotten').length).toBe(1);
  });

  it('forgets by tag', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'a', content: 'a', tags: ['temp'] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'b', content: 'b', tags: ['temp'] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'c', content: 'c', tags: ['keep'] },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_forget',
      payload: { tag: 'temp' },
    });
    expect(node.__agentMemoryState.memories.size).toBe(1);
    expect(node.__agentMemoryState.memories.has('c')).toBe(true);
  });

  it('forgets all memories', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 5; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `k${i}`, content: 'x' },
      });
    }
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_forget',
      payload: { all: true },
    });
    expect(node.__agentMemoryState.memories.size).toBe(0);
  });

  it('ignores forget for unknown key', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_forget',
      payload: { key: 'nonexistent' },
    });
    expect(ctx.of('memory_forgotten').length).toBe(0);
  });
});

// ─── Compress ─────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — compress', () => {
  it('compresses oldest memories by default', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 10; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `m${i}`, content: `c${i}` },
      });
    }
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_compress',
      payload: { strategy: 'oldest', keep_percent: 0.5 },
    });
    const compressed = ctx.of('memory_compressed');
    expect(compressed.length).toBe(1);
    const p = compressed[0].payload as any;
    expect(p.before).toBe(10);
    expect(p.after).toBe(5);
    expect(p.removed).toBe(5);
  });

  it('compresses by least_accessed', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 8; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `m${i}`, content: `c${i}` },
      });
    }
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_compress',
      payload: { strategy: 'least_accessed', keep_percent: 0.75 },
    });
    const p = ctx.of('memory_compressed')[0].payload as any;
    expect(p.removed).toBe(2);
  });

  it('emits no-op when under limit', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'only', content: 'one' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_compress',
      payload: { keep_percent: 0.5 },
    });
    const p = ctx.of('memory_compressed')[0].payload as any;
    expect(p.removed).toBe(0);
  });
});

// ─── List & Stats ─────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — list and stats', () => {
  it('lists memories with pagination', async () => {
    const { node, ctx, config } = await attachNode();
    for (let i = 0; i < 20; i++) {
      agentMemoryHandler.onEvent(node, config, ctx, {
        type: 'memory_store',
        payload: { key: `k${i}`, content: `c${i}` },
      });
    }
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_list',
      payload: { limit: 5, offset: 0 },
    });
    const listed = ctx.of('memory_listed')[0].payload as any;
    expect(listed.memories.length).toBe(5);
    expect(listed.total).toBe(20);
  });

  it('returns memory stats', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'x', content: 'y' },
    });
    agentMemoryHandler.onEvent(node, config, ctx, { type: 'memory_stats' });
    const stats = ctx.of('memory_stats')[0].payload as any;
    expect(stats.count).toBe(1);
    expect(stats.totalStored).toBeGreaterThanOrEqual(1);
  });
});

// ─── TTL eviction ─────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — TTL eviction', () => {
  it('evicts expired memories on update', async () => {
    const { node, ctx, config } = await attachNode();
    // Store with ttl=-1 (already expired)
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'expired', content: 'gone', ttl: -1 },
    });
    expect(node.__agentMemoryState.memories.has('expired')).toBe(true);
    // Trigger update cycle
    agentMemoryHandler.onUpdate(node, config, ctx, 0);
    expect(node.__agentMemoryState.memories.has('expired')).toBe(false);
  });

  it('permanent (null TTL) memories survive update', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onEvent(node, config, ctx, {
      type: 'memory_store',
      payload: { key: 'perm', content: 'lives', ttl: null },
    });
    agentMemoryHandler.onUpdate(node, config, ctx, 0);
    expect(node.__agentMemoryState.memories.has('perm')).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('AgentMemoryTrait — onDetach', () => {
  it('emits memory_closed and cleans up', async () => {
    const { node, ctx, config } = await attachNode();
    agentMemoryHandler.onDetach(node, config, ctx);
    expect(ctx.of('memory_closed').length).toBe(1);
    expect(node.__agentMemoryState).toBeUndefined();
  });
});
