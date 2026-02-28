'use client';

/**
 * usePromptLibrary — fetches curated AI prompts from the prompts API.
 */

import { useState, useCallback, useEffect } from 'react';

export interface Prompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export function usePromptLibrary() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(false);

  const search = useCallback(
    async (q?: string, cat?: string) => {
      setLoading(true);
      const nextQ = q ?? query;
      const nextCat = cat !== undefined ? cat : activeCategory;
      try {
        const params = new URLSearchParams();
        if (nextQ) params.set('q', nextQ);
        if (nextCat) params.set('category', nextCat);
        const res = await fetch(`/api/prompts?${params}`);
        const data = await res.json();
        setPrompts(data.prompts ?? []);
        setCategories(data.categories ?? []);
        setTotal(data.total ?? 0);
        setQuery(nextQ);
        setActiveCategory(nextCat);
      } catch {
        setPrompts([]);
      } finally {
        setLoading(false);
      }
    },
    [query, activeCategory],
  );

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { prompts, categories, total, query, activeCategory, loading, search };
}
