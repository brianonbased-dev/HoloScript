/**
 * HoloScript Marketplace Store
 *
 * Zustand store for managing marketplace state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { FilterState, SearchResult, TraitPackage, TraitCategory, Platform } from '../types';
import { marketplaceApi } from './api';

//=============================================================================
// Filter Store
//=============================================================================

interface FilterStore {
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  setCategory: (category: TraitCategory | null) => void;
  setPlatform: (platform: Platform | null) => void;
  setVerified: (verified: boolean | null) => void;
  setSortBy: (sortBy: FilterState['sortBy']) => void;
  setSortOrder: (sortOrder: FilterState['sortOrder']) => void;
  resetFilters: () => void;
}

const defaultFilters: FilterState = {
  category: null,
  platform: null,
  verified: null,
  sortBy: 'relevance',
  sortOrder: 'desc',
};

export const useFilterStore = create<FilterStore>()(
  devtools(
    (set) => ({
      filters: defaultFilters,

      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),

      setCategory: (category) =>
        set((state) => ({
          filters: { ...state.filters, category },
        })),

      setPlatform: (platform) =>
        set((state) => ({
          filters: { ...state.filters, platform },
        })),

      setVerified: (verified) =>
        set((state) => ({
          filters: { ...state.filters, verified },
        })),

      setSortBy: (sortBy) =>
        set((state) => ({
          filters: { ...state.filters, sortBy },
        })),

      setSortOrder: (sortOrder) =>
        set((state) => ({
          filters: { ...state.filters, sortOrder },
        })),

      resetFilters: () => set({ filters: defaultFilters }),
    }),
    { name: 'marketplace-filters' }
  )
);

//=============================================================================
// Search Store
//=============================================================================

interface SearchStore {
  query: string;
  results: SearchResult | null;
  isSearching: boolean;
  error: string | null;
  page: number;

  setQuery: (query: string) => void;
  setPage: (page: number) => void;
  search: (query: string, filters: FilterState) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchStore>()(
  devtools(
    (set, get) => ({
      query: '',
      results: null,
      isSearching: false,
      error: null,
      page: 1,

      setQuery: (query) => set({ query }),

      setPage: (page) => set({ page }),

      search: async (query, filters) => {
        set({ isSearching: true, error: null });

        try {
          const results = await marketplaceApi.traits.search({
            q: query || undefined,
            category: filters.category || undefined,
            platform: filters.platform || undefined,
            verified: filters.verified ?? undefined,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder,
            page: get().page,
            limit: 20,
          });

          set({ results, isSearching: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Search failed',
            isSearching: false,
          });
        }
      },

      clearResults: () => set({ results: null, error: null }),
    }),
    { name: 'marketplace-search' }
  )
);

//=============================================================================
// Trait Detail Store
//=============================================================================

interface TraitDetailStore {
  trait: TraitPackage | null;
  versions: Array<{ version: string; publishedAt: Date; downloads: number }>;
  selectedVersion: string | null;
  isLoading: boolean;
  error: string | null;

  loadTrait: (id: string, version?: string) => Promise<void>;
  loadVersions: (id: string) => Promise<void>;
  selectVersion: (version: string) => void;
  clear: () => void;
}

export const useTraitDetailStore = create<TraitDetailStore>()(
  devtools(
    (set) => ({
      trait: null,
      versions: [],
      selectedVersion: null,
      isLoading: false,
      error: null,

      loadTrait: async (id, version) => {
        set({ isLoading: true, error: null });

        try {
          const trait = await marketplaceApi.traits.getTrait(id, version);
          set({
            trait,
            selectedVersion: trait.version,
            isLoading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to load trait',
            isLoading: false,
          });
        }
      },

      loadVersions: async (id) => {
        try {
          const versions = await marketplaceApi.traits.getVersions(id);
          set({ versions });
        } catch {
          // Versions are optional, don't set error
        }
      },

      selectVersion: (version) => set({ selectedVersion: version }),

      clear: () =>
        set({
          trait: null,
          versions: [],
          selectedVersion: null,
          error: null,
        }),
    }),
    { name: 'marketplace-trait-detail' }
  )
);

//=============================================================================
// Install Store
//=============================================================================

interface InstallStore {
  installing: Set<string>;
  installed: Set<string>;
  errors: Map<string, string>;

  install: (traitId: string, version: string) => Promise<boolean>;
  uninstall: (traitId: string) => Promise<boolean>;
  isInstalling: (traitId: string) => boolean;
  isInstalled: (traitId: string) => boolean;
  getError: (traitId: string) => string | undefined;
  clearError: (traitId: string) => void;
}

export const useInstallStore = create<InstallStore>()(
  devtools(
    (set, get) => ({
      installing: new Set(),
      installed: new Set(),
      errors: new Map(),

      install: async (traitId, version) => {
        const state = get();

        // Already installing
        if (state.installing.has(traitId)) {
          return false;
        }

        // Update installing state
        set((s) => ({
          installing: new Set([...s.installing, traitId]),
          errors: new Map([...s.errors].filter(([k]) => k !== traitId)),
        }));

        try {
          // Record download on server
          await marketplaceApi.traits.recordDownload(traitId, version);

          // In a real implementation, this would trigger VS Code
          // to install the trait via the extension host

          set((s) => ({
            installing: new Set([...s.installing].filter((id) => id !== traitId)),
            installed: new Set([...s.installed, traitId]),
          }));

          return true;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Install failed';

          set((s) => ({
            installing: new Set([...s.installing].filter((id) => id !== traitId)),
            errors: new Map([...s.errors, [traitId, errorMessage]]),
          }));

          return false;
        }
      },

      uninstall: async (traitId) => {
        try {
          // In a real implementation, this would trigger VS Code
          // to uninstall the trait

          set((s) => ({
            installed: new Set([...s.installed].filter((id) => id !== traitId)),
          }));

          return true;
        } catch {
          return false;
        }
      },

      isInstalling: (traitId) => get().installing.has(traitId),
      isInstalled: (traitId) => get().installed.has(traitId),
      getError: (traitId) => get().errors.get(traitId),
      clearError: (traitId) =>
        set((s) => ({
          errors: new Map([...s.errors].filter(([k]) => k !== traitId)),
        })),
    }),
    { name: 'marketplace-install' }
  )
);

//=============================================================================
// Combined Hooks
//=============================================================================

/**
 * Hook to perform a search with current filters
 */
export function useMarketplaceSearch() {
  const { query, results, isSearching, error, setQuery, search, clearResults } = useSearchStore();
  const { filters, resetFilters } = useFilterStore();

  const performSearch = async (newQuery?: string) => {
    const q = newQuery ?? query;
    if (newQuery !== undefined) {
      setQuery(newQuery);
    }
    await search(q, filters);
  };

  return {
    query,
    results,
    isSearching,
    error,
    filters,
    setQuery,
    performSearch,
    clearResults,
    resetFilters,
  };
}

/**
 * Hook for trait detail page
 */
export function useTraitDetail(traitId: string) {
  const store = useTraitDetailStore();
  const installStore = useInstallStore();

  return {
    trait: store.trait,
    versions: store.versions,
    selectedVersion: store.selectedVersion,
    isLoading: store.isLoading,
    error: store.error,
    loadTrait: () => store.loadTrait(traitId),
    loadVersions: () => store.loadVersions(traitId),
    selectVersion: store.selectVersion,
    isInstalled: installStore.isInstalled(traitId),
    isInstalling: installStore.isInstalling(traitId),
    install: (version: string) => installStore.install(traitId, version),
  };
}
