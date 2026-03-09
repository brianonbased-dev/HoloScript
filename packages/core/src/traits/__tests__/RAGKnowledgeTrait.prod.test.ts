/**
 * RAGKnowledgeTrait Production Tests
 *
 * Retrieval-Augmented Generation for knowledge-grounded responses.
 * Covers: chunkText helper, defaultConfig, onAttach, onDetach, onUpdate (no-op),
 * and all 5 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { ragKnowledgeHandler } from '../RAGKnowledgeTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'rag_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...ragKnowledgeHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  ragKnowledgeHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__ragState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  ragKnowledgeHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('RAGKnowledgeTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = ragKnowledgeHandler.defaultConfig!;
    expect(d.knowledge_sources).toEqual([]);
    expect(d.chunk_size).toBe(512);
    expect(d.overlap).toBe(128);
    expect(d.retrieval_k).toBe(5);
    expect(d.rerank).toBe(true);
    expect(d.citation_mode).toBe(true);
    expect(d.similarity_threshold).toBe(0.7);
    expect(d.metadata_fields).toEqual(['source', 'timestamp', 'category']);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('RAGKnowledgeTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.indexed_documents).toBeInstanceOf(Map);
    expect(s.indexed_documents.size).toBe(0);
    expect(s.total_chunks).toBe(0);
    expect(s.last_query).toBe('');
    expect(s.retrieved_chunks).toHaveLength(0);
    expect(s.is_indexing).toBe(false);
  });

  it('emits rag_init with knowledge_sources and chunk_size', () => {
    const node = makeNode();
    const { ctx, cfg } = attach(node, { knowledge_sources: [], chunk_size: 256 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_init',
      expect.objectContaining({
        knowledgeSources: [],
        chunkSize: 256,
      })
    );
  });

  it('emits rag_index_sources and sets is_indexing when sources provided', () => {
    const node = makeNode();
    const { ctx } = attach(node, { knowledge_sources: ['https://example.com/docs'] });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_index_sources',
      expect.objectContaining({
        sources: ['https://example.com/docs'],
      })
    );
    expect(st(node).is_indexing).toBe(true);
  });

  it('does NOT emit rag_index_sources when no sources', () => {
    const node = makeNode();
    const { ctx } = attach(node, { knowledge_sources: [] });
    expect(ctx.emit).not.toHaveBeenCalledWith('rag_index_sources', expect.any(Object));
    expect(st(node).is_indexing).toBe(false);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('RAGKnowledgeTrait — onDetach', () => {
  it('always emits rag_persist (even with empty docs)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    ragKnowledgeHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_persist',
      expect.objectContaining({ documents: [] })
    );
  });

  it('persists ingested documents', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 50, overlap: 0 });
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'Hello world',
      metadata: {},
    });
    ctx.emit.mockClear();
    ragKnowledgeHandler.onDetach!(node, cfg, ctx as any);
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'rag_persist')?.[1];
    expect(call.documents).toHaveLength(1);
    expect(call.documents[0].id).toBe('doc1');
  });

  it('removes __ragState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ragKnowledgeHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__ragState).toBeUndefined();
  });
});

// ─── onUpdate — no-op ─────────────────────────────────────────────────────────

describe('RAGKnowledgeTrait — onUpdate', () => {
  it('is a no-op (emits nothing)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    ragKnowledgeHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — rag_ingest_document ────────────────────────────────────────────

describe('RAGKnowledgeTrait — onEvent: rag_ingest_document', () => {
  it('indexes document, produces chunks, emits rag_request_embeddings + on_document_ingested', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 10, overlap: 0 });
    const content = 'abcdefghijklmnopqrst'; // 20 chars → 2 chunks of 10
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'd1',
      content,
      metadata: { source: 'test' },
    });

    expect(st(node).indexed_documents.has('d1')).toBe(true);
    const doc = st(node).indexed_documents.get('d1');
    expect(doc.chunks).toHaveLength(2);
    expect(doc.indexed).toBe(false);
    expect(st(node).total_chunks).toBe(2);

    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_request_embeddings',
      expect.objectContaining({
        documentId: 'd1',
        chunks: doc.chunks,
      })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_document_ingested',
      expect.objectContaining({
        documentId: 'd1',
        chunkCount: 2,
      })
    );
  });

  it('chunk overlap reduces stride between chunks', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 10, overlap: 5 });
    // 15-char text: stride = chunk_size - overlap = 5
    // chunk[0] = text[0..9]  = '1234567890'
    // chunk[1] = text[5..14] = '6789012345'
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'd2',
      content: '123456789012345',
      metadata: {},
    });
    const doc = st(node).indexed_documents.get('d2');
    expect(doc.chunks[0]).toBe('1234567890');
    expect(doc.chunks[1]).toBe('6789012345');
  });

  it('single-chunk document when content <= chunk_size', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 512, overlap: 0 });
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'd3', content: 'short', metadata: {} });
    expect(st(node).indexed_documents.get('d3').chunks).toHaveLength(1);
  });

  it('accumulates total_chunks across multiple documents', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 5, overlap: 0 });
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'a', content: '12345', metadata: {} });
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'b', content: '12345', metadata: {} });
    expect(st(node).total_chunks).toBe(2);
  });

  it('empty metadata defaults to {}', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'nometa', content: 'data' });
    expect(st(node).indexed_documents.get('nometa').metadata).toEqual({});
  });
});

// ─── onEvent — rag_embeddings_ready ───────────────────────────────────────────

describe('RAGKnowledgeTrait — onEvent: rag_embeddings_ready', () => {
  it('marks document as indexed and emits on_document_indexed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 50, overlap: 0 });
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'd1', content: 'hello', metadata: {} });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rag_embeddings_ready', documentId: 'd1' });
    expect(st(node).indexed_documents.get('d1').indexed).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_document_indexed',
      expect.objectContaining({ documentId: 'd1' })
    );
  });

  it('is_indexing becomes false when all docs are indexed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { knowledge_sources: ['url1'], chunk_size: 50, overlap: 0 });
    fire(node, cfg, ctx, { type: 'rag_ingest_document', id: 'd1', content: 'text', metadata: {} });
    fire(node, cfg, ctx, { type: 'rag_embeddings_ready', documentId: 'd1' });
    expect(st(node).is_indexing).toBe(false);
  });

  it('unknown documentId is handled gracefully', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(() =>
      fire(node, cfg, ctx, { type: 'rag_embeddings_ready', documentId: 'ghost' })
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalledWith('on_document_indexed', expect.any(Object));
  });
});

// ─── onEvent — rag_query ──────────────────────────────────────────────────────

describe('RAGKnowledgeTrait — onEvent: rag_query', () => {
  it('stores last_query and emits rag_request_retrieval with k', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { retrieval_k: 3 });
    fire(node, cfg, ctx, { type: 'rag_query', question: 'What is HoloScript?' });
    expect(st(node).last_query).toBe('What is HoloScript?');
    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_request_retrieval',
      expect.objectContaining({
        query: 'What is HoloScript?',
        k: 3,
      })
    );
  });
});

// ─── onEvent — rag_retrieval_results ─────────────────────────────────────────

describe('RAGKnowledgeTrait — onEvent: rag_retrieval_results', () => {
  it('maps chunk IDs to doc chunks and emits on_knowledge_retrieved', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 20, overlap: 0, rerank: false });
    // Ingest a doc so chunks exist
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'chunk zero content here',
      metadata: {},
    });

    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [{ id: 'doc1_chunk_0', similarity: 0.85, metadata: {} }],
    });

    expect(ctx.emit).toHaveBeenCalledWith(
      'on_knowledge_retrieved',
      expect.objectContaining({
        query: '',
      })
    );
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    expect(call.chunks[0].score).toBeCloseTo(0.85);
    expect(call.chunks[0].source).toBe('doc1');
    expect(call.chunks[0].chunk).toBeTruthy();
  });

  it('rerank=true: keyword match boosts score by 0.1', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 100, overlap: 0, rerank: true });
    fire(node, cfg, ctx, { type: 'rag_query', question: 'holoscript' });
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'x',
      content: 'HoloScript is great',
      metadata: {},
    });

    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [{ id: 'x_chunk_0', similarity: 0.7, metadata: {} }],
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    // 'holoscript' matches 'HoloScript' (case insensitive) → +0.1
    expect(call.chunks[0].score).toBeCloseTo(0.8, 5);
  });

  it('rerank=true: no keyword match — score unchanged', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 100, overlap: 0, rerank: true });
    fire(node, cfg, ctx, { type: 'rag_query', question: 'unrelated query xyz' });
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'y',
      content: 'some neutral content',
      metadata: {},
    });

    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [{ id: 'y_chunk_0', similarity: 0.6, metadata: {} }],
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    expect(call.chunks[0].score).toBeCloseTo(0.6, 5);
  });

  it('rerank=true: results sorted descending by score', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 100, overlap: 0, rerank: true });
    fire(node, cfg, ctx, { type: 'rag_query', question: 'test' });
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'z',
      content: 'test content and more stuff',
      metadata: {},
    });

    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [
        { id: 'z_chunk_0', similarity: 0.5, metadata: {} }, // keyword match → 0.6
        { id: 'z_chunk_0', similarity: 0.8, metadata: {} }, // no match → 0.8 (wait, same chunk; use rerank)
      ],
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    // Sorted descending
    expect(call.chunks[0].score).toBeGreaterThanOrEqual(call.chunks[1].score);
  });

  it('citation_mode passed through in on_knowledge_retrieved', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { rerank: false, citation_mode: false });
    fire(node, cfg, ctx, { type: 'rag_retrieval_results', results: [] });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    expect(call.citationMode).toBe(false);
  });

  it('missing chunk index falls back to empty string', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { rerank: false });
    // No document ingested for 'missing_doc'
    fire(node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [{ id: 'missing_doc_chunk_99', similarity: 0.9, metadata: {} }],
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'on_knowledge_retrieved'
    )?.[1];
    expect(call.chunks[0].chunk).toBe('');
  });
});

// ─── onEvent — rag_update_document ────────────────────────────────────────────

describe('RAGKnowledgeTrait — onEvent: rag_update_document', () => {
  it('replaces content and chunks, re-requests embeddings', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { chunk_size: 5, overlap: 0 });
    fire(node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'up1',
      content: 'hello',
      metadata: {},
    });
    // Mark as indexed
    fire(node, cfg, ctx, { type: 'rag_embeddings_ready', documentId: 'up1' });
    expect(st(node).indexed_documents.get('up1').indexed).toBe(true);

    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rag_update_document',
      documentId: 'up1',
      content: 'new content',
    });

    const doc = st(node).indexed_documents.get('up1');
    expect(doc.content).toBe('new content');
    expect(doc.indexed).toBe(false); // re-marked dirty
    expect(doc.chunks.join('')).toContain('new c'); // at least first chunk
    expect(ctx.emit).toHaveBeenCalledWith(
      'rag_request_embeddings',
      expect.objectContaining({ documentId: 'up1' })
    );
  });

  it('unknown documentId is ignored gracefully', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(() =>
      fire(node, cfg, ctx, { type: 'rag_update_document', documentId: 'ghost', content: 'x' })
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalledWith('rag_request_embeddings', expect.any(Object));
  });
});
