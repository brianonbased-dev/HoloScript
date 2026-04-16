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
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

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
   * Defaults to OpenAI embeddings (best quality). BM25 is deprecated.
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
   * @deprecated Kept only for backward-compatible deserialize() calls.
   * The provider's own name (provider.name) is now stored in serialised indexes.
   */
  model?: string;
}

export interface IndexedSymbol {
  /** Symbol definition */
  symbol: ExternalSymbolDefinition;
  /** Text representation used for embedding */
  text: string;
  /** Embedding vector */
  embedding: Float32Array;
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

// =============================================================================
// EMBEDDING INDEX
// =============================================================================

export class EmbeddingIndex {
  private entries: IndexedSymbol[] = [];
  private provider: EmbeddingProvider;
  private batchSize: number;
  private useWorkers: boolean;
  private concurrentBatches: number;
  private workerPool?: InstanceType<typeof import('./workers/WorkerPool').WorkerPool>;

  constructor(options: EmbeddingIndexOptions = {}) {
    if (!options.provider) {
      throw new Error('EmbeddingIndex requires an explicit provider. Use createEmbeddingProvider() from providers/EmbeddingProviderFactory.');
    }
    this.provider = options.provider;
    // Increased from 32 to 100 for OpenAI (supports up to 2048)
    // Reduces API calls from 4,062 to 1,300 for 130K symbols
    this.batchSize = options.batchSize ?? (this.provider.name === 'openai' ? 100 : 32);
    this.useWorkers = options.useWorkers !== false && WorkerPool !== null;
    this.concurrentBatches =
      options.concurrentBatches ?? Math.min(4, Math.max(1, os.cpus().length - 2));

    // Initialize worker pool for parallel embedding (Phase 9 Extension)
    if (this.useWorkers && WorkerPool) {
      try {
        const workerFile = path.join(__dirname_esm, 'workers', 'embedding-worker.js');
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
    this.startTime = Date.now(); // Reset timer for ETA calculation

    const symbols = graph.getAllSymbols();
    const texts: string[] = [];
    const symbolRefs: ExternalSymbolDefinition[] = [];

    for (const sym of symbols) {
      const text = this.symbolToText(sym);
      texts.push(text);
      symbolRefs.push(sym);
    }

    const totalBatches = Math.ceil(texts.length / this.batchSize);

    if (this.useWorkers && this.workerPool) {
      // PARALLEL PATH: Use worker threads for 4-8x speedup (Phase 9 Extension)
      await this.buildIndexParallel(texts, symbolRefs, totalBatches, onProgress);
    } else {
      // SEQUENTIAL PATH: Original implementation (fallback)
      await this.buildIndexSequential(texts, symbolRefs, totalBatches, onProgress);
    }
  }

  /**
   * Sequential embedding generation (original implementation).
   */
  private async buildIndexSequential(
    texts: string[],
    symbolRefs: ExternalSymbolDefinition[],
    totalBatches: number,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void
  ): Promise<void> {
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;

      if (batchNum > 1) {
        // Yield to the event loop so setTimeout/signals aren't starved
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const embeddings = await this.getEmbeddings(batch);

      for (let j = 0; j < embeddings.length; j++) {
        this.entries.push({
          symbol: symbolRefs[i + j],
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
    texts: string[],
    symbolRefs: ExternalSymbolDefinition[],
    totalBatches: number,
    onProgress?: (batchNum: number, totalBatches: number, symbolsProcessed: number) => void
  ): Promise<void> {
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
      const batchPromises: Promise<{ batchIndex: number; embeddings: number[][] }>[] = [];

      for (let j = 0; j < this.concurrentBatches && i + j < totalBatches; j++) {
        const batchIndex = i + j;
        const start = batchIndex * this.batchSize;
        const end = Math.min(start + this.batchSize, texts.length);
        const batch = texts.slice(start, end);

        const promise = this.workerPool!
          .execute<{
            jobId: string;
            embeddings?: number[][];
            error?: { message: string };
          }>({
            texts: batch,
            provider: providerConfig,
          })
          .then((result) => {
            if (result.error) {
              throw new Error(result.error.message);
            }
            if (!result.embeddings) {
              throw new Error('Embedding worker returned no embeddings');
            }
            return {
              batchIndex,
              embeddings: result.embeddings,
            };
          });

        batchPromises.push(promise);
      }

      // Wait for all concurrent batches to complete
      const results = await Promise.all(batchPromises);

      // Sort results by batch index and add to entries
      results.sort((a, b) => a.batchIndex - b.batchIndex);

      for (const { batchIndex, embeddings } of results) {
        const start = batchIndex * this.batchSize;

        for (let k = 0; k < embeddings.length; k++) {
          this.entries.push({
            symbol: symbolRefs[start + k],
            text: texts[start + k],
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

    return scored.slice(0, topK).map(({ idx, score }) => ({
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

    return scored.slice(0, topK).map(({ idx, score }) => ({
      symbol: this.entries[idx].symbol,
      score: Math.round(score * 10000) / 10000,
      file: this.entries[idx].symbol.filePath,
      type: this.entries[idx].symbol.type,
    }));
  }

  /**
   * Add new symbols incrementally (e.g., after change detection).
   */
  async addSymbols(symbols: ExternalSymbolDefinition[]): Promise<void> {
    const texts = symbols.map((s) => this.symbolToText(s));

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

    // Concatenate all embeddings into a single Float32Array buffer
    const totalFloats = this.entries.length * dimension;
    const embeddingsBuffer = Buffer.alloc(totalFloats * 4);
    let offset = 0;
    for (const entry of this.entries) {
      for (let i = 0; i < entry.embedding.length; i++) {
        embeddingsBuffer.writeFloatLE(entry.embedding[i], offset);
        offset += 4;
      }
    }

    // Header: 4 bytes for metadata JSON length
    const header = Buffer.alloc(4);
    header.writeUInt32LE(metaBuffer.length);

    return Buffer.concat([header, metaBuffer, embeddingsBuffer]);
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
    let offset = 4 + metaLength;

    index.entries = metadata.entries.map(
      (e: { symbol: ExternalSymbolDefinition; text: string }) => {
        const embedding = new Float32Array(dimension);
        for (let i = 0; i < dimension; i++) {
          embedding[i] = buffer.readFloatLE(offset);
          offset += 4;
        }
        return { symbol: e.symbol, text: e.text, embedding };
      }
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
   */
  private symbolToText(sym: ExternalSymbolDefinition): string {
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
      // Include first line of doc comment for semantic richness
      const firstLine = sym.docComment.split('\n')[0].trim();
      if (firstLine.length > 0) {
        parts.push('-', firstLine);
      }
    }

    return parts.join(' ');
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
