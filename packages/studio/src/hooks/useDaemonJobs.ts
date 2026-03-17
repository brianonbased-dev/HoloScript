'use client';

import { useCallback, useState } from 'react';

export type DaemonProjectKind = 'service' | 'data' | 'frontend' | 'spatial' | 'automation' | 'unknown';
export type DaemonProfile = 'quick' | 'balanced' | 'deep';
export type DaemonJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface DaemonProjectDNA {
  kind: DaemonProjectKind;
  confidence: number;
  detectedStack: string[];
  recommendedProfile: DaemonProfile;
  notes: string[];
}

export interface DaemonJob {
  id: string;
  projectId: string;
  profile: DaemonProfile;
  projectDna: DaemonProjectDNA;
  status: DaemonJobStatus;
  createdAt: string;
  updatedAt: string;
  progress: number;
  summary?: string;
  metrics?: {
    qualityDelta: number;
    filesChanged: number;
    cycles: number;
  };
}

interface CreateJobInput {
  projectId: string;
  profile: DaemonProfile;
  projectDna: DaemonProjectDNA;
}

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

  return { createJob, getJob, creating, error };
}
