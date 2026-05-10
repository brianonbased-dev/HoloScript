'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
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
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { PatchReviewPanel } from '@/components/daemon/PatchReviewPanel';
import { useDaemonJobs } from '@/hooks/useDaemonJobs';
import type { DaemonJob, DaemonProfile } from '@/hooks/useDaemonJobs';

type WorkbenchTab = 'files' | 'diff' | 'agent' | 'board' | 'absorb';

interface WorkspaceSummary {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  if (status === 'ready' || status === 'complete' || status === 'completed') {
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
  if (status === 'failed' || status === 'error') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error || `Request failed (${response.status})`);
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

function StatusPill({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${statusTone(status)}`}
    >
      {status === 'failed' || status === 'error' ? (
        <XCircle className="h-3 w-3" />
      ) : status === 'running' || status === 'queued' || status === 'scanning' ? (
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

export default function WorkspaceWorkbenchPage() {
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
  const activeAbsorbProject = useMemo(() => {
    if (!activeWorkspace) return null;
    return activeWorkspace.metadata;
  }, [activeWorkspace]);
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

  const refreshJobs = useCallback(async () => {
    try {
      const nextJobs = await listJobs();
      setJobs(nextJobs);
    } catch {
      setJobs([]);
    }
  }, [listJobs]);

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
    void refreshJobs();
  }, [loadWorkspaces, refreshJobs]);

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

  async function handleImport() {
    if (!repoUrl.trim()) return;
    setImporting(true);
    setWorkspaceError(null);
    try {
      const created = await fetchJson<WorkspaceImportResponse>('/api/workspace/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: importBranch.trim() || undefined,
          name: importName.trim() || undefined,
        }),
      });
      const workspace: WorkspaceSummary = {
        id: created.id,
        name: created.name,
        repoUrl: created.repoUrl ?? repoUrl.trim(),
        sourceUrl: created.repoUrl ?? repoUrl.trim(),
        branch: (created.branch ?? importBranch.trim()) || null,
        localPath: created.localPath,
        status: created.status ?? 'ready',
        currentCommit: created.currentCommit ?? null,
        fileCount: created.fileCount ?? null,
        updatedAt: created.createdAt ?? new Date().toISOString(),
        metadata: {},
      };
      setWorkspaces((current) => [
        workspace,
        ...current.filter((item) => item.id !== workspace.id),
      ]);
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

  async function handleLaunchAgent() {
    if (!activeWorkspace) return;
    setWorkspaceAction(null);
    try {
      const job = await createJob({
        projectId: activeWorkspace.id,
        projectPath: activeWorkspace.localPath,
        profile: daemonProfile,
        projectDna: {
          kind: 'unknown',
          confidence: 0.65,
          detectedStack: [
            activeWorkspace.fileCount ? `${activeWorkspace.fileCount} files` : 'imported repo',
            activeWorkspace.branch ? `branch ${activeWorkspace.branch}` : 'git workspace',
          ],
          recommendedProfile: daemonProfile,
          notes: [
            `Workbench assigned ${activeWorkspace.name} to the Studio daemon.`,
            `Workspace path: ${activeWorkspace.localPath}`,
          ],
        },
      });
      setSelectedJobId(job.id);
      setActiveTab('agent');
      await refreshJobs();
    } catch (err) {
      setWorkspaceAction(err instanceof Error ? err.message : String(err));
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
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <GlobalNavigation />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <Code2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold text-slate-50">Agent Workbench</h1>
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
                icon={Play}
                onClick={() => void handleLaunchAgent()}
                disabled={!activeWorkspace || creating}
                variant="primary"
              >
                Assign Agent
              </IconButton>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
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
                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => setActiveWorkspaceId(workspace.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          active
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                        }`}
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

          <section className="min-w-0 border-b border-slate-800 bg-slate-950 xl:border-b-0">
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-slate-800 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-slate-50">
                        {activeWorkspace?.name ?? 'No workspace selected'}
                      </h2>
                      <StatusPill status={gitStatus?.clean ? 'ready' : activeWorkspace?.status} />
                      {workspaceLoading && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                      )}
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
                {!activeWorkspace && (
                  <EmptyState>Select or import a workspace to begin.</EmptyState>
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
                        onClick={() => void handleLaunchAgent()}
                        disabled={creating}
                        variant="primary"
                      >
                        Start Job
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
                      <span className="truncate font-medium text-slate-100">
                        {gitStatus.branch}
                      </span>
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
                        <span className="truncate text-xs font-medium text-slate-200">
                          {job.id}
                        </span>
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
      </main>
      {reviewJob && <PatchReviewPanel job={reviewJob} onClose={() => setReviewJob(null)} />}
    </div>
  );
}
