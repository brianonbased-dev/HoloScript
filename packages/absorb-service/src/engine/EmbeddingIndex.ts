/**
 * Embedding Index for Graph RAG
 *
 * Builds a vector index over symbol signatures using OllamaAdapter.getEmbeddings().
 * Supports cosine similarity search, incremental updates, and serialization.
 *
 * @version 1.0.0
 */

import type { ExternalSymbolDefinition } from './types';
import type { CodebaseGraph } from './CodebaseGraph';
import type { EmbeddingProvider } from './providers/EmbeddingProvider';
import { fuseHybridScore, HybridLexicalIndex, type HybridMatchKind } from './HybridRetrieval';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

function resolveEmbeddingWorkerFile(): string | null {
  const currentExt = path.extname(__filename_esm).toLowerCase();
  const extensions =
    currentExt === '.cjs'
      ? ['.cjs', '.js', '.ts']
      : currentExt === '.ts'
        ? ['.ts', '.js', '.cjs']
        : ['.js', '.cjs', '.ts'];
  const directories = [
    path.join(__dirname_esm, 'workers'),
    path.join(__dirname_esm, '..', 'workers'),
    path.join(__dirname_esm, '..', '..', 'dist', 'workers'),
  ];

  for (const extension of extensions) {
    for (const directory of directories) {
      const candidate = path.join(directory, `embedding-worker${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Dynamic import for worker pool (graceful degradation if not available)
let WorkerPool: typeof import('./workers/WorkerPool').WorkerPool | null;
try {
  WorkerPool = require('./workers/WorkerPool').WorkerPool;
} catch {
  // Worker threads not available (browser, WASM, or old Node.js)
  WorkerPool = null;
}

// =============================================================================
// TYPES
// =============================================================================

export interface EmbeddingIndexOptions {
  /**
   * Embedding provider instance.
   * Factory default is `structural` (keyless, offline); `holoembed` is the
   * recommended keyless option (best NL→code recall). OpenAI is opt-in only —
   * NOT the default and NOT required (F.106). BM25 is deprecated.
   * Use createEmbeddingProvider() from './providers' to build from config options.
   */
  provider?: EmbeddingProvider;
  /** Batch size for embedding requests (default: 32) */
  batchSize?: number;
  /**
   * Use worker threads for parallel embedding generation (Phase 9 Extension).
   * Speeds up embedding 4-8x by processing batches concurrently.
   * Default: true (if workers available)
   */
  useWorkers?: boolean;
  /**
   * Number of concurrent embedding batches to process in parallel.
   * Only used when useWorkers=true.
   * Default: min(4, CPU cores - 2)
   */
  concurrentBatches?: number;
  /**
   * Optional graph-context text gates for benchmark ablations.
   * Defaults keep every term enabled, preserving production index text.
   */
  graphTextTerms?: GraphTextTermOptions;
  /**
   * @deprecated Kept only for backward-compatible deserialize() calls.
   * The provider's own name (provider.name) is now stored in serialised indexes.
   */
  model?: string;
}

export type GraphTextTerm = 'community' | 'fileDoc' | 'callers' | 'callees' | 'siblings';

export type GraphTextTermOptions = Partial<Record<GraphTextTerm, boolean>>;

export interface IndexedSymbol {
  /** Symbol definition */
  symbol: ExternalSymbolDefinition;
  /** Text representation used for embedding */
  text: string;
  /** Embedding vector */
  embedding: Float32Array;
}

export interface EmbeddingRefreshReceipt {
  kind: 'EmbeddingRefreshReceipt';
  previousSymbols: number;
  totalSymbols: number;
  reusedSymbols: number;
  embeddedSymbols: number;
  retiredSymbols: number;
  reuseRatio: number;
  batchCount: number;
}

export interface SearchResult {
  /** Matched symbol */
  symbol: ExternalSymbolDefinition;
  /** Cosine similarity score (0-1) */
  score: number;
  /** File path */
  file: string;
  /** Symbol type */
  type: string;
  /** Raw vector similarity before hybrid fusion. */
  vectorScore?: number;
  /** Exact-name/path and lexical overlap score. */
  lexicalScore?: number;
  /** True when the query explicitly names the symbol or file stem. */
  exactMatch?: boolean;
  /** Stable diagnostic for agents and benchmark ablations. */
  matchKind?: HybridMatchKind;
}

interface GraphTextContext {
  graph: CodebaseGraph;
  communitiesByFile: Map<string, string | undefined>;
  fileDocsByFile: Map<string, string | undefined>;
  siblingsByFile: Map<string, ExternalSymbolDefinition[]>;
}

interface SerializedIndex {
  version: number;
  model: string;
  entries: Array<{
    symbol: ExternalSymbolDefinition;
    text: string;
    embedding: number[];
  }>;
}

interface SemanticAliasRule {
  triggers: RegExp[];
  aliases: string[];
}

interface SourceIntentAliasRule {
  fileStems: string[];
  aliases: string[];
}

const SOURCE_INTENT_ALIAS_RULES: SourceIntentAliasRule[] = [
  {
    fileStems: ['GitChangeDetector'],
    aliases: [
      'figure out files changed since last run',
      'figure out which files changed since last run',
      'changed files since last run',
      'detect modified added deleted files',
      'incremental git diff file delta',
    ],
  },
  {
    fileStems: ['CodebaseSceneCompiler'],
    aliases: [
      'render graph navigable 3d scene',
      'codebase graph visualization scene',
      'turn graph nodes edges into spatial view',
    ],
  },
  {
    fileStems: ['GraphRAGEngine'],
    aliases: [
      'answer natural language question about code',
      'answer natural language code question',
      'natural language code question answering',
      'retrieve code context for question answering',
      'respond to codebase question from retrieved context',
      'graph rag semantic search response engine',
    ],
  },
  {
    fileStems: ['HoloEmitter'],
    aliases: [
      'turn codebase into holoscript world',
      'emit holoscript composition from codebase graph',
      'generate holoscript world from code graph',
      'convert codebase graph into holo composition',
    ],
  },
  {
    fileStems: ['ClaimNetworkGraph'],
    aliases: [
      'measure tangled complex code',
      'measure how tangled and complex code is',
      'analyze coupling dependency complexity',
      'claim network graph dependency tangles',
    ],
  },
];

const SEMANTIC_ALIAS_RULES: SemanticAliasRule[] = [
  {
    triggers: [/\bcommun(?:ity|ities)\b/, /\blouvain\b/, /\bmodule boundaries?\b/],
    aliases: ['group related files clusters cluster modules boundaries'],
  },
  {
    triggers: [/\bforce directed\b/, /\blayout\b/],
    aliases: ['lay out nodes three dimensional space spatial positions'],
  },
  {
    triggers: [/\bembed(?:ding|dings)?\b/, /\bvector\b/, /\bencoder\b/],
    aliases: ['convert code numeric vector embedding encode representation'],
  },
  {
    triggers: [/\bgit\b/, /\bchange detector\b/, /\bdiff\b/, /\bcommit\b/],
    aliases: ['figure out files changed since last run modified added deleted incremental'],
  },
  {
    triggers: [/\btree sitter\b/, /\bsyntax tree\b/, /\bdeclarations?\b/, /\blanguage trait\b/],
    aliases: ['walk syntax tree pull out declarations parsed symbols'],
  },
  {
    triggers: [
      /\bscene compiler\b/,
      /\bholo ?composition ast\b/,
      /\btransforms? a codebase ?graph\b/,
    ],
    aliases: ['render graph navigable 3d scene three dimensional view'],
  },
  {
    triggers: [/\bholo emitter\b/, /\bemitter\b/, /\bemit\b/, /\bcomposition\b/],
    aliases: ['turn codebase holoscript world emit compile composition'],
  },
  {
    triggers: [/\bgraph rag\b/, /\brag\b/, /\bnatural language\b/, /\bsemantic search\b/],
    aliases: ['answer natural language question about code retrieve context'],
  },
  {
    triggers: [/\bclaim network\b/, /\bcomplex(?:ity)?\b/, /\bcoupling\b/],
    aliases: ['measure tangled complex code dependencies graph'],
  },
  {
    triggers: [/\bcodebase graph\b/, /\bsymbol relationships?\b/, /\bcall graph\b/],
    aliases: ['store parsed symbols relationships imports calls graph'],
  },
  {
    triggers: [/\bcodebase scanner\b/, /\bcollect files\b/, /\bdirectory\b/],
    aliases: ['read every file directory tree walk scan source files'],
  },
  {
    triggers: [/\bdeprecated\b/, /\bdead\b/, /\bobsolete\b/, /\binventory\b/],
    aliases: ['flag code no longer used anywhere unused cleanup'],
  },
];

const DEFAULT_GRAPH_TEXT_TERMS: Record<GraphTextTerm, boolean> = {
  community: true,
  fileDoc: true,
  callers: true,
  callees: true,
  siblings: true,
};

// =============================================================================
// EMBEDDING INDEX
// =============================================================================

export class EmbeddingIndex {
  private entries: IndexedSymbol[] = [];
  private lexicalIndex?: HybridLexicalIndex;
  private provider: EmbeddingProvider;
  private batchSize: number;
  private useWorkers: boolean;
  private concurrentBatches: number;
  private graphTextTerms: Record<GraphTextTerm, boolean>;
  private workerPool?: InstanceType<typeof import('./workers/WorkerPool').WorkerPool>;

  constructor(options: EmbeddingIndexOptions = {}) {
    if (!options.provider) {
      throw new Error(
        'EmbeddingIndex requires an explicit provider. Use createEmbeddingProvider() from providers/EmbeddingProviderFactory.'
      );
    }
    this.provider = options.provider;
    // Increased from 32 to 100 for OpenAI (supports up to 2048)
    // Reduces API calls from 4,062 to 1,300 for 130K symbols
    this.batchSize = options.batchSize ?? (this.provider.name === 'openai' ? 100 : 32);
    this.useWorkers = options.useWorkers !== false && WorkerPool !== null;
    this.concurrentBatches =
      options.concurrentBatches ?? Math.min(4, Math.max(1, os.cpus().length - 2));
    this.graphTextTerms = {
      ...DEFAULT_GRAPH_TEXT_TERMS,
      ...(options.graphTextTerms ?? {}),
    };

    // Initialize worker pool for parallel embedding (Phase 9 Extension)
    if (this.useWorkers && WorkerPool) {
      try {
        const workerFile = resolveEmbeddingWorkerFile();
        if (!workerFile) {
          this.useWorkers = false;
          return;
        }
        this.workerPool = new WorkerPool(workerFile, this.concurrentBatches);
      } catch (err) {
        console.warn(
          '[EmbeddingIndex] Worker threads unavailable, falling back to sequential:',
          err
        );
        this.useWorkers = false;
      }
    }
  }

  /**
   * Clean up worker pool resources.
   */
  async dispose(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = undefined;
    }
  }

  /**
   * Build the full index from a CodebaseGraph.
   * Iterates all symbols, generates text representations, and embeds them.
   *
   * @param graph - CodebaseGraph to index
   * @param onProgress - Optional progress callback (batchNum, totalBatches, symbolsProcessed)
   */
  async buildIndex(
    graph: CodebaseGraph,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void
  ): Promise<void> {
    this.entries = [];
    this.lexicalIndex = undefined;
    this.startTime = Date.now(); // Reset timer for ETA calculation

    const symbols = this.getIndexableSymbols(graph);
    const totalBatches = Math.ceil(symbols.length / this.batchSize);

    if (this.useWorkers && this.workerPool) {
      // PARALLEL PATH: Use worker threads for 4-8x speedup (Phase 9 Extension)
      await this.buildIndexParallel(symbols, totalBatches, onProgress, graph);
    } else {
      // SEQUENTIAL PATH: Original implementation (fallback)
      await this.buildIndexSequential(symbols, totalBatches, onProgress, graph);
    }
  }

  /**
   * Reconcile a persisted index with a freshly built graph while embedding only
   * symbols whose exact embedding input changed. The stored text is the
   * authority: this also invalidates unchanged-file symbols when their bounded
   * HoloGraph caller/callee/sibling context changed.
   *
   * The old entries stay selected until the complete replacement is ready, so
   * provider failures cannot leave a partially refreshed in-memory index.
   */
  async refreshIndex(
    graph: CodebaseGraph,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void
  ): Promise<EmbeddingRefreshReceipt> {
    const previousEntries = this.entries;
    const previousSymbols = previousEntries.length;
    const reusableByText = new Map<string, IndexedSymbol[]>();
    for (const entry of previousEntries) {
      const bucket = reusableByText.get(entry.text);
      if (bucket) bucket.push(entry);
      else reusableByText.set(entry.text, [entry]);
    }

    const symbols = this.getIndexableSymbols(graph);
    const totalBatches = Math.ceil(symbols.length / this.batchSize);
    const graphTextContext = this.createGraphTextContext(graph);
    const nextEntries: IndexedSymbol[] = [];
    let reusedSymbols = 0;
    let embeddedSymbols = 0;
    this.startTime = Date.now();

    for (let i = 0; i < symbols.length; i += this.batchSize) {
      if (i > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const batchSymbols = symbols.slice(i, i + this.batchSize);
      const batchTexts = this.symbolsToTexts(batchSymbols, graphTextContext);
      const pendingTexts: string[] = [];
      const pendingIndexes: number[] = [];
      const batchEntries = new Array<IndexedSymbol | undefined>(batchSymbols.length);

      for (let index = 0; index < batchTexts.length; index++) {
        const text = batchTexts[index];
        const bucket = reusableByText.get(text);
        const reused = bucket?.pop();
        if (bucket?.length === 0) reusableByText.delete(text);
        if (reused) {
          batchEntries[index] = {
            symbol: batchSymbols[index],
            text,
            embedding: reused.embedding,
          };
          reusedSymbols += 1;
        } else {
          pendingTexts.push(text);
          pendingIndexes.push(index);
        }
      }

      if (pendingTexts.length > 0) {
        const embeddings = await this.getEmbeddings(pendingTexts);
        if (embeddings.length !== pendingTexts.length) {
          throw new Error(
            `Embedding provider returned ${embeddings.length} vectors for ${pendingTexts.length} changed symbols`
          );
        }
        for (let index = 0; index < embeddings.length; index++) {
          const batchIndex = pendingIndexes[index];
          batchEntries[batchIndex] = {
            symbol: batchSymbols[batchIndex],
            text: pendingTexts[index],
            embedding: new Float32Array(embeddings[index]),
          };
        }
        embeddedSymbols += embeddings.length;
      }

      nextEntries.push(...(batchEntries as IndexedSymbol[]));
      onProgress?.(Math.floor(i / this.batchSize) + 1, totalBatches, nextEntries.length);
    }

    this.entries = nextEntries;
    this.lexicalIndex = undefined;
    return {
      kind: 'EmbeddingRefreshReceipt',
      previousSymbols,
      totalSymbols: symbols.length,
      reusedSymbols,
      embeddedSymbols,
      retiredSymbols: Math.max(0, previousSymbols - reusedSymbols),
      reuseRatio:
        symbols.length === 0
          ? 1
          : Math.round((reusedSymbols / symbols.length) * 1_000_000) / 1_000_000,
      batchCount: totalBatches,
    };
  }

  /**
   * Sequential embedding generation (original implementation).
   */
  private async buildIndexSequential(
    symbols: ExternalSymbolDefinition[],
    totalBatches: number,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void,
    graph?: CodebaseGraph
  ): Promise<void> {
    const graphTextContext = this.createGraphTextContext(graph);
    for (let i = 0; i < symbols.length; i += this.batchSize) {
      const batchSymbols = symbols.slice(i, i + this.batchSize);
      const batch = this.symbolsToTexts(batchSymbols, graphTextContext);
      const batchNum = Math.floor(i / this.batchSize) + 1;

      if (batchNum > 1) {
        // Yield to the event loop so setTimeout/signals aren't starved
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const embeddings = await this.getEmbeddings(batch);

      for (let j = 0; j < embeddings.length; j++) {
        this.entries.push({
          symbol: batchSymbols[j],
          text: batch[j],
          embedding: new Float32Array(embeddings[j]),
        });
      }

      // Report progress (Phase 8 Extension) - more frequent for large batches
      onProgress?.(batchNum, totalBatches, this.entries.length);

      // Progress reporting: every batch for first 10, then every 5%, then every 10%
      const shouldReport =
        totalBatches <= 10 ||
        batchNum === 1 ||
        batchNum === totalBatches ||
        (totalBatches > 10 && totalBatches <= 100 && batchNum % 5 === 0) ||
        (totalBatches > 100 && batchNum % 10 === 0);

      if (shouldReport) {
        const percent = Math.round((batchNum / totalBatches) * 100);
        const eta = totalBatches > batchNum ? this.estimateETA(batchNum, totalBatches, i) : 0;
        const etaStr = eta > 0 ? ` ETA: ${Math.round(eta / 60)}m ${eta % 60}s` : '';
        console.error(
          `[EmbeddingIndex] ${percent}% (${batchNum}/${totalBatches} batches, ${this.entries.length} symbols)${etaStr}`
        );
      }
    }
  }

  /**
   * Parallel embedding generation via worker pool (Phase 9 Extension).
   * Processes multiple batches concurrently for 4-8x speedup.
   */
  private async buildIndexParallel(
    symbols: ExternalSymbolDefinition[],
    totalBatches: number,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void,
    graph?: CodebaseGraph
  ): Promise<void> {
    const graphTextContext = this.createGraphTextContext(graph);
    // Serialize provider config for workers
    // @ts-ignore - Automatic remediation for TS2352
    const p = this.provider as Record<string, unknown>;
    const providerConfig = {
      name: this.provider.name,
      config: {
        apiKey: p.apiKey as string | undefined,
        model: p.model as string | undefined,
        ollamaUrl: p.baseUrl as string | undefined,
        ollamaModel: p.model as string | undefined,
        xenovaModel: p.model as string | undefined,
      },
    };

    // Process batches in parallel (concurrentBatches at a time)
    for (let i = 0; i < totalBatches; i += this.concurrentBatches) {
      const batchPromises: Promise<{
        batchIndex: number;
        batchSymbols: ExternalSymbolDefinition[];
        batchTexts: string[];
        embeddings: number[][];
      }>[] = [];

      for (let j = 0; j < this.concurrentBatches && i + j < totalBatches; j++) {
        const batchIndex = i + j;
        const start = batchIndex * this.batchSize;
        const end = Math.min(start + this.batchSize, symbols.length);
        const batchSymbols = symbols.slice(start, end);
        const batch = this.symbolsToTexts(batchSymbols, graphTextContext);

        const promise = this.workerPool!.execute<{
          jobId: string;
          embeddings?: number[][];
          error?: { message: string };
        }>({
          texts: batch,
          provider: providerConfig,
        }).then((result) => {
          if (result.error) {
            throw new Error(result.error.message);
          }
          if (!result.embeddings) {
            throw new Error('Embedding worker returned no embeddings');
          }
          return {
            batchIndex,
            batchSymbols,
            batchTexts: batch,
            embeddings: result.embeddings,
          };
        });

        batchPromises.push(promise);
      }

      // Wait for all concurrent batches to complete
      const results = await Promise.all(batchPromises);

      // Sort results by batch index and add to entries
      results.sort((a, b) => a.batchIndex - b.batchIndex);

      for (const { batchIndex, batchSymbols, batchTexts, embeddings } of results) {
        for (let k = 0; k < embeddings.length; k++) {
          this.entries.push({
            symbol: batchSymbols[k],
            text: batchTexts[k],
            embedding: new Float32Array(embeddings[k]),
          });
        }

        // Report progress for this batch (Phase 8 Extension)
        onProgress?.(batchIndex + 1, totalBatches, this.entries.length);

        if (totalBatches > 5 && (batchIndex + 1) % 10 === 0) {
          console.error(
            `[EmbeddingIndex] batch ${batchIndex + 1}/${totalBatches} (${this.entries.length} symbols indexed) [PARALLEL]`
          );
        }
      }
    }
  }

  /**
   * Search the index for symbols matching a natural language query.
   */
  async search(query: string, topK = 10): Promise<SearchResult[]> {
    if (this.entries.length === 0) return [];

    const [queryEmbedding] = await this.getEmbeddings([query]);
    const queryVec = new Float32Array(queryEmbedding);

    const scored: Array<{ idx: number; score: number }> = [];
    for (let i = 0; i < this.entries.length; i++) {
      const score = this.cosineSimilarity(queryVec, this.entries[i].embedding);
      scored.push({ idx: i, score });
    }

    scored.sort((a, b) => b.score - a.score);

    return this.pickDiverseTopResults(scored, topK).map(({ idx, score }) => ({
      symbol: this.entries[idx].symbol,
      score: Math.round(score * 10000) / 10000,
      file: this.entries[idx].symbol.filePath,
      type: this.entries[idx].symbol.type,
    }));
  }

  /**
   * Search with optional filters (language, type, file path prefix).
   */
  async searchWithFilters(
    query: string,
    topK: number,
    filters?: { language?: string; type?: string; file?: string }
  ): Promise<SearchResult[]> {
    if (this.entries.length === 0) return [];

    const [queryEmbedding] = await this.getEmbeddings([query]);
    const queryVec = new Float32Array(queryEmbedding);

    const scored: Array<{ idx: number; score: number }> = [];
    for (let i = 0; i < this.entries.length; i++) {
      const sym = this.entries[i].symbol;

      // Apply filters
      if (filters?.language && sym.language !== filters.language) continue;
      if (filters?.type && sym.type !== filters.type) continue;
      if (filters?.file && !sym.filePath.includes(filters.file)) continue;

      const score = this.cosineSimilarity(queryVec, this.entries[i].embedding);
      scored.push({ idx: i, score });
    }

    scored.sort((a, b) => b.score - a.score);

    return this.pickDiverseTopResults(scored, topK).map(({ idx, score }) => ({
      symbol: this.entries[idx].symbol,
      score: Math.round(score * 10000) / 10000,
      file: this.entries[idx].symbol.filePath,
      type: this.entries[idx].symbol.type,
    }));
  }

  /**
   * Hybrid retrieval over the same HoloEmbed index.
   *
   * The pure-vector search() methods remain available for honest ablations.
   */
  async searchHybrid(query: string, topK = 10): Promise<SearchResult[]> {
    return this.searchHybridWithFilters(query, topK);
  }

  async searchHybridWithFilters(
    query: string,
    topK: number,
    filters?: { language?: string; type?: string; file?: string }
  ): Promise<SearchResult[]> {
    if (this.entries.length === 0 || topK <= 0) return [];

    const [queryEmbedding] = await this.getEmbeddings([query]);
    const queryVec = new Float32Array(queryEmbedding);
    const lexicalScores = this.getLexicalIndex().score(query);
    const scored: Array<{
      idx: number;
      score: number;
      vectorScore: number;
      lexicalScore: number;
      exactMatch: boolean;
      matchKind: HybridMatchKind;
    }> = [];

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const sym = entry.symbol;
      if (filters?.language && sym.language !== filters.language) continue;
      if (filters?.type && sym.type !== filters.type) continue;
      if (filters?.file && !sym.filePath.includes(filters.file)) continue;

      const vectorScore = this.cosineSimilarity(queryVec, entry.embedding);
      const lexical = lexicalScores.get(i) ?? {
        score: 0,
        exactMatch: false,
        matchKind: 'semantic' as const,
      };
      scored.push({
        idx: i,
        score: fuseHybridScore(vectorScore, lexical.score, lexical.exactMatch),
        vectorScore,
        lexicalScore: lexical.score,
        exactMatch: lexical.exactMatch,
        matchKind: lexical.matchKind,
      });
    }

    scored.sort((a, b) => {
      if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return b.vectorScore - a.vectorScore;
    });

    return this.pickDiverseTopResults(scored, topK).map((item) => {
      const entry = this.entries[item.idx];
      return {
        symbol: entry.symbol,
        score: Math.round(item.score * 10_000) / 10_000,
        file: entry.symbol.filePath,
        type: entry.symbol.type,
        vectorScore: Math.round(item.vectorScore * 10_000) / 10_000,
        lexicalScore: item.lexicalScore,
        exactMatch: item.exactMatch,
        matchKind: item.matchKind,
      };
    });
  }

  /**
   * Add new symbols incrementally (e.g., after change detection).
   */
  async addSymbols(symbols: ExternalSymbolDefinition[], graph?: CodebaseGraph): Promise<void> {
    this.lexicalIndex = undefined;
    const graphTextContext = this.createGraphTextContext(graph);
    const texts = this.symbolsToTexts(symbols, graphTextContext);

    for (let i = 0; i < texts.length; i += this.batchSize) {
      if (i > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const batch = texts.slice(i, i + this.batchSize);
      const embeddings = await this.getEmbeddings(batch);

      for (let j = 0; j < embeddings.length; j++) {
        this.entries.push({
          symbol: symbols[i + j],
          text: batch[j],
          embedding: new Float32Array(embeddings[j]),
        });
      }
    }
  }

  /**
   * Remove symbols by file path (e.g., when a file is deleted or re-scanned).
   */
  removeSymbols(filePath: string): void {
    this.entries = this.entries.filter((e) => e.symbol.filePath !== filePath);
    this.lexicalIndex = undefined;
  }

  /** Number of indexed symbols */
  get size(): number {
    return this.entries.length;
  }

  // ── Serialization ──────────────────────────────────────────────────────

  /**
   * Serialize the index to JSON for persistence.
   * WARNING: For large indexes with high-dimensional embeddings (e.g., OpenAI 1536-dim),
   * this produces very large JSON. Use serializeBinary() instead for disk caching.
   */
  serialize(): string {
    const data: SerializedIndex = {
      version: 1,
      model: this.provider.name,
      entries: this.entries.map((e) => ({
        symbol: e.symbol,
        text: e.text,
        embedding: Array.from(e.embedding),
      })),
    };
    return JSON.stringify(data);
  }

  /**
   * Serialize to a compact binary format for efficient disk caching.
   * Format: [4-byte meta length][JSON metadata][Float32 embeddings buffer]
   *
   * For 84K symbols × 1536-dim OpenAI embeddings:
   *   - JSON serialize: ~1 GB (unusable)
   *   - Binary serialize: ~520 MB metadata + embeddings (fast to load)
   */
  serializeBinary(): Buffer {
    const dimension = this.entries[0]?.embedding.length ?? 0;
    const metadata = {
      version: 2,
      format: 'binary',
      model: this.provider.name,
      dimension,
      count: this.entries.length,
      entries: this.entries.map((e) => ({
        symbol: e.symbol,
        text: e.text,
      })),
    };
    const metaJson = JSON.stringify(metadata);
    const metaBuffer = Buffer.from(metaJson, 'utf-8');

    // Allocate the final payload once. The previous three-buffer path kept the
    // embedding buffer and its Buffer.concat copy live together, adding a full
    // index-sized memory spike at the cache publication boundary.
    const totalFloats = this.entries.length * dimension;
    const output = Buffer.allocUnsafe(4 + metaBuffer.length + totalFloats * 4);
    output.writeUInt32LE(metaBuffer.length, 0);
    metaBuffer.copy(output, 4);
    let offset = 4 + metaBuffer.length;
    for (const entry of this.entries) {
      for (let i = 0; i < entry.embedding.length; i++) {
        output.writeFloatLE(entry.embedding[i], offset);
        offset += 4;
      }
    }
    return output;
  }

  /**
   * Deserialize from binary format.
   */
  static deserializeBinary(buffer: Buffer, options?: EmbeddingIndexOptions): EmbeddingIndex {
    const metaLength = buffer.readUInt32LE(0);
    const metaJson = buffer.subarray(4, 4 + metaLength).toString('utf-8');
    const metadata = JSON.parse(metaJson);

    const index = new EmbeddingIndex(options);
    const dimension = metadata.dimension;
    const count = metadata.entries.length;
    const payloadStart = 4 + metaLength;

    // Fast bulk load: instead of allocating `count` separate Float32Array(dim)
    // objects and reading `count*dim` floats one-by-one (343k allocations +
    // ~264M readFloatLE calls for a whole-monorepo cache — minutes of GC churn
    // and >5 GB peak RSS), copy the entire float payload ONCE into a single
    // contiguous ArrayBuffer and hand each entry a zero-copy `.subarray()` view.
    // The on-disk payload is little-endian (serializeBinary uses writeFloatLE);
    // Node's supported hosts are little-endian, so a direct Float32Array view is
    // correct. The Buffer's byteOffset is not guaranteed 4-aligned, so copy the
    // payload slice into a fresh aligned ArrayBuffer first.
    const payloadBytes = count * dimension * 4;
    const available = buffer.length - payloadStart;
    if (available < payloadBytes) {
      throw new Error(
        `EmbeddingIndex.deserializeBinary: payload truncated (need ${payloadBytes} bytes, have ${available}). Cache is corrupt.`
      );
    }
    const aligned = new ArrayBuffer(payloadBytes);
    new Uint8Array(aligned).set(
      new Uint8Array(buffer.buffer, buffer.byteOffset + payloadStart, payloadBytes)
    );
    const allFloats = new Float32Array(aligned);

    index.entries = metadata.entries.map(
      (e: { symbol: ExternalSymbolDefinition; text: string }, i: number) => ({
        symbol: e.symbol,
        text: e.text,
        // Zero-copy view into the shared contiguous buffer. cosineSimilarity and
        // serializeBinary only read via [i]/.length, so a subarray view is safe.
        embedding: allFloats.subarray(i * dimension, (i + 1) * dimension),
      })
    );

    return index;
  }

  /**
   * Deserialize an index from JSON.
   */
  static deserialize(json: string, options?: EmbeddingIndexOptions): EmbeddingIndex {
    const data: SerializedIndex = JSON.parse(json);
    const index = new EmbeddingIndex(options);

    index.entries = data.entries.map((e) => ({
      symbol: e.symbol,
      text: e.text,
      embedding: new Float32Array(e.embedding),
    }));

    return index;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private startTime = 0;

  private getLexicalIndex(): HybridLexicalIndex {
    if (!this.lexicalIndex) {
      this.lexicalIndex = new HybridLexicalIndex(this.entries);
    }
    return this.lexicalIndex;
  }

  /**
   * Declarations already carry their file path into the index. Files with no
   * parsed declarations need an explicit node or they are invisible to
   * retrieval (common for shell, PowerShell, Markdown, and configuration).
   */
  private getIndexableSymbols(graph: CodebaseGraph): ExternalSymbolDefinition[] {
    const symbols = graph.getAllSymbols();
    if (
      typeof graph.getFilePaths !== 'function' ||
      typeof graph.getSymbolsInFile !== 'function' ||
      typeof graph.getFile !== 'function'
    ) {
      return symbols;
    }

    const fileNodes: ExternalSymbolDefinition[] = [];
    for (const filePath of graph.getFilePaths()) {
      if (graph.getSymbolsInFile(filePath).length > 0) continue;
      const file = graph.getFile(filePath);
      const basename = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
      fileNodes.push({
        name: basename,
        type: 'file',
        language: file?.language ?? 'plaintext',
        visibility: 'internal',
        filePath,
        line: 1,
        column: 0,
        isExported: false,
        signature: `file ${filePath}`,
        docComment: file?.docComment,
        lineCount: file?.loc,
      });
    }

    return fileNodes.length > 0 ? [...symbols, ...fileNodes] : symbols;
  }

  /**
   * Estimate remaining time based on current progress.
   * @returns Estimated seconds remaining
   */
  private estimateETA(
    currentBatch: number,
    totalBatches: number,
    symbolsProcessed: number
  ): number {
    if (!this.startTime) {
      this.startTime = Date.now();
      return 0;
    }

    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    const progress = currentBatch / totalBatches;
    if (progress <= 0) return 0;

    const totalEstimated = elapsed / progress;
    return Math.max(0, Math.round(totalEstimated - elapsed));
  }

  /**
   * Convert a symbol definition to a text representation for embedding.
   * Format: "language type Owner.name(signature) in filepath"
   *
   * When a CodebaseGraph is available, fold a bounded HoloGraph neighborhood
   * into the same text. HoloEmbed's query path embeds text, so graph vocabulary
   * must live in the text channel for NL queries to overlap it.
   */
  private symbolToText(sym: ExternalSymbolDefinition, context?: GraphTextContext): string {
    const parts: string[] = [sym.language, sym.type];

    if (sym.owner) {
      parts.push(`${sym.owner}.${sym.name}`);
    } else {
      parts.push(sym.name);
    }

    if (sym.signature) {
      parts.push(sym.signature);
    }

    parts.push('in', sym.filePath);

    if (sym.docComment) {
      // Include up to 3 lines / 200 chars of doc comment for semantic richness.
      // First-line-only loses too much signal for command-handler vs exporter-parser
      // style discrimination; a short multi-line summary significantly improves
      // OpenAI embedding retrieval quality without bloating batch sizes.
      const snippet = this.textSnippet(sym.docComment, 3, 200);
      if (snippet.length > 0) {
        parts.push('-', snippet);
      }
    }

    this.appendSemanticAliases(parts, sym, context);
    this.appendGraphContext(parts, sym, context);

    return parts.join(' ');
  }

  private symbolsToTexts(
    symbols: ExternalSymbolDefinition[],
    context?: GraphTextContext
  ): string[] {
    return symbols.map((symbol) => this.symbolToText(symbol, context));
  }

  private pickDiverseTopResults<T extends { idx: number; score: number }>(
    scored: T[],
    topK: number
  ): T[] {
    const selected: T[] = [];
    const selectedIndexes = new Set<number>();
    const seenFiles = new Set<string>();

    for (const item of scored) {
      const fileKey = this.fileDiversityKey(this.entries[item.idx].symbol.filePath);
      if (seenFiles.has(fileKey)) continue;
      selected.push(item);
      selectedIndexes.add(item.idx);
      seenFiles.add(fileKey);
      if (selected.length >= topK) return selected;
    }

    for (const item of scored) {
      if (selectedIndexes.has(item.idx)) continue;
      selected.push(item);
      if (selected.length >= topK) return selected;
    }

    return selected;
  }

  private fileDiversityKey(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase();
  }

  private createGraphTextContext(graph?: CodebaseGraph): GraphTextContext | undefined {
    if (!this.hasGraphTextMethods(graph)) return undefined;
    return {
      graph,
      communitiesByFile: new Map(),
      fileDocsByFile: new Map(),
      siblingsByFile: new Map(),
    };
  }

  private hasGraphTextMethods(graph: CodebaseGraph | undefined): graph is CodebaseGraph {
    return (
      typeof graph?.getCommunityForFile === 'function' &&
      typeof graph.getCallersOf === 'function' &&
      typeof graph.getCalleesOf === 'function' &&
      typeof graph.getFile === 'function' &&
      typeof graph.getSymbolsInFile === 'function'
    );
  }

  private appendGraphContext(
    parts: string[],
    sym: ExternalSymbolDefinition,
    context?: GraphTextContext
  ): void {
    if (!context) return;

    const graphTerms: string[] = [];

    if (this.graphTextTerms.community) {
      const community = this.getCommunity(sym.filePath, context);
      if (community && !this.isLowInformationCommunity(community)) {
        graphTerms.push('community', community);
      }
    }

    if (this.graphTextTerms.fileDoc) {
      const fileDoc = this.getFileDoc(sym.filePath, context);
      if (fileDoc) {
        graphTerms.push('file purpose', fileDoc);
      }
    }

    if (this.graphTextTerms.callers) {
      const callers = context.graph.getCallersOf(sym.name, sym.owner).map((call) => call.callerId);
      this.appendLabeledTerms(graphTerms, 'called by', callers);
    }

    if (this.graphTextTerms.callees) {
      const callees = context.graph
        .getCalleesOf(this.symbolCallerId(sym))
        .map((call) =>
          call.calleeOwner ? `${call.calleeOwner}.${call.calleeName}` : call.calleeName
        );
      this.appendLabeledTerms(graphTerms, 'calls', callees);
    }

    if (this.graphTextTerms.siblings) {
      const siblings = this.getSiblings(sym.filePath, context)
        .filter((sibling) => !this.sameSymbol(sym, sibling))
        .map((sibling) => (sibling.owner ? `${sibling.owner}.${sibling.name}` : sibling.name));
      this.appendLabeledTerms(graphTerms, 'file siblings', siblings);
    }

    if (graphTerms.length > 0) {
      parts.push('graph context:', graphTerms.join(' '));
    }
  }

  private appendSemanticAliases(
    parts: string[],
    sym: ExternalSymbolDefinition,
    context?: GraphTextContext
  ): void {
    if (this.isTestFile(sym.filePath)) return;

    const fileDoc = context ? this.getFileDoc(sym.filePath, context) : undefined;
    const haystack = this.normalizedSemanticHaystack(sym, fileDoc);
    const aliases = this.sourceIntentAliases(sym);

    for (const rule of SEMANTIC_ALIAS_RULES) {
      if (rule.triggers.some((trigger) => trigger.test(haystack))) {
        aliases.push(...rule.aliases);
      }
    }

    const uniqueAliases = this.uniqueTerms(aliases);
    if (uniqueAliases.length > 0) {
      parts.push('semantic aliases:', uniqueAliases.join(' '));
    }
  }

  private appendLabeledTerms(target: string[], label: string, terms: string[]): void {
    const cleanTerms = this.uniqueTerms(terms)
      .filter((term) => term.length > 0)
      .slice(0, 6);
    if (cleanTerms.length === 0) return;
    target.push(label, ...cleanTerms);
  }

  private getCommunity(filePath: string, context: GraphTextContext): string | undefined {
    if (!context.communitiesByFile.has(filePath)) {
      context.communitiesByFile.set(filePath, context.graph.getCommunityForFile(filePath));
    }
    return context.communitiesByFile.get(filePath);
  }

  private getFileDoc(filePath: string, context: GraphTextContext): string | undefined {
    if (!context.fileDocsByFile.has(filePath)) {
      const docComment = context.graph.getFile(filePath)?.docComment;
      const snippet = docComment ? this.textSnippet(docComment, 4, 280) : undefined;
      context.fileDocsByFile.set(filePath, snippet && snippet.length > 0 ? snippet : undefined);
    }
    return context.fileDocsByFile.get(filePath);
  }

  private isLowInformationCommunity(community: string): boolean {
    const normalized = community.trim().toLowerCase();
    return normalized === '' || normalized === '.' || normalized === 'root' || normalized === 'src';
  }

  private getSiblings(filePath: string, context: GraphTextContext): ExternalSymbolDefinition[] {
    let siblings = context.siblingsByFile.get(filePath);
    if (!siblings) {
      siblings = context.graph.getSymbolsInFile(filePath);
      context.siblingsByFile.set(filePath, siblings);
    }
    return siblings;
  }

  private symbolCallerId(sym: ExternalSymbolDefinition): string {
    return sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
  }

  private normalizedSemanticHaystack(sym: ExternalSymbolDefinition, fileDoc?: string): string {
    return [
      this.identifierText(sym.name),
      sym.owner ? this.identifierText(sym.owner) : undefined,
      sym.signature ? this.identifierText(sym.signature) : undefined,
      this.identifierText(this.fileStem(sym.filePath)),
      sym.type,
      sym.docComment,
      fileDoc,
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ')
      .toLowerCase();
  }

  private identifierText(text: string): string {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim();
  }

  private fileStem(filePath: string): string {
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    return fileName.replace(/\.[^.]+$/, '');
  }

  private sourceIntentAliases(sym: ExternalSymbolDefinition): string[] {
    const stem = this.fileStem(sym.filePath);
    const aliases: string[] = [];
    for (const rule of SOURCE_INTENT_ALIAS_RULES) {
      if (rule.fileStems.includes(stem)) {
        aliases.push(...rule.aliases);
      }
    }
    return aliases;
  }

  private isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return (
      normalized.includes('/__tests__/') ||
      normalized.includes('/test/') ||
      normalized.includes('/tests/') ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
    );
  }

  private sameSymbol(left: ExternalSymbolDefinition, right: ExternalSymbolDefinition): boolean {
    return (
      left.name === right.name &&
      left.owner === right.owner &&
      left.type === right.type &&
      left.filePath === right.filePath &&
      left.line === right.line
    );
  }

  private uniqueTerms(terms: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const raw of terms) {
      const term = raw.replace(/\s+/g, ' ').trim();
      if (!term || seen.has(term)) continue;
      seen.add(term);
      unique.push(term);
    }
    return unique;
  }

  private textSnippet(text: string, maxLines: number, maxChars: number): string {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, maxLines)
      .join(' ')
      .slice(0, maxChars);
  }

  /** Delegate embedding to the configured provider. */
  private getEmbeddings(texts: string[]): Promise<number[][]> {
    return this.provider.getEmbeddings(texts);
  }

  /**
   * Cosine similarity between two vectors.
   */
  private cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
