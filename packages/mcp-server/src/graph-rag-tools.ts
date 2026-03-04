/**
 * MCP Graph RAG Tools for HoloScript
 *
 * Provides AI agents with semantic search and natural language Q&A
 * over absorbed codebases using Graph RAG (embeddings + graph traversal).
 *
 * Tools:
 * - holo_semantic_search: Vector search over symbol signatures
 * - holo_ask_codebase: Natural language Q&A with graph-enriched context
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const graphRagTools: Tool[] = [
  {
    name: 'holo_semantic_search',
    description:
      'Semantic vector search over an absorbed codebase. Searches symbol signatures, doc comments, and file paths using embedding similarity. Returns ranked results with scores. Requires a prior holo_absorb_repo call in the same session.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language search query. Examples: "authentication handler", "database connection pooling", "error recovery logic"',
        },
        topK: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
        language: {
          type: 'string',
          description: 'Filter to specific language (e.g., "typescript", "python")',
        },
        type: {
          type: 'string',
          description: 'Filter to specific symbol type (e.g., "class", "function", "interface")',
        },
        file: {
          type: 'string',
          description: 'Filter to file path containing this substring',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'holo_ask_codebase',
    description:
      'Ask a natural language question about an absorbed codebase. Uses Graph RAG: combines semantic search with knowledge graph traversal to generate an accurate, cited answer. Returns the answer, citations (file:line), and supporting graph data. Requires a prior holo_absorb_repo call.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'Natural language question. Examples: "How does authentication work?", "What calls the UserService?", "Explain the data flow from API to database"',
        },
        topK: {
          type: 'number',
          description: 'Number of symbols to use as context (default: 20)',
        },
        language: {
          type: 'string',
          description: 'Filter context to specific language',
        },
        type: {
          type: 'string',
          description: 'Filter context to specific symbol type',
        },
      },
      required: ['question'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

// These will be set by codebase-tools.ts when absorb completes
let cachedEmbeddingIndex: any = null;
let cachedGraphRAGEngine: any = null;

/**
 * Set the cached embedding index and RAG engine (called from codebase-tools after absorb).
 */
export function setGraphRAGState(embeddingIndex: any, ragEngine: any): void {
  cachedEmbeddingIndex = embeddingIndex;
  cachedGraphRAGEngine = ragEngine;
}

/**
 * Get whether Graph RAG is initialized.
 */
export function isGraphRAGReady(): boolean {
  return cachedEmbeddingIndex !== null && cachedGraphRAGEngine !== null;
}

export async function handleGraphRagTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'holo_semantic_search':
      return handleSemanticSearch(args);
    case 'holo_ask_codebase':
      return handleAskCodebase(args);
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleSemanticSearch(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedEmbeddingIndex) {
    return {
      error: 'No embedding index built. Call holo_absorb_repo first (embeddings are built automatically).',
    };
  }

  const query = args.query as string;
  const topK = (args.topK as number) ?? 10;
  const filters: Record<string, string | undefined> = {};
  if (args.language) filters.language = args.language as string;
  if (args.type) filters.type = args.type as string;
  if (args.file) filters.file = args.file as string;

  const hasFilters = filters.language || filters.type || filters.file;

  try {
    const results = hasFilters
      ? await cachedEmbeddingIndex.searchWithFilters(query, topK, filters)
      : await cachedEmbeddingIndex.search(query, topK);

    return {
      query,
      results: results.map((r: any) => ({
        name: r.symbol.owner ? `${r.symbol.owner}.${r.symbol.name}` : r.symbol.name,
        type: r.type,
        file: r.file,
        line: r.symbol.line,
        language: r.symbol.language,
        score: r.score,
        signature: r.symbol.signature ?? null,
        docComment: r.symbol.docComment?.split('\n')[0] ?? null,
      })),
      count: results.length,
      filters: hasFilters ? filters : undefined,
    };
  } catch (err: any) {
    return {
      error: `Semantic search failed: ${err.message}`,
      hint: 'Ensure Ollama is running with the nomic-embed-text model: ollama pull nomic-embed-text',
    };
  }
}

async function handleAskCodebase(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedGraphRAGEngine) {
    return {
      error: 'No Graph RAG engine initialized. Call holo_absorb_repo first.',
    };
  }

  const question = args.question as string;
  const topK = (args.topK as number) ?? 20;
  const language = args.language as string | undefined;
  const type = args.type as string | undefined;

  try {
    const answer = await cachedGraphRAGEngine.queryWithLLM(question, {
      topK,
      language,
      type,
    });

    return {
      question,
      answer: answer.answer,
      citations: answer.citations,
      context: answer.context.slice(0, 5).map((r: any) => ({
        name: r.symbol.owner ? `${r.symbol.owner}.${r.symbol.name}` : r.symbol.name,
        type: r.symbol.type,
        file: r.file,
        line: r.symbol.line,
        score: r.score,
        callers: r.callers.slice(0, 3),
        callees: r.callees.slice(0, 3),
        impactRadius: r.impactRadius,
        community: r.community ?? null,
      })),
    };
  } catch (err: any) {
    return {
      error: `Graph RAG query failed: ${err.message}`,
      hint: 'Ensure Ollama is running with both nomic-embed-text and a chat model.',
    };
  }
}
