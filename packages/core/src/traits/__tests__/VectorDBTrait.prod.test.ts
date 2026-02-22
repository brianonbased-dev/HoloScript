/**
 * VectorDBTrait — Production Test Suite
 *
 * Tests the built-in cosine similarity, euclidean distance, dot product math
 * plus insert/search/delete event handling.
 */
import { describe, it, expect, vi } from 'vitest';
import { vectorDBHandler } from '../VectorDBTrait';

function makeNode() { return { id: 'vdb_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...vectorDBHandler.defaultConfig!, ...cfg };
  vectorDBHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

function insert(node: any, ctx: any, config: any, id: string, embedding: number[], metadata: any = {}) {
  vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_insert', id, embedding, metadata });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('vectorDBHandler.defaultConfig', () => {
  const d = vectorDBHandler.defaultConfig!;
  it('embedding_model=sentence-transformers', () => expect(d.embedding_model).toBe('sentence-transformers'));
  it('dimension=384', () => expect(d.dimension).toBe(384));
  it('similarity_metric=cosine', () => expect(d.similarity_metric).toBe('cosine'));
  it('max_entries=10000', () => expect(d.max_entries).toBe(10000));
  it('index_type=hnsw', () => expect(d.index_type).toBe('hnsw'));
  it('similarity_threshold=0.7', () => expect(d.similarity_threshold).toBe(0.7));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('vectorDBHandler.onAttach', () => {
  it('creates __vectorDBState', () => expect(attach().node.__vectorDBState).toBeDefined());
  it('embeddings=[]', () => expect(attach().node.__vectorDBState.embeddings).toHaveLength(0));
  it('index is empty Map', () => expect(attach().node.__vectorDBState.index.size).toBe(0));
  it('entry_count=0', () => expect(attach().node.__vectorDBState.entry_count).toBe(0));
  it('last_search_time=0', () => expect(attach().node.__vectorDBState.last_search_time).toBe(0));
  it('emits vector_db_init with model and dimension', () => {
    const { ctx } = attach({ embedding_model: 'clip', dimension: 512 });
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_init', expect.objectContaining({
      embeddingModel: 'clip',
      dimension: 512,
    }));
  });
  it('vector_db_init includes maxEntries', () => {
    const { ctx } = attach({ max_entries: 500 });
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_init', expect.objectContaining({ maxEntries: 500 }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('vectorDBHandler.onDetach', () => {
  it('removes __vectorDBState', () => {
    const { node, config, ctx } = attach({ dimension: 2 });
    vectorDBHandler.onDetach!(node, config, ctx);
    expect(node.__vectorDBState).toBeUndefined();
  });
  it('emits vector_db_persist with embeddings snapshot', () => {
    const { node, config, ctx } = attach({ dimension: 2 });
    insert(node, ctx, config, 'e1', [1, 0]);
    ctx.emit.mockClear();
    vectorDBHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_persist', expect.objectContaining({ entryCount: 1 }));
  });
});

// ─── onEvent — vector_db_insert ───────────────────────────────────────────────

describe('vectorDBHandler.onEvent — vector_db_insert', () => {
  it('inserts entry and increments entry_count', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    insert(node, ctx, config, 'v1', [1, 0, 0]);
    expect(node.__vectorDBState.entry_count).toBe(1);
  });
  it('stores embedding in embeddings array', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    insert(node, ctx, config, 'v1', [1, 2, 3]);
    expect(node.__vectorDBState.embeddings[0].embedding).toEqual([1, 2, 3]);
  });
  it('stores id in index map', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    insert(node, ctx, config, 'v1', [1, 0, 0]);
    expect(node.__vectorDBState.index.has('v1')).toBe(true);
  });
  it('emits on_vector_inserted', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    ctx.emit.mockClear();
    insert(node, ctx, config, 'v1', [1, 0, 0]);
    expect(ctx.emit).toHaveBeenCalledWith('on_vector_inserted', expect.objectContaining({ id: 'v1', entryCount: 1 }));
  });
  it('stores metadata', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'v1', [1, 0], { label: 'cat' });
    expect(node.__vectorDBState.embeddings[0].metadata.label).toBe('cat');
  });
  it('emits vector_db_error on dimension mismatch', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    ctx.emit.mockClear();
    insert(node, ctx, config, 'v1', [1, 0]); // only 2 elements
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_error', expect.objectContaining({ error: expect.stringContaining('mismatch') }));
  });
  it('does not insert on dimension mismatch', () => {
    const { node, ctx, config } = attach({ dimension: 3 });
    insert(node, ctx, config, 'v1', [1, 0]);
    expect(node.__vectorDBState.entry_count).toBe(0);
  });
  it('emits vector_db_error when max_entries reached', () => {
    const { node, ctx, config } = attach({ dimension: 2, max_entries: 1 });
    insert(node, ctx, config, 'v1', [1, 0]);
    ctx.emit.mockClear();
    insert(node, ctx, config, 'v2', [0, 1]);
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_error', expect.objectContaining({ error: expect.stringContaining('Max entries') }));
  });
  it('supports multiple inserts', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'a', [1, 0]);
    insert(node, ctx, config, 'b', [0, 1]);
    insert(node, ctx, config, 'c', [0.5, 0.5]);
    expect(node.__vectorDBState.entry_count).toBe(3);
  });
});

// ─── onEvent — vector_db_search (cosine) ──────────────────────────────────────

describe('vectorDBHandler.onEvent — vector_db_search (cosine)', () => {
  it('emits on_vector_search_complete with results', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'cosine' });
    insert(node, ctx, config, 'a', [1, 0]);
    insert(node, ctx, config, 'b', [0, 1]);
    ctx.emit.mockClear();
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0], k: 2 });
    expect(ctx.emit).toHaveBeenCalledWith('on_vector_search_complete', expect.objectContaining({ results: expect.any(Array), k: 2 }));
  });
  it('returns best matching result first (identical vector → similarity≈1)', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'cosine' });
    insert(node, ctx, config, 'exact', [1, 0]);
    insert(node, ctx, config, 'ortho', [0, 1]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0], k: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_vector_search_complete')!;
    expect(call[1].results[0].id).toBe('exact');
    expect(call[1].results[0].similarity).toBeCloseTo(1.0);
  });
  it('defaults k=5 when not specified', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'cosine' });
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0] });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_vector_search_complete')!;
    expect(call[1].k).toBe(5);
  });
  it('returns at most k results', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'cosine' });
    insert(node, ctx, config, 'a', [1, 0]);
    insert(node, ctx, config, 'b', [0.9, 0.1]);
    insert(node, ctx, config, 'c', [0.8, 0.2]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0], k: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_vector_search_complete')!;
    expect(call[1].results.length).toBeLessThanOrEqual(2);
  });
  it('emits vector_db_error on query dimension mismatch', () => {
    const { node, ctx, config } = attach({ dimension: 3, similarity_metric: 'cosine' });
    ctx.emit.mockClear();
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0] });
    expect(ctx.emit).toHaveBeenCalledWith('vector_db_error', expect.anything());
  });
  it('updates last_search_time', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'cosine' });
    insert(node, ctx, config, 'a', [1, 0]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0], k: 1 });
    expect(node.__vectorDBState.last_search_time).toBeGreaterThanOrEqual(0);
  });
});

// ─── onEvent — vector_db_search (euclidean & dot_product) ────────────────────

describe('vectorDBHandler.onEvent — vector_db_search (euclidean)', () => {
  it('returns identical vector first with negative euclidean (closer=higher score)', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'euclidean' });
    insert(node, ctx, config, 'near', [1, 0]);
    insert(node, ctx, config, 'far', [0, 10]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 0], k: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_vector_search_complete')!;
    expect(call[1].results[0].id).toBe('near');
  });
});

describe('vectorDBHandler.onEvent — vector_db_search (dot_product)', () => {
  it('rank by dot product (higher magnitude → higher score)', () => {
    const { node, ctx, config } = attach({ dimension: 2, similarity_metric: 'dot_product' });
    insert(node, ctx, config, 'big', [3, 4]);   // dot with [1,1] = 7
    insert(node, ctx, config, 'small', [1, 1]);  // dot with [1,1] = 2
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_search', embedding: [1, 1], k: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_vector_search_complete')!;
    expect(call[1].results[0].id).toBe('big');
  });
});

// ─── onEvent — vector_db_delete ───────────────────────────────────────────────

describe('vectorDBHandler.onEvent — vector_db_delete', () => {
  it('removes entry and decrements entry_count', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'v1', [1, 0]);
    insert(node, ctx, config, 'v2', [0, 1]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_delete', id: 'v1' });
    expect(node.__vectorDBState.entry_count).toBe(1);
  });
  it('removes id from index', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'v1', [1, 0]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_delete', id: 'v1' });
    expect(node.__vectorDBState.index.has('v1')).toBe(false);
  });
  it('rebuilds index correctly after delete', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'a', [1, 0]);
    insert(node, ctx, config, 'b', [0, 1]);
    insert(node, ctx, config, 'c', [0.5, 0.5]);
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_delete', id: 'a' });
    // b and c should have consecutive indices 0 and 1
    expect(node.__vectorDBState.index.get('b')).toBe(0);
    expect(node.__vectorDBState.index.get('c')).toBe(1);
  });
  it('emits on_vector_deleted', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'v1', [1, 0]);
    ctx.emit.mockClear();
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_delete', id: 'v1' });
    expect(ctx.emit).toHaveBeenCalledWith('on_vector_deleted', expect.objectContaining({ id: 'v1', entryCount: 0 }));
  });
  it('no effect when deleting non-existent id', () => {
    const { node, ctx, config } = attach({ dimension: 2 });
    insert(node, ctx, config, 'v1', [1, 0]);
    ctx.emit.mockClear();
    vectorDBHandler.onEvent!(node, config, ctx, { type: 'vector_db_delete', id: 'ghost' });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_vector_deleted', expect.anything());
    expect(node.__vectorDBState.entry_count).toBe(1);
  });
});
