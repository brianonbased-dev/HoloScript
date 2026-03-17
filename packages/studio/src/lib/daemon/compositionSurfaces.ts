import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { HoloScriptPlusParser } from '@holoscript/core';
import type { DaemonJob, DaemonTelemetrySummary } from '@/lib/daemon/types';

export type DaemonSurfaceKind = 'dashboard' | 'orchestration';
export type DaemonSurfaceFormat = 'hsplus';

export interface DaemonSurfaceValidation {
  valid: boolean;
  errors: string[];
}

export interface DaemonSurfaceSummary {
  activityCount: number;
  agentCount: number;
  forkCount: number;
  runningJobs: number;
  queuedJobs: number;
  reviewJobs: number;
}

export interface LoadedDaemonSurface {
  kind: DaemonSurfaceKind;
  format: DaemonSurfaceFormat;
  name: string;
  code: string;
  sourcePath: string;
  validation: DaemonSurfaceValidation;
  summary: DaemonSurfaceSummary;
}

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'compositions'))) {
      return candidate;
    }
  }

  return process.cwd();
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function indentBlock(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

function toHsValue(value: unknown, indent = 0): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${escapeString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const nextIndent = indent + 2;
    return `[` + '\n' + value.map((item) => `${' '.repeat(nextIndent)}${toHsValue(item, nextIndent)}`).join(',\n') + '\n' + `${' '.repeat(indent)}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';

  const nextIndent = indent + 2;
  return `{` + '\n' + entries.map(([key, entryValue]) => `${' '.repeat(nextIndent)}${key}: ${toHsValue(entryValue, nextIndent)}`).join('\n') + '\n' + `${' '.repeat(indent)}}`;
}

function replaceStateBlock(source: string, stateBody: string): string {
  const stateStart = source.indexOf('  state {');
  const computedStart = source.indexOf('\n\n  computed {');

  if (stateStart === -1 || computedStart === -1 || computedStart <= stateStart) {
    return source;
  }

  return `${source.slice(0, stateStart)}  state {\n${indentBlock(stateBody, 4)}\n  }${source.slice(computedStart)}`;
}

function mapJobs(jobs: DaemonJob[]) {
  return jobs.map((job) => ({
    id: job.id,
    title: job.summary || job.statusMessage || `${job.projectId} ${job.profile} job`,
    type: job.plan?.passes[0] || job.projectDna.kind,
    status: job.status === 'completed' && (job.patches?.length ?? 0) > 0 ? 'awaiting_review' : job.status,
    progress: job.progress,
    lane: job.plan?.profile || job.projectDna.kind,
    runtime: job.profile,
    requiresReview: (job.patches?.length ?? 0) > 0,
    assignedAgent: job.plan?.profile || job.profile,
  }));
}

function buildActivity(jobs: DaemonJob[], telemetry: DaemonTelemetrySummary) {
  const recent = telemetry.recentEvents.slice(-8).map((event) => ({
    id: `${event.jobId}-${event.timestamp}`,
    kind: event.eventType,
    message: `${event.eventType} for ${event.jobId}`,
    severity: event.eventType.includes('failed') || event.eventType.includes('rejected') ? 'warning' : 'info',
  }));

  if (recent.length > 0) return recent;

  return jobs.slice(0, 3).map((job) => ({
    id: `${job.id}-activity`,
    kind: 'job',
    message: job.summary || job.statusMessage || `${job.id} is ${job.status}`,
    severity: job.status === 'failed' ? 'warning' : 'info',
  }));
}

function buildAgents(jobs: DaemonJob[]) {
  const uniqueAgents = new Map<string, { id: string; name: string; state: string; mode: string; available: boolean }>();
  for (const job of jobs) {
    const agentId = job.plan?.profile || job.profile;
    if (!uniqueAgents.has(agentId)) {
      uniqueAgents.set(agentId, {
        id: agentId,
        name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
        state: job.status === 'running' ? 'active' : 'idle',
        mode: job.plan?.profile || job.projectDna.kind,
        available: job.status !== 'running',
      });
    }
  }
  return Array.from(uniqueAgents.values());
}

function buildForks(jobs: DaemonJob[]) {
  const seen = new Set<string>();
  const forks: Array<{ id: string; branch: string; status: string }> = [];
  for (const job of jobs) {
    const branch = `studio/${job.projectId}/${job.id}`;
    if (seen.has(branch)) continue;
    seen.add(branch);
    forks.push({
      id: `fork-${job.id}`,
      branch,
      status: job.status === 'completed' ? 'ready' : job.status,
    });
  }
  return forks;
}

function hydrateDashboard(source: string, jobs: DaemonJob[], telemetry: DaemonTelemetrySummary): { code: string; summary: DaemonSurfaceSummary } {
  const mappedJobs = mapJobs(jobs);
  const activity = buildActivity(jobs, telemetry);
  const agents = buildAgents(jobs);
  const selectedJob = mappedJobs[0];
  const reviewJobs = mappedJobs.filter((job) => job.status === 'awaiting_review').length;
  const runningJobs = mappedJobs.filter((job) => job.status === 'running').length;
  const queuedJobs = mappedJobs.filter((job) => job.status === 'queued').length;
  const heroStatus = `Studio is tracking ${mappedJobs.length} jobs across ${agents.length} agents.`;
  const healthPercent = Math.round(
    (telemetry.totalJobs === 0 ? 1 : Math.max(0.25, Math.min(1, 1 - telemetry.failedJobs / Math.max(telemetry.totalJobs, 1)))) * 100,
  );

  const stateBody = [
    `workspaceName: ${toHsValue(jobs[0]?.projectId || 'studio-workspace')}`,
    `branchName: ${toHsValue('main')}`,
    `activeView: ${toHsValue('operations')}`,
    `selectedJobId: ${toHsValue(selectedJob?.id || 'no-job')}`,
    `syncStatus: ${toHsValue('synced')}`,
    `pendingReviews: ${reviewJobs}`,
    `openAlerts: ${telemetry.failedJobs}`,
    `daemonHealth: ${healthPercent / 100}`,
    `heroStatus: ${toHsValue(heroStatus)}`,
    `healthPercentLabel: ${toHsValue(`${healthPercent}%`)}`,
    `runningJobsLabel: ${toHsValue(String(runningJobs))}`,
    `queuedJobsLabel: ${toHsValue(String(queuedJobs))}`,
    `reviewLabel: ${toHsValue(`${reviewJobs} pending reviews`)}`,
    `selectedJobTitle: ${toHsValue(selectedJob?.title || 'No job selected')}`,
    `selectedJobMeta: ${toHsValue(selectedJob ? `${selectedJob.status} / ${selectedJob.runtime} / ${selectedJob.lane}` : '')}`,
    `selectedJobStatus: ${toHsValue(selectedJob?.status || 'idle')}`,
    `selectedJobProgress: ${selectedJob?.progress || 0}`,
    `jobQueueText: ${toHsValue(mappedJobs.map((job) => `${job.title} · ${job.status} · ${job.progress}%`).join('\n'))}`,
    `activityText: ${toHsValue(activity.map((entry) => `${entry.kind.toUpperCase()} · ${entry.message}`).join('\n'))}`,
    `agentText: ${toHsValue(agents.map((agent) => `${agent.name} · ${agent.state}`).join('\n'))}`,
    `jobs: ${toHsValue(mappedJobs, 4)}`,
    `activity: ${toHsValue(activity, 4)}`,
    `agents: ${toHsValue(agents.map((agent) => ({ id: agent.id, name: agent.name, state: agent.state })), 4)}`,
  ].join('\n');

  return {
    code: replaceStateBlock(source, stateBody),
    summary: {
      activityCount: activity.length,
      agentCount: agents.length,
      forkCount: buildForks(jobs).length,
      runningJobs,
      queuedJobs,
      reviewJobs,
    },
  };
}

function hydrateOrchestration(source: string, jobs: DaemonJob[], telemetry: DaemonTelemetrySummary): { code: string; summary: DaemonSurfaceSummary } {
  const mappedJobs = mapJobs(jobs).map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    runtime: job.runtime,
    progress: job.progress,
    requiresReview: job.requiresReview,
    assignedAgent: job.assignedAgent,
  }));
  const activities = buildActivity(jobs, telemetry).map((entry, index) => ({
    id: index + 1,
    kind: entry.kind,
    message: entry.message,
  }));
  const agents = buildAgents(jobs).map((agent) => ({
    id: agent.id,
    mode: agent.mode,
    available: agent.available,
  }));
  const forks = buildForks(jobs);
  const reviewJobs = mappedJobs.filter((job) => job.status === 'awaiting_review').length;
  const runningJobs = mappedJobs.filter((job) => job.status === 'running').length;
  const queuedJobs = mappedJobs.filter((job) => job.status === 'queued').length;
  const queueDepth = mappedJobs.filter(
    (job) => job.status === 'queued' || job.status === 'running' || job.status === 'awaiting_review',
  ).length;

  const stateBody = [
    `workspaceId: ${toHsValue(jobs[0]?.projectId || 'studio-workspace')}`,
    `branchName: ${toHsValue('main')}`,
    `queueOpen: true`,
    `activeRuntime: ${toHsValue(mappedJobs[0]?.runtime || 'balanced')}`,
    `nextActivityId: ${activities.length + 1}`,
    `runningJobCount: ${runningJobs}`,
    `queuedJobCount: ${queuedJobs}`,
    `reviewJobCount: ${reviewJobs}`,
    `queueDepth: ${queueDepth}`,
    `jobs: ${toHsValue(mappedJobs, 4)}`,
    `activities: ${toHsValue(activities, 4)}`,
    `forks: ${toHsValue(forks, 4)}`,
    `agents: ${toHsValue(agents, 4)}`,
  ].join('\n');

  return {
    code: replaceStateBlock(source, stateBody),
    summary: {
      activityCount: activities.length,
      agentCount: agents.length,
      forkCount: forks.length,
      runningJobs,
      queuedJobs,
      reviewJobs,
    },
  };
}

function validateSurface(code: string): DaemonSurfaceValidation {
  try {
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    const errors = (result.errors ?? []).map((entry) =>
      typeof entry === 'string' ? entry : entry.message || String(entry),
    );

    return { valid: errors.length === 0, errors };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function loadDaemonSurface(kind: DaemonSurfaceKind, jobs: DaemonJob[], telemetry: DaemonTelemetrySummary): Promise<LoadedDaemonSurface> {
  const repoRoot = resolveRepoRoot();
  const fileName = kind === 'dashboard' ? 'studio-operations-dashboard.hsplus' : 'studio-job-orchestration.hsplus';
  const sourcePath = path.join(repoRoot, 'compositions', fileName);
  const source = await readFile(sourcePath, 'utf8');

  const hydrated = kind === 'dashboard'
    ? hydrateDashboard(source, jobs, telemetry)
    : hydrateOrchestration(source, jobs, telemetry);

  return {
    kind,
    format: 'hsplus',
    name: kind === 'dashboard' ? 'StudioOperationsDashboard' : 'StudioJobOrchestration',
    code: hydrated.code,
    sourcePath,
    validation: validateSurface(hydrated.code),
    summary: hydrated.summary,
  };
}