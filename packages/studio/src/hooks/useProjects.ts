'use client';

/**
 * useProjects — server-backed project list for the authenticated user.
 *
 * Talks to /api/projects (GET/POST/DELETE), which is scoped to
 * session.user.id and persisted in the Postgres `projects` table. Replaces the
 * dead browser-IndexedDB path (`@/lib/storage`) that nothing ever wrote to.
 *
 * The server reconciles client string-ids vs the uuid PK: a freshly-created
 * project comes back with the canonical uuid in `project.id`, which callers
 * should adopt for subsequent saves (passing it back as `id` performs an
 * owner-scoped upsert).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Present only on single-project fetch / create / save responses. */
  code?: string;
}

export interface SaveProjectInput {
  /** Pass the canonical uuid to update an existing project; omit to create. */
  id?: string;
  name: string;
  code?: string;
  description?: string;
  slug?: string;
  visibility?: 'private' | 'public';
  metadata?: Record<string, unknown>;
}

export interface UseProjectsResult {
  projects: ProjectSummary[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  saveProject: (input: SaveProjectInput) => Promise<ProjectSummary | null>;
  loadProject: (id: string) => Promise<ProjectSummary | null>;
  deleteProject: (id: string) => Promise<boolean>;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useProjects(): UseProjectsResult {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setProjects([]);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', { signal: ac.signal });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { projects: ProjectSummary[] };
      setProjects(data.projects ?? []);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const saveProject = useCallback(
    async (input: SaveProjectInput): Promise<ProjectSummary | null> => {
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          setError(await readError(res));
          return null;
        }
        const data = (await res.json()) as { project: ProjectSummary };
        await refresh();
        return data.project;
      } catch (err) {
        setError((err as Error).message);
        return null;
      }
    },
    [refresh]
  );

  const loadProject = useCallback(async (id: string): Promise<ProjectSummary | null> => {
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError(await readError(res));
        return null;
      }
      const data = (await res.json()) as { project: ProjectSummary };
      return data.project;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          setError(await readError(res));
          return false;
        }
        await refresh();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [refresh]
  );

  return {
    projects,
    isLoading,
    error,
    isAuthenticated,
    refresh,
    saveProject,
    loadProject,
    deleteProject,
  };
}
