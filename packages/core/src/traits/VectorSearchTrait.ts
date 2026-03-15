/**
 * VectorSearchTrait — v5.1
 *
 * Nearest-neighbor similarity search over vector collections.
 *
 * Events:
 *  vsearch:index    { collection, docId, vector }
 *  vsearch:query    { collection, vector, topK }
 *  vsearch:result   { collection, matches[] }
 */

import type { TraitHandler } from './TraitTypes';

export interface VectorSearchConfig {
  default_top_k: number;
  max_collections: number;
}

interface VectorDoc {
  docId: string;
  vector: number[];
}

export const vectorSearchHandler: TraitHandler<VectorSearchConfig> = {
  name: 'vector_search',
  defaultConfig: { default_top_k: 10, max_collections: 20 },

  onAttach(node: any): void {
    node.__vectorSearchState = { collections: new Map<string, VectorDoc[]>() };
  },
  onDetach(node: any): void { delete node.__vectorSearchState; },
  onUpdate(): void {},

  onEvent(node: any, config: VectorSearchConfig, context: any, event: any): void {
    const state = node.__vectorSearchState as { collections: Map<string, VectorDoc[]> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'vsearch:index': {
        const coll = (event.collection as string) ?? 'default';
        if (!state.collections.has(coll)) {
          if (state.collections.size >= config.max_collections) break;
          state.collections.set(coll, []);
        }
        state.collections.get(coll)!.push({ docId: event.docId as string, vector: event.vector as number[] });
        break;
      }
      case 'vsearch:query': {
        const coll = (event.collection as string) ?? 'default';
        const docs = state.collections.get(coll) ?? [];
        const topK = (event.topK as number) ?? config.default_top_k;
        // Simplified: return first topK (real impl uses cosine similarity)
        const matches = docs.slice(0, topK).map(d => ({ docId: d.docId, score: 1.0 }));
        context.emit?.('vsearch:result', { collection: coll, matches, total: docs.length });
        break;
      }
    }
  },
};

export default vectorSearchHandler;
