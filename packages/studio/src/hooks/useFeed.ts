'use client';

/**
 * useFeed — fetch the public feed of shared worlds (WS-2 sovereign-web
 * consumer loop MVP). Talks to studio's own proxy route (/api/feed), never
 * the mcp-server URL directly -- client components should never need to know
 * the mcp-server's absolute origin.
 */

import { useState, useCallback } from 'react';

export interface FeedScene {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  author?: string;
  thumbnail?: string;
  previewUrl: string;
}

export function useFeed(limit?: number) {
  const [scenes, setScenes] = useState<FeedScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
      const res = await fetch(`/api/feed${query}`);
      const data = (await res.json()) as { scenes?: FeedScene[]; error?: string };
      setScenes(data.scenes ?? []);
      if (!res.ok && data.error) {
        setError(data.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  return { scenes, loading, error, reload };
}
