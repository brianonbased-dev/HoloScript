import { describe, it, expect, beforeEach } from 'vitest';
import { ragKnowledgeHandler } from '../RAGKnowledgeTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('RAGKnowledgeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    knowledge_sources: [] as string[],
    chunk_size: 20,
    overlap: 5,
    retrieval_k: 3,
    rerank: true,
    citation_mode: true,
    similarity_threshold: 0.7,
    metadata_fields: ['source'],
  };

  beforeEach(() => {
    node = createMockNode('rag');
    ctx = createMockContext();
    attachTrait(ragKnowledgeHandler, node, cfg, ctx);
  });

  it('emits init on attach', () => {
    expect(getEventCount(ctx, 'rag_init')).toBe(1);
  });

  it('auto-indexes sources when provided', () => {
    const n = createMockNode('rag2');
    const c = createMockContext();
    attachTrait(ragKnowledgeHandler, n, { ...cfg, knowledge_sources: ['doc1.txt'] }, c);
    expect(getEventCount(c, 'rag_index_sources')).toBe(1);
    expect((n as any).__ragState.is_indexing).toBe(true);
  });

  it('ingest document chunks text and requests embeddings', () => {
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'This is a test document with enough text to chunk.',
      metadata: { source: 'test' },
    });
    const s = (node as any).__ragState;
    expect(s.indexed_documents.size).toBe(1);
    expect(s.total_chunks).toBeGreaterThan(0);
    expect(getEventCount(ctx, 'rag_request_embeddings')).toBe(1);
    expect(getEventCount(ctx, 'on_document_ingested')).toBe(1);
  });

  it('embeddings ready marks document indexed', () => {
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'Short doc.',
    });
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, { type: 'rag_embeddings_ready', documentId: 'doc1' });
    const doc = (node as any).__ragState.indexed_documents.get('doc1');
    expect(doc.indexed).toBe(true);
    expect(getEventCount(ctx, 'on_document_indexed')).toBe(1);
  });

  it('query emits retrieval request', () => {
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, { type: 'rag_query', question: 'What is AI?' });
    expect(getEventCount(ctx, 'rag_request_retrieval')).toBe(1);
    expect((node as any).__ragState.last_query).toBe('What is AI?');
  });

  it('retrieval results mapped and reranked', () => {
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'chunk0 chunk1 chunk2 chunk3',
    });
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, { type: 'rag_query', question: 'chunk0' });
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_retrieval_results',
      results: [
        { id: 'doc1_chunk_0', similarity: 0.9, metadata: {} },
        { id: 'doc1_chunk_1', similarity: 0.7, metadata: {} },
      ],
    });
    expect(getEventCount(ctx, 'on_knowledge_retrieved')).toBe(1);
    const s = (node as any).__ragState;
    expect(s.retrieved_chunks.length).toBe(2);
  });

  it('update document re-indexes', () => {
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_ingest_document',
      id: 'doc1',
      content: 'Original content.',
    });
    sendEvent(ragKnowledgeHandler, node, cfg, ctx, {
      type: 'rag_update_document',
      documentId: 'doc1',
      content: 'Updated and longer content here.',
    });
    expect(getEventCount(ctx, 'rag_request_embeddings')).toBe(2);
    const doc = (node as any).__ragState.indexed_documents.get('doc1');
    expect(doc.indexed).toBe(false);
  });

  it('detach persists documents', () => {
    ragKnowledgeHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'rag_persist')).toBe(1);
    expect((node as any).__ragState).toBeUndefined();
  });
});
