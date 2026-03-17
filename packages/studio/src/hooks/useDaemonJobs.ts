'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DaemonJob,
  DaemonLogEntry,
  DaemonProfile,
  DaemonProjectDNA,
  PatchProposal,
} from '@/lib/daemon/types';

export type {
  DaemonJob,
  DaemonLogEntry,
  DaemonProfile,
  DaemonProjectDNA,
  PatchProposal,
} from '@/lib/daemon/types';

interface CreateJobInput {
  projectId: string;
  profile: DaemonProfile;
  projectDna: DaemonProjectDNA;
  projectPath?: string;
}

// ---------------------------------------------------------------------------
// Hook: useDaemonJobs
// ---------------------------------------------------------------------------

export function useDaemonJobs() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createJob = useCallback(async (input: CreateJobInput): Promise<DaemonJob> => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/daemon/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      const json = (await response.json()) as { job?: DaemonJob; error?: string };
      if (!response.ok || !json.job) {
        throw new Error(json.error || `Daemon job create failed (${response.status})`);
      }
      return json.job;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  const getJob = useCallback(async (id: string): Promise<DaemonJob> => {
    const response = await fetch(`/api/daemon/jobs/${id}`);
    const json = (await response.json()) as { job?: DaemonJob; error?: string };
    if (!response.ok || !json.job) {
      throw new Error(json.error || `Daemon job fetch failed (${response.status})`);
    }
    return json.job;
  }, []);

  const getPatches = useCallback(async (jobId: string): Promise<PatchProposal[]> => {
    const response = await fetch(`/api/daemon/jobs/${jobId}?view=patches`);
    const json = (await response.json()) as { patches?: PatchProposal[]; error?: string };
    if (!response.ok) {
      throw new Error(json.error || `Fetch patches failed (${response.status})`);
    }
    return json.patches ?? [];
  }, []);

  const getLogs = useCallback(async (jobId: string): Promise<DaemonLogEntry[]> => {
    const response = await fetch(`/api/daemon/jobs/${jobId}?view=logs`);
    const json = (await response.json()) as { logs?: DaemonLogEntry[]; error?: string };
    if (!response.ok) {
      throw new Error(json.error || `Fetch logs failed (${response.status})`);
    }
    return json.logs ?? [];
  }, []);

  const recordPatchAction = useCallback(async (
    jobId: string,
    patchIds: string[],
    action: 'apply' | 'export' | 'reject',
  ): Promise<void> => {
    await fetch(`/api/daemon/jobs/${jobId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, patchIds }),
    });
  }, []);

  return { createJob, getJob, getPatches, getLogs, recordPatchAction, creating, error };
}

// ---------------------------------------------------------------------------
// Hook: useDaemonJobPoller — polls a job until completed/failed
// ---------------------------------------------------------------------------

export function useDaemonJobPoller(jobId: string | null, intervalMs = 2000) {
  const [job, setJob] = useState<DaemonJob | null>(null);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { getJob } = useDaemonJobs();

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    setPolling(true);

    const poll = async () => {
      try {
        const fetched = await getJob(jobId);
        setJob(fetched);
        if (fetched.status === 'completed' || fetched.status === 'failed') {
          setPolling(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch {
        // Retry on next interval
      }
    };

    void poll();
    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [jobId, intervalMs, getJob]);

  return { job, polling };
}
