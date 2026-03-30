/**
 * usePipeline — React hook for pipeline API interaction.
 *
 * Follows the same pattern as useDaemonJobs.ts.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PipelineMode } from '@/lib/recursive/types';

interface PipelineRunInfo {
  id: string;
  mode: string;
  targetProject: string;
  status: string;
  startedAt: string;
}

export function usePipeline() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPipeline = useCallback(async (mode: PipelineMode, targetProject: string) => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, targetProject }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start pipeline');
        return null;
      }
      return data as PipelineRunInfo;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      return null;
    } finally {
      setStarting(false);
    }
  }, []);

  const controlPipeline = useCallback(
    async (
      id: string,
      action: 'pause' | 'resume' | 'stop' | 'approve' | 'reject',
      layerId?: number
    ) => {
      try {
        const res = await fetch(`/api/pipeline/${id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, layerId }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  const listPipelines = useCallback(async (): Promise<PipelineRunInfo[]> => {
    try {
      const res = await fetch('/api/pipeline');
      if (!res.ok) return [];
      const data = await res.json();
      return data.runs ?? [];
    } catch {
      return [];
    }
  }, []);

  return { startPipeline, controlPipeline, listPipelines, starting, error };
}

/**
 * Poll a pipeline run until it completes.
 */
export function usePipelinePoller(pipelineId: string | null, intervalMs = 3000) {
  const [run, setRun] = useState<PipelineRunInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pipelineId) {
      setRun(null);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/pipeline/${pipelineId}`);
        if (res.ok) {
          const data = await res.json();
          setRun(data);
          if (data.status === 'completed' || data.status === 'failed') {
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }
      } catch {
        // Retry on next interval
      }
    };

    void poll();
    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pipelineId, intervalMs]);

  return { run };
}
