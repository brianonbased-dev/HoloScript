/**
 * React hooks for marketplace integration
 */

import { useState, useEffect, useCallback } from 'react';
import { getMarketplaceClient } from './client';
import type {
  MarketplaceTemplate,
  MarketplaceCategory,
  MarketplaceFilter,
  MarketplaceResponse,
  TemplateUpload,
} from './types';

// ── Browse Templates Hook ─────────────────────────────────────────────────

export interface UseMarketplaceTemplatesResult {
  templates: MarketplaceTemplate[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMarketplaceTemplates(
  filter: MarketplaceFilter = {}
): UseMarketplaceTemplatesResult {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(filter.page || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = filter.limit || 20;
  const hasMore = templates.length < total;

  const fetchTemplates = useCallback(
    async (currentPage: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const client = getMarketplaceClient();
        const response = await client.browseTemplates({
          ...filter,
          page: currentPage,
          limit,
        });

        if (append) {
          setTemplates((prev) => [...prev, ...response.data]);
        } else {
          setTemplates(response.data);
        }

        setTotal(response.total);
        setPage(currentPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    },
    [filter, limit]
  );

  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchTemplates(page + 1, true);
    }
  }, [loading, hasMore, page, fetchTemplates]);

  const refresh = useCallback(async () => {
    await fetchTemplates(1, false);
  }, [fetchTemplates]);

  useEffect(() => {
    fetchTemplates(1, false);
  }, [fetchTemplates]);

  return {
    templates,
    total,
    page,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

// ── Search Templates Hook ─────────────────────────────────────────────────

export function useMarketplaceSearch(query: string, filter: MarketplaceFilter = {}) {
  const [results, setResults] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getMarketplaceClient();
      const response = await client.searchTemplates(query, filter);
      setResults(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, filter]);

  useEffect(() => {
    search();
  }, [search]);

  return { results, loading, error, search };
}

// ── Featured Templates Hook ───────────────────────────────────────────────

export function useFeaturedTemplates() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchFeatured() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getFeaturedTemplates();
        if (mounted) {
          setTemplates(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load featured templates');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchFeatured();

    return () => {
      mounted = false;
    };
  }, []);

  return { templates, loading, error };
}

// ── Trending Templates Hook ───────────────────────────────────────────────

export function useTrendingTemplates(limit = 10) {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchTrending() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getTrendingTemplates(limit);
        if (mounted) {
          setTemplates(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load trending templates');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchTrending();

    return () => {
      mounted = false;
    };
  }, [limit]);

  return { templates, loading, error };
}

// ── Categories Hook ───────────────────────────────────────────────────────

export function useMarketplaceCategories() {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchCategories() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getCategories();
        if (mounted) {
          setCategories(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load categories');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCategories();

    return () => {
      mounted = false;
    };
  }, []);

  return { categories, loading, error };
}

// ── Download Template Hook ────────────────────────────────────────────────

export function useTemplateDownload() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (templateId: string) => {
    setDownloading(true);
    setError(null);

    try {
      const client = getMarketplaceClient();
      const content = await client.downloadTemplate(templateId);
      await client.trackDownload(templateId);
      return content;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      throw err;
    } finally {
      setDownloading(false);
    }
  }, []);

  return { download, downloading, error };
}

// ── Upload Template Hook ──────────────────────────────────────────────────

export function useTemplateUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (templateData: TemplateUpload) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const client = getMarketplaceClient();

      // Simulate progress for UX (real progress would need XMLHttpRequest)
      setProgress(30);

      const result = await client.uploadTemplate(templateData);

      setProgress(100);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      throw err;
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  }, []);

  return { upload, uploading, progress, error };
}

// ── Favorites Hook ────────────────────────────────────────────────────────

export function useFavorites() {
  const [favorites, setFavorites] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMarketplaceClient();
      const data = await client.getFavorites();
      setFavorites(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  }, []);

  const addFavorite = useCallback(
    async (templateId: string) => {
      try {
        const client = getMarketplaceClient();
        await client.addFavorite(templateId);
        await fetchFavorites();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add favorite');
        throw err;
      }
    },
    [fetchFavorites]
  );

  const removeFavorite = useCallback(
    async (templateId: string) => {
      try {
        const client = getMarketplaceClient();
        await client.removeFavorite(templateId);
        await fetchFavorites();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove favorite');
        throw err;
      }
    },
    [fetchFavorites]
  );

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorite = useCallback(
    (templateId: string) => favorites.some((t) => t.id === templateId),
    [favorites]
  );

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    isFavorite,
    refresh: fetchFavorites,
  };
}
