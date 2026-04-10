'use client';

/**
 * useAbsorb — Studio's "IntelliSense indexer" hook
 *
 * Equivalent to VS Code indexing the workspace on startup. Calls
 * /api/daemon/absorb to run (or retrieve cached) CodebaseScanner output,
 * and maps the result into CodebaseVisualizationData for the panel.
 *
 * Auto-triggers when projectPath changes (like VS Code re-indexing on folder open).
 * Manual refresh available via refresh().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { handleError } from '@/lib/error';
import type { CodebaseVisualizationData } from '@/components/visualization/CodebaseVisualizationPanel';

// ─── Types from /api/daemon/absorb ────────────────────────────────────────────

interface AbsorbVisualizationNode {
  id: string;
  label: string;
  community: number;
  degree: number;
  inDegree: number;
  outDegree: number;
  loc: number;
}

interface AbsorbVisualizationEdge {
  source: string;
  target: string;
}

export interface AbsorbResult {
  graphJson: string;
  visualization: {
    nodes: AbsorbVisualizationNode[];
    edges: AbsorbVisualizationEdge[];
    communities: Record<string, number>;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      totalImports: number;
      totalLoc: number;
      communityCount: number;
    };
  };
  inDegree: Record<string, number>;
  leafFirstOrder: string[];
  hubFiles: Array<{ path: string; inDegree: number; symbols: number }>;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalImports: number;
    totalLoc: number;
    durationMs: number;
    errors: string[];
    filesByLanguage: Record<string, number>;
    symbolsByType: Record<string, number>;
    totalCalls: number;
  };
  durationMs: number;
  absorbedAt: string;
  projectPath: string;
  depth: 'shallow' | 'medium' | 'deep';
}

interface AbsorbCacheStatus {
  cached: boolean;
  absorbedAt?: string;
  durationMs?: number;
  totalFiles?: number;
  totalSymbols?: number;
  depth?: string;
  projectPath?: string;
  ageMs?: number;
}

export interface UseAbsorbOptions {
  projectPath: string | null;
  depth?: 'shallow' | 'medium' | 'deep';
  /** If true, skip auto-run on mount and only run when refresh() is called */
  manual?: boolean;
}

export interface UseAbsorbResult {
  /** Mapped data ready for CodebaseVisualizationPanel */
  data: CodebaseVisualizationData | null;
  /** Raw absorb result (for impact analysis, leafFirstOrder, hubFiles) */
  absorb: AbsorbResult | null;
  isLoading: boolean;
  error: string | null;
  /** Cache status from last GET check */
  cacheStatus: AbsorbCacheStatus | null;
  /** Leaf-first file order — safest files to touch first */
  leafFirstOrder: string[];
  /** Hub files sorted by in-degree (highest risk to modify) */
  hubFiles: Array<{ path: string; inDegree: number; symbols: number }>;
  /** In-degree map: file → number of files that import it */
  inDegree: Record<string, number>;
  /** Trigger a fresh absorb (force=true bypasses cache) */
  refresh: (force?: boolean) => Promise<void>;
}

// ─── Mapping: AbsorbResult → CodebaseVisualizationData ───────────────────────

function mapToVisualizationData(absorb: AbsorbResult): CodebaseVisualizationData {
  return {
    nodes: absorb.visualization.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      community: n.community,
      degree: n.degree,
    })),
    edges: absorb.visualization.edges.map((e) => ({
      source: e.source,
      target: e.target,
    })),
    communities: absorb.visualization.communities,
    stats: {
      totalFiles: absorb.visualization.stats.totalFiles,
      totalSymbols: absorb.visualization.stats.totalSymbols,
      totalImports: absorb.visualization.stats.totalImports,
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAbsorb({
  projectPath,
  depth = 'medium',
  manual = false,
}: UseAbsorbOptions): UseAbsorbResult {
  const [data, setData] = useState<CodebaseVisualizationData | null>(null);
  const [absorb, setAbsorb] = useState<AbsorbResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<AbsorbCacheStatus | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const runAbsorb = useCallback(
    async (force = false) => {
      if (!projectPath) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/daemon/absorb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath, depth, force }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch((e) => ({ error: res.statusText, _orig: handleError('useAbsorb:res.json', e) }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const result = (await res.json()) as AbsorbResult;
        setAbsorb(result);
        setData(mapToVisualizationData(result));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message ?? 'Absorb failed');
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath, depth]
  );

  const checkCache = useCallback(async () => {
    if (!projectPath) return;
    try {
      const params = new URLSearchParams({ projectPath, depth });
      const res = await fetch(`/api/daemon/absorb?${params.toString()}`);
      if (res.ok) {
        const status = (await res.json()) as AbsorbCacheStatus;
        setCacheStatus(status);
        return status;
      }
    } catch (err) {
      handleError('useAbsorb:checkCache', err);
      // cache check is best-effort
    }
    return null;
  }, [projectPath, depth]);

  // Auto-run: check cache first; only POST if cache is cold or projectPath changed
  useEffect(() => {
    if (!projectPath || manual) return;

    let cancelled = false;

    (async () => {
      const status = await checkCache();
      if (cancelled) return;

      if (status?.cached) {
        // Cache hit — still run POST so we get the full result (route returns cache hit fast)
        await runAbsorb(false);
      } else {
        // Cache miss — full scan
        await runAbsorb(false);
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // Only re-run when projectPath or depth changes — not on every runAbsorb ref change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, depth, manual]);

  return {
    data,
    absorb,
    isLoading,
    error,
    cacheStatus,
    leafFirstOrder: absorb?.leafFirstOrder ?? [],
    hubFiles: absorb?.hubFiles ?? [],
    inDegree: absorb?.inDegree ?? {},
    refresh: runAbsorb,
  };
}
