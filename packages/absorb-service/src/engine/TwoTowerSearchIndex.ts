import type { ExternalSymbolDefinition } from './types';
import type { SearchResult } from './EmbeddingIndex';
import type { SymbolSearchFilters, SymbolSearchIndex } from './SearchIndex';
import type { EmbeddingProvider } from './providers/EmbeddingProvider';
import { fuseHybridScore, HybridLexicalIndex } from './HybridRetrieval';

export type TwoTowerScoreMode = 'cosine' | 'dot';

export interface TwoTowerSearchEntry {
  symbol: ExternalSymbolDefinition;
  embedding: ArrayLike<number>;
  text?: string;
  nodeIndex?: number;
}

export interface TwoTowerSearchIndexOptions {
  /** Query-side encoder, for example a frozen HoloDistill M1a student. */
  queryProvider: EmbeddingProvider;
  /**
   * Indexed symbol/node embeddings, for example exported R-GAT node vectors.
   * Each entry is paired to the symbol it retrieves.
   */
  entries: TwoTowerSearchEntry[];
  /** Defaults to cosine for GraphRAG-compatible 0..1-ish scores. */
  scoreMode?: TwoTowerScoreMode;
  /** Stable diagnostic name for manifests and receipts. */
  name?: string;
}

interface StoredTwoTowerEntry {
  symbol: ExternalSymbolDefinition;
  embedding: Float32Array;
  text?: string;
  nodeIndex?: number;
}

/**
 * Explicit two-tower search index.
 *
 * This keeps R-GAT-style retrieval out of the symmetric EmbeddingProvider
 * contract: query text is embedded by a query tower, while indexed symbols are
 * searched from a precomputed node/symbol embedding matrix.
 */
export class TwoTowerSearchIndex implements SymbolSearchIndex {
  readonly name: string;

  private readonly queryProvider: EmbeddingProvider;
  private readonly entries: StoredTwoTowerEntry[];
  private readonly lexicalIndex: HybridLexicalIndex;
  private readonly scoreMode: TwoTowerScoreMode;
  private readonly dimension: number;

  constructor(options: TwoTowerSearchIndexOptions) {
    if (options.entries.length === 0) {
      throw new Error('TwoTowerSearchIndex requires at least one indexed entry.');
    }

    this.queryProvider = options.queryProvider;
    this.scoreMode = options.scoreMode ?? 'cosine';
    this.name = options.name ?? `two-tower:${this.queryProvider.name}`;

    this.entries = options.entries.map((entry, index) => ({
      symbol: entry.symbol,
      embedding: toFloat32Array(entry.embedding, `entries[${index}].embedding`),
      text: entry.text,
      nodeIndex: entry.nodeIndex,
    }));
    this.lexicalIndex = new HybridLexicalIndex(this.entries);

    this.dimension = this.entries[0]!.embedding.length;
    for (let i = 1; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      if (entry.embedding.length !== this.dimension) {
        throw new Error(
          `TwoTowerSearchIndex entry ${i} has dimension ${entry.embedding.length}; expected ${this.dimension}.`
        );
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    return this.searchWithFilters(query, topK);
  }

  async searchWithFilters(
    query: string,
    topK: number,
    filters?: SymbolSearchFilters
  ): Promise<SearchResult[]> {
    if (topK <= 0) return [];

    const queryVec = await this.embedQuery(query);
    const scored: Array<{ entry: StoredTwoTowerEntry; score: number }> = [];

    for (const entry of this.entries) {
      const sym = entry.symbol;
      if (filters?.language && sym.language !== filters.language) continue;
      if (filters?.type && sym.type !== filters.type) continue;
      if (filters?.file && !sym.filePath.includes(filters.file)) continue;

      scored.push({
        entry,
        score:
          this.scoreMode === 'dot'
            ? dotProduct(queryVec, entry.embedding)
            : cosineSimilarity(queryVec, entry.embedding),
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const byFile = a.entry.symbol.filePath.localeCompare(b.entry.symbol.filePath);
      if (byFile !== 0) return byFile;
      return a.entry.symbol.name.localeCompare(b.entry.symbol.name);
    });

    return scored.slice(0, topK).map(({ entry, score }) => ({
      symbol: entry.symbol,
      score: Math.round(score * 10000) / 10000,
      file: entry.symbol.filePath,
      type: entry.symbol.type,
    }));
  }

  async searchHybrid(query: string, topK = 10): Promise<SearchResult[]> {
    return this.searchHybridWithFilters(query, topK);
  }

  async searchHybridWithFilters(
    query: string,
    topK: number,
    filters?: SymbolSearchFilters
  ): Promise<SearchResult[]> {
    if (topK <= 0) return [];

    const queryVec = await this.embedQuery(query);
    const lexicalScores = this.lexicalIndex.score(query);
    const scored = this.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        const sym = entry.symbol;
        if (filters?.language && sym.language !== filters.language) return false;
        if (filters?.type && sym.type !== filters.type) return false;
        if (filters?.file && !sym.filePath.includes(filters.file)) return false;
        return true;
      })
      .map(({ entry, index }) => {
        const vectorScore =
          this.scoreMode === 'dot'
            ? dotProduct(queryVec, entry.embedding)
            : cosineSimilarity(queryVec, entry.embedding);
        const lexical = lexicalScores.get(index) ?? {
          score: 0,
          exactMatch: false,
          matchKind: 'semantic' as const,
        };
        return {
          entry,
          vectorScore,
          lexicalScore: lexical.score,
          exactMatch: lexical.exactMatch,
          matchKind: lexical.matchKind,
          score: fuseHybridScore(vectorScore, lexical.score, lexical.exactMatch),
        };
      });

    scored.sort((a, b) => {
      if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      const byFile = a.entry.symbol.filePath.localeCompare(b.entry.symbol.filePath);
      if (byFile !== 0) return byFile;
      return a.entry.symbol.name.localeCompare(b.entry.symbol.name);
    });

    return scored.slice(0, topK).map((item) => ({
      symbol: item.entry.symbol,
      score: item.score,
      file: item.entry.symbol.filePath,
      type: item.entry.symbol.type,
      vectorScore: Math.round(item.vectorScore * 10_000) / 10_000,
      lexicalScore: item.lexicalScore,
      exactMatch: item.exactMatch,
      matchKind: item.matchKind,
    }));
  }

  private async embedQuery(query: string): Promise<Float32Array> {
    const [embedding] = await this.queryProvider.getEmbeddings([query]);
    if (!embedding) {
      throw new Error('TwoTowerSearchIndex query provider returned no embedding.');
    }

    const queryVec = toFloat32Array(embedding, 'query embedding');
    if (queryVec.length !== this.dimension) {
      throw new Error(
        `TwoTowerSearchIndex query dimension ${queryVec.length} does not match indexed dimension ${this.dimension}.`
      );
    }
    return queryVec;
  }
}

function toFloat32Array(vector: ArrayLike<number>, label: string): Float32Array {
  if (!Number.isInteger(vector.length) || vector.length <= 0) {
    throw new Error(`TwoTowerSearchIndex ${label} must be a non-empty numeric vector.`);
  }

  const out = vector instanceof Float32Array ? vector : new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`TwoTowerSearchIndex ${label} contains a non-finite value at index ${i}.`);
    }
    if (out !== vector) out[i] = value;
  }
  return out;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
