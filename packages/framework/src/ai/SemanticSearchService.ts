/**
 * SemanticSearchService
 *
 * Provides vector-based search for HoloScript traits.
 */

import type { AIAdapter } from './AIAdapter';

export interface SearchResult<T> {
  item: T;
  score: number;
}

export class SemanticSearchService<T extends { name: string; description: string }> {
  private adapter: AIAdapter;
  private items: T[];
  private embeddings: Map<string, number[]> = new Map();

  constructor(adapter: AIAdapter, items: T[]) {
    this.adapter = adapter;
    this.items = items;
  }

  /**
   * Pre-calculate embeddings for all items
   */
  async initialize(): Promise<void> {
    if (!this.adapter.getEmbeddings) {
      throw new Error(`AI Adapter ${this.adapter.name} does not support embeddings.`);
    }

    const texts = this.items.map((item) => `${item.name}: ${item.description}`);
    const embeddings = await this.adapter.getEmbeddings(texts);

    this.items.forEach((item, i) => {
      this.embeddings.set(item.name, embeddings[i]);
    });
  }

  /**
   * Search for items similar to the query
   */
  async search(query: string, limit: number = 5): Promise<SearchResult<T>[]> {
    if (!this.adapter.getEmbeddings) {
      throw new Error(`AI Adapter ${this.adapter.name} does not support embeddings.`);
    }

    const [queryEmbedding] = await this.adapter.getEmbeddings(query);

    const results: SearchResult<T>[] = this.items.map((item) => {
      const itemEmbedding = this.embeddings.get(item.name);
      if (!itemEmbedding) return { item, score: 0 };

      return {
        item,
        score: this.cosineSimilarity(queryEmbedding, itemEmbedding),
      };
    });

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
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
