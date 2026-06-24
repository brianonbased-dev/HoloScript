/**
 * Search Traits
 * @version 1.1.0
 */
export const SEARCH_TRAITS = [
  'full_text_search', // Full-text search indexing and querying
  'faceted_search', // Faceted / filtered search
  'autocomplete', // Typeahead / autocomplete suggestions
  'pattern_match', // Multi-mode pattern matching (regex/glob/semantic/fuzzy) with rule dispatch
] as const;

export type SearchTraitName = (typeof SEARCH_TRAITS)[number];
