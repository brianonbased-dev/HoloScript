/**
 * Search Traits
 * @version 1.0.0
 */
export const SEARCH_TRAITS = [
  'full_text_search',   // Full-text search indexing and querying
  'faceted_search',     // Faceted / filtered search
  'autocomplete',       // Typeahead / autocomplete suggestions
] as const;

export type SearchTraitName = (typeof SEARCH_TRAITS)[number];
