/**
 * Daemon Job Store -- Persists job state, logs, metrics, and patch proposals.
 *
 * Replaces the former simulated lifecycle with real daemon execution via
 * the DaemonRunner. Jobs run in isolated workspace directories and produce
 * concrete patch proposals that users can review and apply through Studio.
 */

import { runDaemonJob, type AbsorbGraphData } from './runner';
import { buildDaemonPlan, projectDNAFromLegacySignals } from '@/lib/daemon/profilePlanner';
import type {
  CreateDaemonJobInput,
  DaemonAbsorbSnapshot,
  DaemonJob,
  DaemonJobLimits,
  DaemonLogEntry,
  DaemonProfile,
  DaemonProjectDNA,
  DaemonTelemetryEvent,
  DaemonTelemetrySummary,
  PatchProposal,
} from '@/lib/daemon/types';

export type { CreateDaemonJobInput } from '@/lib/daemon/types';

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

const daemonJobs = new Map<string, DaemonJob>();
const telemetryLog: DaemonTelemetryEvent[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function emitTelemetry(event: DaemonTelemetryEvent): void {
  telemetryLog.push(event);
  if (telemetryLog.length > 1000) {
    telemetryLog.splice(0, telemetryLog.length - 1000);
  }
}

// ---------------------------------------------------------------------------
// Real Daemon Execution
// ---------------------------------------------------------------------------

async function executeDaemonJob(jobId: string): Promise<void> {
  const job = daemonJobs.get(jobId);
  if (!job) return;

  const now = nowIso();
  daemonJobs.set(jobId, {
    ...job,
    status: 'running',
    progress: 5,
    statusMessage: 'Initializing daemon pipeline...',
    updatedAt: now,
  });
  emitTelemetry({ eventType: 'job_started', jobId, timestamp: now, profile: job.profile });

  const projectPath = job.projectPath || process.cwd();

  try {
    const result = await runDaemonJob(
      projectPath,
      job.profile,
      job.projectDna,
      (progress, status, log) => {
        const current = daemonJobs.get(jobId);
        if (!current || current.status !== 'running') return;
        daemonJobs.set(jobId, {
          ...current,
          progress: progress >= 0 ? progress : current.progress,
          statusMessage: status,
          updatedAt: nowIso(),
          logs: log ? [...(current.logs ?? []), log] : current.logs,
        });
      },
      job.limits || undefined
    );

    const final = daemonJobs.get(jobId)!;

    // Convert AbsorbGraphData → DaemonAbsorbSnapshot for persistence
    const absorbSnapshot: DaemonAbsorbSnapshot | undefined = result.absorb
      ? {
          leafFirstOrder: result.absorb.leafFirstOrder,
          inDegree: result.absorb.inDegree,
          communities: result.absorb.communities,
          totalFiles: result.absorb.totalFiles,
          totalSymbols: result.absorb.totalSymbols,
          durationMs: result.absorb.durationMs,
          graphJson: result.absorb.graphJson,
          hubFiles: Object.entries(result.absorb.inDegree)
            .filter(([, deg]) => deg >= 3)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([path, inDegree]) => ({ path, inDegree })),
        }
      : undefined;

    daemonJobs.set(jobId, {
      ...final,
      status: 'completed',
      progress: 100,
      statusMessage: 'Complete',
      updatedAt: nowIso(),
      summary: result.summary,
      metrics: {
        qualityDelta: result.qualityDelta,
        qualityBefore: result.qualityBefore,
        qualityAfter: result.qualityAfter,
        filesChanged: result.filesChanged,
        filesAnalyzed: result.filesAnalyzed,
        cycles: result.cycles,
        durationMs: result.durationMs,
      },
      patches: result.patches,
      logs: result.logs,
      absorb: absorbSnapshot,
    });

    emitTelemetry({
      eventType: 'job_completed',
      jobId,
      timestamp: nowIso(),
      profile: job.profile,
      durationMs: result.durationMs,
      qualityDelta: result.qualityDelta,
      filesChanged: result.filesChanged,
      patchCount: result.patches.length,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const final = daemonJobs.get(jobId)!;
    daemonJobs.set(jobId, {
      ...final,
      status: 'failed',
      progress: 0,
      statusMessage: `Failed: ${errorMessage}`,
      updatedAt: nowIso(),
      summary: `Daemon job failed: ${errorMessage}`,
      error: errorMessage,
    });
    emitTelemetry({
      eventType: 'job_failed',
      jobId,
      timestamp: nowIso(),
      profile: job.profile,
      error: errorMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createDaemonJob(input: CreateDaemonJobInput): DaemonJob {
  const id = `dj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const created: DaemonJob = {
    id,
    projectId: input.projectId,
    profile: input.profile,
    projectDna: input.projectDna,
    plan: buildDaemonPlan(projectDNAFromLegacySignals(input.projectDna), input.profile),
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    progress: 0,
    statusMessage: 'Queued',
    projectPath: input.projectPath,
    limits: input.customLimits as DaemonJobLimits | undefined,
    userId: input.userId,
  };

  daemonJobs.set(id, created);
  emitTelemetry({
    eventType: 'job_created',
    jobId: id,
    timestamp: created.createdAt,
    profile: input.profile,
  });

  // Fire-and-forget: start real execution asynchronously
  void executeDaemonJob(id);

  return created;
}

export function listDaemonJobs(): DaemonJob[] {
  return Array.from(daemonJobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDaemonJob(id: string): DaemonJob | null {
  return daemonJobs.get(id) ?? null;
}

export function getJobPatches(jobId: string): PatchProposal[] {
  return daemonJobs.get(jobId)?.patches ?? [];
}

export function getJobLogs(jobId: string): DaemonLogEntry[] {
  return daemonJobs.get(jobId)?.logs ?? [];
}

export function recordPatchAction(
  jobId: string,
  patchIds: string[],
  action: 'applied' | 'exported' | 'rejected'
): void {
  const eventType =
    action === 'applied'
      ? ('patch_applied' as const)
      : action === 'exported'
        ? ('patch_exported' as const)
        : ('patch_rejected' as const);
  for (const _patchId of patchIds) {
    emitTelemetry({ eventType, jobId, timestamp: nowIso(), patchCount: 1 });
  }
}

export function getTelemetrySummary(): DaemonTelemetrySummary {
  const jobs = Array.from(daemonJobs.values());
  const completed = jobs.filter((j) => j.status === 'completed');
  const failed = jobs.filter((j) => j.status === 'failed');
  const totalPatches = completed.reduce((sum, j) => sum + (j.patches?.length ?? 0), 0);
  const appliedPatches = telemetryLog.filter((e) => e.eventType === 'patch_applied').length;
  const avgDelta =
    completed.length > 0
      ? completed.reduce((sum, j) => sum + (j.metrics?.qualityDelta ?? 0), 0) / completed.length
      : 0;
  const avgDuration =
    completed.length > 0
      ? completed.reduce((sum, j) => sum + (j.metrics?.durationMs ?? 0), 0) / completed.length
      : 0;
  const profileUsage: Record<DaemonProfile, number> = { quick: 0, balanced: 0, deep: 0 };
  for (const job of jobs) profileUsage[job.profile]++;

  return {
    totalJobs: jobs.length,
    completedJobs: completed.length,
    failedJobs: failed.length,
    totalPatches,
    appliedPatches,
    avgQualityDelta: Math.round(avgDelta * 100) / 100,
    avgDurationMs: Math.round(avgDuration),
    profileUsage,
    recentEvents: telemetryLog.slice(-50),
  };
}
