'use client';

/**
 * useAssetLibrary — fetches and filters the GLTF/HDR asset catalog.
 */

import { useState, useCallback, useEffect } from 'react';
import { handleError } from '@/lib/error';

export type AssetCategory = 'model' | 'hdr' | 'texture' | 'audio';

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  tags: string[];
  thumbnail: string;
  url: string;
  format: string;
  sizeKb: number;
  creator: string;
  license: string;
}

interface AssetPage {
  items: Asset[];
  total: number;
  page: number;
  pages: number;
}

export function useAssetLibrary() {
  const [results, setResults] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AssetCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (q?: string, cat?: AssetCategory | '', pg?: number) => {
      setLoading(true);
      setError(null);
      const nextQ = q ?? query;
      const nextCat = cat !== undefined ? cat : category;
      const nextPg = pg ?? 1;
      try {
        const params = new URLSearchParams();
        if (nextQ) params.set('q', nextQ);
        if (nextCat) params.set('category', nextCat);
        params.set('page', String(nextPg));
        const res = await fetch(`/api/assets?${params}`);
        const data = (await res.json()) as AssetPage;
        setResults(data.items);
        setTotal(data.total);
        setPage(data.page);
        setPages(data.pages);
        setQuery(nextQ);
        setCategory(nextCat);
      } catch (e) {
        handleError('useAssetLibrary:search', e);
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [query, category]
  );

  // Initial load
  useEffect(() => {
    search();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    results,
    total,
    page,
    pages,
    query,
    category,
    loading,
    error,
    search,
    setPage: (p: number) => search(query, category, p),
  };
}
