'use client';

/**
 * useExamples — fetches .holo example files from the examples API.
 * Supports search + category filtering.
 */

import { useState, useCallback, useEffect } from 'react';

export interface ExampleFile {
  id: string;
  name: string;
  filename: string;
  category: string;
  description: string;
  sizeBytes: number;
  code: string;
  traits: string[];
}

interface ExamplesResponse {
  examples: ExampleFile[];
  categories: string[];
  total: number;
}

export function useExamples() {
  const [examples, setExamples] = useState<ExampleFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (q?: string, cat?: string) => {
      setLoading(true);
      setError(null);
      const nextQ = q ?? query;
      const nextCat = cat !== undefined ? cat : activeCategory;
      try {
        const params = new URLSearchParams();
        if (nextQ) params.set('q', nextQ);
        if (nextCat) params.set('category', nextCat);
        const res = await fetch(`/api/examples?${params}`);
        const data = (await res.json()) as ExamplesResponse;
        setExamples(data.examples ?? []);
        setCategories(data.categories ?? []);
        setTotal(data.total ?? 0);
        setQuery(nextQ);
        setActiveCategory(nextCat);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load examples');
      } finally {
        setLoading(false);
      }
    },
    [query, activeCategory],
  );

  // Initial load
  useEffect(() => {
    search();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { examples, categories, total, query, activeCategory, loading, error, search };
}
