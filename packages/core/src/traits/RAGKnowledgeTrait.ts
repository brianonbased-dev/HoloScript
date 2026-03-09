/**
 * RAG Knowledge Trait
 *
 * Retrieval-Augmented Generation for knowledge-grounded responses.
 * Integrates with VectorDB for semantic search and retrieval.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface Document {
  id: string;
  content: string;
  chunks: string[];
  metadata: Record<string, unknown>;
  indexed: boolean;
}

export interface RAGConfig {
  knowledge_sources: string[]; // URLs or file paths
  chunk_size: number; // Characters per chunk
  overlap: number; // Overlap between chunks
  retrieval_k: number; // Number of chunks to retrieve
  rerank: boolean;
  citation_mode: boolean;
  similarity_threshold?: number; // Optional, defaults to 0.7
  metadata_fields?: string[]; // Optional metadata to preserve
}

interface RAGState {
  indexed_documents: Map<string, Document>;
  total_chunks: number;
  last_query: string;
  retrieved_chunks: Array<{ chunk: string; score: number; source: string }>;
  is_indexing: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

// =============================================================================
// HANDLER
// =============================================================================

export const ragKnowledgeHandler: TraitHandler<RAGConfig> = {
  name: 'rag_knowledge' as any,

  defaultConfig: {
    knowledge_sources: [],
    chunk_size: 512,
    overlap: 128,
    retrieval_k: 5,
    rerank: true,
    citation_mode: true,
    similarity_threshold: 0.7,
    metadata_fields: ['source', 'timestamp', 'category'],
  },

  onAttach(node, config, context) {
    const state: RAGState = {
      indexed_documents: new Map(),
      total_chunks: 0,
      last_query: '',
      retrieved_chunks: [],
      is_indexing: false,
    };
    (node as any).__ragState = state;

    context.emit?.('rag_init', {
      node,
      knowledgeSources: config.knowledge_sources,
      chunkSize: config.chunk_size,
    });

    // Auto-index knowledge sources if provided
    if (config.knowledge_sources.length > 0) {
      context.emit?.('rag_index_sources', {
        node,
        sources: config.knowledge_sources,
      });
      state.is_indexing = true;
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__ragState as RAGState;

    // Optionally persist indexed documents
    context.emit?.('rag_persist', {
      node,
      documents: Array.from(state?.indexed_documents.values()),
    });

    delete (node as any).__ragState;
  },

  onUpdate(node, config, context, delta) {
    // RAG is event-driven, no periodic updates needed
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__ragState as RAGState;
    if (!state) return;

    if (event.type === 'rag_ingest_document') {
      const doc: Document = {
        id: event.id as string,
        content: event.content as string,
        chunks: chunkText(event.content as string, config.chunk_size, config.overlap),
        metadata: (event.metadata as Record<string, unknown>) || {},
        indexed: false,
      };

      state.indexed_documents.set(doc.id, doc);
      state.total_chunks += doc.chunks.length;

      // Request vector embeddings for chunks
      context.emit?.('rag_request_embeddings', {
        node,
        documentId: doc.id,
        chunks: doc.chunks,
      });

      context.emit?.('on_document_ingested', {
        node,
        documentId: doc.id,
        chunkCount: doc.chunks.length,
      });
    } else if (event.type === 'rag_embeddings_ready') {
      const documentId = event.documentId as string;
      const doc = state.indexed_documents.get(documentId);

      if (doc) {
        doc.indexed = true;
        state.is_indexing =
          state.is_indexing && Array.from(state.indexed_documents.values()).some((d) => !d.indexed);

        context.emit?.('on_document_indexed', {
          node,
          documentId,
        });
      }
    } else if (event.type === 'rag_query') {
      const question = event.question as string;
      state.last_query = question;

      // Request vector search from VectorDB
      context.emit?.('rag_request_retrieval', {
        node,
        query: question,
        k: config.retrieval_k,
      });
    } else if (event.type === 'rag_retrieval_results') {
      const results = event.results as Array<{
        id: string;
        similarity: number;
        metadata: Record<string, unknown>;
      }>;

      // Map results back to chunks
      state.retrieved_chunks = results.map((r) => {
        const [docId, chunkIdx] = r.id.split('_chunk_');
        const doc = state.indexed_documents.get(docId);
        const chunk = doc?.chunks[parseInt(chunkIdx, 10)] || '';

        return {
          chunk,
          score: r.similarity,
          source: docId,
        };
      });

      // Optionally rerank
      if (config.rerank) {
        // Simple rerank by keyword match (in production, use cross-encoder)
        const queryLower = state.last_query.toLowerCase();
        state.retrieved_chunks = state.retrieved_chunks
          .map((item) => {
            const keywordBonus = item.chunk.toLowerCase().includes(queryLower) ? 0.1 : 0;
            return {
              ...item,
              score: item.score + keywordBonus,
            };
          })
          .sort((a, b) => b.score - a.score);
      }

      context.emit?.('on_knowledge_retrieved', {
        node,
        query: state.last_query,
        chunks: state.retrieved_chunks,
        citationMode: config.citation_mode,
      });
    } else if (event.type === 'rag_update_document') {
      const documentId = event.documentId as string;
      const newContent = event.content as string;
      const doc = state.indexed_documents.get(documentId);

      if (doc) {
        doc.content = newContent;
        doc.chunks = chunkText(newContent, config.chunk_size, config.overlap);
        doc.indexed = false;
        state.total_chunks -= doc.chunks.length;
        state.total_chunks += doc.chunks.length;

        // Re-index
        context.emit?.('rag_request_embeddings', {
          node,
          documentId: doc.id,
          chunks: doc.chunks,
        });
      }
    }
  },
};
