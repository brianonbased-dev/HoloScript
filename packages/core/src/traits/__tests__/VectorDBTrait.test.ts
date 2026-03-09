import { describe, it, expect, beforeEach } from 'vitest';
import { vectorDBHandler } from '../VectorDBTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('VectorDBTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    embedding_model: 'sentence-transformers' as const,
    dimension: 3,
    similarity_metric: 'cosine' as const,
    max_entries: 100,
    index_type: 'hnsw' as const,
    similarity_threshold: 0.7,
  };

  beforeEach(() => {
    node = createMockNode('vdb');
    ctx = createMockContext();
    attachTrait(vectorDBHandler, node, cfg, ctx);
  });

  it('emits init on attach', () => {
    expect(getEventCount(ctx, 'vector_db_init')).toBe(1);
  });

  it('insert stores embedding', () => {
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'v1',
      embedding: [1, 0, 0],
      metadata: { label: 'cat' },
    });
    expect((node as any).__vectorDBState.entry_count).toBe(1);
    expect(getEventCount(ctx, 'on_vector_inserted')).toBe(1);
  });

  it('rejects wrong dimension', () => {
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'v2',
      embedding: [1, 0],
    });
    expect(getEventCount(ctx, 'vector_db_error')).toBe(1);
    expect((node as any).__vectorDBState.entry_count).toBe(0);
  });

  it('rejects when max entries reached', () => {
    const smallCfg = { ...cfg, max_entries: 2 };
    const n = createMockNode('vdb2');
    const c = createMockContext();
    attachTrait(vectorDBHandler, n, smallCfg, c);
    sendEvent(vectorDBHandler, n, smallCfg, c, {
      type: 'vector_db_insert',
      id: 'a',
      embedding: [1, 0, 0],
    });
    sendEvent(vectorDBHandler, n, smallCfg, c, {
      type: 'vector_db_insert',
      id: 'b',
      embedding: [0, 1, 0],
    });
    sendEvent(vectorDBHandler, n, smallCfg, c, {
      type: 'vector_db_insert',
      id: 'c',
      embedding: [0, 0, 1],
    });
    expect(getEventCount(c, 'vector_db_error')).toBe(1);
  });

  it('search returns ranked results', () => {
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'a',
      embedding: [1, 0, 0],
    });
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'b',
      embedding: [0, 1, 0],
    });
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'c',
      embedding: [0.9, 0.1, 0],
    });
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_search',
      embedding: [1, 0, 0],
      k: 2,
    });
    const ev = getLastEvent(ctx, 'on_vector_search_complete') as any;
    expect(ev.results.length).toBe(2);
    expect(ev.results[0].id).toBe('a'); // Exact match
  });

  it('search rejects wrong query dimension', () => {
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_search',
      embedding: [1, 0],
      k: 5,
    });
    expect(getEventCount(ctx, 'vector_db_error')).toBe(1);
  });

  it('delete removes entry and rebuilds index', () => {
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'a',
      embedding: [1, 0, 0],
    });
    sendEvent(vectorDBHandler, node, cfg, ctx, {
      type: 'vector_db_insert',
      id: 'b',
      embedding: [0, 1, 0],
    });
    sendEvent(vectorDBHandler, node, cfg, ctx, { type: 'vector_db_delete', id: 'a' });
    expect((node as any).__vectorDBState.entry_count).toBe(1);
    expect(getEventCount(ctx, 'on_vector_deleted')).toBe(1);
  });

  it('detach persists state', () => {
    vectorDBHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'vector_db_persist')).toBe(1);
    expect((node as any).__vectorDBState).toBeUndefined();
  });
});
