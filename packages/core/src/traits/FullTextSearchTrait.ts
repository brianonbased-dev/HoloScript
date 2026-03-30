/**
 * FullTextSearchTrait — v5.1
 * Full-text search indexing and querying.
 */
import type { TraitHandler } from './TraitTypes';
export interface FullTextSearchConfig {
  max_results: number;
}
export const fullTextSearchHandler: TraitHandler<FullTextSearchConfig> = {
  name: 'full_text_search',
  defaultConfig: { max_results: 50 },
  onAttach(node: any): void {
    node.__ftsState = { index: new Map<string, string>() };
  },
  onDetach(node: any): void {
    delete node.__ftsState;
  },
  onUpdate(): void {},
  onEvent(node: any, config: FullTextSearchConfig, context: any, event: any): void {
    const state = node.__ftsState as { index: Map<string, string> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'fts:index':
        state.index.set(event.docId as string, (event.content as string) ?? '');
        context.emit?.('fts:indexed', { docId: event.docId, size: state.index.size });
        break;
      case 'fts:search': {
        const q = ((event.query as string) ?? '').toLowerCase();
        const hits: string[] = [];
        for (const [id, content] of state.index) {
          if (content.toLowerCase().includes(q) && hits.length < config.max_results) hits.push(id);
        }
        context.emit?.('fts:results', { query: event.query, hits, total: hits.length });
        break;
      }
    }
  },
};
export default fullTextSearchHandler;
