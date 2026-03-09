'use client';

/**
 * usePolyHaven — fetches and browses assets from the Poly Haven API proxy.
 * Supports models, HDRIs, and textures with search + pagination.
 */

import { useState, useCallback, useEffect } from 'react';

export type PolyHavenType = 'models' | 'hdris' | 'textures';

export interface PolyHavenAsset {
  id: string;
  name: string;
  type: 'model' | 'hdri' | 'texture';
  tags: string[];
  categories: string[];
  thumbnail: string;
  downloadUrl: string;
  authors: string[];
  license: string;
}

interface PolyHavenPage {
  items: PolyHavenAsset[];
  total: number;
  page: number;
  pages: number;
  type: string;
}

export function usePolyHaven() {
  const [results, setResults] = useState<PolyHavenAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [pages, setPages] = useState(1);
  const [assetType, setAssetType] = useState<PolyHavenType>('models');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (q?: string, type?: PolyHavenType, pg?: number) => {
      setLoading(true);
      setError(null);
      const nextQ = q ?? query;
      const nextType = type ?? assetType;
      const nextPg = pg ?? 1;
      try {
        const params = new URLSearchParams();
        params.set('type', nextType);
        if (nextQ) params.set('q', nextQ);
        params.set('page', String(nextPg));
        params.set('pageSize', '20');
        const res = await fetch(`/api/polyhaven?${params}`);
        const data = (await res.json()) as PolyHavenPage;
        setResults(data.items ?? []);
        setTotal(data.total ?? 0);
        setPageState(data.page ?? 1);
        setPages(data.pages ?? 1);
        setQuery(nextQ);
        setAssetType(nextType);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load Poly Haven assets');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [query, assetType]
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
    assetType,
    query,
    loading,
    error,
    search,
    setPage: (p: number) => search(query, assetType, p),
    setType: (t: PolyHavenType) => search(query, t, 1),
  };
}
