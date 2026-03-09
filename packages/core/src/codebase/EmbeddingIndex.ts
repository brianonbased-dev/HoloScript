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

// =============================================================================
// TYPES
// =============================================================================

export interface EmbeddingIndexOptions {
  /** Ollama base URL (default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** Embedding model (default: 'nomic-embed-text') */
  model?: string;
  /** Batch size for embedding requests (default: 32) */
  batchSize?: number;
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
  private ollamaUrl: string;
  private model: string;
  private batchSize: number;

  constructor(options: EmbeddingIndexOptions = {}) {
    this.ollamaUrl = options.ollamaUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'nomic-embed-text';
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

    // Batch embed
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const embeddings = await this.getEmbeddings(batch);

      for (let j = 0; j < embeddings.length; j++) {
        this.entries.push({
          symbol: symbolRefs[i + j],
          text: batch[j],
          embedding: new Float32Array(embeddings[j]),
        });
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
      model: this.model,
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
    const index = new EmbeddingIndex({
      ...options,
      model: options?.model ?? data.model,
    });

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

  /**
   * Call Ollama embeddings API.
   * Processes one at a time since Ollama /api/embeddings takes single prompt.
   */
  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(this.ollamaUrl + '/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama Embeddings API error: ${response.statusText}`);
      }

      const data = await response.json();
      results.push(data.embedding);
    }

    return results;
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
