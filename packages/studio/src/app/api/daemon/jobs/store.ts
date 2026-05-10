/**
 * Daemon Job Store -- Persists job state, logs, metrics, and patch proposals.
 *
 * Replaces the former simulated lifecycle with real daemon execution via
 * the DaemonRunner. Jobs run in isolated workspace directories and produce
 * concrete patch proposals that users can review and apply through Studio.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  PatchApplyResult,
  PatchProposal,
} from '@/lib/daemon/types';

export type { CreateDaemonJobInput } from '@/lib/daemon/types';

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

interface DaemonStoreSnapshot {
  jobs: DaemonJob[];
  telemetryLog: DaemonTelemetryEvent[];
}

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
const STORE_DIR = path.join(HOME_DIR, '.holoscript', 'studio');
const STORE_PATH = path.join(STORE_DIR, 'daemon-jobs.json');
const WORKSPACE_ROOT = path.join(HOME_DIR, '.holoscript', 'workspaces');

const daemonJobs = new Map<string, DaemonJob>();
const telemetryLog: DaemonTelemetryEvent[] = [];

loadStore();

function nowIso(): string {
  return new Date().toISOString();
}

function loadStore(): void {
  if (!fs.existsSync(STORE_PATH)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<DaemonStoreSnapshot>;
    if (Array.isArray(parsed.jobs)) {
      for (const job of parsed.jobs) {
        if (job && typeof job.id === 'string') {
          daemonJobs.set(job.id, job);
        }
      }
    }
    if (Array.isArray(parsed.telemetryLog)) {
      telemetryLog.push(...parsed.telemetryLog.slice(-1000));
    }
  } catch (err) {
    console.warn('[daemon jobs] failed to load durable store', err);
  }
}

function persistStore(): void {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
    const snapshot: DaemonStoreSnapshot = {
      jobs: Array.from(daemonJobs.values()),
      telemetryLog: telemetryLog.slice(-1000),
    };
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.warn('[daemon jobs] failed to persist durable store', err);
  }
}

function setDaemonJob(jobId: string, job: DaemonJob): void {
  daemonJobs.set(jobId, job);
  persistStore();
}

function emitTelemetry(event: DaemonTelemetryEvent): void {
  telemetryLog.push(event);
  if (telemetryLog.length > 1000) {
    telemetryLog.splice(0, telemetryLog.length - 1000);
  }
  persistStore();
}

// ---------------------------------------------------------------------------
// Real Daemon Execution
// ---------------------------------------------------------------------------

async function executeDaemonJob(jobId: string): Promise<void> {
  const job = daemonJobs.get(jobId);
  if (!job) return;

  const now = nowIso();
  setDaemonJob(jobId, {
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
        setDaemonJob(jobId, {
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

    setDaemonJob(jobId, {
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
    setDaemonJob(jobId, {
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

  setDaemonJob(id, created);
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

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sanitizeBranchName(value: string): string {
  const cleaned = value
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[./-]+|[./-]+$/g, '')
    .slice(0, 160);
  return cleaned || 'studio/daemon-patches';
}

function defaultBranchName(job: DaemonJob): string {
  return sanitizeBranchName(`studio/${job.projectId}/${job.id}`);
}

function assertWorkspacePath(projectPath: string | undefined): string {
  if (!projectPath) {
    throw new Error('Daemon job has no workspace path to apply patches into');
  }

  const workspaceRoot = path.resolve(WORKSPACE_ROOT);
  const resolved = path.resolve(projectPath);
  if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
    throw new Error('Workspace path must be inside ~/.holoscript/workspaces');
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    throw new Error('Workspace path does not contain a git repository');
  }
  return resolved;
}

function assertPatchTarget(
  workspacePath: string,
  filePath: string
): { absolute: string; relative: string } {
  if (!filePath || filePath.includes('\0')) {
    throw new Error('Patch contains an invalid file path');
  }

  const normalized = filePath.replace(/\\/g, '/');
  const absolute = path.resolve(workspacePath, normalized);
  const relativePath = path.relative(workspacePath, absolute);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Patch target escapes workspace: ${filePath}`);
  }
  return { absolute, relative: relativePath.replace(/\\/g, '/') };
}

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const withoutGitSuffix = remoteUrl.trim().replace(/\.git$/, '');
  const httpsMatch = withoutGitSuffix.match(/^https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = withoutGitSuffix.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

function getSelectedPatches(job: DaemonJob, patchIds: string[]): PatchProposal[] {
  if (patchIds.length === 0) {
    throw new Error('Select at least one patch to apply');
  }

  const requested = new Set(patchIds);
  const patches = (job.patches ?? []).filter((patch) => requested.has(patch.id));
  if (patches.length !== requested.size) {
    const found = new Set(patches.map((patch) => patch.id));
    const missing = patchIds.filter((patchId) => !found.has(patchId));
    throw new Error(`Unknown patch id(s): ${missing.join(', ')}`);
  }
  return patches;
}

export function applyPatchesToWorkspaceBranch(
  jobId: string,
  patchIds: string[],
  options: { branchName?: string; baseBranch?: string } = {}
): PatchApplyResult {
  const job = daemonJobs.get(jobId);
  if (!job) {
    throw new Error('Daemon job not found');
  }

  const workspacePath = assertWorkspacePath(job.projectPath);
  const patches = getSelectedPatches(job, patchIds);
  const preStatus = runGit(workspacePath, ['status', '--porcelain']);
  if (preStatus) {
    throw new Error(
      'Workspace has uncommitted changes; commit or discard them before applying patches'
    );
  }

  const currentBranch = runGit(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const baseBranch =
    options.baseBranch?.trim() || (currentBranch === 'HEAD' ? 'main' : currentBranch);
  const branchName = sanitizeBranchName(options.branchName?.trim() || defaultBranchName(job));
  runGit(workspacePath, ['check-ref-format', '--branch', branchName]);
  runGit(workspacePath, ['checkout', '-B', branchName]);

  const files = new Set<string>();
  for (const patch of patches) {
    const target = assertPatchTarget(workspacePath, patch.filePath);
    files.add(target.relative);

    if (patch.action === 'delete') {
      fs.rmSync(target.absolute, { force: true });
      continue;
    }

    if (patch.proposedContent === null) {
      throw new Error(`Patch ${patch.id} is missing proposed content`);
    }
    fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
    fs.writeFileSync(target.absolute, patch.proposedContent, 'utf8');
  }

  const fileList = Array.from(files);
  runGit(workspacePath, ['add', '--', ...fileList]);
  const changed = runGit(workspacePath, ['status', '--porcelain', '--', ...fileList]);
  let commitHash: string | null = null;
  if (changed) {
    runGit(workspacePath, ['commit', '-m', `chore(studio): apply daemon patches ${job.id}`]);
    commitHash = runGit(workspacePath, ['rev-parse', '--short', 'HEAD']);
  }

  let remote: { owner: string; repo: string } | null = null;
  try {
    remote = parseGitHubRemote(runGit(workspacePath, ['remote', 'get-url', 'origin']));
  } catch {
    remote = null;
  }

  const result: PatchApplyResult = {
    branchName,
    baseBranch,
    commitHash,
    files: fileList,
    noChanges: commitHash === null,
    pushRequest: {
      workspacePath,
      remote: 'origin',
      branch: branchName,
      force: false,
    },
    pullRequest:
      remote && commitHash
        ? {
            owner: remote.owner,
            repo: remote.repo,
            title: `Apply daemon patches from ${job.id}`,
            body: [
              `Applies ${patches.length} reviewed daemon patch${patches.length === 1 ? '' : 'es'} from Studio job ${job.id}.`,
              '',
              'Changed files:',
              ...fileList.map((file) => `- ${file}`),
            ].join('\n'),
            head: branchName,
            base: baseBranch,
            draft: true,
          }
        : undefined,
  };

  setDaemonJob(jobId, {
    ...job,
    updatedAt: nowIso(),
    logs: [
      ...(job.logs ?? []),
      {
        timestamp: nowIso(),
        level: 'info',
        message: commitHash
          ? `Applied ${patches.length} patch${patches.length === 1 ? '' : 'es'} to ${branchName} (${commitHash}).`
          : `Selected patches already matched ${branchName}; no commit was created.`,
      },
    ],
  });

  return result;
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
