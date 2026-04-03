// @ts-nocheck
/**
 * templateSearch.ts — Template Search Engine
 *
 * Fuzzy search, scoring, and filtering for studio templates.
 */

// Re-export scene template search utilities
export * from './scene/templateSearch';

import { STUDIO_TEMPLATES, type StudioTemplate, type TemplateCategory } from './sceneTemplates';

export interface SearchResult {
  template: StudioTemplate;
  score: number; // 0..1 relevance score
  matchedFields: string[];
}

export interface SearchFilters {
  category?: TemplateCategory;
  difficulty?: StudioTemplate['difficulty'];
  minObjects?: number;
  maxObjects?: number;
  tags?: string[];
}

/**
 * Fuzzy search templates with scoring.
 */
export function fuzzySearch(query: string, filters?: SearchFilters): SearchResult[] {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  let candidates = STUDIO_TEMPLATES;

  if (filters?.category) candidates = candidates.filter((t) => t.category === filters.category);
  if (filters?.difficulty) {
    candidates = candidates.filter((t) => t.difficulty === filters.difficulty);
  }
  if (filters?.minObjects !== undefined) {
    candidates = candidates.filter((t) => t.estimatedObjects >= filters.minObjects);
  }
  if (filters?.maxObjects !== undefined) {
    candidates = candidates.filter((t) => t.estimatedObjects <= filters.maxObjects);
  }
  if (filters?.tags?.length) {
    candidates = candidates.filter((t) => filters.tags!.some((ft) => t.tags.includes(ft)));
  }

  if (words.length === 0) {
    return candidates.map((t) => ({ template: t, score: 1, matchedFields: [] }));
  }

  const results: SearchResult[] = [];

  for (const template of candidates) {
    let score = 0;
    const matched: string[] = [];

    for (const word of words) {
      if (template.name.toLowerCase().includes(word)) {
        score += 0.4;
        matched.push('name');
      }
      if (template.description.toLowerCase().includes(word)) {
        score += 0.2;
        matched.push('description');
      }
      if (template.category.includes(word)) {
        score += 0.15;
        matched.push('category');
      }
      if (template.tags.some((tag) => tag.includes(word))) {
        score += 0.15;
        matched.push('tags');
      }
      if (template.holoScript.toLowerCase().includes(word)) {
        score += 0.1;
        matched.push('code');
      }
    }

    score = Math.min(1, score / words.length);

    if (score > 0) {
      results.push({ template, score, matchedFields: [...new Set(matched)] });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Get autocomplete suggestions for a partial query.
 */
export function autocompleteSuggestions(partial: string, maxResults: number = 5): string[] {
  const p = partial.toLowerCase();
  const suggestions = new Set<string>();

  for (const template of STUDIO_TEMPLATES) {
    if (template.name.toLowerCase().startsWith(p)) suggestions.add(template.name);
    for (const tag of template.tags) {
      if (tag.startsWith(p)) suggestions.add(tag);
    }
    if (suggestions.size >= maxResults) break;
  }

  return [...suggestions].slice(0, maxResults);
}

/**
 * Get popular tags across all templates.
 */
export function popularTags(limit: number = 10): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const template of STUDIO_TEMPLATES) {
    for (const tag of template.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
