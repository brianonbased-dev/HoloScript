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
import type { SearchResult } from '../engine/EmbeddingIndex';
import type { EmbeddingIndex } from '../engine/EmbeddingIndex';
import { GraphRAGEngine, type EnrichedResult, type LLMProvider } from '../engine/GraphRAGEngine';
import {
  ABSORB_EMBEDDING_INDEX_ERROR,
  ABSORB_GRAPH_RAG_ENGINE_ERROR,
  ABSORB_HOLO_ABSORB_REPO_HINT,
} from './graph-rag-prerequisite';

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
        llmProvider: {
          type: 'string',
          enum: ['openrouter', 'anthropic', 'openai', 'gemini', 'ollama'],
          description:
            'LLM provider for answer generation (default: auto-detect from env, cloud-first). Priority: openrouter → anthropic → openai → gemini → ollama.',
        },
        llmApiKey: {
          type: 'string',
          description:
            'API key for the LLM provider (required for openai/anthropic/gemini, not needed for ollama). Falls back to OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY environment variables if not provided.',
        },
        llmModel: {
          type: 'string',
          description:
            'Model name override (e.g., "gpt-4o-mini", "claude-haiku-4-5", "gemini-1.5-flash"). Defaults to provider-specific defaults.',
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
let cachedEmbeddingIndex: EmbeddingIndex | null = null;
let cachedGraphRAGEngine: GraphRAGEngine | null = null;

/**
 * Set the cached embedding index and RAG engine (called from codebase-tools after absorb).
 */
export function setGraphRAGState(embeddingIndex: EmbeddingIndex, ragEngine: GraphRAGEngine): void {
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
  args: Record<string, unknown>
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

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Auto-detect the best LLM provider from environment variables.
 * Cloud-first: OpenRouter → Anthropic → OpenAI → Ollama (last resort).
 */
function detectDefaultLLMProvider(): string {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'ollama';
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleSemanticSearch(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedEmbeddingIndex) {
    return {
      error: ABSORB_EMBEDDING_INDEX_ERROR,
      hint: ABSORB_HOLO_ABSORB_REPO_HINT,
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
      results: results.map((r: SearchResult) => ({
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
  } catch (err: unknown) {
    return {
      error: `Semantic search failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Embedding search failed. Ensure your embedding provider is configured (OPENAI_API_KEY for best quality, or Ollama with nomic-embed-text).',
    };
  }
}

async function handleAskCodebase(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedEmbeddingIndex || !cachedGraphRAGEngine) {
    return {
      error: ABSORB_GRAPH_RAG_ENGINE_ERROR,
      hint: ABSORB_HOLO_ABSORB_REPO_HINT,
    };
  }

  const question = args.question as string;
  const topK = (args.topK as number) ?? 20;
  const language = args.language as string | undefined;
  const type = args.type as string | undefined;
  const llmProvider = args.llmProvider as string | undefined;
  const llmApiKey = args.llmApiKey as string | undefined;
  const llmModel = args.llmModel as string | undefined;

  try {
    // If a custom LLM provider is specified, create a new engine with that provider
    let engine = cachedGraphRAGEngine;
    const effectiveProvider = llmProvider ?? detectDefaultLLMProvider();
    if (effectiveProvider && effectiveProvider !== 'ollama') {
      try {
        const llmPkg = await import('@holoscript/llm-provider');
        const apiKey = llmApiKey || process.env[`${effectiveProvider.toUpperCase()}_API_KEY`] || '';

        // The adapter classes from @holoscript/llm-provider satisfy the
        // structural LLMProvider interface from ../engine/GraphRAGEngine
        // at runtime, but signatures drifted during peer's refactor. Cast
        // at construction; runtime invariant intact. (Fix 2026-04-25 to
        // unblock deploy.)
        let llmAdapter: LLMProvider;
        switch (effectiveProvider) {
          case 'openrouter':
            llmAdapter = new llmPkg.OpenAIAdapter({
              apiKey: apiKey || process.env.OPENROUTER_API_KEY || '',
              defaultModel: llmModel ?? 'anthropic/claude-sonnet-4',
              baseURL: 'https://openrouter.ai/api/v1',
            }) as unknown as LLMProvider;
            break;
          case 'openai':
            llmAdapter = new llmPkg.OpenAIAdapter({
              apiKey,
              defaultModel: llmModel ?? 'gpt-4o-mini',
            }) as unknown as LLMProvider;
            break;
          case 'anthropic':
            llmAdapter = new llmPkg.AnthropicAdapter({
              apiKey,
              defaultModel: llmModel ?? 'claude-haiku-4-5',
            }) as unknown as LLMProvider;
            break;
          case 'gemini':
            llmAdapter = new llmPkg.GeminiAdapter({
              apiKey,
              defaultModel: llmModel ?? 'gemini-1.5-flash',
            }) as unknown as LLMProvider;
            break;
          default:
            return {
              error: `Unknown LLM provider: ${effectiveProvider}`,
              hint: 'Supported providers: openrouter, anthropic, openai, gemini, ollama',
            };
        }

        // Create a temporary engine with the custom LLM provider
        const { GraphRAGEngine } = await import('../engine/GraphRAGEngine');
        const graph = cachedGraphRAGEngine.graph;
        engine = new GraphRAGEngine(graph, cachedEmbeddingIndex!, {
          llmProvider: llmAdapter,
          llmModel: llmModel,
        });
      } catch (err: unknown) {
        return {
          error: `Failed to initialize ${effectiveProvider} provider: ${err instanceof Error ? err.message : String(err)}`,
          hint: 'Ensure @holoscript/llm-provider is installed and API key is valid',
        };
      }
    }

    const answer = await (engine as GraphRAGEngine).queryWithLLM(question, {
      topK,
      language,
      type,
    });

    return {
      question,
      answer: answer.answer,
      citations: answer.citations,
      context: answer.context.slice(0, 5).map((r: EnrichedResult) => ({
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
      llmProvider: effectiveProvider ?? 'ollama',
    };
  } catch (err: unknown) {
    return {
      error: `Graph RAG query failed: ${err instanceof Error ? err.message : String(err)}`,
      hint:
        // @ts-ignore - Automatic remediation for TS2304
        effectiveProvider && effectiveProvider !== 'ollama'
          // @ts-ignore - Automatic remediation for TS2304
          ? `Ensure ${effectiveProvider.toUpperCase()}_API_KEY is set or passed via llmApiKey parameter`
          : 'No cloud API keys found. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY for cloud LLM, or ensure Ollama is running locally.',
    };
  }
}
