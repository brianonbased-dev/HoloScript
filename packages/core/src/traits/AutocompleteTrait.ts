/**
 * AutocompleteTrait — v5.1
 * Typeahead / autocomplete suggestions.
 */
import type { TraitHandler } from './TraitTypes';
export interface AutocompleteConfig { max_suggestions: number; min_chars: number; }
export const autocompleteHandler: TraitHandler<AutocompleteConfig> = {
  name: 'autocomplete' as any, defaultConfig: { max_suggestions: 10, min_chars: 2 },
  onAttach(node: any): void { node.__acState = { terms: [] as string[] }; },
  onDetach(node: any): void { delete node.__acState; },
  onUpdate(): void {},
  onEvent(node: any, config: AutocompleteConfig, context: any, event: any): void {
    const state = node.__acState as { terms: string[] } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'ac:add_term': state.terms.push(event.term as string); context.emit?.('ac:term_added', { term: event.term, total: state.terms.length }); break;
      case 'ac:suggest': {
        const q = ((event.query as string) ?? '').toLowerCase();
        if (q.length < config.min_chars) { context.emit?.('ac:suggestions', { suggestions: [] }); break; }
        const suggestions = state.terms.filter(t => t.toLowerCase().startsWith(q)).slice(0, config.max_suggestions);
        context.emit?.('ac:suggestions', { query: event.query, suggestions });
        break;
      }
    }
  },
};
export default autocompleteHandler;
