import type { SearchResult } from './EmbeddingIndex';

export interface SymbolSearchFilters {
  language?: string;
  type?: string;
  file?: string;
}

/**
 * Search-only contract consumed by GraphRAGEngine.
 *
 * EmbeddingIndex satisfies this interface for symmetric indexes. Two-tower
 * indexes can satisfy it by embedding the query with one model and searching a
 * precomputed symbol/node embedding matrix from another model.
 */
export interface SymbolSearchIndex {
  search(query: string, topK?: number): Promise<SearchResult[]>;
  searchWithFilters(
    query: string,
    topK: number,
    filters?: SymbolSearchFilters
  ): Promise<SearchResult[]>;
  /** Optional exact-name/path + vector fusion used by HoloAbsorb retrieval. */
  searchHybrid?(query: string, topK?: number): Promise<SearchResult[]>;
  /** Filtered counterpart to searchHybrid(). */
  searchHybridWithFilters?(
    query: string,
    topK: number,
    filters?: SymbolSearchFilters
  ): Promise<SearchResult[]>;
}
