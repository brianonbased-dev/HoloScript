/**
 * IndexTrait — v5.1
 *
 * Secondary index for fast lookups by field value.
 *
 * Events:
 *  index:add      { indexName, key, docId }
 *  index:remove   { indexName, key, docId }
 *  index:lookup   { indexName, key }
 *  index:result   { indexName, key, docIds[] }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface IndexConfig {
  max_indices: number;
}

export interface IndexState {
  indices: Map<string, Map<string, Set<string>>>;
}

export const indexHandler: TraitHandler<IndexConfig> = {
  name: 'index',
  defaultConfig: { max_indices: 50 },

  onAttach(node: any): void {
    node.__indexState = { indices: new Map() } as IndexState;
  },
  onDetach(node: any): void { delete node.__indexState; },
  onUpdate(): void {},

  onEvent(node: any, config: IndexConfig, context: any, event: any): void {
    const state: IndexState | undefined = node.__indexState;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'index:add': {
        const name = event.indexName as string;
        if (!name) break;
        if (!state.indices.has(name)) {
          if (state.indices.size >= config.max_indices) break;
          state.indices.set(name, new Map());
        }
        const idx = state.indices.get(name)!;
        const key = String(event.key ?? '');
        if (!idx.has(key)) idx.set(key, new Set());
        idx.get(key)!.add(event.docId as string);
        break;
      }
      case 'index:remove': {
        const idx = state.indices.get(event.indexName as string);
        if (!idx) break;
        const set = idx.get(String(event.key ?? ''));
        set?.delete(event.docId as string);
        break;
      }
      case 'index:lookup': {
        const idx = state.indices.get(event.indexName as string);
        const key = String(event.key ?? '');
        const docIds = idx?.get(key) ? [...idx.get(key)!] : [];
        context.emit?.('index:result', { indexName: event.indexName, key, docIds });
        break;
      }
    }
  },
};

export default indexHandler;
