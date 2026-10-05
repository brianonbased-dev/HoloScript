import type { DaemonJob, DaemonMissionProfile } from '@/lib/daemon/types';
import type { ProjectWorkspaceOverview, WorkspaceGitSnapshot } from './workspaceOverview';
import {
  workspaceAbsorbStatus,
  workspaceAgentStatus,
  workspaceBuildStatus,
} from './workspaceOverview';
import { absorbEmptyLabel } from '@/lib/daemon/honestyLabels';

export type HonestyTone = 'ready' | 'blocked' | 'degraded' | 'idle' | 'running' | 'neutral';

export interface ReadinessBlocker {
  code: string;
  label: string;
}

export interface WorkspaceReadiness {
  ready: boolean;
  /** Single truth label — never "Ready" when blockers exist */
  label: string;
  tone: HonestyTone;
  blockers: ReadinessBlocker[];
}

export interface JobOutcomeView {
  /** Human-first line: what it did / will do */
  headline: string;
  /** Secondary honesty line (zero-delta, empty absorb, etc.) */
  honesty: string | null;
  tone: HonestyTone;
  showProgressPercent: boolean;
  patches: number;
  filesAnalyzed: number;
  qualityDelta: number;
  absorbFiles: number;
  /** Daemon id / DNA / limits belong behind Details */
  details: {
    jobId: string;
    projectPath?: string;
    dnaConfidencePct: number;
    missionProfile?: string;
    limits?: string;
  };
}

/** Collapse Git/Absorb/Agent/Build into one truth. Blockers win over Ready. */
export function workspaceReadiness(
  workspace: ProjectWorkspaceOverview,
  jobs: DaemonJob[],
  git?: WorkspaceGitSnapshot | null,
  nowMs = Date.now()
): WorkspaceReadiness {
  const blockers: ReadinessBlocker[] = [];
  const absorb = workspaceAbsorbStatus(workspace, nowMs);
  const build = workspaceBuildStatus(workspace);
  const agent = workspaceAgentStatus(workspace, jobs);
  const gitStatus = git?.status ?? 'unknown';

  if (absorb === 'stale') {
    blockers.push({ code: 'absorb_stale', label: 'Absorb stale — refresh' });
  } else if (absorb === 'failed' || absorb === 'error') {
    blockers.push({ code: 'absorb_failed', label: 'Absorb failed — refresh' });
  }

  if (build === 'unknown') {
    blockers.push({ code: 'build_unknown', label: 'Build: unknown' });
  } else if (build === 'failing') {
    blockers.push({ code: 'build_failing', label: 'Build failing' });
  }

  if (gitStatus === 'error') {
    blockers.push({ code: 'git_error', label: 'Git error' });
  }

  if (agent === 'failed') {
    blockers.push({ code: 'agent_failed', label: 'Last agent job failed' });
  }

  // Empty / never-absorbed workspace with 0 files is not Ready.
  if ((workspace.fileCount ?? 0) === 0 && absorb === 'stale') {
    if (!blockers.some((b) => b.code === 'absorb_stale')) {
      blockers.push({ code: 'absorb_stale', label: 'Absorb stale — refresh' });
    }
  }

  if (
    agent === 'running' ||
    agent === 'queued' ||
    absorb === 'scanning' ||
    absorb === 'absorbing'
  ) {
    return {
      ready: false,
      label: agent === 'running' || agent === 'queued' ? `Agent ${agent}` : `Absorb ${absorb}`,
      tone: 'running',
      blockers,
    };
  }

  if (blockers.length > 0) {
    return {
      ready: false,
      label: blockers[0].label,
      tone:
        blockers[0].code.startsWith('build_') || blockers[0].code === 'absorb_stale'
          ? 'degraded'
          : 'blocked',
      blockers,
    };
  }

  if (gitStatus === 'dirty') {
    return {
      ready: true,
      label: 'Ready (dirty tree)',
      tone: 'ready',
      blockers: [],
    };
  }

  return { ready: true, label: 'Ready', tone: 'ready', blockers: [] };
}

export function startMissionCtaLabel(
  missionId: DaemonMissionProfile | string,
  missionName: string,
  selectedCount: number
): string {
  if (selectedCount > 1) {
    return `Start ${selectedCount} × ${missionName}`;
  }
  if (missionId === 'holoheal' || /holoheal/i.test(missionName)) {
    return 'Start HoloHeal';
  }
  return `Start ${missionName}`;
}

function absorbFileCount(job: DaemonJob): number {
  return job.absorb?.totalFiles ?? 0;
}

/** Files Absorb was handed (0 for jobs persisted before the field existed). */
function absorbFilesScanned(job: DaemonJob): number {
  return job.absorb?.filesScanned ?? 0;
}

/** Honest outcome for a daemon job card — no success lipstick on 0-delta / empty absorb. */
export function describeJobOutcome(job: DaemonJob): JobOutcomeView {
  const patches = job.patches?.length ?? 0;
  const filesAnalyzed = job.metrics?.filesAnalyzed ?? 0;
  const qualityDelta = job.metrics?.qualityDelta ?? 0;
  const absorbFiles = absorbFileCount(job);
  const filesScanned = absorbFilesScanned(job);
  const dnaConfidencePct = Math.round((job.projectDna?.confidence ?? 0) * 100);
  const missionProfile = job.projectDna?.daemonAgent?.missionProfile;
  const limits = job.limits
    ? `${job.limits.maxCycles} cycles · ${job.limits.maxFilesChanged} files · ${Math.round(job.limits.timeoutMs / 1000)}s`
    : undefined;

  const details = {
    jobId: job.id,
    projectPath: job.projectPath,
    dnaConfidencePct,
    missionProfile,
    limits,
  };

  const missionLabel =
    job.projectDna?.daemonAgent?.agentName ??
    (missionProfile ? String(missionProfile) : 'agent job');

  if (job.status === 'queued') {
    return {
      headline: `Will run ${missionLabel}`,
      honesty: null,
      tone: 'idle',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  if (job.status === 'running') {
    return {
      headline: `Running ${missionLabel}`,
      honesty: job.statusMessage ?? null,
      tone: 'running',
      showProgressPercent: true,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  // Absorb scanned N files but built no graph: Blocked, with N, whether the
  // runner stopped the job (failed) or a job still completed. Never green.
  const absorbEmptyWithFiles =
    job.absorb != null && absorbFiles === 0 && filesScanned > 0 && patches === 0;

  if (job.status === 'failed' && absorbEmptyWithFiles) {
    return {
      headline: absorbEmptyLabel(filesScanned),
      honesty: job.error ?? job.summary ?? job.statusMessage ?? 'Absorb returned an empty graph.',
      tone: 'blocked',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  if (job.status === 'failed') {
    return {
      headline: `Failed — ${missionLabel}`,
      honesty: job.error ?? job.summary ?? job.statusMessage ?? 'Job failed',
      tone: 'blocked',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  // completed
  if (absorbFiles === 0 && patches === 0) {
    return {
      headline: absorbEmptyWithFiles ? absorbEmptyLabel(filesScanned) : 'Blocked — Absorb empty',
      honesty: absorbEmptyWithFiles
        ? `Absorb built no graph from ${filesScanned} scanned files. Not a heal success — refresh Absorb or check the files are a supported language.`
        : 'Absorb returned an empty graph. Not a heal success — refresh Absorb or verify the workspace path.',
      tone: 'blocked',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  if (filesAnalyzed === 0 && patches === 0) {
    return {
      headline: 'Finished, nothing examined',
      honesty: '0 files analyzed — not claiming heal success.',
      tone: 'degraded',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  if (patches === 0 && qualityDelta === 0) {
    return {
      headline: 'Finished, nothing to change',
      honesty: `${filesAnalyzed} examined · 0 patches · delta +0`,
      tone: 'neutral',
      showProgressPercent: false,
      patches,
      filesAnalyzed,
      qualityDelta,
      absorbFiles,
      details,
    };
  }

  return {
    headline: patches > 0 ? `Proposed ${patches} change${patches === 1 ? '' : 's'}` : 'Finished',
    honesty: job.summary ?? null,
    tone: 'ready',
    showProgressPercent: false,
    patches,
    filesAnalyzed,
    qualityDelta,
    absorbFiles,
    details,
  };
}

/** Direct-ship one-liner: what it means + what to do. */
export function directShipWarning(canDirectShip: boolean): string {
  if (canDirectShip) {
    return 'Direct ship pushes to the default branch without a PR. Prefer Open Draft PR unless you intend to land on main immediately.';
  }
  return 'Direct ship is off for this account — use branch + Open Draft PR, or ask an admin to enable it in Settings.';
}
