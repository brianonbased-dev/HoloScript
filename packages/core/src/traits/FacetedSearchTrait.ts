/**
 * FacetedSearchTrait — v5.1
 * Faceted / filtered search.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface FacetedSearchConfig {
  max_facets: number;
}
export const facetedSearchHandler: TraitHandler<FacetedSearchConfig> = {
  name: 'faceted_search',
  defaultConfig: { max_facets: 20 },
  onAttach(node: HSPlusNode): void {
    node.__facetState = { facets: new Map<string, Set<string>>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__facetState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: FacetedSearchConfig, context: TraitContext, event: TraitEvent): void {
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
        context.emit?.('facet:filtered', {
          facets: Object.fromEntries([...state.facets].map(([k, v]) => [k, [...v]])),
        });
        break;
    }
  },
};
export default facetedSearchHandler;
