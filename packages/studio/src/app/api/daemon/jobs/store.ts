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

export interface CreateDaemonJobInput {
  projectId: string;
  profile: DaemonProfile;
  projectDna: DaemonProjectDNA;
}

const daemonJobs = new Map<string, DaemonJob>();

function nowIso(): string {
  return new Date().toISOString();
}

function simulateDaemonLifecycle(jobId: string): void {
  const queued = daemonJobs.get(jobId);
  if (!queued) return;

  setTimeout(() => {
    const running = daemonJobs.get(jobId);
    if (!running) return;
    daemonJobs.set(jobId, {
      ...running,
      status: 'running',
      progress: 40,
      updatedAt: nowIso(),
    });
  }, 200);

  setTimeout(() => {
    const running = daemonJobs.get(jobId);
    if (!running) return;
    daemonJobs.set(jobId, {
      ...running,
      status: 'completed',
      progress: 100,
      updatedAt: nowIso(),
      summary: 'Legacy-first daemon scan completed with dry-run patch recommendations.',
      metrics: {
        qualityDelta: 0.12,
        filesChanged: running.profile === 'quick' ? 4 : running.profile === 'balanced' ? 9 : 15,
        cycles: running.profile === 'quick' ? 1 : running.profile === 'balanced' ? 2 : 3,
      },
    });
  }, 1200);
}

export function createDaemonJob(input: CreateDaemonJobInput): DaemonJob {
  const id = `dj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const created: DaemonJob = {
    id,
    projectId: input.projectId,
    profile: input.profile,
    projectDna: input.projectDna,
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    progress: 5,
  };

  daemonJobs.set(id, created);
  simulateDaemonLifecycle(id);
  return created;
}

export function listDaemonJobs(): DaemonJob[] {
  return Array.from(daemonJobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDaemonJob(id: string): DaemonJob | null {
  return daemonJobs.get(id) ?? null;
}
