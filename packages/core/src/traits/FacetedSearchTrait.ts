/**
 * FacetedSearchTrait — v5.1
 * Faceted / filtered search.
 */
import type { TraitHandler } from './TraitTypes';
export interface FacetedSearchConfig { max_facets: number; }
export const facetedSearchHandler: TraitHandler<FacetedSearchConfig> = {
  name: 'faceted_search' as any, defaultConfig: { max_facets: 20 },
  onAttach(node: any): void { node.__facetState = { facets: new Map<string, Set<string>>() }; },
  onDetach(node: any): void { delete node.__facetState; },
  onUpdate(): void {},
  onEvent(node: any, _config: FacetedSearchConfig, context: any, event: any): void {
    const state = node.__facetState as { facets: Map<string, Set<string>> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'facet:add': {
        const key = event.facet as string;
        if (!state.facets.has(key)) state.facets.set(key, new Set());
        state.facets.get(key)!.add(event.value as string);
        context.emit?.('facet:added', { facet: key, values: [...state.facets.get(key)!] });
        break;
      }
      case 'facet:filter':
        context.emit?.('facet:filtered', { facets: Object.fromEntries([...state.facets].map(([k, v]) => [k, [...v]])) });
        break;
    }
  },
};
export default facetedSearchHandler;
