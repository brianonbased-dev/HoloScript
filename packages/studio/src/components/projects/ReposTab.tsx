'use client';

/**
 * ReposTab — Agent Workbench tab mounted inside /projects.
 *
 * Extracted from src/app/workspace/page.tsx (the old standalone /workspace
 * route). Contains: repo import form, workspace list, git ops, agent
 * assignment, board view, absorb diff, and the three-column workbench layout.
 *
 * The parent ProjectsView is responsible for mounting this tab; the tab
 * must NOT render its own GlobalNavigation (that caused the double-nav bug
 * tracked in the A4 recon).
 *
 * @module projects/ReposTab
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  Code2,
  FileText,
  Folder,
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitPullRequestCreate,
  History,
  ListTree,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Split,
  TerminalSquare,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { PatchReviewPanel } from '@/components/daemon/PatchReviewPanel';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';
import {
  ResearchLanePrompt,
  ResearchLaneArtifacts,
} from '@/components/research/ResearchLanePrompt';
import { useDaemonJobs } from '@/hooks/useDaemonJobs';
import type { DaemonJob, DaemonProfile } from '@/hooks/useDaemonJobs';
import { HOLO_DAEMON_MISSIONS } from '@/lib/daemon/agentProfiles';
import type { DaemonMissionProfile } from '@/lib/daemon/types';
import type { PaperUnlockState, PublishWorthinessSummary } from '@/lib/stores/workspaceStore';
import {
  buildProjectDna,
  isWorkspaceAbsorbStale,
  workspaceAbsorbStatus,
  workspaceAgentStatus,
  workspaceBuildStatus,
  type BulkWorkspaceProgress,
  type ProjectWorkspaceOverview,
  type WorkspaceGitSnapshot,
} from './workspaceOverview';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkbenchTab = 'files' | 'diff' | 'agent' | 'board' | 'absorb';

interface WorkspaceSummary extends ProjectWorkspaceOverview {
  id: string;
  name: string;
  repoUrl: string | null;
  sourceUrl: string | null;
  branch: string | null;
  localPath: string;
  status: string | null;
  currentCommit: string | null;
  fileCount: number | null;
  updatedAt: string | null;
  metadata: Record<string, unknown>;
  publishWorthiness?: PublishWorthinessSummary | null;
  paperUnlockState?: PaperUnlockState | null;
}

interface WorkspaceImportResponse {
  id: string;
  name: string;
  repoUrl?: string;
  branch?: string;
  localPath: string;
  status?: string;
  fileCount?: number;
  currentCommit?: string | null;
  createdAt?: string;
  error?: string;
}

interface GitStatusResponse {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  files: Array<{ path: string; status: string }>;
  recentCommits: Array<{ sha: string; message: string }>;
  error?: string;
}

interface GitBranchesResponse {
  branches: string[];
  current: string;
  error?: string;
}

interface GitTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

interface GitTreeResponse {
  path: string;
  parentPath: string | null;
  entries: GitTreeEntry[];
  total: number;
  error?: string;
}

interface GitDiffFile {
  file: string;
  diff: string;
  additions: number;
  deletions: number;
}

interface GitDiffResponse {
  raw: string;
  files: GitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  error?: string;
}

interface AbsorbProject {
  id: string;
  name: string;
  sourceUrl?: string | null;
  sourceType?: string;
  localPath?: string | null;
  status?: string;
  lastAbsorbedAt?: string | null;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  absorbJobs?: Array<{
    id: string;
    status: string;
    depth: string;
    updatedAt: string;
    error?: string | null;
  }>;
}

interface BoardTask {
  id: string;
  title: string;
  status?: string;
  priority?: number;
  claimedByName?: string;
}

interface BoardResponse {
  board?: {
    open?: BoardTask[];
    claimed?: BoardTask[];
    done?: BoardTask[];
  };
  mode?: string;
  objective?: string;
  tasks?: BoardTask[];
  error?: string;
}

interface RepoAccess {
  role: 'owner' | 'maintainer' | 'contributor' | 'viewer' | 'unknown';
  canDirectShip: boolean;
  recommendedFlow: 'direct-ship' | 'branch-pr';
  user: string | null;
  owner: string | null;
  error?: string;
}

interface RepoRef {
  owner: string;
  repo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPublishWorthiness(value: unknown): PublishWorthinessSummary | null {
  if (!isRecord(value)) return null;
  const verdict = stringField(value.verdict);
  if (verdict !== 'locked' && verdict !== 'candidate' && verdict !== 'unlock') return null;
  return {
    verdict,
    hiddenPaperProgramUnlocked: value.hiddenPaperProgramUnlocked === true,
    deterministicScore: numberField(value.deterministicScore) ?? 0,
    finalScore: numberField(value.finalScore) ?? 0,
    threshold: numberField(value.threshold) ?? 78,
    requiredGateFailures: Array.isArray(value.requiredGateFailures)
      ? value.requiredGateFailures.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function readPaperUnlockState(value: unknown): PaperUnlockState | null {
  if (!isRecord(value)) return null;
  const status = stringField(value.status);
  if (status !== 'locked' && status !== 'candidate' && status !== 'opted-in') return null;
  return {
    status,
    optInAt: stringField(value.optInAt) ?? undefined,
    researchDir: stringField(value.researchDir) ?? undefined,
    artifactsCreated: Array.isArray(value.artifactsCreated)
      ? value.artifactsCreated.filter((item): item is string => typeof item === 'string')
      : undefined,
    boardTaskIds: Array.isArray(value.boardTaskIds)
      ? value.boardTaskIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    knowledgeEntryIds: Array.isArray(value.knowledgeEntryIds)
      ? value.knowledgeEntryIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    workspaceMemoryEntryIds: Array.isArray(value.workspaceMemoryEntryIds)
      ? value.workspaceMemoryEntryIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    workspaceMemoryPath: stringField(value.workspaceMemoryPath) ?? undefined,
    publicKnowledgeConsent: value.publicKnowledgeConsent === true,
    publicationPrepConsent: value.publicationPrepConsent === true,
  };
}

function repoRefFromUrl(value: string | null): RepoRef | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\.git$/i, '');
  const match = normalized.match(/github\.com[/:]([^/\s]+)\/([^/\s]+)$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusTone(status: string | null | undefined): string {
  if (
    status === 'ready' ||
    status === 'complete' ||
    status === 'completed' ||
    status === 'clean' ||
    status === 'fresh' ||
    status === 'passing' ||
    status === 'idle'
  ) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (
    status === 'running' ||
    status === 'queued' ||
    status === 'scanning' ||
    status === 'absorbing'
  ) {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  }
  if (status === 'dirty' || status === 'stale' || status === 'unknown') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  if (status === 'failed' || status === 'error' || status === 'failing') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error((json as { error?: string }).error || `Request failed (${response.status})`);
  }
  return json;
}

function readWorkspaceFromProject(project: AbsorbProject): WorkspaceSummary {
  const metadata = project.metadata ?? {};
  return {
    id: project.id,
    name: project.name,
    repoUrl: stringField(project.sourceUrl) ?? stringField(metadata.repoUrl),
    sourceUrl: stringField(project.sourceUrl),
    branch: stringField(metadata.branch),
    localPath: stringField(project.localPath) ?? '',
    status: project.status ?? 'ready',
    currentCommit: stringField(metadata.currentCommit),
    fileCount: numberField(metadata.fileCount),
    updatedAt: project.updatedAt ?? project.lastAbsorbedAt ?? null,
    metadata,
    publishWorthiness: readPublishWorthiness(metadata.publishWorthiness),
    paperUnlockState: readPaperUnlockState(metadata.paperUnlockState),
    lastAbsorbedAt: project.lastAbsorbedAt ?? null,
    absorbJobs: project.absorbJobs ?? [],
  };
}

function mergeWorkspaces(diskPayload: unknown, absorbPayload: unknown): WorkspaceSummary[] {
  const byId = new Map<string, WorkspaceSummary>();
  const diskWorkspaces =
    isRecord(diskPayload) && Array.isArray(diskPayload.workspaces) ? diskPayload.workspaces : [];
  for (const item of diskWorkspaces) {
    if (!isRecord(item)) continue;
    const id = stringField(item.id);
    const localPath = stringField(item.localPath);
    if (!id || !localPath) continue;
    byId.set(id, {
      id,
      name: stringField(item.name) ?? id,
      repoUrl: stringField(item.repoUrl),
      sourceUrl: stringField(item.repoUrl),
      branch: stringField(item.branch),
      localPath,
      status: stringField(item.status) ?? 'ready',
      currentCommit: stringField(item.currentCommit),
      fileCount: numberField(item.fileCount),
      updatedAt: stringField(item.createdAt),
      metadata: {},
      publishWorthiness: null,
      paperUnlockState: readPaperUnlockState(item.paperUnlockState),
      lastAbsorbedAt: null,
      absorbJobs: [],
    });
  }

  const projects =
    isRecord(absorbPayload) && Array.isArray(absorbPayload.projects) ? absorbPayload.projects : [];
  for (const item of projects) {
    if (!isRecord(item)) continue;
    const project = item as unknown as AbsorbProject;
    const fromProject = readWorkspaceFromProject(project);
    if (!fromProject.localPath) continue;
    const existing = byId.get(fromProject.id);
    byId.set(fromProject.id, {
      ...(existing ?? fromProject),
      ...fromProject,
      repoUrl: fromProject.repoUrl ?? existing?.repoUrl ?? null,
      sourceUrl: fromProject.sourceUrl ?? existing?.sourceUrl ?? null,
      branch: fromProject.branch ?? existing?.branch ?? null,
      fileCount: fromProject.fileCount ?? existing?.fileCount ?? null,
      publishWorthiness: fromProject.publishWorthiness ?? existing?.publishWorthiness ?? null,
      paperUnlockState: existing?.paperUnlockState ?? fromProject.paperUnlockState ?? null,
      lastAbsorbedAt: fromProject.lastAbsorbedAt ?? existing?.lastAbsorbedAt ?? null,
      absorbJobs: fromProject.absorbJobs ?? existing?.absorbJobs ?? [],
      metadata: {
        ...(existing?.metadata ?? {}),
        ...fromProject.metadata,
      },
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${statusTone(status)}`}
    >
      {status === 'failed' || status === 'error' || status === 'failing' ? (
        <XCircle className="h-3 w-3" />
      ) : status === 'dirty' || status === 'stale' || status === 'unknown' ? (
        <AlertTriangle className="h-3 w-3" />
      ) : status === 'running' ||
        status === 'queued' ||
        status === 'scanning' ||
        status === 'absorbing' ? (
        <Activity className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
      {status ?? 'unknown'}
    </span>
  );
}

function IconButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  variant = 'neutral',
  title,
}: {
  icon: typeof RefreshCw;
  children: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'neutral' | 'primary' | 'danger';
  title?: string;
}) {
  const classes =
    variant === 'primary'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
      : variant === 'danger'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
        : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:bg-slate-800';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{children}</span>
    </button>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

// ─── ReposTab ─────────────────────────────────────────────────────────────────

export function ReposTab() {
  const { createJob, listJobs, creating } = useDaemonJobs();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('files');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [repoUrl, setRepoUrl] = useState('');
  const [importBranch, setImportBranch] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);

  // Bulk import (founder 2026-06-11: "everything is setup to configure one
  // project at a time when we have many") — multi-select from the signed-in
  // user's GitHub repos, imported sequentially to avoid clone storms.
  const githubRepos = useGitHubRepos();
  const [selectedRepoUrls, setSelectedRepoUrls] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    current: string;
  } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<string>>(new Set());
  const [workspaceGitSnapshots, setWorkspaceGitSnapshots] = useState<
    Record<string, WorkspaceGitSnapshot>
  >({});
  const [workspaceBulkProgress, setWorkspaceBulkProgress] = useState<BulkWorkspaceProgress | null>(
    null
  );
  const [workspaceBulkErrors, setWorkspaceBulkErrors] = useState<string[]>([]);

  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [branches, setBranches] = useState<GitBranchesResponse | null>(null);
  const [tree, setTree] = useState<GitTreeResponse | null>(null);
  const [treePath, setTreePath] = useState('');
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceAction, setWorkspaceAction] = useState<string | null>(null);

  const [jobs, setJobs] = useState<DaemonJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reviewJob, setReviewJob] = useState<DaemonJob | null>(null);
  const [daemonProfile, setDaemonProfile] = useState<DaemonProfile>('balanced');
  const [daemonMissionProfile, setDaemonMissionProfile] =
    useState<DaemonMissionProfile>('holoheal');

  const [teamId, setTeamId] = useState('');
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [access, setAccess] = useState<RepoAccess | null>(null);
  const [newBranch, setNewBranch] = useState('');
  const [commitMessage, setCommitMessage] = useState('chore(studio): apply workspace changes');
  const [prBase, setPrBase] = useState('main');
  const [prTitle, setPrTitle] = useState('Studio workspace improvements');
  const [operationBusy, setOperationBusy] = useState(false);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces]
  );
  const activeRepoRef = useMemo(
    () => repoRefFromUrl(activeWorkspace?.repoUrl ?? activeWorkspace?.sourceUrl ?? null),
    [activeWorkspace?.repoUrl, activeWorkspace?.sourceUrl]
  );
  const importedRepoKeys = useMemo(() => {
    const normalize = (url: string) => url.toLowerCase().replace(/\.git$/, '');
    return new Set(
      workspaces
        .map((workspace) => workspace.repoUrl ?? workspace.sourceUrl ?? '')
        .filter(Boolean)
        .map(normalize)
    );
  }, [workspaces]);
  const activeAbsorbProject = useMemo(() => {
    if (!activeWorkspace) return null;
    return activeWorkspace.metadata;
  }, [activeWorkspace]);
  const selectedDaemonMission = useMemo(
    () =>
      HOLO_DAEMON_MISSIONS.find((mission) => mission.id === daemonMissionProfile) ??
      HOLO_DAEMON_MISSIONS[0],
    [daemonMissionProfile]
  );
  const selectedWorkspaces = useMemo(
    () => workspaces.filter((workspace) => selectedWorkspaceIds.has(workspace.id)),
    [selectedWorkspaceIds, workspaces]
  );
  const actionWorkspaces = useMemo(() => {
    if (selectedWorkspaces.length > 0) return selectedWorkspaces;
    return activeWorkspace ? [activeWorkspace] : [];
  }, [activeWorkspace, selectedWorkspaces]);
  const staleWorkspaces = useMemo(() => workspaces.filter(isWorkspaceAbsorbStale), [workspaces]);
  const workspaceJobs = useMemo(() => {
    if (!activeWorkspace) return [];
    return jobs.filter(
      (job) => job.projectId === activeWorkspace.id || job.projectPath === activeWorkspace.localPath
    );
  }, [activeWorkspace, jobs]);
  const selectedJob = useMemo(
    () => workspaceJobs.find((job) => job.id === selectedJobId) ?? workspaceJobs[0] ?? null,
    [selectedJobId, workspaceJobs]
  );
  const branchName = gitStatus?.branch ?? branches?.current ?? activeWorkspace?.branch ?? 'main';
  const canDirectShip = access?.canDirectShip === true;
  const bulkBusy = workspaceBulkProgress !== null;
  const assignmentTargetCount = actionWorkspaces.length;
  const selectedWorkspaceLabel =
    selectedWorkspaceIds.size > 0 ? `${selectedWorkspaceIds.size} selected` : 'active workspace';

  const refreshJobs = useCallback(async () => {
    try {
      const nextJobs = await listJobs();
      setJobs(nextJobs);
    } catch {
      setJobs([]);
    }
  }, [listJobs]);

  const refreshWorkspaceOverview = useCallback(async () => {
    if (workspaces.length === 0) {
      setWorkspaceGitSnapshots({});
      return;
    }
    const snapshots: Record<string, WorkspaceGitSnapshot> = {};
    for (const workspace of workspaces) {
      if (!workspace.localPath) {
        snapshots[workspace.id] = {
          status: 'unknown',
          branch: workspace.branch,
          changedFiles: null,
          checkedAt: new Date().toISOString(),
        };
        continue;
      }
      try {
        const encodedPath = encodeURIComponent(workspace.localPath);
        const statusPayload = await fetchJson<GitStatusResponse>(
          `/api/git/status?workspacePath=${encodedPath}`
        );
        snapshots[workspace.id] = {
          status: statusPayload.clean ? 'clean' : 'dirty',
          branch: statusPayload.branch,
          changedFiles: statusPayload.files.length,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        snapshots[workspace.id] = {
          status: 'error',
          branch: workspace.branch,
          changedFiles: null,
          checkedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    setWorkspaceGitSnapshots(snapshots);
  }, [workspaces]);

  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const [workspacePayload, absorbPayload] = await Promise.all([
        fetchJson<unknown>('/api/workspace/import'),
        fetchJson<unknown>('/api/absorb/projects').catch(() => ({ projects: [] })),
      ]);
      const merged = mergeWorkspaces(workspacePayload, absorbPayload);
      setWorkspaces(merged);
      setActiveWorkspaceId((current) => current ?? merged[0]?.id ?? null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  const handlePaperOptIn = useCallback(
    (workspaceId: string, paperUnlockState: PaperUnlockState) => {
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, paperUnlockState } : workspace
        )
      );
    },
    []
  );

  const loadWorkspaceRuntime = useCallback(async (workspace: WorkspaceSummary) => {
    if (!workspace.localPath) return;
    setWorkspaceLoading(true);
    setWorkspaceAction(null);
    try {
      const encodedPath = encodeURIComponent(workspace.localPath);
      const [statusPayload, branchPayload, diffPayload] = await Promise.all([
        fetchJson<GitStatusResponse>(`/api/git/status?workspacePath=${encodedPath}`),
        fetchJson<GitBranchesResponse>(`/api/git/branch?workspacePath=${encodedPath}`),
        fetchJson<GitDiffResponse>(`/api/git/diff?workspacePath=${encodedPath}`),
      ]);
      setGitStatus(statusPayload);
      setBranches(branchPayload);
      setDiff(diffPayload);
      setNewBranch(
        (current) => current || `studio/${workspace.name.replace(/[^A-Za-z0-9._-]+/g, '-')}`
      );
      setPrTitle((current) => current || `${workspace.name} Studio improvements`);
    } catch (err) {
      setWorkspaceAction(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const loadTree = useCallback(async (workspace: WorkspaceSummary, nextPath: string) => {
    if (!workspace.localPath) return;
    const params = new URLSearchParams({ workspacePath: workspace.localPath });
    if (nextPath) params.set('path', nextPath);
    try {
      setTree(await fetchJson<GitTreeResponse>(`/api/git/tree?${params.toString()}`));
    } catch (err) {
      setTree({
        path: nextPath,
        parentPath: null,
        entries: [],
        total: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const loadAccess = useCallback(async (repoRef: RepoRef | null) => {
    if (!repoRef) {
      setAccess(null);
      return;
    }
    try {
      const params = new URLSearchParams({ owner: repoRef.owner, repo: repoRef.repo });
      setAccess(await fetchJson<RepoAccess>(`/api/github/access?${params.toString()}`));
    } catch (err) {
      setAccess({
        role: 'unknown',
        canDirectShip: false,
        recommendedFlow: 'branch-pr',
        user: null,
        owner: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const refreshBoard = useCallback(async () => {
    if (!teamId.trim()) return;
    setBoardError(null);
    try {
      setBoard(
        await fetchJson<BoardResponse>(
          `/api/holomesh/team/${encodeURIComponent(teamId.trim())}/board`
        )
      );
    } catch (err) {
      setBoard(null);
      setBoardError(err instanceof Error ? err.message : String(err));
    }
  }, [teamId]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) return;
    void refreshJobs();
  }, [activeWorkspace, refreshJobs]);

  useEffect(() => {
    setSelectedWorkspaceIds((current) => {
      const valid = new Set(workspaces.map((workspace) => workspace.id));
      const next = new Set(Array.from(current).filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [workspaces]);

  useEffect(() => {
    void refreshWorkspaceOverview();
  }, [refreshWorkspaceOverview]);

  useEffect(() => {
    const stored =
      window.localStorage.getItem('holomesh_active_team_id') ??
      window.localStorage.getItem('workspace_workbench_team_id') ??
      process.env.NEXT_PUBLIC_HOLOMESH_TEAM_ID ??
      '';
    setTeamId(stored);
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    setTreePath('');
    void loadWorkspaceRuntime(activeWorkspace);
    void loadTree(activeWorkspace, '');
    void loadAccess(activeRepoRef);
  }, [activeRepoRef, activeWorkspace, loadAccess, loadTree, loadWorkspaceRuntime]);

  useEffect(() => {
    if (!activeWorkspace) return;
    void loadTree(activeWorkspace, treePath);
  }, [activeWorkspace, loadTree, treePath]);

  useEffect(() => {
    if (!teamId.trim()) return;
    window.localStorage.setItem('workspace_workbench_team_id', teamId.trim());
    void refreshBoard();
  }, [refreshBoard, teamId]);

  useEffect(() => {
    if (!workspaceJobs.some((job) => job.status === 'queued' || job.status === 'running')) return;
    const timer = window.setInterval(() => {
      void refreshJobs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refreshJobs, workspaceJobs]);

  async function importOneRepo(
    url: string,
    branch?: string,
    name?: string
  ): Promise<WorkspaceSummary> {
    const created = await fetchJson<WorkspaceImportResponse>('/api/workspace/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoUrl: url,
        approvedRepos: [url],
        branch: branch || undefined,
        name: name || undefined,
      }),
    });
    const workspace: WorkspaceSummary = {
      id: created.id,
      name: created.name,
      repoUrl: created.repoUrl ?? url,
      sourceUrl: created.repoUrl ?? url,
      branch: (created.branch ?? branch ?? '') || null,
      localPath: created.localPath,
      status: created.status ?? 'ready',
      currentCommit: created.currentCommit ?? null,
      fileCount: created.fileCount ?? null,
      updatedAt: created.createdAt ?? new Date().toISOString(),
      metadata: {},
      lastAbsorbedAt: null,
      absorbJobs: [],
    };
    setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)]);
    return workspace;
  }

  async function handleImport() {
    if (!repoUrl.trim()) return;
    setImporting(true);
    setWorkspaceError(null);
    try {
      const workspace = await importOneRepo(
        repoUrl.trim(),
        importBranch.trim() || undefined,
        importName.trim() || undefined
      );
      setActiveWorkspaceId(workspace.id);
      setRepoUrl('');
      setImportBranch('');
      setImportName('');
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function toggleRepoSelection(url: string) {
    setSelectedRepoUrls((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleWorkspaceSelection(id: string) {
    setSelectedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllWorkspaceSelection() {
    setSelectedWorkspaceIds((current) =>
      current.size === workspaces.length ? new Set() : new Set(workspaces.map((item) => item.id))
    );
  }

  async function handleBulkImport() {
    const urls = Array.from(selectedRepoUrls);
    if (urls.length === 0 || bulkProgress) return;
    setWorkspaceError(null);
    setBulkErrors([]);
    const errors: string[] = [];
    let firstImported: string | null = null;
    // Sequential on purpose: each import clones + kicks off absorb server-side;
    // parallel clones of N repos would stampede the workspace host.
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      setBulkProgress({ done: i, total: urls.length, current: url });
      try {
        const workspace = await importOneRepo(url);
        firstImported = firstImported ?? workspace.id;
        setSelectedRepoUrls((current) => {
          const next = new Set(current);
          next.delete(url);
          return next;
        });
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBulkProgress(null);
    setBulkErrors(errors);
    if (firstImported) setActiveWorkspaceId((current) => current ?? firstImported);
    await loadWorkspaces();
  }

  async function runWorkspaceOperation(label: string, operation: () => Promise<void>) {
    setOperationBusy(true);
    setWorkspaceAction(null);
    try {
      await operation();
      setWorkspaceAction(label);
      if (activeWorkspace) {
        await loadWorkspaceRuntime(activeWorkspace);
        await loadTree(activeWorkspace, treePath);
      }
    } catch (err) {
      setWorkspaceAction(err instanceof Error ? err.message : String(err));
    } finally {
      setOperationBusy(false);
    }
  }

  async function handleCreateBranch() {
    if (!activeWorkspace || !newBranch.trim()) return;
    await runWorkspaceOperation(`Checked out ${newBranch.trim()}.`, async () => {
      await fetchJson('/api/git/branch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspacePath: activeWorkspace.localPath,
          branch: newBranch.trim(),
        }),
      });
    });
  }

  async function handleCommit() {
    if (!activeWorkspace || !commitMessage.trim()) return;
    await runWorkspaceOperation('Commit action completed.', async () => {
      await fetchJson('/api/git/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspacePath: activeWorkspace.localPath,
          message: commitMessage.trim(),
        }),
      });
    });
  }

  async function handlePush() {
    if (!activeWorkspace) return;
    await runWorkspaceOperation(`Pushed ${branchName}.`, async () => {
      await fetchJson('/api/git/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspacePath: activeWorkspace.localPath,
          remote: 'origin',
          branch: branchName,
          force: false,
        }),
      });
    });
  }

  async function handleOpenPr() {
    if (!activeWorkspace || !activeRepoRef) return;
    await runWorkspaceOperation('Draft PR request completed.', async () => {
      await fetchJson('/api/github/pr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          owner: activeRepoRef.owner,
          repo: activeRepoRef.repo,
          title: prTitle.trim() || `${activeWorkspace.name} Studio improvements`,
          body: [
            `Workspace: ${activeWorkspace.name}`,
            `Local path: ${activeWorkspace.localPath}`,
            '',
            'Created from HoloScript Studio agent workbench.',
          ].join('\n'),
          head: branchName,
          base: prBase.trim() || 'main',
          draft: true,
        }),
      });
    });
  }

  async function handleDirectShip() {
    if (!activeWorkspace || !canDirectShip) return;
    await runWorkspaceOperation('Direct ship action completed.', async () => {
      await fetchJson('/api/git/ship', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspacePath: activeWorkspace.localPath,
          message: commitMessage.trim() || 'chore(studio): apply workspace changes',
          branch: branchName,
          remote: 'origin',
        }),
      });
    });
  }

  async function handleLaunchAgents() {
    const targets = actionWorkspaces;
    if (targets.length === 0 || bulkBusy) return;
    setWorkspaceAction(null);
    setWorkspaceBulkErrors([]);
    const errors: string[] = [];
    let firstJobId: string | null = null;
    try {
      for (let i = 0; i < targets.length; i += 1) {
        const workspace = targets[i];
        setWorkspaceBulkProgress({
          kind: 'agent',
          done: i,
          total: targets.length,
          current: workspace.name,
        });
        try {
          const job = await createJob({
            projectId: workspace.id,
            projectPath: workspace.localPath,
            profile: daemonProfile,
            projectDna: buildProjectDna(workspace, daemonProfile, selectedDaemonMission),
          });
          firstJobId = firstJobId ?? job.id;
        } catch (err) {
          errors.push(`${workspace.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (firstJobId) setSelectedJobId(firstJobId);
      setActiveTab('agent');
      await refreshJobs();
      if (errors.length > 0) {
        setWorkspaceBulkErrors(errors);
        setWorkspaceAction(
          `Assigned ${targets.length - errors.length}/${targets.length} workspaces.`
        );
      } else {
        setWorkspaceAction(
          `Assigned ${targets.length} workspace${targets.length === 1 ? '' : 's'}.`
        );
      }
    } catch (err) {
      setWorkspaceAction(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkspaceBulkProgress(null);
    }
  }

  async function handleScanStaleWorkspaces() {
    if (staleWorkspaces.length === 0 || bulkBusy) return;
    setWorkspaceAction(null);
    setWorkspaceBulkErrors([]);
    const errors: string[] = [];
    try {
      for (let i = 0; i < staleWorkspaces.length; i += 1) {
        const workspace = staleWorkspaces[i];
        setWorkspaceBulkProgress({
          kind: 'absorb',
          done: i,
          total: staleWorkspaces.length,
          current: workspace.name,
        });
        try {
          await fetchJson('/api/daemon/absorb', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              projectId: workspace.id,
              projectPath: workspace.localPath,
              depth: 'medium',
              tier: 'medium',
            }),
          });
        } catch (err) {
          errors.push(`${workspace.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await loadWorkspaces();
      await refreshWorkspaceOverview();
      if (errors.length > 0) {
        setWorkspaceBulkErrors(errors);
        setWorkspaceAction(
          `Scan-all-stale completed ${staleWorkspaces.length - errors.length}/${staleWorkspaces.length} workspaces.`
        );
      } else {
        setWorkspaceAction(
          `Scan-all-stale queued ${staleWorkspaces.length} workspace${staleWorkspaces.length === 1 ? '' : 's'}.`
        );
      }
    } finally {
      setWorkspaceBulkProgress(null);
    }
  }

  const boardTasks = useMemo(() => {
    if (!board) return [];
    const open = board.board?.open ?? [];
    const claimed = board.board?.claimed ?? [];
    const taskFallback = board.tasks ?? [];
    return [...open, ...claimed, ...taskFallback].slice(0, 12);
  }, [board]);

  const tabs: Array<{ id: WorkbenchTab; label: string; icon: typeof Code2 }> = [
    { id: 'files', label: 'Files', icon: ListTree },
    { id: 'diff', label: 'Diff', icon: Split },
    { id: 'agent', label: 'Agent', icon: Bot },
    { id: 'board', label: 'Board', icon: ClipboardCheck },
    { id: 'absorb', label: 'Absorb', icon: Activity },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-950 text-slate-100">
      {/* Workbench header */}
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Code2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-50">Agent Workbench</h2>
                <p className="truncate text-xs text-slate-400">
                  {activeWorkspace
                    ? `${activeWorkspace.name} on ${branchName}`
                    : 'Import or select a workspace'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              icon={RefreshCw}
              onClick={() => void loadWorkspaces()}
              disabled={loadingWorkspaces}
            >
              Refresh
            </IconButton>
            <IconButton
              icon={Activity}
              onClick={() => void handleScanStaleWorkspaces()}
              disabled={staleWorkspaces.length === 0 || bulkBusy}
              title="Run absorb for every stale workspace"
            >
              {`Scan stale (${staleWorkspaces.length})`}
            </IconButton>
            <IconButton
              icon={Play}
              onClick={() => void handleLaunchAgents()}
              disabled={assignmentTargetCount === 0 || creating || bulkBusy}
              variant="primary"
            >
              {selectedWorkspaceIds.size > 0
                ? `Assign ${selectedWorkspaceIds.size}`
                : 'Assign Agent'}
            </IconButton>
          </div>
        </div>
      </header>

      {/* Three-column body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* Left: import + workspace list */}
        <aside className="min-h-0 border-b border-slate-800 bg-slate-950 xl:border-b-0 xl:border-r">
          <div className="flex h-full flex-col">
            <section className="border-b border-slate-800 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
                <GitPullRequestCreate className="h-4 w-4 text-blue-300" />
                Import Repository
              </div>
              <div className="space-y-2">
                <input
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={importBranch}
                    onChange={(event) => setImportBranch(event.target.value)}
                    placeholder="branch"
                    className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                  />
                  <input
                    value={importName}
                    onChange={(event) => setImportName(event.target.value)}
                    placeholder="name"
                    className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={!repoUrl.trim() || importing}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  Import
                </button>
              </div>
              {workspaceError && <p className="mt-2 text-xs text-rose-300">{workspaceError}</p>}
            </section>

            {/* Bulk import from the signed-in user's GitHub repos */}
            <section className="border-b border-slate-800 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <ListTree className="h-4 w-4 text-blue-300" />
                  Your GitHub Repos
                </div>
                {selectedRepoUrls.size > 0 && (
                  <span className="text-xs text-blue-300">{selectedRepoUrls.size} selected</span>
                )}
              </div>
              {!githubRepos.isConnected ? (
                <p className="text-xs text-slate-500">
                  Sign in with GitHub to pick repos from your account.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      value={githubRepos.search}
                      onChange={(event) => githubRepos.setSearch(event.target.value)}
                      placeholder="Filter repos…"
                      className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                    />
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 p-1">
                    {githubRepos.isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading repos…
                      </div>
                    ) : githubRepos.error ? (
                      <p className="px-2 py-3 text-xs text-rose-300">{githubRepos.error}</p>
                    ) : githubRepos.repos.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-slate-500">No repos found.</p>
                    ) : (
                      githubRepos.repos.map((repo) => {
                        const normalizedUrl = repo.cloneUrl.toLowerCase().replace(/\.git$/, '');
                        const alreadyImported = importedRepoKeys.has(normalizedUrl);
                        const checked = selectedRepoUrls.has(repo.cloneUrl);
                        return (
                          <label
                            key={repo.id}
                            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
                              alreadyImported
                                ? 'cursor-default opacity-50'
                                : checked
                                  ? 'bg-blue-500/15 text-blue-100'
                                  : 'text-slate-300 hover:bg-slate-800/80'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={alreadyImported || bulkProgress !== null}
                              onChange={() => toggleRepoSelection(repo.cloneUrl)}
                              className="h-3.5 w-3.5 accent-blue-500"
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {repo.fullName}
                            </span>
                            {alreadyImported ? (
                              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                imported
                              </span>
                            ) : (
                              repo.language && (
                                <span className="shrink-0 text-[10px] text-slate-500">
                                  {repo.language}
                                </span>
                              )
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBulkImport()}
                    disabled={selectedRepoUrls.size === 0 || bulkProgress !== null}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {bulkProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing {bulkProgress.done + 1}/{bulkProgress.total}…
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4" />
                        Import selected ({selectedRepoUrls.size})
                      </>
                    )}
                  </button>
                  {bulkProgress && (
                    <p className="truncate text-[10px] text-slate-500">{bulkProgress.current}</p>
                  )}
                  {bulkErrors.length > 0 && (
                    <div className="space-y-0.5">
                      {bulkErrors.map((message) => (
                        <p key={message} className="text-[10px] text-rose-300">
                          {message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="border-b border-slate-800 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Activity className="h-4 w-4 text-emerald-300" />
                  Projects Overview
                </div>
                {workspaces.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllWorkspaceSelection}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-500"
                  >
                    {selectedWorkspaceIds.size === workspaces.length ? 'Clear' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {workspaces.map((workspace) => {
                  const snapshot = workspaceGitSnapshots[workspace.id];
                  const selected = selectedWorkspaceIds.has(workspace.id);
                  const agentStatus = workspaceAgentStatus(workspace, jobs);
                  const absorbStatus = workspaceAbsorbStatus(workspace);
                  const buildStatus = workspaceBuildStatus(workspace);
                  return (
                    <div
                      key={`overview:${workspace.id}`}
                      className={`rounded-lg border p-2 transition ${
                        activeWorkspaceId === workspace.id
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-900/60'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleWorkspaceSelection(workspace.id)}
                          aria-label={`Select ${workspace.name}`}
                          className="h-3.5 w-3.5 accent-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveWorkspaceId(workspace.id)}
                          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-100 hover:text-emerald-200"
                        >
                          {workspace.name}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                        <div className="min-w-0">
                          <span className="mb-1 block text-slate-500">Git</span>
                          <StatusPill status={snapshot?.status ?? 'unknown'} />
                        </div>
                        <div className="min-w-0">
                          <span className="mb-1 block text-slate-500">Absorb</span>
                          <StatusPill status={absorbStatus} />
                        </div>
                        <div className="min-w-0">
                          <span className="mb-1 block text-slate-500">Agent</span>
                          <StatusPill status={agentStatus} />
                        </div>
                        <div className="min-w-0">
                          <span className="mb-1 block text-slate-500">Build</span>
                          <StatusPill status={buildStatus} />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span className="truncate">
                          {snapshot?.branch ?? workspace.branch ?? 'branch unknown'}
                        </span>
                        <span>
                          {snapshot?.changedFiles === null || snapshot?.changedFiles === undefined
                            ? '--'
                            : `${snapshot.changedFiles} changed`}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {workspaces.length === 0 && (
                  <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-4 text-center text-xs text-slate-500">
                    No projects to summarize yet.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{selectedWorkspaceLabel}</span>
                {workspaceBulkProgress && (
                  <span className="inline-flex items-center gap-1 text-blue-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {workspaceBulkProgress.kind === 'agent' ? 'Assigning' : 'Scanning'}{' '}
                    {workspaceBulkProgress.done + 1}/{workspaceBulkProgress.total}
                  </span>
                )}
              </div>
              {workspaceBulkProgress && (
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {workspaceBulkProgress.current}
                </p>
              )}
              {workspaceBulkErrors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {workspaceBulkErrors.map((message) => (
                    <p key={message} className="text-[10px] text-rose-300">
                      {message}
                    </p>
                  ))}
                </div>
              )}
            </section>

            <section className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Workspaces
                </span>
                <span className="text-xs text-slate-500">{workspaces.length}</span>
              </div>
              <div className="space-y-2">
                {workspaces.map((workspace) => {
                  const active = workspace.id === activeWorkspaceId;
                  const selected = selectedWorkspaceIds.has(workspace.id);
                  return (
                    <div
                      key={workspace.id}
                      className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleWorkspaceSelection(workspace.id)}
                        aria-label={`Select ${workspace.name}`}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceId(workspace.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-100">
                              {workspace.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {workspace.localPath}
                            </p>
                          </div>
                          <StatusPill status={workspace.status} />
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                          <GitBranch className="h-3.5 w-3.5" />
                          <span className="truncate">{workspace.branch ?? 'unknown branch'}</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
                {!loadingWorkspaces && workspaces.length === 0 && (
                  <EmptyState>No imported workspaces found.</EmptyState>
                )}
                {loadingWorkspaces && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading workspaces
                  </div>
                )}
              </div>
            </section>
          </div>
        </aside>

        {/* Centre: active workspace + tabs */}
        <section className="min-w-0 border-b border-slate-800 bg-slate-950 xl:border-b-0">
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-slate-800 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-xl font-semibold text-slate-50">
                      {activeWorkspace?.name ?? 'No workspace selected'}
                    </h3>
                    <StatusPill status={gitStatus?.clean ? 'ready' : activeWorkspace?.status} />
                    {workspaceLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-300" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      {branchName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {activeWorkspace?.fileCount ?? tree?.total ?? 0} files
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <History className="h-3.5 w-3.5" />
                      {formatTime(activeWorkspace?.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition ${
                          active
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {workspaceAction && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                  {workspaceAction}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!activeWorkspace && <EmptyState>Select or import a workspace to begin.</EmptyState>}

              {activeWorkspace && (
                <div className="mb-4 space-y-3">
                  <ResearchLanePrompt
                    workspaceId={activeWorkspace.id}
                    localPath={activeWorkspace.localPath}
                    publishWorthiness={activeWorkspace.publishWorthiness}
                    paperUnlockState={activeWorkspace.paperUnlockState}
                    teamId={teamId}
                    onOptIn={handlePaperOptIn}
                  />
                  <ResearchLaneArtifacts paperUnlockState={activeWorkspace.paperUnlockState} />
                </div>
              )}

              {activeWorkspace && activeTab === 'files' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setTreePath('')}
                      className="text-sm text-blue-300 hover:text-blue-200"
                    >
                      root
                    </button>
                    {treePath
                      .split('/')
                      .filter(Boolean)
                      .map((part, index, parts) => {
                        const next = parts.slice(0, index + 1).join('/');
                        return (
                          <span
                            key={next}
                            className="inline-flex items-center gap-2 text-sm text-slate-400"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                            <button
                              type="button"
                              onClick={() => setTreePath(next)}
                              className="hover:text-slate-200"
                            >
                              {part}
                            </button>
                          </span>
                        );
                      })}
                  </div>
                  {tree?.error && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                      {tree.error}
                    </div>
                  )}
                  <div className="overflow-hidden rounded-lg border border-slate-800">
                    <div className="grid grid-cols-[minmax(0,1fr)_110px_140px] border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
                      <span>Name</span>
                      <span>Size</span>
                      <span>Modified</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {tree?.entries.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          onClick={() => entry.type === 'directory' && setTreePath(entry.path)}
                          className="grid w-full grid-cols-[minmax(0,1fr)_110px_140px] items-center px-3 py-2 text-left text-sm transition hover:bg-slate-900"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {entry.type === 'directory' ? (
                              <Folder className="h-4 w-4 shrink-0 text-blue-300" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                            <span className="truncate text-slate-200">{entry.name}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            {entry.type === 'file' ? formatBytes(entry.size) : '-'}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            {formatTime(entry.modifiedAt)}
                          </span>
                        </button>
                      ))}
                      {tree && tree.entries.length === 0 && (
                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                          No files in this directory.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeWorkspace && activeTab === 'diff' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
                      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <Split className="h-4 w-4 text-amber-300" />
                          Working Tree
                        </div>
                        <span className="text-xs text-slate-500">
                          +{diff?.totalAdditions ?? 0} -{diff?.totalDeletions ?? 0}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {gitStatus?.files.map((file) => (
                          <div
                            key={`${file.status}:${file.path}`}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          >
                            <span className="truncate text-slate-200">{file.path}</span>
                            <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-400">
                              {file.status}
                            </span>
                          </div>
                        ))}
                        {gitStatus?.files.length === 0 && (
                          <div className="px-3 py-8 text-center text-sm text-slate-500">
                            Working tree is clean.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {diff?.files.map((file) => (
                        <details
                          key={file.file}
                          className="rounded-lg border border-slate-800 bg-slate-900/60"
                          open
                        >
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-100">
                            {file.file}{' '}
                            <span className="text-xs text-slate-500">
                              +{file.additions} -{file.deletions}
                            </span>
                          </summary>
                          <pre className="max-h-[360px] overflow-auto border-t border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                            {file.diff}
                          </pre>
                        </details>
                      ))}
                      {diff && diff.files.length === 0 && (
                        <EmptyState>No diff to review.</EmptyState>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <GitBranch className="h-4 w-4 text-blue-300" />
                      Branch and Ship
                    </div>
                    <input
                      value={newBranch}
                      onChange={(event) => setNewBranch(event.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                    />
                    <IconButton
                      icon={GitBranch}
                      onClick={() => void handleCreateBranch()}
                      disabled={operationBusy}
                    >
                      Create Branch
                    </IconButton>
                    <textarea
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      className="min-h-[76px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                    />
                    <IconButton
                      icon={GitCommit}
                      onClick={() => void handleCommit()}
                      disabled={operationBusy}
                    >
                      Commit
                    </IconButton>
                    <IconButton
                      icon={UploadCloud}
                      onClick={() => void handlePush()}
                      disabled={operationBusy}
                    >
                      Push
                    </IconButton>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={prBase}
                        onChange={(event) => setPrBase(event.target.value)}
                        className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                      />
                      <input
                        value={prTitle}
                        onChange={(event) => setPrTitle(event.target.value)}
                        className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                      />
                    </div>
                    <IconButton
                      icon={GitPullRequest}
                      onClick={() => void handleOpenPr()}
                      disabled={operationBusy || !activeRepoRef}
                    >
                      Open Draft PR
                    </IconButton>
                    <IconButton
                      icon={Rocket}
                      onClick={() => void handleDirectShip()}
                      disabled={operationBusy || !canDirectShip}
                      variant={canDirectShip ? 'primary' : 'neutral'}
                      title={
                        access?.recommendedFlow === 'branch-pr'
                          ? 'Use branch and PR flow for this role'
                          : undefined
                      }
                    >
                      Direct Ship
                    </IconButton>
                  </div>
                </div>
              )}

              {activeWorkspace && activeTab === 'agent' && (
                <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <Bot className="h-4 w-4 text-emerald-300" />
                      Agent Assignment
                    </div>
                    <label className="block text-xs text-slate-400">
                      Mission
                      <select
                        value={daemonMissionProfile}
                        onChange={(event) =>
                          setDaemonMissionProfile(event.target.value as DaemonMissionProfile)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      >
                        {HOLO_DAEMON_MISSIONS.map((mission) => (
                          <option key={mission.id} value={mission.id}>
                            {mission.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs leading-relaxed text-slate-400">
                      {selectedDaemonMission.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedDaemonMission.defaultSkills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['quick', 'balanced', 'deep'] as DaemonProfile[]).map((profile) => (
                        <button
                          key={profile}
                          type="button"
                          onClick={() => setDaemonProfile(profile)}
                          className={`h-9 rounded-lg border text-sm capitalize transition ${
                            daemonProfile === profile
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {profile}
                        </button>
                      ))}
                    </div>
                    <IconButton
                      icon={Play}
                      onClick={() => void handleLaunchAgents()}
                      disabled={assignmentTargetCount === 0 || creating || bulkBusy}
                      variant="primary"
                    >
                      {selectedWorkspaceIds.size > 0
                        ? `Start ${selectedWorkspaceIds.size}`
                        : 'Start Job'}
                    </IconButton>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
                      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <TerminalSquare className="h-4 w-4 text-slate-300" />
                          Sessions
                        </div>
                        <IconButton icon={RefreshCw} onClick={() => void refreshJobs()}>
                          Jobs
                        </IconButton>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {workspaceJobs.map((job) => (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => setSelectedJobId(job.id)}
                            className={`grid w-full grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-3 px-3 py-2 text-left text-sm transition ${
                              selectedJob?.id === job.id ? 'bg-slate-800' : 'hover:bg-slate-900'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-slate-100">{job.id}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {job.statusMessage ?? job.summary ?? 'queued'}
                              </span>
                            </span>
                            <StatusPill status={job.status} />
                            <span className="text-right text-xs text-slate-500">
                              {job.progress}%
                            </span>
                          </button>
                        ))}
                        {workspaceJobs.length === 0 && (
                          <div className="px-3 py-8 text-center text-sm text-slate-500">
                            No agent sessions for this workspace yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedJob && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60">
                        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-100">
                              {selectedJob.id}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {selectedJob.summary ?? selectedJob.statusMessage}
                            </p>
                          </div>
                          <IconButton
                            icon={Search}
                            onClick={() => setReviewJob(selectedJob)}
                            disabled={!selectedJob.patches?.length}
                          >
                            Review
                          </IconButton>
                        </div>
                        <div className="grid grid-cols-3 gap-2 border-b border-slate-800 p-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">Patches</p>
                            <p className="font-medium text-slate-100">
                              {selectedJob.patches?.length ?? 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Files</p>
                            <p className="font-medium text-slate-100">
                              {selectedJob.metrics?.filesAnalyzed ?? 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Delta</p>
                            <p className="font-medium text-slate-100">
                              {selectedJob.metrics?.qualityDelta ?? 0}
                            </p>
                          </div>
                        </div>
                        <div className="max-h-[280px] overflow-auto p-3 font-mono text-xs text-slate-400">
                          {(selectedJob.logs ?? []).slice(-30).map((log, index) => (
                            <div key={`${log.timestamp}:${index}`} className="mb-1 flex gap-2">
                              <span className="shrink-0 text-slate-600">
                                {formatTime(log.timestamp)}
                              </span>
                              <span
                                className={
                                  log.level === 'error'
                                    ? 'text-rose-300'
                                    : log.level === 'warn'
                                      ? 'text-amber-300'
                                      : 'text-slate-300'
                                }
                              >
                                {log.message}
                              </span>
                            </div>
                          ))}
                          {(!selectedJob.logs || selectedJob.logs.length === 0) && (
                            <span>No logs yet.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeWorkspace && activeTab === 'board' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:flex-row">
                    <input
                      value={teamId}
                      onChange={(event) => setTeamId(event.target.value)}
                      placeholder="team id"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                    />
                    <IconButton
                      icon={RefreshCw}
                      onClick={() => void refreshBoard()}
                      disabled={!teamId.trim()}
                    >
                      Board
                    </IconButton>
                  </div>
                  {boardError && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                      {boardError}
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    {boardTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-slate-100">{task.title}</p>
                          <span className="shrink-0 rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                            P{task.priority ?? '?'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{task.id}</span>
                          {task.claimedByName && <span>{task.claimedByName}</span>}
                          {task.status && <span>{task.status}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {board && boardTasks.length === 0 && (
                    <EmptyState>No board tasks returned for this team.</EmptyState>
                  )}
                </div>
              )}

              {activeWorkspace && activeTab === 'absorb' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                      <Activity className="h-4 w-4 text-emerald-300" />
                      Project Evidence
                    </div>
                    <dl className="grid gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Local path</dt>
                        <dd className="break-all text-slate-200">{activeWorkspace.localPath}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Source</dt>
                        <dd className="break-all text-slate-200">
                          {activeWorkspace.repoUrl ?? 'local workspace'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Current commit</dt>
                        <dd className="font-mono text-slate-200">
                          {activeWorkspace.currentCommit ?? 'unknown'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Absorb metadata</dt>
                        <dd className="mt-1 max-h-[260px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-400">
                          {JSON.stringify(activeAbsorbProject, null, 2)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                      <ListTree className="h-4 w-4 text-blue-300" />
                      Graph Snapshot
                    </div>
                    {selectedJob?.absorb ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                            <p className="text-xs text-slate-500">Files</p>
                            <p className="text-lg font-semibold text-slate-100">
                              {selectedJob.absorb.totalFiles}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                            <p className="text-xs text-slate-500">Symbols</p>
                            <p className="text-lg font-semibold text-slate-100">
                              {selectedJob.absorb.totalSymbols}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                            <p className="text-xs text-slate-500">Hubs</p>
                            <p className="text-lg font-semibold text-slate-100">
                              {selectedJob.absorb.hubFiles.length}
                            </p>
                          </div>
                        </div>
                        <div className="max-h-[320px] overflow-auto rounded-lg border border-slate-800 bg-slate-950">
                          {selectedJob.absorb.hubFiles.map((hub) => (
                            <div
                              key={hub.path}
                              className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0"
                            >
                              <span className="truncate text-slate-200">{hub.path}</span>
                              <span className="text-xs text-slate-500">{hub.inDegree}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <EmptyState>
                        Run an agent job to populate an Absorb graph snapshot.
                      </EmptyState>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right: permission review, branch state, session timeline */}
        <aside className="min-h-0 border-slate-800 bg-slate-950 xl:border-l">
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Permission Review
              </div>
              {access ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">Role</span>
                    <span className="font-medium text-slate-100">{access.role}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">Flow</span>
                    <span className="font-medium text-slate-100">{access.recommendedFlow}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-amber-300" />
                    {access.canDirectShip
                      ? 'Direct ship is enabled for this account.'
                      : 'Branch and PR flow is active for this account.'}
                  </div>
                  {access.error && <p className="text-xs text-amber-300">{access.error}</p>}
                </div>
              ) : (
                <EmptyState>No GitHub repository selected.</EmptyState>
              )}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                <GitBranch className="h-4 w-4 text-blue-300" />
                Branch State
              </div>
              {gitStatus ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">Current</span>
                    <span className="truncate font-medium text-slate-100">{gitStatus.branch}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p className="text-xs text-slate-500">Ahead</p>
                      <p className="text-lg font-semibold text-slate-100">{gitStatus.ahead}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <p className="text-xs text-slate-500">Behind</p>
                      <p className="text-lg font-semibold text-slate-100">{gitStatus.behind}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {gitStatus.recentCommits.slice(0, 5).map((commit) => (
                      <div
                        key={commit.sha}
                        className="rounded-lg border border-slate-800 bg-slate-950 p-2"
                      >
                        <p className="font-mono text-xs text-blue-300">{commit.sha}</p>
                        <p className="truncate text-xs text-slate-400">{commit.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState>No git status loaded.</EmptyState>
              )}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                <TerminalSquare className="h-4 w-4 text-slate-300" />
                Session Timeline
              </div>
              <div className="space-y-2">
                {workspaceJobs.slice(0, 6).map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      setSelectedJobId(job.id);
                      setActiveTab('agent');
                    }}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-left transition hover:border-slate-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-200">{job.id}</span>
                      <StatusPill status={job.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {job.statusMessage ?? job.summary}
                    </p>
                  </button>
                ))}
                {workspaceJobs.length === 0 && <EmptyState>No timeline entries yet.</EmptyState>}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {reviewJob && <PatchReviewPanel job={reviewJob} onClose={() => setReviewJob(null)} />}
    </div>
  );
}
