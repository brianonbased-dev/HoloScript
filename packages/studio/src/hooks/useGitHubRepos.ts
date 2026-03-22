'use client';

/**
 * useGitHubRepos — Fetch authenticated user's GitHub repos for import wizard.
 *
 * Now integrates with connectorStore — checks if GitHub is connected via
 * the connector infrastructure. If connected, uses the connector; if not,
 * prompts user to connect via /integrations.
 *
 * Calls GET /api/github/repos with optional search query.
 * Returns typed repo list, loading state, and error.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectorStore } from '@/lib/stores/connectorStore';

export interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  cloneUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  pushedAt: string;
  isPrivate: boolean;
  isFork: boolean;
  sizeKB: number;
}

export interface UseGitHubReposResult {
  repos: GitHubRepoItem[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (q: string) => void;
  refresh: () => Promise<void>;
  isConnected: boolean; // NEW: GitHub connection status
  connectionError: string | null; // NEW: Connection error from store
}

export function useGitHubRepos(): UseGitHubReposResult {
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Check GitHub connection status from connector store
  const githubConnection = useConnectorStore((s) => s.connections.github);
  const isConnected = githubConnection?.status === 'connected';
  const connectionError = githubConnection?.lastError || null;

  const fetchRepos = useCallback(async () => {
    // Don't fetch if not connected
    if (!isConnected) {
      setError('GitHub not connected. Visit /integrations to connect.');
      setRepos([]);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ per_page: '50' });
      if (search) params.set('q', search);

      const res = await fetch(`/api/github/repos?${params}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setRepos(data.repos ?? []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? 'Failed to fetch repos');
    } finally {
      setIsLoading(false);
    }
  }, [search, isConnected]);

  useEffect(() => {
    const timer = setTimeout(fetchRepos, search ? 300 : 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [fetchRepos]);

  return {
    repos,
    isLoading,
    error,
    search,
    setSearch,
    refresh: fetchRepos,
    isConnected,
    connectionError,
  };
}
