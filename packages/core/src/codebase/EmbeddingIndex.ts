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
import { BM25EmbeddingProvider } from './providers/BM25EmbeddingProvider';

// =============================================================================
// TYPES
// =============================================================================

export interface EmbeddingIndexOptions {
  /**
   * Embedding provider instance.
   * Defaults to BM25EmbeddingProvider (zero dependencies, always works).
   * Use createEmbeddingProvider() from './providers' to build from config options.
   */
  provider?: EmbeddingProvider;
  /** Batch size for embedding requests (default: 32) */
  batchSize?: number;
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

  constructor(options: EmbeddingIndexOptions = {}) {
    this.provider = options.provider ?? new BM25EmbeddingProvider();
    this.batchSize = options.batchSize ?? 32;
  }

  /**
   * Build the full index from a CodebaseGraph.
   * Iterates all symbols, generates text representations, and embeds them.
   */
  async buildIndex(graph: CodebaseGraph): Promise<void> {
    this.entries = [];

    const symbols = graph.getAllSymbols();
    const texts: string[] = [];
    const symbolRefs: ExternalSymbolDefinition[] = [];

    for (const sym of symbols) {
      const text = this.symbolToText(sym);
      texts.push(text);
      symbolRefs.push(sym);
    }

    // Batch embed — yield to event loop between batches so timers/signals can fire
    const totalBatches = Math.ceil(texts.length / this.batchSize);
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

      if (totalBatches > 5 && batchNum % 10 === 0) {
        console.error(`[EmbeddingIndex] batch ${batchNum}/${totalBatches} (${this.entries.length} symbols indexed)`);
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
