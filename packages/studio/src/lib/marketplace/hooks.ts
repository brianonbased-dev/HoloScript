/**
 * React hooks for marketplace integration
 * Universal hooks for all HoloScript content types
 */

import { useState, useEffect, useCallback } from 'react';
import { getMarketplaceClient } from './client';
import type {
  MarketplaceItem,
  MarketplaceCategory,
  MarketplaceFilter,
  ContentUpload,
  ContentType,
} from './types';

// ── Browse Content Hook ───────────────────────────────────────────────────

export interface UseMarketplaceResult {
  items: MarketplaceItem[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMarketplace(filter: MarketplaceFilter = {}): UseMarketplaceResult {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(filter.page || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = filter.limit || 20;
  const hasMore = items.length < total;

  const fetchContent = useCallback(
    async (currentPage: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const client = getMarketplaceClient();
        const response = await client.browse({
          ...filter,
          page: currentPage,
          limit,
        });

        if (append) {
          setItems((prev) => [...prev, ...response.data]);
        } else {
          setItems(response.data);
        }

        setTotal(response.total);
        setPage(currentPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    },
    [filter, limit]
  );

  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchContent(page + 1, true);
    }
  }, [loading, hasMore, page, fetchContent]);

  const refresh = useCallback(async () => {
    await fetchContent(1, false);
  }, [fetchContent]);

  useEffect(() => {
    fetchContent(1, false);
  }, [fetchContent]);

  return {
    items,
    total,
    page,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

/**
 * Browse content by specific type
 */
export function useMarketplaceByType(type: ContentType, filter: MarketplaceFilter = {}) {
  return useMarketplace({ ...filter, type });
}

// ── Search Content Hook ───────────────────────────────────────────────────

export function useMarketplaceSearch(query: string, filter: MarketplaceFilter = {}) {
  const [results, setResults] = useState<MarketplaceItem[]>([]);
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
      const response = await client.search(query, filter);
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

// ── Featured Content Hook ─────────────────────────────────────────────────

export function useFeatured(type?: ContentType) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchFeatured() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getFeatured(type);
        if (mounted) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load featured content');
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
  }, [type]);

  return { items, loading, error };
}

// ── Trending Content Hook ─────────────────────────────────────────────────

export function useTrending(limit = 10, type?: ContentType) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchTrending() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getTrending(limit, type);
        if (mounted) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load trending content');
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
  }, [limit, type]);

  return { items, loading, error };
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

// ── Download Content Hook ─────────────────────────────────────────────────

export function useDownload() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (contentId: string) => {
    setDownloading(true);
    setError(null);

    try {
      const client = getMarketplaceClient();
      const content = await client.download(contentId);
      await client.trackDownload(contentId);
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

// ── Upload Content Hook ───────────────────────────────────────────────────

export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (contentData: ContentUpload) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const client = getMarketplaceClient();

      // Simulate progress for UX (real progress would need XMLHttpRequest)
      setProgress(30);

      const result = await client.upload(contentData);

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

export function useFavorites(type?: ContentType) {
  const [favorites, setFavorites] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMarketplaceClient();
      const data = await client.getFavorites(type);
      setFavorites(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  }, [type]);

  const addFavorite = useCallback(
    async (contentId: string) => {
      try {
        const client = getMarketplaceClient();
        await client.addFavorite(contentId);
        await fetchFavorites();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add favorite');
        throw err;
      }
    },
    [fetchFavorites]
  );

  const removeFavorite = useCallback(
    async (contentId: string) => {
      try {
        const client = getMarketplaceClient();
        await client.removeFavorite(contentId);
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
    (contentId: string) => favorites.some((item) => item.id === contentId),
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

// ── Collections Hook ──────────────────────────────────────────────────────

export function useCollections() {
  const [collections, setCollections] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      items: MarketplaceItem[];
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchCollections() {
      try {
        const client = getMarketplaceClient();
        const data = await client.getCollections();
        if (mounted) {
          setCollections(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load collections');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCollections();

    return () => {
      mounted = false;
    };
  }, []);

  return { collections, loading, error };
}
