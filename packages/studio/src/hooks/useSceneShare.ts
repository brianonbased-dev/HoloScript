'use client';

/**
 * useSceneShare — publish and browse shared scenes
 */

import { useState, useCallback, useEffect } from 'react';

export interface SharedSceneEntry {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  views: number;
}

export interface UseSceneShareReturn {
  publish: (opts: { name: string; code: string; author?: string }) => Promise<string | null>;
  gallery: SharedSceneEntry[];
  loadGallery: () => Promise<void>;
  shareUrl: string | null;
  publishing: boolean;
  loadingGallery: boolean;
  error: string | null;
  reset: () => void;
}

export function useSceneShare(): UseSceneShareReturn {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [gallery, setGallery] = useState<SharedSceneEntry[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(
    async ({
      name,
      code,
      author = 'Anonymous',
    }: {
      name: string;
      code: string;
      author?: string;
    }): Promise<string | null> => {
      setPublishing(true);
      setError(null);
      setShareUrl(null);

      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code, author }),
        });

        const data = (await res.json()) as { id?: string; url?: string; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

        const url = `${window.location.origin}/shared/${data.id}`;
        setShareUrl(url);
        return url;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Publish failed');
        return null;
      } finally {
        setPublishing(false);
      }
    },
    []
  );

  const loadGallery = useCallback(async () => {
    setLoadingGallery(true);
    setError(null);
    try {
      const res = await fetch('/api/share');
      const data = (await res.json()) as { scenes: SharedSceneEntry[] };
      setGallery(data.scenes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gallery load failed');
    } finally {
      setLoadingGallery(false);
    }
  }, []);

  // Load gallery on first mount
  useEffect(() => { loadGallery(); }, [loadGallery]);

  const reset = useCallback(() => {
    setShareUrl(null);
    setError(null);
  }, []);

  return { publish, gallery, loadGallery, shareUrl, publishing, loadingGallery, error, reset };
}
