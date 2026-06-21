import type {
  DaemonJob,
  DaemonMissionProfile,
  DaemonProfile,
  DaemonProjectDNA,
} from '@/lib/daemon/types';

export interface ProjectWorkspaceOverview {
  id: string;
  name: string;
  localPath: string;
  branch: string | null;
  status: string | null;
  fileCount: number | null;
  metadata: Record<string, unknown>;
  lastAbsorbedAt: string | null;
  absorbJobs?: Array<{
    id: string;
    status: string;
    depth: string;
    updatedAt: string;
    error?: string | null;
  }>;
}

export interface WorkspaceGitSnapshot {
  status: 'clean' | 'dirty' | 'unknown' | 'error';
  branch: string | null;
  changedFiles: number | null;
  checkedAt: string;
  error?: string;
}

export interface BulkWorkspaceProgress {
  kind: 'agent' | 'absorb';
  done: number;
  total: number;
  current: string;
}

export interface DaemonMissionLike {
  id: DaemonMissionProfile;
  name: string;
  description: string;
  defaultSkills: string[];
  authorityRefs: string[];
  schedules: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function ageInHours(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (nowMs - date.getTime()) / (1000 * 60 * 60);
}

export function workspaceLastAbsorbedAt(workspace: ProjectWorkspaceOverview): string | null {
  return (
    workspace.lastAbsorbedAt ??
    stringField(workspace.metadata.lastAbsorbedAt) ??
    stringField(workspace.metadata.last_absorbed_at)
  );
}

export function workspaceAbsorbStatus(
  workspace: ProjectWorkspaceOverview,
  nowMs = Date.now()
): string {
  const activeJob = workspace.absorbJobs?.find((job) =>
    ['queued', 'running', 'scanning', 'absorbing'].includes(job.status)
  );
  if (activeJob) return activeJob.status;
  if (workspace.status === 'scanning' || workspace.status === 'absorbing') return workspace.status;
  const age = ageInHours(workspaceLastAbsorbedAt(workspace), nowMs);
  if (age === null) return 'stale';
  return age <= 24 ? 'fresh' : 'stale';
}

export function isWorkspaceAbsorbStale(
  workspace: ProjectWorkspaceOverview,
  nowMs = Date.now()
): boolean {
  const status = workspaceAbsorbStatus(workspace, nowMs);
  return status === 'stale' || status === 'failed' || status === 'error';
}

export function workspaceBuildStatus(workspace: ProjectWorkspaceOverview): string {
  const metadata = workspace.metadata;
  const nested = isRecord(metadata.lastBuild) ? metadata.lastBuild.status : null;
  const raw =
    stringField(metadata.buildHealth) ??
    stringField(metadata.buildStatus) ??
    stringField(metadata.lastBuildStatus) ??
    stringField(nested);
  if (!raw) return 'unknown';
  const normalized = raw.toLowerCase();
  if (['ok', 'pass', 'passed', 'passing', 'success', 'succeeded', 'green'].includes(normalized)) {
    return 'passing';
  }
  if (['fail', 'failed', 'failing', 'error', 'red'].includes(normalized)) return 'failing';
  return normalized;
}

export function workspaceLatestJob(
  workspace: ProjectWorkspaceOverview,
  jobs: DaemonJob[]
): DaemonJob | null {
  const matches = jobs.filter(
    (job) => job.projectId === workspace.id || job.projectPath === workspace.localPath
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export function workspaceAgentStatus(
  workspace: ProjectWorkspaceOverview,
  jobs: DaemonJob[]
): string {
  const job = workspaceLatestJob(workspace, jobs);
  if (!job) return 'idle';
  if (job.status === 'running' || job.status === 'queued') return job.status;
  return job.status;
}

export function buildProjectDna(
  workspace: ProjectWorkspaceOverview,
  profile: DaemonProfile,
  mission: DaemonMissionLike
): DaemonProjectDNA {
  return {
    kind: 'unknown',
    confidence: 0.65,
    detectedStack: [
      workspace.fileCount ? `${workspace.fileCount} files` : 'imported repo',
      workspace.branch ? `branch ${workspace.branch}` : 'git workspace',
      `daemon:${mission.id}`,
    ],
    recommendedProfile: profile,
    notes: [
      `Workbench assigned ${workspace.name} to HoloDaemon mission ${mission.id}.`,
      mission.description,
      `Workspace path: ${workspace.localPath}`,
    ],
    daemonAgent: {
      missionProfile: mission.id,
      agentName: mission.name,
      skills: mission.defaultSkills,
      authorityRefs: mission.authorityRefs,
      schedules: mission.schedules,
      rawSecretAccess: false,
    },
  };
}
