import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';
import type { GitHubRepoItem } from '@/hooks/useGitHubRepos';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';
import type { Workspace, ProjectDNA } from '@/lib/stores/workspaceStore';
import { detectProjectDNA } from '@/lib/workspace/projectDNA';
import { useAbsorbPipelineBridge } from '@/hooks/useAbsorbPipelineBridge';
import type { PipelineTriggerConfig } from '@/lib/integrations/absorbPipelineBridge';
import { ANIM_WIZARD_STEP } from '@/lib/ui-timings';

export interface ImportRepoWizardState {
  step: number;
  prevStep: number;
  direction: 'left' | 'right';
  TOTAL_STEPS: number;

  // Step 0
  repos: ReturnType<typeof useGitHubRepos>['repos'];
  reposLoading: boolean;
  reposError: ReturnType<typeof useGitHubRepos>['error'];
  search: string;
  setSearch: (v: string) => void;
  selectedRepo: GitHubRepoItem | null;
  setSelectedRepo: (repo: GitHubRepoItem | null) => void;
  manualUrl: string;
  setManualUrl: (v: string) => void;
  useManual: boolean;
  setUseManual: (v: boolean) => void;

  // Step 1
  branch: string;
  setBranch: (v: string) => void;

  // Step 2
  importStatus: 'idle' | 'cloning' | 'absorbing' | 'detecting' | 'done' | 'error';
  importError: string | null;
  importProgress: number;

  // Step 3
  dna: ProjectDNA | null;
  absorbStats: {
    totalFiles: number;
    totalSymbols: number;
    totalLoc: number;
    durationMs: number;
  } | null;

  // Derived
  repoUrl: string;
  repoName: string;
  canNext: boolean;
  stepTitles: string[];
  isTriggering: boolean;
  config: PipelineTriggerConfig;

  // Actions
  goToStep: (next: number) => void;
  handleLaunch: () => void;
  handleAbsorbAndImprove: () => Promise<void>;
  retryImport: () => void;
  timeAgo: (dateStr: string) => string;
}

export function useImportRepoWizard(onClose: () => void): ImportRepoWizardState {
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
      setTimeout(() => goToStep(3), ANIM_WIZARD_STEP);
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

  const retryImport = useCallback(() => {
    setImportStatus('idle');
    setImportProgress(0);
    runImport();
  }, [runImport]);

  const stepTitles = [
    'Choose a repository',
    'Select branch',
    'Importing...',
    'Project DNA',
    'Workspace Ready',
  ];

  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return {
    step,
    prevStep,
    direction,
    TOTAL_STEPS,
    repos,
    reposLoading,
    reposError,
    search,
    setSearch,
    selectedRepo,
    setSelectedRepo,
    manualUrl,
    setManualUrl,
    useManual,
    setUseManual,
    branch,
    setBranch,
    importStatus,
    importError,
    importProgress,
    dna,
    absorbStats,
    repoUrl,
    repoName,
    canNext,
    stepTitles,
    isTriggering,
    config,
    goToStep,
    handleLaunch,
    handleAbsorbAndImprove,
    retryImport,
    timeAgo,
  };
}
