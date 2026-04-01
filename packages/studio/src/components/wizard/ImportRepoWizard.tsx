'use client';

/**
 * ImportRepoWizard — 5-step wizard for importing GitHub repos into Studio.
 *
 * Step 0: "Choose a repo" (GitHub repo list or manual URL)
 * Step 1: "Select branch" (shows branches for chosen repo)
 * Step 2: "Importing..." (clone + absorb progress)
 * Step 3: "Project DNA" (inferred classification + daemon recommendation)
 * Step 4: "Workspace Ready" (summary + launch)
 *
 * Matches StudioSetupWizard's visual language (emerald accent, AnimatedStep, same layout).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  GitBranch,
  Search,
  Loader2,
  FolderGit2,
  Globe,
  Lock,
  GitFork,
  Star,
  AlertCircle,
  Zap,
  BarChart2,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';
import type { GitHubRepoItem } from '@/hooks/useGitHubRepos';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';
import type { Workspace, ProjectDNA } from '@/lib/stores/workspaceStore';
import { detectProjectDNA } from '@/lib/workspace/projectDNA';
import { useAbsorbPipelineBridge } from '@/hooks/useAbsorbPipelineBridge';

// ─── Animated step (shared with StudioSetupWizard) ──────────────────────────

function AnimatedStep({
  visible,
  direction,
  children,
}: {
  visible: boolean;
  direction: 'left' | 'right';
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const enterFrom = direction === 'right' ? 'translate-x-8' : '-translate-x-8';

  return (
    <div
      ref={ref}
      className={`absolute inset-0 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-x-0' : `opacity-0 ${enterFrom}`
      }`}
    >
      {children}
    </div>
  );
}

// ─── Kind badge ──────────────────────────────────────────────────────────────

const KIND_META: Record<string, { emoji: string; label: string; color: string }> = {
  service: { emoji: '🔧', label: 'API / Service', color: 'text-blue-400' },
  frontend: { emoji: '🎨', label: 'Frontend App', color: 'text-purple-400' },
  data: { emoji: '📊', label: 'Data Pipeline', color: 'text-amber-400' },
  automation: { emoji: '🤖', label: 'Automation / Bot', color: 'text-orange-400' },
  'agent-backend': { emoji: '🧠', label: 'Agent / MCP Backend', color: 'text-cyan-400' },
  library: { emoji: '📦', label: 'Library / Package', color: 'text-green-400' },
  spatial: { emoji: '🌐', label: 'Spatial / XR', color: 'text-emerald-400' },
  storefront: { emoji: '🏪', label: 'Storefront / Retail', color: 'text-lime-400' },
  unknown: { emoji: '❓', label: 'Unknown', color: 'text-gray-400' },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface ImportRepoWizardProps {
  onClose: () => void;
}

export function ImportRepoWizard({ onClose }: ImportRepoWizardProps) {
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const { config, triggerPipeline, isTriggering } = useAbsorbPipelineBridge();

  const [step, setStep] = useState(0);
  const [prevStep, setPrevStep] = useState(0);

  // Step 0: Repo selection
  const { repos, isLoading: reposLoading, error: reposError, search, setSearch } = useGitHubRepos();
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [useManual, setUseManual] = useState(false);

  // Step 1: Branch
  const [branch, setBranch] = useState('');

  // Step 2: Import progress
  const [importStatus, setImportStatus] = useState<
    'idle' | 'cloning' | 'absorbing' | 'detecting' | 'done' | 'error'
  >('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Step 3: DNA results
  const [dna, setDna] = useState<ProjectDNA | null>(null);
  const [absorbStats, setAbsorbStats] = useState<{
    totalFiles: number;
    totalSymbols: number;
    totalLoc: number;
    durationMs: number;
  } | null>(null);

  const direction: 'left' | 'right' = step >= prevStep ? 'right' : 'left';
  const TOTAL_STEPS = 5;

  const goToStep = useCallback(
    (next: number) => {
      setPrevStep(step);
      setStep(next);
    },
    [step]
  );

  // Effective repo URL
  const repoUrl = useManual ? manualUrl.trim() : (selectedRepo?.cloneUrl ?? '');
  const repoName = useManual
    ? manualUrl.replace(/.*\/([^/]+?)(?:\.git)?$/, '$1')
    : (selectedRepo?.name ?? '');

  // When a repo is selected, default to its branch
  useEffect(() => {
    if (selectedRepo && !useManual) {
      setBranch(selectedRepo.defaultBranch);
    }
  }, [selectedRepo, useManual]);

  // ── Import flow (Step 2) ──

  const runImport = useCallback(async () => {
    if (!repoUrl) return;

    setImportStatus('cloning');
    setImportError(null);
    setImportProgress(15);

    try {
      // Phase 1: Clone
      const cloneRes = await fetch('/api/workspace/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch: branch || undefined,
          name: repoName,
        }),
      });

      if (!cloneRes.ok) {
        const body = await cloneRes.json().catch(() => ({ error: 'Clone failed' }));
        throw new Error(body.error ?? `Clone failed: HTTP ${cloneRes.status}`);
      }

      const cloneResult = await cloneRes.json();
      const wsId = cloneResult.id;
      setWorkspaceId(wsId);
      setImportProgress(40);

      // Create workspace entry in store
      const ws: Workspace = {
        id: wsId,
        name: cloneResult.name,
        repoUrl,
        branch: cloneResult.branch,
        localPath: cloneResult.localPath,
        status: 'absorbing',
        dna: null,
        absorbedAt: null,
        createdAt: cloneResult.createdAt,
        error: null,
        stats: null,
      };
      addWorkspace(ws);
      setImportStatus('absorbing');

      // Phase 2: Absorb
      setImportProgress(55);
      const absorbRes = await fetch('/api/daemon/absorb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: cloneResult.localPath,
          depth: 'medium',
        }),
      });

      if (!absorbRes.ok) {
        const body = await absorbRes.json().catch(() => ({ error: 'Absorb failed' }));
        throw new Error(body.error ?? `Absorb failed: HTTP ${absorbRes.status}`);
      }

      const absorbResult = await absorbRes.json();
      setImportProgress(80);
      setAbsorbStats({
        totalFiles: absorbResult.stats.totalFiles,
        totalSymbols: absorbResult.stats.totalSymbols,
        totalLoc: absorbResult.stats.totalLoc,
        durationMs: absorbResult.durationMs,
      });

      // Phase 3: Detect DNA
      setImportStatus('detecting');
      setImportProgress(90);

      const detectedDna = detectProjectDNA({
        stats: absorbResult.stats,
        hubFiles: absorbResult.hubFiles,
        leafFirstOrder: absorbResult.leafFirstOrder,
      });
      setDna(detectedDna);

      // Update workspace with results
      updateWorkspace(wsId, {
        status: 'ready',
        dna: detectedDna,
        absorbedAt: absorbResult.absorbedAt,
        stats: {
          totalFiles: absorbResult.stats.totalFiles,
          totalSymbols: absorbResult.stats.totalSymbols,
          totalLoc: absorbResult.stats.totalLoc,
        },
      });

      setImportProgress(100);
      setImportStatus('done');

      // Auto-advance to DNA step
      setTimeout(() => goToStep(3), 600);
    } catch (err) {
      setImportStatus('error');
      setImportError((err as Error).message ?? 'Import failed');
      if (workspaceId) {
        updateWorkspace(workspaceId, { status: 'error', error: (err as Error).message });
      }
    }
  }, [repoUrl, branch, repoName, addWorkspace, updateWorkspace, goToStep, workspaceId]);

  // Kick off import when Step 2 becomes visible
  useEffect(() => {
    if (step === 2 && importStatus === 'idle') {
      runImport();
    }
  }, [step, importStatus, runImport]);

  // ── Handle Absorb & Improve ──
  const handleAbsorbAndImprove = useCallback(async () => {
    if (!absorbStats || !repoUrl) return;

    const event = {
      projectPath: repoUrl,
      stats: {
        filesProcessed: absorbStats.totalFiles || 0,
        patternsDetected: absorbStats.totalSymbols || 0,
        technologiesFound: dna?.languages || [],
        confidence: dna?.confidence || 0,
      },
    };

    await triggerPipeline(event);
  }, [absorbStats, repoUrl, dna, triggerPipeline]);

  // ── Validation ──

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return useManual
          ? manualUrl.startsWith('https://') || manualUrl.startsWith('git@')
          : !!selectedRepo;
      case 1:
        return !!branch;
      case 2:
        return importStatus === 'done';
      case 3:
        return !!dna;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, selectedRepo, manualUrl, useManual, branch, importStatus, dna]);

  // ── Launch ──

  const handleLaunch = useCallback(() => {
    if (workspaceId) {
      setActiveWorkspace(workspaceId);
    }
    onClose();
  }, [workspaceId, setActiveWorkspace, onClose]);

  const stepTitles = [
    'Choose a repository',
    'Select branch',
    'Importing...',
    'Project DNA',
    'Workspace Ready',
  ];

  // ── Time formatting ──
  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl border border-studio-border bg-studio-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <FolderGit2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-studio-text">{stepTitles[step]}</p>
              <p className="text-xs text-studio-muted">
                Step {step + 1} of {TOTAL_STEPS}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/20">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="relative min-h-[360px] p-6">
          {/* ── Step 0: Choose repo ── */}
          <AnimatedStep visible={step === 0} direction={direction}>
            <div className="flex flex-col gap-3">
              {/* Toggle: GitHub list vs manual URL */}
              <div className="flex gap-2 mb-1">
                <button
                  onClick={() => setUseManual(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    !useManual
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                      : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  My Repositories
                </button>
                <button
                  onClick={() => setUseManual(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    useManual
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                      : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Paste URL
                </button>
              </div>

              {useManual ? (
                /* Manual URL input */
                <div>
                  <label className="text-xs font-medium text-studio-text mb-1.5 block">
                    Repository URL
                  </label>
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className="w-full rounded-lg border border-studio-border bg-black/30 px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
                  />
                  <p className="text-[10px] text-studio-muted mt-1.5">
                    Supports HTTPS and SSH URLs. Private repos require GitHub authentication.
                  </p>
                </div>
              ) : (
                /* GitHub repo list */
                <div>
                  {/* Search */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-studio-muted" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search repositories..."
                      className="w-full rounded-lg border border-studio-border bg-black/30 pl-9 pr-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
                    />
                  </div>

                  {/* Repo list */}
                  <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-1">
                    {reposLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                        <span className="ml-2 text-sm text-studio-muted">Loading repos...</span>
                      </div>
                    )}

                    {reposError && (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
                        <AlertCircle className="h-8 w-8 text-amber-400" />
                        <div>
                          <p className="text-sm font-semibold text-amber-300">
                            GitHub Not Connected
                          </p>
                          <p className="text-[11px] text-amber-300/70 mt-1 max-w-[240px] mx-auto">
                            {reposError ||
                              'You must connect your GitHub account in the Integration Hub before importing repositories.'}
                          </p>
                        </div>
                        <a
                          href="/integrations"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-500/20 px-4 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200 transition"
                        >
                          Open Integration Hub
                        </a>
                      </div>
                    )}

                    {!reposLoading && !reposError && repos.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-sm text-studio-muted">No repositories found</p>
                        <p className="text-[10px] text-studio-muted mt-1">
                          Try a different search or paste a URL
                        </p>
                      </div>
                    )}

                    {repos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo)}
                        className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                          selectedRepo?.id === repo.id
                            ? 'border-blue-500/60 bg-blue-500/10 scale-[1.01]'
                            : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {repo.isPrivate ? (
                            <Lock className="h-4 w-4 text-amber-400" />
                          ) : repo.isFork ? (
                            <GitFork className="h-4 w-4 text-studio-muted" />
                          ) : (
                            <FolderGit2 className="h-4 w-4 text-studio-muted" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-studio-text truncate">
                              {repo.name}
                            </span>
                            {repo.language && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-studio-muted">
                                {repo.language}
                              </span>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-[11px] text-studio-muted mt-0.5 truncate">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-studio-muted">
                            {repo.stars > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3" /> {repo.stars}
                              </span>
                            )}
                            <span>{repo.defaultBranch}</span>
                            <span>{timeAgo(repo.pushedAt)}</span>
                          </div>
                        </div>
                        {selectedRepo?.id === repo.id && (
                          <Check className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AnimatedStep>

          {/* ── Step 1: Branch ── */}
          <AnimatedStep visible={step === 1} direction={direction}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                <FolderGit2 className="h-5 w-5 text-blue-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-studio-text">{repoName}</p>
                  <p className="text-[11px] text-studio-muted truncate">{repoUrl}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-studio-text mb-1.5 block">
                  Branch to import
                </label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-studio-muted" />
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder={selectedRepo?.defaultBranch ?? 'main'}
                    className="w-full rounded-lg border border-studio-border bg-black/30 pl-9 pr-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-blue-500/60 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-studio-muted mt-1.5">
                  Leave as default branch or type a specific branch name.
                </p>
              </div>

              <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                <p className="text-xs font-medium text-studio-text mb-2">What happens next:</p>
                <div className="flex flex-col gap-1.5 text-[11px] text-studio-muted">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">1.</span> Shallow clone into Studio workspace
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">2.</span> Absorb + index the entire codebase
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">3.</span> Detect Project DNA (stack, shape,
                    risk)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">4.</span> Recommend daemon improvement strategy
                  </div>
                </div>
              </div>
            </div>
          </AnimatedStep>

          {/* ── Step 2: Import progress ── */}
          <AnimatedStep visible={step === 2} direction={direction}>
            <div className="flex flex-col items-center justify-center gap-6 py-8">
              {importStatus === 'error' ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                    <AlertCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-red-400">Import Failed</p>
                    <p className="text-[11px] text-studio-muted mt-1 max-w-xs">{importError}</p>
                  </div>
                  <button
                    onClick={() => {
                      setImportStatus('idle');
                      setImportProgress(0);
                      runImport();
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-1.5 text-sm text-blue-400 transition hover:bg-blue-500/30"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <div className="relative">
                    <Loader2
                      className={`h-12 w-12 text-blue-400 ${importStatus !== 'done' ? 'animate-spin' : ''}`}
                    />
                    {importStatus === 'done' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="h-6 w-6 text-emerald-400" />
                      </div>
                    )}
                  </div>

                  <div className="text-center">
                    <p className="text-sm font-semibold text-studio-text">
                      {importStatus === 'cloning' && 'Cloning repository...'}
                      {importStatus === 'absorbing' && 'Absorbing codebase...'}
                      {importStatus === 'detecting' && 'Detecting Project DNA...'}
                      {importStatus === 'done' && 'Import complete!'}
                      {importStatus === 'idle' && 'Preparing...'}
                    </p>
                    <p className="text-[11px] text-studio-muted mt-1">
                      {importStatus === 'cloning' && `Cloning ${repoName} (${branch})...`}
                      {importStatus === 'absorbing' &&
                        'Scanning files, symbols, and import graph...'}
                      {importStatus === 'detecting' && 'Classifying repo type and risk profile...'}
                      {importStatus === 'done' && 'All scans complete.'}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full max-w-xs">
                    <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-700 ease-out"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-studio-muted mt-1 text-center">
                      {importProgress}%
                    </p>
                  </div>
                </>
              )}
            </div>
          </AnimatedStep>

          {/* ── Step 3: Project DNA ── */}
          <AnimatedStep visible={step === 3} direction={direction}>
            {dna && (
              <div className="flex flex-col gap-4">
                {/* Kind badge */}
                <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                  <span className="text-3xl">{KIND_META[dna.kind]?.emoji ?? '❓'}</span>
                  <div>
                    <p
                      className={`text-sm font-semibold ${KIND_META[dna.kind]?.color ?? 'text-studio-text'}`}
                    >
                      {KIND_META[dna.kind]?.label ?? dna.kind}
                    </p>
                    <p className="text-[11px] text-studio-muted">
                      {Math.round(dna.confidence * 100)}% confidence
                      {dna.repoShape !== 'unknown' && ` \u00b7 ${dna.repoShape}`}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {absorbStats && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                      <p className="text-lg font-bold text-studio-text">
                        {absorbStats.totalFiles.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-studio-muted">Files</p>
                    </div>
                    <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                      <p className="text-lg font-bold text-studio-text">
                        {absorbStats.totalSymbols.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-studio-muted">Symbols</p>
                    </div>
                    <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                      <p className="text-lg font-bold text-studio-text">
                        {absorbStats.totalLoc.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-studio-muted">Lines</p>
                    </div>
                  </div>
                )}

                {/* Languages + frameworks */}
                <div className="flex flex-col gap-2">
                  {dna.languages.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-studio-text mb-1">Languages</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dna.languages.slice(0, 8).map((lang) => (
                          <span
                            key={lang}
                            className="rounded-md bg-white/5 border border-studio-border px-2 py-0.5 text-[10px] text-studio-muted"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {dna.frameworks.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-studio-text mb-1">Frameworks</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dna.frameworks.map((fw) => (
                          <span
                            key={fw}
                            className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] text-blue-400"
                          >
                            {fw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Strengths + risks */}
                <div className="grid grid-cols-2 gap-2">
                  {dna.strengths.length > 0 && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                      <p className="text-[10px] font-medium text-emerald-400 mb-1 flex items-center gap-1">
                        <Shield className="h-3 w-3" /> Strengths
                      </p>
                      {dna.strengths.map((s) => (
                        <p key={s} className="text-[10px] text-studio-muted">
                          {s}
                        </p>
                      ))}
                    </div>
                  )}
                  {dna.riskSignals.length > 0 && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                      <p className="text-[10px] font-medium text-amber-400 mb-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Risks
                      </p>
                      {dna.riskSignals.map((r) => (
                        <p key={r} className="text-[10px] text-studio-muted">
                          {r}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommended daemon */}
                <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-black/20 p-3">
                  <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-studio-text">
                      Recommended: <span className="text-blue-400">{dna.recommendedProfile}</span>{' '}
                      daemon
                    </p>
                    <p className="text-[10px] text-studio-muted">
                      Mode: {dna.recommendedMode} \u00b7 Based on project DNA analysis
                    </p>
                  </div>
                </div>
              </div>
            )}
          </AnimatedStep>

          {/* ── Step 4: Workspace Ready ── */}
          <AnimatedStep visible={step === 4} direction={direction}>
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 shadow-2xl shadow-emerald-500/20">
                <Check className="h-10 w-10 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-studio-text">Workspace Ready</p>
                <p className="text-sm text-studio-muted mt-1">
                  {repoName} has been imported and indexed.
                </p>
              </div>

              {dna && (
                <div className="w-full flex flex-col gap-2">
                  <div className="flex items-center gap-3 rounded-xl border border-studio-border bg-black/20 p-3">
                    <span className="text-2xl">{KIND_META[dna.kind]?.emoji ?? '❓'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-studio-text">
                        {KIND_META[dna.kind]?.label}
                      </p>
                      <p className="text-[10px] text-studio-muted">
                        {dna.languages.slice(0, 3).join(', ')} \u00b7 {dna.repoShape}
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                      {Math.round(dna.confidence * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-studio-muted justify-center">
                    {absorbStats && (
                      <>
                        <span>{absorbStats.totalFiles.toLocaleString()} files</span>
                        <span className="text-studio-border">\u00b7</span>
                        <span>{absorbStats.totalLoc.toLocaleString()} LOC</span>
                        <span className="text-studio-border">\u00b7</span>
                        <span>Indexed in {(absorbStats.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 text-[11px] text-studio-muted w-full">
                <p className="text-xs font-medium text-studio-text">
                  {dna?.kind === 'storefront' ? 'Your storefront is ready:' :
                   dna?.kind === 'service' ? 'Your service is ready:' :
                   dna?.kind === 'spatial' ? 'Your spatial project is ready:' :
                   dna?.kind === 'data' ? 'Your data pipeline is ready:' :
                   'Next steps:'}
                </p>

                {/* Storefront-specific actions */}
                {dna?.kind === 'storefront' && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-lime-400" />
                      <span>Generate spatial storefront from your product data</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-lime-400" />
                      <span>Deploy to phone, web, Quest, and AR simultaneously</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-lime-400" />
                      <span>Set up IoT monitoring if you have a physical operation</span>
                    </div>
                  </>
                )}

                {/* Service-specific actions */}
                {dna?.kind === 'service' && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>Convert routes and models to .holo service compositions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>Extract knowledge (W/P/G) from your architecture</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>Run the {dna.recommendedProfile} daemon for safe improvements</span>
                    </div>
                  </>
                )}

                {/* Spatial-specific actions */}
                {dna?.kind === 'spatial' && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-emerald-400" />
                      <span>Open in the Editor — your scene is ready to compile</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-emerald-400" />
                      <span>Compile to any of 37 targets from the same source</span>
                    </div>
                  </>
                )}

                {/* Frontend-specific actions */}
                {dna?.kind === 'frontend' && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-purple-400" />
                      <span>Scan components for spatial conversion candidates</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-purple-400" />
                      <span>Extract UI patterns into .holo compositions</span>
                    </div>
                  </>
                )}

                {/* Data-specific actions */}
                {dna?.kind === 'data' && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-amber-400" />
                      <span>Map your data schema to spatial traits automatically</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-amber-400" />
                      <span>Generate monitoring dashboards as .holo compositions</span>
                    </div>
                  </>
                )}

                {/* Generic fallback for other kinds */}
                {(!dna?.kind || !['storefront', 'service', 'spatial', 'frontend', 'data'].includes(dna.kind)) && (
                  <>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>View the architecture graph in the Codebase panel</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>Run the {dna?.recommendedProfile ?? 'recommended'} daemon for improvements</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-blue-400" />
                      <span>Extract knowledge and publish to HoloMesh</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </AnimatedStep>
        </div>

        {/* Summary chips */}
        {step > 0 && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                <FolderGit2 className="h-3 w-3" /> {repoName}
              </span>
              {step >= 1 && branch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  <GitBranch className="h-3 w-3" /> {branch}
                </span>
              )}
              {step >= 3 && dna && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] text-blue-400">
                  {KIND_META[dna.kind]?.emoji} {KIND_META[dna.kind]?.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => (step > 0 && step !== 2 ? goToStep(step - 1) : onClose())}
            disabled={step === 2 && importStatus !== 'error'}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30 disabled:opacity-40"
            >
              {step === 1 ? 'Import' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAbsorbAndImprove}
                disabled={isTriggering || !config.autoStart}
                className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-4 py-1.5 text-sm font-medium text-purple-400 transition hover:bg-purple-500/30 disabled:opacity-40"
                title={
                  config.autoStart
                    ? 'Trigger recursive pipeline'
                    : 'Enable auto-start in /integrations'
                }
              >
                {isTriggering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Absorb & Improve
              </button>
              <button
                onClick={handleLaunch}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95"
              >
                <BarChart2 className="h-4 w-4" />
                Open Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
