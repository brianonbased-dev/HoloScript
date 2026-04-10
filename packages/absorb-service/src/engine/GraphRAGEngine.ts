/**
 * Graph RAG Engine
 *
 * Combines semantic search (via EmbeddingIndex) with graph traversal
 * (via CodebaseGraph) to produce enriched, context-aware query results.
 *
 * Query flow:
 *  1. Embed query → vector search for top-K semantic matches
 *  2. For each match, fan out via graph: callers, callees, community, impact
 *  3. Re-rank by combined score (semantic + structural relevance)
 *  4. Optionally generate natural language answer via LLM
 *
 * @version 1.0.0
 */

import type { ExternalSymbolDefinition, CallEdge } from './types';
import type { CodebaseGraph, CallChain } from './CodebaseGraph';
import type { EmbeddingIndex, SearchResult } from './EmbeddingIndex';

// =============================================================================
// TYPES
// =============================================================================

export interface GraphRAGOptions {
  /** Max semantic search results to fan out (default: 20) */
  topK?: number;
  /** Max graph depth for call chain tracing (default: 5) */
  maxDepth?: number;
  /** Scoring weights */
  weights?: {
    semantic?: number; // default: 0.6
    connections?: number; // default: 0.2
    impact?: number; // default: 0.2
  };
  /** Filter results to specific language */
  language?: string;
  /** Filter results to specific symbol type */
  type?: string;
  /** Filter results to specific file path prefix */
  file?: string;
  /** Ollama base URL for LLM queries (last-resort fallback, default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** LLM model for answer generation (default: 'brittney-qwen-v23' for Ollama fallback) */
  llmModel?: string;
  /**
   * LLM provider for answer generation.
   * When set, takes precedence over ollamaUrl/llmModel.
   * Any @holoscript/llm-provider adapter satisfies this interface.
   */
  llmProvider?: LLMProvider;
}

export interface GraphRAGResult {
  /** The original query */
  query: string;
  /** Ranked results with graph context */
  results: EnrichedResult[];
  /** Total matched symbols */
  totalMatches: number;
  /** Related communities discovered */
  communities: string[];
}

export interface EnrichedResult {
  /** Symbol definition */
  symbol: ExternalSymbolDefinition;
  /** Combined score (0-1) */
  score: number;
  /** Semantic similarity score */
  semanticScore: number;
  /** Connection-based relevance score */
  connectionScore: number;
  /** Impact radius score */
  impactScore: number;
  /** File path */
  file: string;
  /** Community this symbol belongs to */
  community?: string;
  /** Direct callers of this symbol */
  callers: string[];
  /** Direct callees of this symbol */
  callees: string[];
  /** Number of files affected if this symbol changes */
  impactRadius: number;
}

/**
 * Minimal LLM provider interface for query answering.
 * Structurally compatible with ILLMProvider from @holoscript/llm-provider,
 * so any adapter from that package can be passed directly.
 */
export interface LLMProvider {
  /**
   * Generate a completion for the given message thread.
   *
   * @param request - Chat messages in OpenAI-style format. Typically a single
   *                  `user` message containing the enriched graph context + question.
   * @param model   - Optional model override. If omitted the engine uses the
   *                  model configured in `GraphRAGOptions.llmModel`.
   * @returns The model’s reply as `{ content: string }`.
   */
  complete(
    request: { messages: Array<{ role: string; content: string }> },
    model?: string
  ): Promise<{ content: string }>;
}

export interface LLMAnswer {
  /** Natural language answer */
  answer: string;
  /** Cited symbols with file locations */
  citations: Array<{ name: string; file: string; line: number }>;
  /** Graph context used to generate the answer */
  context: EnrichedResult[];
}

// =============================================================================
// ENGINE
// =============================================================================

export class GraphRAGEngine {
  private graph: CodebaseGraph;
  private index: EmbeddingIndex;
  private ollamaUrl: string;
  private llmModel: string;
  private llmProvider?: LLMProvider;

  constructor(
    graph: CodebaseGraph,
    index: EmbeddingIndex,
    options?: Pick<GraphRAGOptions, 'ollamaUrl' | 'llmModel' | 'llmProvider'>
  ) {
    this.graph = graph;
    this.index = index;
    this.ollamaUrl = options?.ollamaUrl ?? 'http://localhost:11434';
    this.llmModel = options?.llmModel ?? 'brittney-qwen-v23';
    this.llmProvider = options?.llmProvider;
  }

  /**
   * Execute a Graph RAG query: semantic search + graph enrichment + re-ranking.
   */
  async query(naturalLanguage: string, options: GraphRAGOptions = {}): Promise<GraphRAGResult> {
    const topK = options.topK ?? 20;
    const wSemantic = options.weights?.semantic ?? 0.6;
    const wConnections = options.weights?.connections ?? 0.2;
    const wImpact = options.weights?.impact ?? 0.2;

    // 1. Semantic search
    const filters = {
      language: options.language,
      type: options.type,
      file: options.file,
    };
    const hasFilters = filters.language || filters.type || filters.file;
    const semanticResults = hasFilters
      ? await this.index.searchWithFilters(naturalLanguage, topK, filters)
      : await this.index.search(naturalLanguage, topK);

    // 2. Enrich each result with graph context
    const enriched: EnrichedResult[] = [];
    const communitySet = new Set<string>();
    let maxCallers = 1;
    let maxImpact = 1;

    // First pass: compute raw metrics
    const rawMetrics: Array<{
      callers: CallEdge[];
      callees: CallEdge[];
      impact: number;
      community?: string;
    }> = [];

    for (const sr of semanticResults) {
      const sym = sr.symbol;
      const callers = this.graph.getCallersOf(sym.name, sym.owner);
      const callerId = sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
      const callees = this.graph.getCalleesOf(callerId);
      const impact = this.graph.getSymbolImpact(sym.name, sym.owner).size;
      const community = this.graph.getCommunityForFile(sym.filePath);

      if (callers.length > maxCallers) maxCallers = callers.length;
      if (impact > maxImpact) maxImpact = impact;
      if (community) communitySet.add(community);

      rawMetrics.push({ callers, callees, impact, community });
    }

    // Second pass: compute normalized scores
    for (let i = 0; i < semanticResults.length; i++) {
      const sr = semanticResults[i];
      const metrics = rawMetrics[i];

      const connectionScore = metrics.callers.length / maxCallers;
      const impactScore = metrics.impact / maxImpact;
      const combinedScore =
        wSemantic * sr.score + wConnections * connectionScore + wImpact * impactScore;

      enriched.push({
        symbol: sr.symbol,
        score: Math.round(combinedScore * 10000) / 10000,
        semanticScore: sr.score,
        connectionScore: Math.round(connectionScore * 10000) / 10000,
        impactScore: Math.round(impactScore * 10000) / 10000,
        file: sr.file,
        community: metrics.community,
        callers: metrics.callers.map((c) => c.callerId),
        callees: metrics.callees.map((c) =>
          c.calleeOwner ? `${c.calleeOwner}.${c.calleeName}` : c.calleeName
        ),
        impactRadius: metrics.impact,
      });
    }

    // Re-rank by combined score
    enriched.sort((a, b) => b.score - a.score);

    return {
      query: naturalLanguage,
      results: enriched,
      totalMatches: enriched.length,
      communities: Array.from(communitySet),
    };
  }

  /**
   * Query with LLM-generated natural language answer.
   *
   * Executes a Graph RAG query, condenses the top-10 enriched results into a
   * structured prompt, and feeds it to the configured LLM.  The LLM output is
   * returned alongside extracted symbol citations.
   *
   * @param question - Natural-language question about the codebase.
   * @param options  - Graph RAG options (topK, weights, filters, etc.).
   * @returns `LLMAnswer` with `answer` text, `citations` array, and raw `context`.
   * @throws If no LLM provider is configured and Ollama is unreachable.
   */
  async queryWithLLM(question: string, options: GraphRAGOptions = {}): Promise<LLMAnswer> {
    const ragResult = await this.query(question, options);
    const topResults = ragResult.results.slice(0, 10);

    // Build context prompt
    const contextLines = topResults.map((r, i) => {
      const parts = [
        `${i + 1}. ${r.symbol.language} ${r.symbol.type} "${r.symbol.name}"`,
        `   File: ${r.file}:${r.symbol.line}`,
        r.symbol.signature ? `   Signature: ${r.symbol.signature}` : '',
        r.symbol.docComment ? `   Doc: ${r.symbol.docComment.split('\n')[0]}` : '',
        r.callers.length > 0 ? `   Called by: ${r.callers.slice(0, 5).join(', ')}` : '',
        r.callees.length > 0 ? `   Calls: ${r.callees.slice(0, 5).join(', ')}` : '',
        r.community ? `   Module: ${r.community}` : '',
        `   Impact radius: ${r.impactRadius} files`,
        `   Relevance: ${r.score}`,
      ];
      return parts.filter(Boolean).join('\n');
    });

    const prompt = [
      'You are a codebase assistant. Answer the question using ONLY the provided code context.',
      'Cite specific symbols and file locations in your answer.',
      '',
      '## Code Context',
      contextLines.join('\n\n'),
      '',
      '## Question',
      question,
      '',
      '## Answer',
    ].join('\n');

    const answer = await this.queryLLM(prompt);

    // Extract citations from top results
    const citations = topResults.map((r) => ({
      name: r.symbol.owner ? `${r.symbol.owner}.${r.symbol.name}` : r.symbol.name,
      file: r.file,
      line: r.symbol.line,
    }));

    return {
      answer,
      citations,
      context: topResults,
    };
  }

  /**
   * Trace a call chain and describe it with graph context.
   */
  async traceWithContext(
    fromSymbol: string,
    toSymbol: string,
    maxDepth = 10
  ): Promise<{ chain: CallChain | null; context: EnrichedResult[] }> {
    const chain = this.graph.traceCallChain(fromSymbol, toSymbol, maxDepth);

    if (!chain) {
      return { chain: null, context: [] };
    }

    // Enrich each node in the chain
    const context: EnrichedResult[] = [];
    for (const nodeName of chain.path) {
      const symbols = this.graph.findSymbolsByName(nodeName);
      if (symbols.length > 0) {
        const sym = symbols[0];
        const callers = this.graph.getCallersOf(sym.name, sym.owner);
        const callerId = sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
        const callees = this.graph.getCalleesOf(callerId);
        const impact = this.graph.getSymbolImpact(sym.name, sym.owner).size;

        context.push({
          symbol: sym,
          score: 1,
          semanticScore: 1,
          connectionScore: 0,
          impactScore: 0,
          file: sym.filePath,
          community: this.graph.getCommunityForFile(sym.filePath),
          callers: callers.map((c) => c.callerId),
          callees: callees.map((c) =>
            c.calleeOwner ? `${c.calleeOwner}.${c.calleeName}` : c.calleeName
          ),
          impactRadius: impact,
        });
      }
    }

    return { chain, context };
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async queryLLM(prompt: string): Promise<string> {
    // Prefer injected LLM provider (OpenAI, Anthropic, Gemini, etc.)
    if (this.llmProvider) {
      const resp = await this.llmProvider.complete({
        messages: [{ role: 'user', content: prompt }],
      });
      return resp.content;
    }

    // Fall back to direct Ollama API call (original behaviour)
    const response = await fetch(this.ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.llmModel,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama Generate API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response ?? '';
  }
}
