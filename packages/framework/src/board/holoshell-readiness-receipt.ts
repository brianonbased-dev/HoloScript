/**
 * HoloShell Source-Native Readiness Receipt
 *
 * A composite receipt that aggregates git status, HoloScript validation,
 * pnpm build, device-lab, graph status, and task filing into one
 * replayable evidence pack for non-developer HoloShell rooms.
 *
 * task_1778739828973_uirq
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';
import type { LocalCliAbsorptionReceipt } from './holoshell-cli-receipts';
import { cloneLocalCliAbsorptionReceipt } from './holoshell-cli-receipts';

// ── Sub-receipts ──

/** Git status snapshot captured at readiness time. */
export interface ReadinessGitStatus {
  /** Branch name at capture time. */
  branch: string;
  /** Short commit hash of HEAD. */
  commitShort: string;
  /** Number of files with unstaged changes. */
  changedFiles: number;
  /** Number of files staged in the index. */
  stagedFiles: number;
  /** Number of untracked files. */
  untrackedFiles: number;
  /** Ahead/behind upstream, e.g. "+2/-1" or "0/0". */
  aheadBehind: string;
  /** True when the worktree has zero changes, zero staged, zero untracked. */
  isClean: boolean;
}

/** A single source-validation check (lint, type-check, format, etc.). */
export interface ReadinessValidationCheck {
  /** Check identifier, e.g. `tsc-noemit`, `eslint`, `prettier`. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Outcome of this check. */
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  /** Exit code, if applicable. */
  exitCode?: number;
  /** File count processed, if known. */
  fileCount?: number;
  /** Error count, if applicable. */
  errorCount?: number;
  /** Warning count, if applicable. */
  warningCount?: number;
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Hash of the check output (stdout or report file). */
  outputHash?: string;
}

/** HoloScript source validation sub-receipt. */
export interface ReadinessSourceValidation {
  /** Overall validation status — fail if any required check failed. */
  status: 'pass' | 'warn' | 'fail';
  /** Individual checks run against the source. */
  checks: ReadinessValidationCheck[];
  /** HoloScript core version used for validation. */
  holoScriptVersion?: string;
}

/** A single device-lab probe check embedded in the readiness receipt. */
export interface ReadinessDeviceLabCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}

/** Device-lab sub-receipt — lightweight copy of hololand-platform schema. */
export interface ReadinessDeviceLabStatus {
  /** Overall device-lab status. */
  status: 'pass' | 'warn' | 'fail';
  /** Individual hardware probes. */
  checks: ReadinessDeviceLabCheck[];
  /** GPU/WebGPU adapter info, if available. */
  gpuAdapter?: string;
  /** Node version detected. */
  nodeVersion?: string;
  /** pnpm version detected. */
  pnpmVersion?: string;
}

/** Codebase graph status sub-receipt. */
export interface ReadinessGraphStatus {
  /** Whether the graph was successfully loaded. */
  graphLoaded: boolean;
  /** Number of nodes in the graph. */
  nodeCount: number;
  /** Number of edges in the graph. */
  edgeCount: number;
  /** Type errors detected via graph analysis. */
  typeErrors?: number;
  /** Human-readable graph health summary. */
  summary?: string;
}

/** Task filing sub-receipt — records what was seeded to the board. */
export interface ReadinessTaskFiling {
  /** Number of tasks filed during the readiness workflow. */
  tasksFiled: number;
  /** IDs of filed tasks, if known at receipt time. */
  taskIds?: string[];
  /** Source that triggered the filing, e.g. `holoshell-human-os-frontier`. */
  seedSource?: string;
  /** Board mode at filing time. */
  boardMode?: string;
}

// ── Overall outcome ──

export const READINESS_OUTCOMES = ['pass', 'warn', 'fail'] as const;
export type ReadinessOutcome = (typeof READINESS_OUTCOMES)[number];

// ── Composite receipt ──

/**
 * HoloShell source-native readiness receipt.
 *
 * Aggregates six sub-receipts (git, build, validation, device-lab, graph,
 * task-filing) into a single replayable evidence pack. Designed for
 * non-developer HoloShell rooms that need deterministic proof a machine
 * is ready to build HoloLand worlds.
 */
export interface HoloShellReadinessReceipt {
  /** Stable receipt id, e.g. `holoshell_readiness_20260514_xyz`. */
  id: string;
  /** Workflow identifier, e.g. `prepare-computer-for-hololand-world`. */
  workflow: string;
  /** ISO-8601 timestamp when the readiness workflow started. */
  startedAt: string;
  /** ISO-8601 timestamp when the readiness workflow ended. */
  endedAt: string;

  // ── Sub-receipts ──
  gitStatus: ReadinessGitStatus;
  buildReceipt: LocalCliAbsorptionReceipt;
  sourceValidation: ReadinessSourceValidation;
  deviceLab: ReadinessDeviceLabStatus;
  graphStatus: ReadinessGraphStatus;
  taskFiling?: ReadinessTaskFiling;

  /** Overall readiness outcome — fail if any required sub-receipt failed. */
  overallOutcome: ReadinessOutcome;
  /** Human-readable summary, kept short (under ~200 chars by convention). */
  summary?: string;

  /** Hash of the canonical receipt body (id + workflow + ordered sub-receipts). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that reproduce the readiness workflow. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Validators ──

function validateReadinessGitStatus(git: ReadinessGitStatus): string[] {
  const errors: string[] = [];
  if (!git.branch) errors.push('ReadinessGitStatus.branch is required.');
  if (typeof git.changedFiles !== 'number' || git.changedFiles < 0) {
    errors.push('ReadinessGitStatus.changedFiles must be a non-negative number.');
  }
  if (typeof git.stagedFiles !== 'number' || git.stagedFiles < 0) {
    errors.push('ReadinessGitStatus.stagedFiles must be a non-negative number.');
  }
  if (typeof git.untrackedFiles !== 'number' || git.untrackedFiles < 0) {
    errors.push('ReadinessGitStatus.untrackedFiles must be a non-negative number.');
  }
  if (typeof git.isClean !== 'boolean') {
    errors.push('ReadinessGitStatus.isClean must be a boolean.');
  }
  return errors;
}

function validateReadinessValidationCheck(check: ReadinessValidationCheck): string[] {
  const errors: string[] = [];
  if (!check.id) errors.push('ReadinessValidationCheck.id is required.');
  if (!check.label) errors.push('ReadinessValidationCheck.label is required.');
  if (!isSupportedReadinessStatus(check.status)) {
    errors.push(`ReadinessValidationCheck.status is unsupported: ${String(check.status)}.`);
  }
  if (check.exitCode !== undefined && typeof check.exitCode !== 'number') {
    errors.push(`ReadinessValidationCheck ${check.id || '<unknown>'}.exitCode must be a number.`);
  }
  if (check.durationMs !== undefined && (typeof check.durationMs !== 'number' || check.durationMs < 0)) {
    errors.push(`ReadinessValidationCheck ${check.id || '<unknown>'}.durationMs must be a non-negative number.`);
  }
  if (check.fileCount !== undefined && (typeof check.fileCount !== 'number' || check.fileCount < 0)) {
    errors.push(`ReadinessValidationCheck ${check.id || '<unknown>'}.fileCount must be a non-negative number.`);
  }
  if (check.errorCount !== undefined && (typeof check.errorCount !== 'number' || check.errorCount < 0)) {
    errors.push(`ReadinessValidationCheck ${check.id || '<unknown>'}.errorCount must be a non-negative number.`);
  }
  if (check.warningCount !== undefined && (typeof check.warningCount !== 'number' || check.warningCount < 0)) {
    errors.push(`ReadinessValidationCheck ${check.id || '<unknown>'}.warningCount must be a non-negative number.`);
  }
  return errors;
}

function validateReadinessSourceValidation(sv: ReadinessSourceValidation): string[] {
  const errors: string[] = [];
  if (!isSupportedReadinessStatus(sv.status)) {
    errors.push(`ReadinessSourceValidation.status is unsupported: ${String(sv.status)}.`);
  }
  if (!Array.isArray(sv.checks)) {
    errors.push('ReadinessSourceValidation.checks must be an array.');
  } else {
    for (const check of sv.checks) {
      errors.push(...validateReadinessValidationCheck(check));
    }
  }
  return errors;
}

function validateReadinessDeviceLabCheck(check: ReadinessDeviceLabCheck): string[] {
  const errors: string[] = [];
  if (!check.id) errors.push('ReadinessDeviceLabCheck.id is required.');
  if (!check.label) errors.push('ReadinessDeviceLabCheck.label is required.');
  if (!isSupportedReadinessStatus(check.status)) {
    errors.push(`ReadinessDeviceLabCheck.status is unsupported: ${String(check.status)}.`);
  }
  return errors;
}

function validateReadinessDeviceLabStatus(dl: ReadinessDeviceLabStatus): string[] {
  const errors: string[] = [];
  if (!isSupportedReadinessStatus(dl.status)) {
    errors.push(`ReadinessDeviceLabStatus.status is unsupported: ${String(dl.status)}.`);
  }
  if (!Array.isArray(dl.checks)) {
    errors.push('ReadinessDeviceLabStatus.checks must be an array.');
  } else {
    for (const check of dl.checks) {
      errors.push(...validateReadinessDeviceLabCheck(check));
    }
  }
  return errors;
}

function validateReadinessGraphStatus(gs: ReadinessGraphStatus): string[] {
  const errors: string[] = [];
  if (typeof gs.graphLoaded !== 'boolean') {
    errors.push('ReadinessGraphStatus.graphLoaded must be a boolean.');
  }
  if (typeof gs.nodeCount !== 'number' || gs.nodeCount < 0) {
    errors.push('ReadinessGraphStatus.nodeCount must be a non-negative number.');
  }
  if (typeof gs.edgeCount !== 'number' || gs.edgeCount < 0) {
    errors.push('ReadinessGraphStatus.edgeCount must be a non-negative number.');
  }
  if (gs.typeErrors !== undefined && (typeof gs.typeErrors !== 'number' || gs.typeErrors < 0)) {
    errors.push('ReadinessGraphStatus.typeErrors must be a non-negative number.');
  }
  return errors;
}

function validateReadinessTaskFiling(tf: ReadinessTaskFiling): string[] {
  const errors: string[] = [];
  if (typeof tf.tasksFiled !== 'number' || tf.tasksFiled < 0) {
    errors.push('ReadinessTaskFiling.tasksFiled must be a non-negative number.');
  }
  if (tf.taskIds !== undefined && !Array.isArray(tf.taskIds)) {
    errors.push('ReadinessTaskFiling.taskIds must be an array.');
  }
  return errors;
}

/**
 * Validate a HoloShellReadinessReceipt. Returns a list of validation errors;
 * empty array means the receipt is structurally valid.
 */
export function validateHoloShellReadinessReceipt(receipt: HoloShellReadinessReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('HoloShellReadinessReceipt.id is required.');
  if (!receipt.workflow) errors.push('HoloShellReadinessReceipt.workflow is required.');

  if (
    receipt.startedAt === undefined ||
    receipt.startedAt === null ||
    receipt.startedAt === '' ||
    Number.isNaN(Date.parse(receipt.startedAt))
  ) {
    errors.push('HoloShellReadinessReceipt.startedAt is required and must be a valid ISO-8601 timestamp.');
  }
  if (
    receipt.endedAt === undefined ||
    receipt.endedAt === null ||
    receipt.endedAt === '' ||
    Number.isNaN(Date.parse(receipt.endedAt))
  ) {
    errors.push('HoloShellReadinessReceipt.endedAt is required and must be a valid ISO-8601 timestamp.');
  }

  if (!receipt.gitStatus || typeof receipt.gitStatus !== 'object') {
    errors.push('HoloShellReadinessReceipt.gitStatus is required.');
  } else {
    errors.push(...validateReadinessGitStatus(receipt.gitStatus));
  }

  if (!receipt.buildReceipt || typeof receipt.buildReceipt !== 'object') {
    errors.push('HoloShellReadinessReceipt.buildReceipt is required.');
  }

  if (!receipt.sourceValidation || typeof receipt.sourceValidation !== 'object') {
    errors.push('HoloShellReadinessReceipt.sourceValidation is required.');
  } else {
    errors.push(...validateReadinessSourceValidation(receipt.sourceValidation));
  }

  if (!receipt.deviceLab || typeof receipt.deviceLab !== 'object') {
    errors.push('HoloShellReadinessReceipt.deviceLab is required.');
  } else {
    errors.push(...validateReadinessDeviceLabStatus(receipt.deviceLab));
  }

  if (!receipt.graphStatus || typeof receipt.graphStatus !== 'object') {
    errors.push('HoloShellReadinessReceipt.graphStatus is required.');
  } else {
    errors.push(...validateReadinessGraphStatus(receipt.graphStatus));
  }

  if (receipt.taskFiling) {
    errors.push(...validateReadinessTaskFiling(receipt.taskFiling));
  }

  if (!isSupportedReadinessOutcome(receipt.overallOutcome)) {
    errors.push(`HoloShellReadinessReceipt.overallOutcome is unsupported: ${String(receipt.overallOutcome)}.`);
  }

  if (!receipt.hash) errors.push('HoloShellReadinessReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('HoloShellReadinessReceipt.hashAlgorithm is required.');

  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(`HoloShellReadinessReceipt ${receipt.id || '<unknown>'} has a verification command without command text.`);
    }
  }

  return errors;
}

// ── Type guards ──

export function isSupportedReadinessOutcome(outcome: string): outcome is ReadinessOutcome {
  return (READINESS_OUTCOMES as readonly string[]).includes(outcome);
}

const READINESS_STATUSES = ['pass', 'warn', 'fail', 'skipped'] as const;

export function isSupportedReadinessStatus(status: string): status is 'pass' | 'warn' | 'fail' | 'skipped' {
  return (READINESS_STATUSES as readonly string[]).includes(status);
}

// ── Cloning ──

function cloneReadinessGitStatus(git: ReadinessGitStatus): ReadinessGitStatus {
  return { ...git };
}

function cloneReadinessValidationCheck(check: ReadinessValidationCheck): ReadinessValidationCheck {
  return { ...check };
}

function cloneReadinessSourceValidation(sv: ReadinessSourceValidation): ReadinessSourceValidation {
  return {
    ...sv,
    checks: sv.checks.map(cloneReadinessValidationCheck),
  };
}

function cloneReadinessDeviceLabCheck(check: ReadinessDeviceLabCheck): ReadinessDeviceLabCheck {
  return { ...check };
}

function cloneReadinessDeviceLabStatus(dl: ReadinessDeviceLabStatus): ReadinessDeviceLabStatus {
  return {
    ...dl,
    checks: dl.checks.map(cloneReadinessDeviceLabCheck),
  };
}

function cloneReadinessGraphStatus(gs: ReadinessGraphStatus): ReadinessGraphStatus {
  return { ...gs };
}

function cloneReadinessTaskFiling(tf: ReadinessTaskFiling): ReadinessTaskFiling {
  return {
    ...tf,
    ...(tf.taskIds ? { taskIds: [...tf.taskIds] } : {}),
  };
}

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
): ArtifactVerificationCommand[] | undefined {
  if (!commands) return undefined;
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

function cloneProvenance(
  provenance: ArtifactProvenanceLink | undefined,
): ArtifactProvenanceLink | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}

export function cloneHoloShellReadinessReceipt(
  receipt: HoloShellReadinessReceipt,
): HoloShellReadinessReceipt {
  return {
    ...receipt,
    gitStatus: cloneReadinessGitStatus(receipt.gitStatus),
    buildReceipt: cloneLocalCliAbsorptionReceipt(receipt.buildReceipt),
    sourceValidation: cloneReadinessSourceValidation(receipt.sourceValidation),
    deviceLab: cloneReadinessDeviceLabStatus(receipt.deviceLab),
    graphStatus: cloneReadinessGraphStatus(receipt.graphStatus),
    ...(receipt.taskFiling ? { taskFiling: cloneReadinessTaskFiling(receipt.taskFiling) } : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
