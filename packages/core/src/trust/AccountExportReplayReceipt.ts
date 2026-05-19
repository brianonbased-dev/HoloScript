/**
 * AccountExportReplayReceipt — trust receipt for deterministic replay of a
 * verified archive import.
 *
 * Produced when HoloShell replays a previously verified archive import
 * operation. The replay receipt proves that the deterministic replay
 * matches the original verification, enabling audit, rollback, and
 * cross-surface trust propagation.
 *
 * A replay can only be initiated against an archive that has already
 * produced an AccountExportArchiveReceipt with `verificationResult:
 * 'verified'` or `'verified_with_warnings'`. This receipt captures the
 * comparison between the original verification and the replay outcome.
 *
 * @see AccountExportArchiveReceipt
 * @see AccountExportArchiveVerifier
 */

import {
  TrustReceiptInput,
  TrustPermissionEnvelope,
  generateReceiptId,
} from './TrustReceipt';

import type { VerificationResult } from './AccountExportArchiveReceipt';

// ─── Replay Outcome ──────────────────────────────────────────────────────────

export type ReplayOutcome =
  | 'match'
  | 'match_with_warnings'
  | 'mismatch'
  | 'mismatch_corrupt'
  | 'mismatch_missing_files'
  | 'mismatch_sensitivity_drift'
  | 'mismatch_executable_drift'
  | 'replay_failed';

export type ReplayTrigger =
  | 'user_initiated'
  | 'audit_scheduled'
  | 'rollback'
  | 'cross_surface_sync'
  | 'integrity_check';

// ─── Replay Payload ───────────────────────────────────────────────────────────

export interface AccountExportReplayPayload {
  /** Which export workflow this replay belongs to. */
  workflow: 'browser_account_export' | string;

  /** Provider being replayed. */
  provider: string;

  /** Human-readable label for the provider. */
  providerLabel: string;

  // ─── Original verification reference ──────────────────────────────────────

  /** Receipt ID of the original AccountExportArchiveReceipt. */
  originalVerificationReceiptId: string;

  /** Archive hash from the original verification (for comparison). */
  originalArchiveHash: string;

  /** Verification result from the original verification. */
  originalVerificationResult: VerificationResult;

  // ─── Replay metadata ──────────────────────────────────────────────────────

  /** What triggered this replay. */
  trigger: ReplayTrigger;

  /** When the original verification was recorded. */
  originalVerificationTimestamp: string;

  /** When this replay was performed. */
  replayTimestamp: string;

  /** Duration of the replay in milliseconds. */
  replayDurationMs: number;

  // ─── Replay result ────────────────────────────────────────────────────────

  /** Whether the archive hash matches the original. */
  archiveHashMatch: boolean;

  /** Whether all file content hashes match the original. */
  fileContentMatch: boolean;

  /** Number of files that matched the original manifest. */
  filesMatched: number;

  /** Number of files that differed from the original manifest. */
  filesDiffered: number;

  /** Number of files present in original but missing in replay. */
  filesMissing: number;

  /** Number of files present in replay but not in original manifest. */
  filesExtra: number;

  /** Whether the sensitivity classification is unchanged. */
  sensitivityMatch: boolean;

  /** Whether the executable classification is unchanged. */
  executableMatch: boolean;

  /** Overall replay outcome. */
  replayOutcome: ReplayOutcome;

  /** Human-readable summary of the replay comparison. */
  replaySummary: string;

  /** Files that differ between original and replay, with details. */
  diffEntries: ReplayDiffEntry[];

  /** Warnings encountered during replay. */
  warnings: string[];

  /** Errors encountered during replay. */
  errors: string[];

  // ─── Custody invariants ───────────────────────────────────────────────────

  /** Whether any file was mutated during replay. */
  sourceFileMutationPerformed: boolean;

  /** Whether raw private data was published during replay. */
  rawPrivateDataPublished: boolean;

  /** Whether a private path leaked into the replay receipt. */
  privatePathLeakedToPublicReceipt: boolean;
}

// ─── Replay Diff Entry ────────────────────────────────────────────────────────

export interface ReplayDiffEntry {
  /** File path within the archive. */
  path: string;

  /** Type of difference detected. */
  diffType: 'content_hash_mismatch' | 'missing_in_replay' | 'extra_in_replay'
    | 'sensitivity_drift' | 'executable_drift' | 'size_mismatch';

  /** Original value (hash, sensitivity level, etc.). */
  originalValue: string;

  /** Replay value. */
  replayValue: string;
}

// ─── Adapter Options ──────────────────────────────────────────────────────────

export interface AccountExportReplayAdapterOptions {
  /** Canonical Passport DID for the actor. */
  passportDid: string;

  /** HoloMesh task ID linking this receipt to a board task, if any. */
  taskId?: string;

  /** Git commit this receipt is associated with, if any. */
  commit?: string;

  /** Parent receipt IDs (original verification receipt, plus any prior replays). */
  parentReceiptIds?: string[];

  /**
   * Layer-3 oracle reference.
   * Required because the replay action name contains "replay" which triggers
   * the simulation-keyword check in TrustReceipt validation. Defaults to
   * "archive_replay_verify" if not provided.
   */
  layer3OracleRef?: string;

  /** Explicit permission envelope override. */
  permissionEnvelope?: TrustPermissionEnvelope;

  /** Sync state override. Default: local_only. */
  syncState?: 'local_only' | 'synced' | 'redacted_sync' | 'sync_failed';

  /** Redacted fields for synced receipts. */
  redactedFields?: string[];
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Convert an AccountExportReplayPayload into a TrustReceiptInput suitable
 * for appending to a TrustLedger.
 */
export function replayToReceiptInput(
  payload: AccountExportReplayPayload,
  options: AccountExportReplayAdapterOptions,
): TrustReceiptInput {
  const permissionEnvelope: TrustPermissionEnvelope =
    options.permissionEnvelope ?? replayOutcomeToEnvelope(payload.replayOutcome);

  const actionName = 'account_export_archive_replay';
  const resource = `holoshell/${payload.workflow}/${payload.provider}/replay`;

  const outcome = payload.replayOutcome.startsWith('match')
    ? 'success'
    : payload.replayOutcome === 'replay_failed'
      ? 'failure'
      : 'denied';

  const payloadHash = stableReplayHash(payload);

  return {
    schemaVersion: '1.0.0',
    recordedAt: new Date().toISOString(),
    actor: {
      passportDid: options.passportDid,
      bindings: [
        { value: payload.provider, type: 'provider_export' },
        { value: payload.workflow, type: 'workflow' },
        { value: 'archive_replay', type: 'verification_phase' },
      ],
    },
    permissionEnvelope,
    action: {
      name: actionName,
      resource,
      outcome,
    },
    evidence: {
      hashes: [payloadHash],
      nonce: `archive_replay_${payload.workflow}_${payload.provider}_${Date.now()}`,
      commandHash: payload.originalArchiveHash || undefined,
      witnessRefs: [
        ...payload.errors,
        ...payload.warnings,
        ...payload.diffEntries.map((d) => `${d.path}:${d.diffType}`),
      ],
    },
    algebraicTrust: {
      layer1Strategy: 'strict_error',
      layer2HistoryRef: `provider_export/${payload.provider}/archive_replay`,
      layer3OracleRef: options.layer3OracleRef ?? 'archive_replay_verify',
    },
    links: {
      parentReceiptIds: options.parentReceiptIds,
      taskId: options.taskId,
      commit: options.commit,
    },
    storage: {
      syncState: options.syncState ?? 'local_only',
      redactedFields: options.redactedFields,
    },
  };
}

function replayOutcomeToEnvelope(outcome: ReplayOutcome): TrustPermissionEnvelope {
  switch (outcome) {
    case 'match':
    case 'match_with_warnings':
      return 'read_only';
    case 'mismatch':
    case 'mismatch_corrupt':
    case 'mismatch_missing_files':
    case 'mismatch_executable_drift':
      return 'break_glass';
    case 'mismatch_sensitivity_drift':
      return 'guarded_execute';
    case 'replay_failed':
      return 'break_glass';
    default:
      return 'read_only';
  }
}

/**
 * Deterministic hash of an AccountExportReplayPayload for evidence chaining.
 */
export function stableReplayHash(payload: AccountExportReplayPayload): string {
  const { createHash } = require('crypto');
  const canonical = JSON.stringify(canonicalizeReplayObject(payload));
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function canonicalizeReplayObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeReplayObject);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeReplayObject(entry);
      }
    }
    return sorted;
  }
  return value;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an AccountExportReplayPayload against replay verification rules.
 *
 * Rules:
 * - sourceFileMutationPerformed must be false
 * - rawPrivateDataPublished must be false
 * - privatePathLeakedToPublicReceipt must be false
 * - originalVerificationReceiptId is required
 * - originalArchiveHash is required
 * - originalVerificationResult is required
 * - replayOutcome must be consistent with match/mismatch counts
 * - If replayOutcome is 'match', no diff entries should exist
 */
export function validateReplayVerification(
  payload: AccountExportReplayPayload,
): ReplayValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!payload.workflow) errors.push('Missing workflow');
  if (!payload.provider) errors.push('Missing provider');
  if (!payload.originalVerificationReceiptId) errors.push('Missing originalVerificationReceiptId');
  if (!payload.originalArchiveHash) errors.push('Missing originalArchiveHash');
  if (!payload.originalVerificationResult) errors.push('Missing originalVerificationResult');
  if (!payload.replayTimestamp) errors.push('Missing replayTimestamp');
  if (!payload.originalVerificationTimestamp) errors.push('Missing originalVerificationTimestamp');

  // Custody invariants — must always be false
  if (payload.sourceFileMutationPerformed) {
    errors.push('sourceFileMutationPerformed must be false — replay must not mutate source files');
  }
  if (payload.rawPrivateDataPublished) {
    errors.push('rawPrivateDataPublished must be false — raw private data must not be published during replay');
  }
  if (payload.privatePathLeakedToPublicReceipt) {
    errors.push('privatePathLeakedToPublicReceipt must be false — private paths must not leak into replay receipts');
  }

  // Outcome consistency
  if (payload.replayOutcome === 'match' && payload.diffEntries.length > 0) {
    errors.push('replayOutcome is "match" but diffEntries is non-empty');
  }

  if (payload.replayOutcome === 'match' && payload.filesDiffered > 0) {
    errors.push('replayOutcome is "match" but filesDiffered is non-zero');
  }

  if (payload.replayOutcome.startsWith('mismatch') && payload.archiveHashMatch && payload.fileContentMatch) {
    warnings.push('replayOutcome indicates mismatch but archiveHashMatch and fileContentMatch are both true');
  }

  if (payload.replayOutcome === 'replay_failed' && payload.replayDurationMs > 0) {
    // This is fine — a failed replay can still have taken time
  }

  // Timing consistency
  if (payload.replayDurationMs < 0) {
    errors.push('replayDurationMs must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}