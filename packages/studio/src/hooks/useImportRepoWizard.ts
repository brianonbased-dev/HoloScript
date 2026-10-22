import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGitHubRepos } from '@/hooks/useGitHubRepos';
import type { GitHubRepoItem } from '@/hooks/useGitHubRepos';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';
import type {
  ConversionAction,
  ConversionCandidate,
  PaperUnlockState,
  PublishWorthinessSummary,
  Workspace,
  ProjectDNA,
} from '@/lib/stores/workspaceStore';
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
  conversionCandidates: ConversionCandidate[];
  conversionActions: Record<string, ConversionAction>;

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
  acceptConversionCandidate: (candidateId: string) => void;
  dismissConversionCandidate: (candidateId: string) => void;
  exportConversionCandidates: () => void;
  retryImport: () => void;
  timeAgo: (dateStr: string) => string;
}

interface WorkspaceImportResponse {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  localPath: string;
  createdAt: string;
  conversionCandidates?: ConversionCandidate[];
  conversionManifestPath?: string;
  publishWorthiness?: PublishWorthinessSummary | null;
  paperUnlockState?: PaperUnlockState | null;
}

/**
 * Absorb answers these BEFORE any charge (bad URL or branch, no credential,
 * not enough credits, refused, not found, too large, clone timeout). Only these
 * roll a new workspace back.
 */
const CLEAN_ABSORB_REFUSALS: ReadonlySet<number> = new Set([400, 401, 402, 403, 404, 413, 504]);

/** One importId per workspace: a retry of the same workspace replays, never recharges. */
export function absorbImportIdFor(workspaceId: string): string {
  return `imp-${workspaceId}`;
}

export function useImportRepoWizard(onClose: () => void): ImportRepoWizardState {
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
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
  const [conversionCandidates, setConversionCandidates] = useState<ConversionCandidate[]>([]);
  const [conversionActions, setConversionActions] = useState<Record<string, ConversionAction>>({});
  const [conversionManifestPath, setConversionManifestPath] = useState<string | null>(null);

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
  // An absorb whose outcome is unknown (timeout, 5xx, 409, network error) may
  // have been charged. Its workspace is kept, and the next attempt re-asks
  // absorb with the SAME workspace and importId, which replays a finished
  // import at cost 0 instead of cloning again and charging again
  // (Treasurer, #617).
  const pendingAbsorbRef = useRef<{ repoUrl: string; cloneResult: WorkspaceImportResponse } | null>(null);

  const runImport = useCallback(async () => {
    if (!repoUrl) return;

    setImportStatus('cloning');
    setImportError(null);
    setImportProgress(15);

    // Tracked locally: the `workspaceId` state is stale inside this callback,
    // so the old catch never saw the workspace it had just created.
    let createdWsId: string | null = null;
    let absorbSucceeded = false;
    let absorbAttempted = false;
    let cleanRefusal = false;
    const pending = pendingAbsorbRef.current?.repoUrl === repoUrl ? pendingAbsorbRef.current : null;
    let cloneForRetry: WorkspaceImportResponse | null = pending?.cloneResult ?? null;
    try {
      let cloneResult: WorkspaceImportResponse;
      if (pending) {
        // Retry of an absorb with an unknown outcome: no new clone, same ids.
        cloneResult = pending.cloneResult;
        createdWsId = cloneResult.id;
        setWorkspaceId(cloneResult.id);
        updateWorkspace(cloneResult.id, { status: 'absorbing', error: null });
        setImportStatus('absorbing');
      } else {
      // Phase 1: Clone
      const cloneRes = await fetch('/api/workspace/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          approvedRepos: [repoUrl],
          branch: branch || undefined,
          name: repoName,
        }),
      });

      if (!cloneRes.ok) {
        const body = await cloneRes.json().catch(() => ({ error: 'Clone failed' }));
        throw new Error(body.error ?? `Clone failed: HTTP ${cloneRes.status}`);
      }

      cloneResult = (await cloneRes.json()) as WorkspaceImportResponse;
      cloneForRetry = cloneResult;
      createdWsId = cloneResult.id;
      const wsId = cloneResult.id;
      const candidates = cloneResult.conversionCandidates ?? [];
      setWorkspaceId(wsId);
      setConversionCandidates(candidates);
      setConversionActions({});
      setConversionManifestPath(cloneResult.conversionManifestPath ?? null);
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
        conversionCandidates: candidates,
        conversionManifestPath: cloneResult.conversionManifestPath ?? null,
        conversionActions: {},
        publishWorthiness: cloneResult.publishWorthiness ?? null,
        paperUnlockState: cloneResult.paperUnlockState ?? null,
      };
      addWorkspace(ws);
      setImportStatus('absorbing');
      }
      const wsId = cloneResult.id;
      const candidates = cloneResult.conversionCandidates ?? [];

      // Phase 2: Absorb
      setImportProgress(55);
      const absorbRes = await fetch('/api/daemon/absorb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // absorb clones the repo itself from the workspace's URL (it cannot
        // see Studio's clone). One importId per WORKSPACE, derived from its
        // id: every retry for this workspace replays instead of recharging.
        body: JSON.stringify({
          workspaceId: wsId,
          importId: absorbImportIdFor(wsId),
          depth: 'medium',
        }),
      }).finally(() => {
        absorbAttempted = true;
      });

      if (!absorbRes.ok) {
        // Only a refusal that absorb answers BEFORE any charge may roll the
        // workspace back; anything else may have been charged.
        cleanRefusal = CLEAN_ABSORB_REFUSALS.has(absorbRes.status);
        const body = await absorbRes.json().catch(() => ({ error: 'Absorb failed' }));
        throw new Error(body.error ?? `Absorb failed: HTTP ${absorbRes.status}`);
      }

      const absorbResult = await absorbRes.json().catch(() => null);
      // A 200 without stats is not a finished absorb (a tool error once came
      // back this way and crashed on stats.totalFiles). Fail cleanly instead,
      // so the catch below reports it and cleans up the workspace.
      if (!absorbResult?.stats || typeof absorbResult.stats.totalFiles !== 'number') {
        const reason =
          typeof absorbResult?.error === 'string' && absorbResult.error
            ? absorbResult.error
            : 'the absorb service returned no results';
        throw new Error(`Absorb failed: ${reason}`);
      }
      absorbSucceeded = true;
      pendingAbsorbRef.current = null;
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
        conversionCandidates: candidates,
        conversionManifestPath: cloneResult.conversionManifestPath ?? null,
        conversionActions: {},
      });

      setImportProgress(100);
      setImportStatus('done');

      // Auto-advance to DNA step
      setTimeout(() => goToStep(3), ANIM_WIZARD_STEP);
    } catch (err) {
      setImportStatus('error');
      setImportError((err as Error).message ?? 'Import failed');
      // A failed import cleans up after itself: roll back the clone on the
      // server and drop the local entry, so no orphan "stale" workspace stays.
      // Only before absorb succeeded: a later DNA/UI error keeps the
      // absorbed workspace and marks it errored instead.
      if (createdWsId && absorbSucceeded) {
        updateWorkspace(createdWsId, { status: 'error', error: (err as Error).message });
      } else if (createdWsId && absorbAttempted && !cleanRefusal) {
        // Outcome unknown (may have been charged): keep the workspace, and let
        // the next attempt replay the same importId before anything is rolled back.
        updateWorkspace(createdWsId, { status: 'error', error: (err as Error).message });
        if (cloneForRetry) pendingAbsorbRef.current = { repoUrl, cloneResult: cloneForRetry };
      } else if (createdWsId) {
        pendingAbsorbRef.current = null;
        const failedId = createdWsId;
        removeWorkspace(failedId);
        setWorkspaceId(null);
        await fetch(`/api/workspace/import?id=${encodeURIComponent(failedId)}`, {
          method: 'DELETE',
        }).catch((cleanupErr: unknown) => {
          console.error('[import] rollback of failed workspace failed:', cleanupErr);
        });
      }
    }
  }, [repoUrl, branch, repoName, addWorkspace, updateWorkspace, removeWorkspace, goToStep]);

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

  const setConversionAction = useCallback(
    (candidateId: string, action: ConversionAction) => {
      setConversionActions((prev) => {
        const next = { ...prev, [candidateId]: action };
        if (workspaceId) updateWorkspace(workspaceId, { conversionActions: next });
        return next;
      });
    },
    [updateWorkspace, workspaceId]
  );

  const acceptConversionCandidate = useCallback(
    (candidateId: string) => setConversionAction(candidateId, 'accepted'),
    [setConversionAction]
  );

  const dismissConversionCandidate = useCallback(
    (candidateId: string) => setConversionAction(candidateId, 'dismissed'),
    [setConversionAction]
  );

  const exportConversionCandidates = useCallback(() => {
    if (conversionCandidates.length === 0) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaceId,
      repoUrl,
      branch,
      conversionManifestPath,
      candidates: conversionCandidates.map((candidate) => ({
        ...candidate,
        decision: conversionActions[candidate.id] ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${repoName || 'workspace'}-conversion-candidates.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [
    branch,
    conversionActions,
    conversionCandidates,
    conversionManifestPath,
    repoName,
    repoUrl,
    workspaceId,
  ]);

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
    // Fire provision in the background so the user gets a HoloMesh agent identity
    // and their ai-workspace config repo is seeded. Non-blocking — failures are silent.
    // The import flow already has GitHub auth, so provision can run the full pipeline.
    fetch('/api/workspace/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consent: { scaffold: true, absorb: false, daemon: true, publishKnowledge: false },
      }),
    }).catch(() => {
      // Non-fatal — user can re-run /onboard later
    });
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
    conversionCandidates,
    conversionActions,
    repoUrl,
    repoName,
    canNext,
    stepTitles,
    isTriggering,
    config,
    goToStep,
    handleLaunch,
    handleAbsorbAndImprove,
    acceptConversionCandidate,
    dismissConversionCandidate,
    exportConversionCandidates,
    retryImport,
    timeAgo,
  };
}
