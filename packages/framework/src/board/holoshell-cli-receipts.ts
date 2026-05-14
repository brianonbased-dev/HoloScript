/**
 * HoloShell Local Project CLI Absorption Receipts — Pilot
 *
 * Receipt types for local command-line workflows absorbed into HoloScript.
 * Package managers, build orchestrators, test runners, and local process
 * invocations produce deterministic evidence: exit code, stdout/stderr,
 * lockfile diffs, and build artifact hashes.
 *
 * Trust floor: `known` (per legacy-absorption-paths.md CLI / PowerShell path).
 * Target upgrade: Native API / MCP when vendor ships first-party programmatic surface.
 *
 * Phase 1 pilot — may migrate to dedicated @holoshell/cli package when
 * the absorption surface stabilizes.
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── CLI Action ──

export const CLI_ACTION_KINDS = [
  'exec',
  'install',
  'build',
  'test',
  'lint',
  'format',
  'clean',
  'deploy',
  'other',
] as const;

export type CliActionKind = (typeof CLI_ACTION_KINDS)[number];

/** A single step in a local CLI workflow sequence. */
export interface CliAction {
  /** Sequential step number within the receipt. */
  step: number;
  /** Action family. */
  kind: CliActionKind;
  /** ISO-8601 timestamp when the action was executed. */
  timestamp: string;
  /** Command binary invoked (e.g., 'npm', 'cargo', 'make'). */
  command?: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Working directory for this step. */
  cwd?: string;
  /** Exit code returned by the process. */
  exitCode?: number;
  /** Hash of captured stdout, if captured. */
  stdoutHash?: string;
  /** Hash of captured stderr, if captured. */
  stderrHash?: string;
  /** Hash of produced artifact for this step, if any. */
  artifactHash?: string;
  /** Wall-clock duration of the action in milliseconds. */
  durationMs?: number;
}

// ── Policy Envelope ──

/**
 * Policy envelope that constrains a local CLI automation session.
 * Matches the HoloScript safety envelope pattern but scoped to
 * local shell risks (path traversal, arbitrary execution, secret leakage,
 * resource exhaustion).
 */
export interface LocalCliPolicy {
  /** Binaries the agent is permitted to invoke. Empty = all permitted (dangerous). */
  allowedBinaries: string[];
  /** Binaries the agent must never invoke. Blacklist overrides whitelist. */
  blockedBinaries: string[];
  /** Paths the agent is permitted to read or write. */
  allowedPaths: string[];
  /** Paths the agent must never touch. Blacklist overrides whitelist. */
  blockedPaths: string[];
  /** Maximum total session duration in milliseconds. */
  maxDurationMs: number;
  /** Maximum memory the spawned process may consume in megabytes. */
  maxMemoryMb?: number;
  /** Whether to capture stdout. */
  captureStdout: boolean;
  /** Whether to capture stderr. */
  captureStderr: boolean;
  /** Whether to capture the exit code. */
  captureExitCode: boolean;
  /** Whether to compute a diff of lockfiles before vs after. */
  captureLockfileDiff: boolean;
  /** Whether to capture network activity (e.g., npm install fetching packages). */
  captureNetworkLog: boolean;
  /** Whether to audit relevant environment variable names (values are never captured). */
  auditEnvironment: boolean;
}

// ── Receipt ──

/**
 * Local project CLI absorption pilot receipt.
 *
 * Evidence produced by a local shell process operating behind a
 * HoloScript policy envelope. The receipt is the deterministic, auditable
 * record that a CLI workflow executed as claimed.
 */
export interface LocalCliAbsorptionReceipt {
  /** Stable receipt id, e.g. `cli_build_holoscript_20260513_xyz`. */
  id: string;
  /** Absolute path to the project directory operated against. */
  projectPath: string;
  /** Primary binary invoked. */
  binary: string;
  /** Arguments passed to the primary binary. */
  args: string[];
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
  /** ISO-8601 timestamp when the session ended. */
  endedAt: string;
  /** Policy envelope that constrained this session. */
  policy: LocalCliPolicy;
  /** Exit code returned by the primary process. */
  exitCode: number;
  /** Hash of captured stdout, if captured. */
  stdoutHash?: string;
  /** Hash of captured stderr, if captured. */
  stderrHash?: string;
  /** Hash of the computed lockfile diff, if captured. */
  lockfileDiffHash?: string;
  /** Hash of the final build artifact, if produced. */
  buildArtifactHash?: string;
  /** Hash of the captured network log, if captured. */
  networkLogHash?: string;
  /** Hash of the environment-variable name audit, if audited. */
  environmentAuditHash?: string;
  /** Ordered action sequence that reproduces the session. */
  actions: CliAction[];
  /** Overall outcome of the session. */
  outcome: 'success' | 'failure' | 'timeout' | 'blocked_by_policy';
  /** Human-readable summary, kept short (under ~200 chars by convention). */
  summary?: string;
  /** Hash of the canonical receipt body (id + projectPath + binary + args + ordered actions + policy + exitCode). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that reproduce the automation. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Validators ──

/**
 * Validate a LocalCliAbsorptionReceipt. Returns a list of validation errors;
 * empty array means the receipt is structurally valid.
 */
export function validateLocalCliAbsorptionReceipt(receipt: LocalCliAbsorptionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('LocalCliAbsorptionReceipt.id is required.');
  if (!receipt.projectPath) errors.push('LocalCliAbsorptionReceipt.projectPath is required.');
  if (!receipt.binary) errors.push('LocalCliAbsorptionReceipt.binary is required.');

  if (
    receipt.startedAt === undefined ||
    receipt.startedAt === null ||
    receipt.startedAt === '' ||
    Number.isNaN(Date.parse(receipt.startedAt))
  ) {
    errors.push('LocalCliAbsorptionReceipt.startedAt is required and must be a valid ISO-8601 timestamp.');
  }
  if (
    receipt.endedAt === undefined ||
    receipt.endedAt === null ||
    receipt.endedAt === '' ||
    Number.isNaN(Date.parse(receipt.endedAt))
  ) {
    errors.push('LocalCliAbsorptionReceipt.endedAt is required and must be a valid ISO-8601 timestamp.');
  }

  if (typeof receipt.exitCode !== 'number') {
    errors.push('LocalCliAbsorptionReceipt.exitCode is required and must be a number.');
  }

  // Policy validation
  if (!receipt.policy || typeof receipt.policy !== 'object') {
    errors.push('LocalCliAbsorptionReceipt.policy is required.');
  } else {
    const p = receipt.policy;
    if (!Array.isArray(p.allowedBinaries)) {
      errors.push('LocalCliAbsorptionReceipt.policy.allowedBinaries must be an array.');
    }
    if (!Array.isArray(p.blockedBinaries)) {
      errors.push('LocalCliAbsorptionReceipt.policy.blockedBinaries must be an array.');
    }
    if (!Array.isArray(p.allowedPaths)) {
      errors.push('LocalCliAbsorptionReceipt.policy.allowedPaths must be an array.');
    }
    if (!Array.isArray(p.blockedPaths)) {
      errors.push('LocalCliAbsorptionReceipt.policy.blockedPaths must be an array.');
    }
    if (p.maxDurationMs === undefined || typeof p.maxDurationMs !== 'number' || p.maxDurationMs < 0) {
      errors.push('LocalCliAbsorptionReceipt.policy.maxDurationMs must be a non-negative number.');
    }
    if (p.maxMemoryMb !== undefined && (typeof p.maxMemoryMb !== 'number' || p.maxMemoryMb < 0)) {
      errors.push('LocalCliAbsorptionReceipt.policy.maxMemoryMb must be a non-negative number.');
    }
    if (typeof p.captureStdout !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.captureStdout must be a boolean.');
    }
    if (typeof p.captureStderr !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.captureStderr must be a boolean.');
    }
    if (typeof p.captureExitCode !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.captureExitCode must be a boolean.');
    }
    if (typeof p.captureLockfileDiff !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.captureLockfileDiff must be a boolean.');
    }
    if (typeof p.captureNetworkLog !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.captureNetworkLog must be a boolean.');
    }
    if (typeof p.auditEnvironment !== 'boolean') {
      errors.push('LocalCliAbsorptionReceipt.policy.auditEnvironment must be a boolean.');
    }
    for (const action of p.allowedBinaries ?? []) {
      if (typeof action !== 'string') {
        errors.push('LocalCliAbsorptionReceipt.policy.allowedBinaries must contain only strings.');
      }
    }
  }

  if (!receipt.hash) errors.push('LocalCliAbsorptionReceipt.hash is required.');
  if (!receipt.hashAlgorithm) {
    errors.push('LocalCliAbsorptionReceipt.hashAlgorithm is required.');
  }

  if (!Array.isArray(receipt.actions)) {
    errors.push('LocalCliAbsorptionReceipt.actions must be an array.');
  } else {
    for (const action of receipt.actions) {
      if (typeof action.step !== 'number' || action.step < 0 || !Number.isInteger(action.step)) {
        errors.push(`CliAction step must be a non-negative integer.`);
      }
      if (!isSupportedCliActionKind(action.kind)) {
        errors.push(`CliAction kind is unsupported: ${String(action.kind)}.`);
      }
      if (
        action.timestamp === undefined ||
        action.timestamp === null ||
        action.timestamp === '' ||
        Number.isNaN(Date.parse(action.timestamp))
      ) {
        errors.push(`CliAction step ${action.step ?? '?'} timestamp is invalid.`);
      }
      if (action.durationMs !== undefined && (typeof action.durationMs !== 'number' || action.durationMs < 0)) {
        errors.push(`CliAction step ${action.step ?? '?'} durationMs must be a non-negative number.`);
      }
      if (action.exitCode !== undefined && typeof action.exitCode !== 'number') {
        errors.push(`CliAction step ${action.step ?? '?'} exitCode must be a number.`);
      }
    }
  }

  if (!isSupportedCliAbsorptionOutcome(receipt.outcome)) {
    errors.push(`LocalCliAbsorptionReceipt.outcome is unsupported: ${String(receipt.outcome)}.`);
  }

  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(`LocalCliAbsorptionReceipt ${receipt.id || '<unknown>'} has a verification command without command text.`);
    }
  }

  return errors;
}

// ── Type guards ──

export function isSupportedCliActionKind(kind: string): kind is CliActionKind {
  return (CLI_ACTION_KINDS as readonly string[]).includes(kind);
}

const CLI_ABSORPTION_OUTCOMES = ['success', 'failure', 'timeout', 'blocked_by_policy'] as const;

export function isSupportedCliAbsorptionOutcome(
  outcome: string,
): outcome is LocalCliAbsorptionReceipt['outcome'] {
  return (CLI_ABSORPTION_OUTCOMES as readonly string[]).includes(outcome);
}

// ── Cloning ──

function cloneCliActions(actions: CliAction[]): CliAction[] {
  return actions.map((a) => ({ ...a, args: a.args ? [...a.args] : undefined }));
}

function cloneCliPolicy(policy: LocalCliPolicy): LocalCliPolicy {
  return {
    ...policy,
    allowedBinaries: [...policy.allowedBinaries],
    blockedBinaries: [...policy.blockedBinaries],
    allowedPaths: [...policy.allowedPaths],
    blockedPaths: [...policy.blockedPaths],
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

export function cloneLocalCliAbsorptionReceipt(
  receipt: LocalCliAbsorptionReceipt,
): LocalCliAbsorptionReceipt {
  return {
    ...receipt,
    args: [...receipt.args],
    policy: cloneCliPolicy(receipt.policy),
    actions: cloneCliActions(receipt.actions),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
