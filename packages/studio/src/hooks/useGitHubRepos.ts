'use client';

/**
 * useGitHubRepos — Fetch authenticated user's GitHub repos for import wizard.
 *
 * Connection priority:
 *  1. Active GitHub OAuth session (signed in via "Continue with GitHub") — no extra setup needed
 *  2. GitHub connector connected via /integrations connector store
 *
 * Calls GET /api/github/repos which uses the OAuth access token from the session.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
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
  isConnected: boolean;
  connectionError: string | null;
}

export function useGitHubRepos(): UseGitHubReposResult {
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Primary: GitHub OAuth session (signed in with GitHub in Studio)
  const { data: session } = useSession();
  const hasOAuthToken = !!(session?.accessToken);

  // Secondary: manual connector from /integrations
  const githubConnection = useConnectorStore((s) => s.connections.github);
  const connectorConnected = githubConnection?.status === 'connected';

  const isConnected = hasOAuthToken || connectorConnected;
  const connectionError = isConnected ? null : (githubConnection?.lastError ?? null);

  const fetchRepos = useCallback(async () => {
    if (!isConnected) {
      setError('Sign in with GitHub to access your repositories.');
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
