'use client';

import { useState, useMemo, useCallback } from 'react';
import { SCENARIOS, type ScenarioEntry, type ScenarioCategory } from '@/components/scenarios/ScenarioGallery';

// ─── Types ──────────────────────────────────────────────────────

export type SortField = 'name' | 'testCount' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface UseScenarioListOptions {
  /** Initial search query. */
  initialSearch?: string;
  /** Initial category filter. */
  initialCategory?: ScenarioCategory | 'all';
  /** Initial sort field. */
  initialSort?: SortField;
  /** Initial sort direction. */
  initialSortDirection?: SortDirection;
}

export interface UseScenarioListReturn {
  /** Filtered and sorted scenario list. */
  scenarios: ScenarioEntry[];
  /** All available scenarios (unfiltered). */
  allScenarios: ScenarioEntry[];
  /** Current search query. */
  search: string;
  /** Update search query. */
  setSearch: (q: string) => void;
  /** Current category filter. */
  category: ScenarioCategory | 'all';
  /** Update category filter. */
  setCategory: (c: ScenarioCategory | 'all') => void;
  /** Current sort field. */
  sortField: SortField;
  /** Update sort field. */
  setSortField: (f: SortField) => void;
  /** Current sort direction. */
  sortDirection: SortDirection;
  /** Toggle sort direction. */
  toggleSortDirection: () => void;
  /** Number of results after filtering. */
  resultCount: number;
  /** Total number of scenarios. */
  totalCount: number;
  /** Aggregate test count across filtered results. */
  filteredTestCount: number;
  /** Aggregate test count across all scenarios. */
  totalTestCount: number;
  /** Category breakdown counts for the filter bar. */
  categoryCounts: Record<ScenarioCategory | 'all', number>;
  /** Reset all filters to defaults. */
  resetFilters: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────

/**
 * useScenarioList -- Manages filtering, searching, and sorting of the scenario registry.
 *
 * Provides a complete state management layer for the ScenarioGallery and any
 * alternative scenario browsing views. All operations are memoized for performance.
 *
 * @example
 * ```tsx
 * const { scenarios, search, setSearch, category, setCategory } = useScenarioList();
 * ```
 */
export function useScenarioList(options: UseScenarioListOptions = {}): UseScenarioListReturn {
  const {
    initialSearch = '',
    initialCategory = 'all',
    initialSort = 'name',
    initialSortDirection = 'asc',
  } = options;

  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState<ScenarioCategory | 'all'>(initialCategory);
  const [sortField, setSortField] = useState<SortField>(initialSort);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);

  // Category breakdown
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: SCENARIOS.length };
    for (const s of SCENARIOS) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts as Record<ScenarioCategory | 'all', number>;
  }, []);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SCENARIOS.filter((s) => {
      const matchesCategory = category === 'all' || s.category === category;
      if (!matchesCategory) return false;
      if (q === '') return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.engine.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'testCount':
          return (a.testCount - b.testCount) * dir;
        case 'category':
          return a.category.localeCompare(b.category) * dir;
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortField, sortDirection]);

  const totalTestCount = useMemo(() => SCENARIOS.reduce((sum, s) => sum + s.testCount, 0), []);
  const filteredTestCount = useMemo(() => sorted.reduce((sum, s) => sum + s.testCount, 0), [sorted]);

  const toggleSortDirection = useCallback(() => {
    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch(initialSearch);
    setCategory(initialCategory);
    setSortField(initialSort);
    setSortDirection(initialSortDirection);
  }, [initialSearch, initialCategory, initialSort, initialSortDirection]);

  return {
    scenarios: sorted,
    allScenarios: SCENARIOS,
    search,
    setSearch,
    category,
    setCategory,
    sortField,
    setSortField,
    sortDirection,
    toggleSortDirection,
    resultCount: sorted.length,
    totalCount: SCENARIOS.length,
    filteredTestCount,
    totalTestCount,
    categoryCounts,
    resetFilters,
  };
}
