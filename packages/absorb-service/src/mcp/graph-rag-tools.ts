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
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import { GraphRAGEngine, type EnrichedResult, type LLMProvider } from '../engine/GraphRAGEngine';
import type {
  HoloLlamaBundleSummary,
  HoloLlamaProfile,
  HoloLlamaServeSpec,
} from '@holoscript/holollama';
import {
  createHoloGraphHoloEmbedSearchIndexFromManifest,
  DEFAULT_HOLOGRAPH_HOLOEMBED_STUDENT_SHA256,
  resolveDefaultHoloGraphHoloEmbedManifestPath,
} from '../engine/HoloGraphHoloEmbedManifest';
import { LLMCreditExhaustedError } from '@holoscript/llm-provider';
import { validateCitations, type Citation } from '../engine/ProvenanceIntegrityGuard';
import {
  ABSORB_EMBEDDING_INDEX_ERROR,
  ABSORB_GRAPH_RAG_ENGINE_ERROR,
  ABSORB_HOLO_ABSORB_REPO_HINT,
} from './graph-rag-prerequisite';
import { resolveConfigSecret } from '@holoscript/config';

export const HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA = 'holoscript.absorb.holollama-synthesis.v1';

const HOLOLLAMA_PROFILES: HoloLlamaProfile[] = ['jetson-orin', 'laptop-windows', 'vast-linux-gpu'];

type LLMProviderName = 'openrouter' | 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'holollama';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface HoloLlamaSynthesisReceipt {
  schema: typeof HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA;
  generatedAt: string;
  provider: 'holollama';
  role: 'answer-synthesis';
  profile: HoloLlamaProfile;
  registryHandle: string;
  endpoint: string;
  chatCompletionsUrl: string;
  healthUrl: string;
  model: string;
  node: string;
  registerAs: string;
  embeddingProvider: 'holoembed';
  embeddingPolicy: 'holoembed-query-tower-only';
  graphProvider: 'holograph';
  warnings: string[];
}

export interface HoloLlamaSynthesisProvider extends LLMProvider {
  receipt: HoloLlamaSynthesisReceipt;
}

export interface HoloLlamaSynthesisProviderOptions {
  profile?: unknown;
  endpoint?: unknown;
  model?: string;
  generatedAt?: string;
  fetchImpl?: FetchLike;
}

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
        holoGraphHoloEmbedManifest: {
          type: 'string',
          description:
            'Optional path to a canonical HoloGraph/HoloEmbed two-tower manifest. When omitted, search uses HOLOGRAPH_HOLOEMBED_MANIFEST or the promoted local ai-ecosystem HoloGraph/HoloEmbed release when present, then falls back to cached absorb state.',
        },
        useCachedAbsorbIndex: {
          type: 'boolean',
          description:
            'When true, search the current holo_absorb_repo in-memory index even if a default HoloGraph/HoloEmbed manifest is present. Intended for repo-local benchmarks and validation.',
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
          enum: ['openrouter', 'anthropic', 'openai', 'gemini', 'ollama', 'holollama'],
          description:
            'LLM provider for answer generation. Default is HoloLlama, resolved through the HoloKey-aware HoloLlama profile/endpoint bridge. Cloud providers are explicit opt-in only.',
        },
        llmApiKey: {
          type: 'string',
          description:
            'API key for an explicitly selected cloud LLM provider. Not used for default HoloLlama synthesis.',
        },
        llmModel: {
          type: 'string',
          description:
            'Model name override (e.g., "gpt-4o-mini", "claude-haiku-4-5", "gemini-1.5-flash"). Defaults to provider-specific defaults.',
        },
        holoLlamaProfile: {
          type: 'string',
          enum: HOLOLLAMA_PROFILES,
          description:
            'HoloLlama serving profile used when llmProvider is "holollama" (default: HoloKey-aware HOLOLLAMA_PROFILE/env or "jetson-orin").',
        },
        holoLlamaEndpoint: {
          type: 'string',
          description:
            'OpenAI-compatible HoloLlama endpoint override used when llmProvider is "holollama" (default: HoloKey-aware HOLOLLAMA_ENDPOINT/env or the selected profile registry endpoint). Accepts a base URL, /v1 URL, or /v1/chat/completions URL.',
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
let cachedEmbeddingIndex: SymbolSearchIndex | null = null;
let cachedGraphRAGEngine: GraphRAGEngine | null = null;
let cachedGraphRAGRootDir: string | null = null;
let cachedGraphRAGTimestamp = 0;

/**
 * Set the cached embedding index and RAG engine (called from codebase-tools after absorb).
 */
export function setGraphRAGState(
  embeddingIndex: SymbolSearchIndex,
  ragEngine: GraphRAGEngine,
  provenance: { rootDir?: string; timestamp?: number } = {}
): void {
  cachedEmbeddingIndex = embeddingIndex;
  cachedGraphRAGEngine = ragEngine;
  cachedGraphRAGRootDir = provenance.rootDir ?? null;
  cachedGraphRAGTimestamp = provenance.timestamp ?? Date.now();
}

/**
 * Get whether Graph RAG is initialized.
 */
export function isGraphRAGReady(): boolean {
  return cachedEmbeddingIndex !== null && cachedGraphRAGEngine !== null;
}

export function getGraphRAGStateStatus(): {
  ready: boolean;
  rootDir: string | null;
  timestamp: number | null;
  ageMs: number | null;
} {
  return {
    ready: isGraphRAGReady(),
    rootDir: cachedGraphRAGRootDir,
    timestamp: cachedGraphRAGTimestamp || null,
    ageMs: cachedGraphRAGTimestamp ? Date.now() - cachedGraphRAGTimestamp : null,
  };
}

export function resetGraphRAGState(): void {
  cachedEmbeddingIndex = null;
  cachedGraphRAGEngine = null;
  cachedGraphRAGRootDir = null;
  cachedGraphRAGTimestamp = 0;
}

export const resetGraphRAGStateForTests = resetGraphRAGState;

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
 * Resolve GraphRAG answer synthesis.
 *
 * Bare holo_ask_codebase calls use sovereign HoloLlama. Cloud providers remain
 * available only through explicit tool args or provider override config.
 */
async function detectDefaultLLMProvider(): Promise<LLMProviderName> {
  const configured = (
    (await resolveFirstConfigSecret(
      'ABSORB_GRAPH_RAG_LLM_PROVIDER',
      'HOLO_LLM_PROVIDER',
      'BRITTNEY_PROVIDER'
    )) ?? 'holollama'
  ).toLowerCase();

  switch (configured) {
    case '':
    case 'auto':
    case 'sovereign':
    case 'holollama':
      return 'holollama';
    case 'openrouter':
    case 'anthropic':
    case 'openai':
    case 'gemini':
    case 'ollama':
      return configured;
    default:
      throw new Error(
        `Unsupported GraphRAG synthesis provider "${configured}". ` +
          'Use holollama, ollama, openrouter, anthropic, openai, or gemini.'
      );
  }
}

async function resolveFirstConfigSecret(...names: string[]): Promise<string | undefined> {
  for (const name of names) {
    const value = stringArg(await resolveConfigSecret(name));
    if (value) return value;
  }
  return undefined;
}

function graphRagFailureHint(provider: string | undefined): string {
  if (provider === 'holollama') {
    return 'Ensure the selected HoloLlama profile is serving an OpenAI-compatible endpoint. Provide holoLlamaEndpoint or resolve HOLOLLAMA_ENDPOINT through HoloKey-aware config/env; embeddings remain fixed to HoloEmbed.';
  }

  if (provider && provider !== 'ollama') {
    return `Ensure ${provider.toUpperCase()}_API_KEY is set or passed via llmApiKey parameter, or omit llmProvider to use HoloLlama.`;
  }

  return 'Default synthesis is HoloLlama. Pass llmProvider explicitly for cloud BYOK synthesis, or ensure the selected local provider is running.';
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function createHoloLlamaSynthesisProvider(
  options: HoloLlamaSynthesisProviderOptions = {}
): Promise<HoloLlamaSynthesisProvider> {
  const holoLlama = await import('@holoscript/holollama');
  const explicitProfile = stringArg(options.profile);
  const profile = resolveHoloLlamaProfile(
    explicitProfile,
    explicitProfile ? undefined : await resolveHoloLlamaConfigSecret('HOLOLLAMA_PROFILE')
  );
  const spec = holoLlama.resolveHoloLlamaServeSpec(profile);
  const bundle = holoLlama.compileHoloLlamaBundle({ profile });
  const summary = holoLlama.summarizeHoloLlamaBundle(bundle);
  const explicitEndpoint = stringArg(options.endpoint);
  const endpoint =
    explicitEndpoint ??
    (explicitEndpoint
      ? undefined
      : await resolveFirstConfigSecret('HOLOLLAMA_ENDPOINT', 'HOLOLLAMA_URL')) ??
    summary.endpoint ??
    `http://${spec.host}:${spec.port}/v1`;
  const chatCompletionsUrl = normalizeHoloLlamaChatCompletionsUrl(endpoint);
  const model = options.model ?? spec.model;
  const fetchImpl = options.fetchImpl ?? fetch;
  const receipt = buildHoloLlamaSynthesisReceipt({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    profile,
    spec,
    summary,
    endpoint: trimTrailingSlashes(endpoint),
    chatCompletionsUrl,
    model,
  });

  return {
    receipt,
    async complete(request, modelOverride) {
      const response = await fetchImpl(chatCompletionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelOverride ?? model,
          messages: request.messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `HoloLlama chat completions error: ${response.status} ${response.statusText}`
        );
      }

      return { content: extractChatCompletionContent(await response.json()) };
    },
  };
}

async function resolveHoloLlamaConfigSecret(name: string): Promise<string | undefined> {
  return stringArg(await resolveConfigSecret(name));
}

function resolveHoloLlamaProfile(value: unknown, configuredProfile?: string): HoloLlamaProfile {
  const candidate = stringArg(value) ?? configuredProfile ?? 'jetson-orin';
  if (HOLOLLAMA_PROFILES.includes(candidate as HoloLlamaProfile)) {
    return candidate as HoloLlamaProfile;
  }
  throw new Error(`Unknown HoloLlama profile: ${candidate}`);
}

export function normalizeHoloLlamaChatCompletionsUrl(endpoint: string): string {
  const normalized = trimTrailingSlashes(endpoint);
  if (/\/v1\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function buildHoloLlamaSynthesisReceipt(options: {
  generatedAt: string;
  profile: HoloLlamaProfile;
  spec: HoloLlamaServeSpec;
  summary: HoloLlamaBundleSummary;
  endpoint: string;
  chatCompletionsUrl: string;
  model: string;
}): HoloLlamaSynthesisReceipt {
  const { generatedAt, profile, spec, summary, endpoint, chatCompletionsUrl, model } = options;
  return {
    schema: HOLOLLAMA_SYNTHESIS_RECEIPT_SCHEMA,
    generatedAt,
    provider: 'holollama',
    role: 'answer-synthesis',
    profile,
    registryHandle: summary.registryHandle,
    endpoint,
    chatCompletionsUrl,
    healthUrl: summary.healthUrl,
    model,
    node: spec.node,
    registerAs: spec.registerAs,
    embeddingProvider: 'holoembed',
    embeddingPolicy: 'holoembed-query-tower-only',
    graphProvider: 'holograph',
    warnings: summary.warnings,
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, '');
}

function extractChatCompletionContent(data: unknown): string {
  const root = asRecord(data);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const messageContent = readContentValue(message?.content);
  if (messageContent) return messageContent;

  const text = readStringValue(firstChoice?.text);
  if (text) return text;

  const content = readStringValue(root?.content);
  if (content) return content;

  const response = readStringValue(root?.response);
  if (response) return response;

  throw new Error('HoloLlama response did not include message content');
}

function readContentValue(value: unknown): string | undefined {
  const direct = readStringValue(value);
  if (direct) return direct;
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map((part) => readStringValue(asRecord(part)?.text))
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join('') : undefined;
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

async function handleSemanticSearch(args: Record<string, unknown>): Promise<unknown> {
  const resolvedIndex = await resolveSemanticSearchIndex(args);
  if ('error' in resolvedIndex) {
    return resolvedIndex;
  }

  if (!resolvedIndex.index) {
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
      ? await resolvedIndex.index.searchWithFilters(query, topK, filters)
      : await resolvedIndex.index.search(query, topK);

    return {
      query,
      indexSource: resolvedIndex.source,
      ...(resolvedIndex.manifestPath
        ? { holoGraphHoloEmbedManifest: resolvedIndex.manifestPath }
        : {}),
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
      hint: 'Embedding search failed. Shared GraphRAG uses HoloEmbed (structural is a legacy alias) with no API key. For exact structural code intelligence prefer HoloGraph (holo_query_codebase). OpenAI/Ollama/Xenova providers are low-level experiments only and are not valid shared GraphRAG embedding providers.',
    };
  }
}

async function resolveSemanticSearchIndex(
  args: Record<string, unknown>
): Promise<
  | { index: SymbolSearchIndex; source: string; manifestPath?: string }
  | { error: string; hint: string }
> {
  if (args.useCachedAbsorbIndex === true) {
    return cachedEmbeddingIndex
      ? { index: cachedEmbeddingIndex, source: 'cached-embedding-index' }
      : {
          error: ABSORB_EMBEDDING_INDEX_ERROR,
          hint: ABSORB_HOLO_ABSORB_REPO_HINT,
        };
  }

  const explicitManifestPath =
    stringArg(args.holoGraphHoloEmbedManifest) ??
    stringArg(process.env.HOLOGRAPH_HOLOEMBED_MANIFEST);
  const defaultManifestPath = explicitManifestPath
    ? undefined
    : resolveDefaultHoloGraphHoloEmbedManifestPath();
  const manifestPath = explicitManifestPath ?? defaultManifestPath;
  if (!manifestPath) {
    return cachedEmbeddingIndex
      ? { index: cachedEmbeddingIndex, source: 'cached-embedding-index' }
      : {
          error: ABSORB_EMBEDDING_INDEX_ERROR,
          hint: ABSORB_HOLO_ABSORB_REPO_HINT,
        };
  }

  try {
    const index = await createHoloGraphHoloEmbedSearchIndexFromManifest({
      manifestPath,
      expectedHoloEmbedQueryTowerSha256: defaultManifestPath
        ? DEFAULT_HOLOGRAPH_HOLOEMBED_STUDENT_SHA256
        : undefined,
    });
    return {
      index,
      source: 'holograph-holoembed-manifest',
      manifestPath,
    };
  } catch (err) {
    return {
      error: `HoloGraph/HoloEmbed manifest search failed (${manifestPath}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      hint: 'Verify the manifest schema, graphPath, nodeEmbeddingPath, and that the HoloEmbed query provider dimension matches the HoloGraph node embedding dimension.',
    };
  }
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function contextName(r: EnrichedResult): string {
  return r.symbol.owner ? `${r.symbol.owner}.${r.symbol.name}` : r.symbol.name;
}

function contextPayload(context: EnrichedResult[]): Array<Record<string, unknown>> {
  return context.slice(0, 5).map((r: EnrichedResult) => ({
    name: contextName(r),
    type: r.symbol.type,
    file: r.file,
    line: r.symbol.line,
    score: r.score,
    callers: r.callers.slice(0, 3),
    callees: r.callees.slice(0, 3),
    impactRadius: r.impactRadius,
    community: r.community ?? null,
  }));
}

async function buildExtractiveCodebaseAnswer(options: {
  engine: GraphRAGEngine;
  question: string;
  topK: number;
  language?: string;
  type?: string;
  effectiveProvider?: string;
  holoLlamaReceipt?: HoloLlamaSynthesisReceipt;
  fallbackReason: string;
}): Promise<Record<string, unknown>> {
  const {
    engine,
    question,
    topK,
    language,
    type,
    effectiveProvider,
    holoLlamaReceipt,
    fallbackReason,
  } = options;
  const ragResult = await engine.query(question, { topK, language, type });
  const context = ragResult.results.slice(0, 10);

  if (context.length === 0) {
    return {
      question,
      error: 'Graph RAG query returned no context for extractive answer fallback.',
      fallback: 'extractive-graphrag',
      fallbackReason,
    };
  }

  const citations = context.map((r) => ({
    name: contextName(r),
    file: r.file,
    line: r.symbol.line,
  }));
  const guard = validateCitations(citations as Citation[], engine.graph);
  const filteredCitations = guard.passed
    ? guard.resolved.map(({ name, file, line }) => ({ name, file, line }))
    : [];

  const citedLines = context.slice(0, 5).map((r, index) => {
    const signature = r.symbol.signature ? ` ${r.symbol.signature}` : '';
    return `${index + 1}. ${contextName(r)} (${r.symbol.type}) at ${r.file}:${r.symbol.line}.${signature}`;
  });

  return {
    question,
    answer: guard.passed
      ? [
          `LLM generation was unavailable (${fallbackReason}); returning an extractive GraphRAG answer from cited code context.`,
          '',
          ...citedLines,
        ].join('\n')
      : `[Provenance guard rejected: ${guard.rejectionReason}]`,
    citations: filteredCitations,
    provenanceGuard: {
      resolvedCount: guard.resolvedCount,
      unresolvedCount: guard.unresolvedCount,
      passed: guard.passed,
      ...(guard.unresolvedCount > 0
        ? {
            unresolvedCitations: guard.unresolved.map(({ name, file, line }) => ({
              name,
              file,
              line,
            })),
          }
        : {}),
    },
    context: contextPayload(context),
    llmProvider: effectiveProvider ?? 'ollama',
    ...(holoLlamaReceipt ? { holoLlamaReceipt } : {}),
    fallback: 'extractive-graphrag',
    fallbackReason,
  };
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
  const llmProvider = args.llmProvider as LLMProviderName | undefined;
  const llmApiKey = args.llmApiKey as string | undefined;
  const llmModel = args.llmModel as string | undefined;
  const effectiveProvider = llmProvider ?? (await detectDefaultLLMProvider());
  let holoLlamaReceipt: HoloLlamaSynthesisReceipt | undefined;

  try {
    // If a custom LLM provider is specified, create a new engine with that provider
    let engine = cachedGraphRAGEngine;
    if (effectiveProvider && effectiveProvider !== 'ollama') {
      try {
        // The adapter classes from @holoscript/llm-provider satisfy the
        // structural LLMProvider interface from ../engine/GraphRAGEngine
        // at runtime, but signatures drifted during peer's refactor. Cast
        // at construction; runtime invariant intact. (Fix 2026-04-25 to
        // unblock deploy.)
        let llmAdapter: LLMProvider;
        if (effectiveProvider === 'holollama') {
          const provider = await createHoloLlamaSynthesisProvider({
            profile: args.holoLlamaProfile,
            endpoint: args.holoLlamaEndpoint,
            model: llmModel,
          });
          llmAdapter = provider;
          holoLlamaReceipt = provider.receipt;
        } else {
          const llmPkg = await import('@holoscript/llm-provider');
          const apiKey =
            llmApiKey || (await resolveConfigSecret(`${effectiveProvider.toUpperCase()}_API_KEY`));

          switch (effectiveProvider) {
            case 'openrouter':
              llmAdapter = new llmPkg.OpenAIAdapter({
                apiKey,
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
                hint: 'Supported providers: openrouter, anthropic, openai, gemini, ollama, holollama',
              };
          }
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
          hint:
            effectiveProvider === 'holollama'
              ? 'Ensure @holoscript/holollama is installed and the requested HoloLlama profile compiles.'
              : 'Ensure @holoscript/llm-provider is installed and API key is valid',
        };
      }
    }

    const answer = await (engine as GraphRAGEngine).queryWithLLM(question, {
      topK,
      language,
      type,
    });

    // Provenance integrity guard: validate every cited file:line resolves
    // to a real span in the absorbed graph. Drop unresolvable citations;
    // reject the answer if zero citations survive (F.069, task cykp).
    const guard = validateCitations(
      answer.citations as Citation[],
      (engine as GraphRAGEngine).graph
    );

    const filteredCitations = guard.passed
      ? guard.resolved.map(({ name, file, line }) => ({ name, file, line }))
      : [];

    return {
      question,
      answer: guard.passed
        ? answer.answer
        : `[Provenance guard rejected: ${guard.rejectionReason}]`,
      citations: filteredCitations,
      provenanceGuard: {
        resolvedCount: guard.resolvedCount,
        unresolvedCount: guard.unresolvedCount,
        passed: guard.passed,
        ...(guard.unresolvedCount > 0
          ? {
              unresolvedCitations: guard.unresolved.map(({ name, file, line }) => ({
                name,
                file,
                line,
              })),
            }
          : {}),
      },
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
      ...(holoLlamaReceipt ? { holoLlamaReceipt } : {}),
    };
  } catch (err: unknown) {
    // Fallback on auto-detected Anthropic credit exhaustion
    if (
      err instanceof LLMCreditExhaustedError &&
      effectiveProvider === 'anthropic' &&
      !llmProvider
    ) {
      const fallbackOrder = ['openrouter', 'openai', 'gemini'] as const;
      for (const fb of fallbackOrder) {
        const fbKey = process.env[`${fb.toUpperCase()}_API_KEY`];
        if (!fbKey) continue;
        try {
          const llmPkg = await import('@holoscript/llm-provider');
          let fbAdapter: LLMProvider;
          switch (fb) {
            case 'openrouter':
              fbAdapter = new llmPkg.OpenAIAdapter({
                apiKey: fbKey,
                defaultModel: llmModel ?? 'anthropic/claude-sonnet-4',
                baseURL: 'https://openrouter.ai/api/v1',
              }) as unknown as LLMProvider;
              break;
            case 'openai':
              fbAdapter = new llmPkg.OpenAIAdapter({
                apiKey: fbKey,
                defaultModel: llmModel ?? 'gpt-4o-mini',
              }) as unknown as LLMProvider;
              break;
            case 'gemini':
              fbAdapter = new llmPkg.GeminiAdapter({
                apiKey: fbKey,
                defaultModel: llmModel ?? 'gemini-1.5-flash',
              }) as unknown as LLMProvider;
              break;
            default:
              continue;
          }
          const { GraphRAGEngine } = await import('../engine/GraphRAGEngine');
          const fbEngine = new GraphRAGEngine(cachedGraphRAGEngine.graph, cachedEmbeddingIndex!, {
            llmProvider: fbAdapter,
            llmModel,
          });
          const fbAnswer = await fbEngine.queryWithLLM(question, {
            topK,
            language,
            type,
          });

          // Provenance integrity guard (same as primary path)
          const fbGuard = validateCitations(
            fbAnswer.citations as Citation[],
            cachedGraphRAGEngine.graph
          );
          const fbFilteredCitations = fbGuard.passed
            ? fbGuard.resolved.map(({ name, file, line }) => ({ name, file, line }))
            : [];

          return {
            question,
            answer: fbGuard.passed
              ? fbAnswer.answer
              : `[Provenance guard rejected: ${fbGuard.rejectionReason}]`,
            citations: fbFilteredCitations,
            provenanceGuard: {
              resolvedCount: fbGuard.resolvedCount,
              unresolvedCount: fbGuard.unresolvedCount,
              passed: fbGuard.passed,
              ...(fbGuard.unresolvedCount > 0
                ? {
                    unresolvedCitations: fbGuard.unresolved.map(({ name, file, line }) => ({
                      name,
                      file,
                      line,
                    })),
                  }
                : {}),
            },
            context: fbAnswer.context.slice(0, 5).map((r: EnrichedResult) => ({
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
            llmProvider: fb,
            fallbackFrom: 'anthropic',
          };
        } catch {
          // try next fallback
        }
      }
    }
    const failureReason = err instanceof Error ? err.message : String(err);
    try {
      return await buildExtractiveCodebaseAnswer({
        engine: cachedGraphRAGEngine,
        question,
        topK,
        language,
        type,
        effectiveProvider,
        holoLlamaReceipt,
        fallbackReason: failureReason,
      });
    } catch (fallbackErr: unknown) {
      return {
        error: `Graph RAG query failed: ${failureReason}`,
        hint: graphRagFailureHint(effectiveProvider),
        fallbackError: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      };
    }
  }
}
