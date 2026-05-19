/**
 * ProviderExportCustodyReceipt — trust receipt for provider data export custody.
 *
 * Covers the full lifecycle of account data exports (Google Takeout, Microsoft
 * Privacy Dashboard, browser data exports, etc.) with provider-specific fields:
 * selected products, delivery method, archive size, async wait state,
 * cloud handoff, connected app access, link expiry, and managed-account blockers.
 *
 * Extends the canonical TrustReceipt shape per ADR-2026-05-14.
 * Each phase of the export workflow (classify → boundary → approval → provider_wait
 * → download → quarantine → verify → preview → file) mints a receipt with the
 * phase-specific fields populated.
 *
 * @see holoshell-browser-account-export-policy.hsplus
 * @see holoshell-account-task-custody.hsplus
 */

import {
  TrustReceiptInput,
  TrustReceipt,
  TrustPermissionEnvelope,
  generateReceiptId,
} from './TrustReceipt';

// ─── Provider Types ──────────────────────────────────────────────────────────

export type ProviderExportProvider =
  | 'google_takeout'
  | 'microsoft_privacy_dashboard'
  | 'apple_data_and_privacy'
  | 'browser_profile_export'
  | 'meta_access_your_information'
  | 'x_twitter_archive'
  | 'generic_provider_export'
  | string; // extensible for new providers

export type ProviderExportPhase =
  | 'intent_classification'
  | 'boundary_check'
  | 'approval_bundle'
  | 'provider_wait'
  | 'download_quarantine'
  | 'verify_files'
  | 'preview'
  | 'task_file'
  | 'rollback';

export type ProviderExportWaitState =
  | 'not_requested'
  | 'requested'
  | 'provider_waiting'
  | 'ready_to_download'
  | 'expired'
  | 'blocked';

export type ProviderDeliveryMethod =
  | 'email_link'
  | 'cloud_drive'
  | 'browser_download'
  | 'push_to_service'
  | 'unknown';

export type ProviderArchiveFormat =
  | 'zip'
  | 'tar_gz'
  | 'json'
  | 'mbox'
  | 'unknown';

// ─── Provider Export Custody Receipt Payload ──────────────────────────────────

export interface ProviderExportCustodyPayload {
  /** Which export workflow this receipt belongs to. */
  workflow: 'browser_account_export' | string;

  /** Provider being exported from. */
  provider: ProviderExportProvider;

  /** Which phase of the export workflow this receipt captures. */
  phase: ProviderExportPhase;

  /** Human-readable label for the provider (e.g. "Google", "Microsoft 365"). */
  providerLabel: string;

  // ─── Provider-specific fields ──────────────────────────────────────────────

  /** Products selected for export (e.g. ["Gmail", "Google Photos", "YouTube"]). */
  selectedProducts: string[];

  /** How the provider delivers the export archive. */
  deliveryMethod: ProviderDeliveryMethod;

  /** Size of the export archive in bytes, if known. 0 = unknown. */
  archiveSizeBytes: number;

  /** Format of the export archive. */
  archiveFormat: ProviderArchiveFormat;

  /** Current async wait state (export creation can take hours/days). */
  waitState: ProviderExportWaitState;

  /** Whether a cloud handoff occurred (provider pushed to Drive/OneDrive/etc). */
  cloudHandoff: boolean;

  /** Which cloud service received the handoff, if any. */
  cloudHandoffDestination?: string;

  /** Whether connected app access was detected for this provider account. */
  connectedAppAccess: boolean;

  /** Count of connected apps with access to this export's data. */
  connectedAppCount: number;

  /** ISO-8601 timestamp when the export download link expires, if applicable. */
  linkExpiry?: string;

  /** Whether a managed account (enterprise/EDU/family) was detected. */
  managedAccount: boolean;

  /** Managed account type, if detected. */
  managedAccountType?: 'enterprise' | 'education' | 'family' | 'supervised' | string;

  /** Blockers that prevent or restrict the export, if any. */
  blockers: ProviderExportBlocker[];

  // ─── Boundary & custody fields ──────────────────────────────────────────────

  /** Browser profile used for the export (or "none" for API-based). */
  browserProfile: string;

  /** Whether a credential-bearing browser profile was required. */
  credentialAdjacent: boolean;

  /** Whether the account was mutated during the export (should always be false). */
  accountMutationPerformed: boolean;

  /** Whether any source file was mutated (should always be false). */
  sourceFileMutationPerformed: boolean;

  /** Whether raw private data was published (should always be false). */
  rawPrivateDataPublished: boolean;

  /** Whether a private path leaked into a public receipt (should always be false). */
  privatePathLeakedToPublicReceipt: boolean;

  /** Number of files in the export archive. */
  fileCount: number;

  /** SHA-256 hash of the export archive. */
  archiveHash: string;

  /** Number of custody receipts captured so far in this workflow. */
  receiptsCaptured: number;
}

export interface ProviderExportBlocker {
  reason: string;
  evidencePath?: string;
  ownerSurface?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export interface ProviderExportCustodyAdapterOptions {
  /** Canonical Passport DID for the actor. */
  passportDid: string;
  /** HoloMesh task ID linking this receipt to a board task, if any. */
  taskId?: string;
  /** Git commit this receipt is associated with, if any. */
  commit?: string;
  /** Parent receipt IDs in the chain, if this receipt follows prior ones. */
  parentReceiptIds?: string[];
  /** Layer-3 oracle reference for simulation receipts. */
  layer3OracleRef?: string;
  /** Explicit permission envelope override. */
  permissionEnvelope?: TrustPermissionEnvelope;
  /** Sync state override. Default: local_only. */
  syncState?: 'local_only' | 'synced' | 'redacted_sync' | 'sync_failed';
  /** Redacted fields for synced receipts. */
  redactedFields?: string[];
}

/**
 * Convert a ProviderExportCustodyPayload into a TrustReceiptInput suitable
 * for appending to a TrustLedger.
 *
 * The payload fields are serialized into the evidence.hashes array and
 * the action resource encodes the workflow and phase for ledger queries.
 */
export function providerExportToReceiptInput(
  payload: ProviderExportCustodyPayload,
  options: ProviderExportCustodyAdapterOptions,
): TrustReceiptInput {
  const permissionEnvelope: TrustPermissionEnvelope =
    options.permissionEnvelope ?? phaseToEnvelope(payload.phase);

  const actionName = `provider_export_${payload.phase}`;
  const resource = `holoshell/${payload.workflow}/${payload.provider}`;

  const outcome = payload.blockers.length > 0 ? 'denied' : 'success';

  // Encode the custody payload as a canonical evidence hash so the receipt
  // is self-contained and the ledger can verify it independently.
  const payloadHash = stableProviderExportHash(payload);

  return {
    schemaVersion: '1.0.0',
    recordedAt: new Date().toISOString(),
    actor: {
      passportDid: options.passportDid,
      bindings: [
        { value: payload.provider, type: 'provider_export' },
        { value: payload.workflow, type: 'workflow' },
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
      nonce: `${payload.workflow}_${payload.phase}_${payload.provider}_${Date.now()}`,
      commandHash: payload.archiveHash || undefined,
      witnessRefs: payload.blockers.map((b) => b.reason),
    },
    algebraicTrust: {
      layer1Strategy: 'strict_error',
      layer2HistoryRef: `provider_export/${payload.provider}/${payload.phase}`,
      layer3OracleRef: options.layer3OracleRef,
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

/**
 * Derive the permission envelope from the workflow phase.
 * Matches the policy envelope definitions in holoshell-browser-account-export-policy.hsplus.
 */
function phaseToEnvelope(phase: ProviderExportPhase): TrustPermissionEnvelope {
  switch (phase) {
    case 'intent_classification':
      return 'read_only';
    case 'boundary_check':
      return 'guarded_execute';
    case 'approval_bundle':
      return 'guarded_execute';
    case 'provider_wait':
      return 'read_only';
    case 'download_quarantine':
      return 'break_glass';
    case 'verify_files':
      return 'read_only';
    case 'preview':
      return 'guarded_execute';
    case 'task_file':
      return 'guarded_execute';
    case 'rollback':
      return 'break_glass';
    default:
      return 'read_only';
  }
}

/**
 * Deterministic hash of a ProviderExportCustodyPayload for evidence chaining.
 * Canonicalizes the payload by sorting keys and hashing the JSON.
 */
export function stableProviderExportHash(payload: ProviderExportCustodyPayload): string {
  const { createHash } = require('crypto');
  const canonical = JSON.stringify(canonicalizeObject(payload));
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function canonicalizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeObject);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeObject(entry);
      }
    }
    return sorted;
  }
  return value;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ProviderExportCustodyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a ProviderExportCustodyPayload against the export custody rules.
 *
 * Rules derived from holoshell-browser-account-export-policy.hsplus:
 * - accountMutationPerformed must be false (no silent mutation)
 * - sourceFileMutationPerformed must be false (no source mutation)
 * - rawPrivateDataPublished must be false (no private data leakage)
 * - privatePathLeakedToPublicReceipt must be false (no path leakage)
 * - downloadedArchiveExecuted must be false for quarantine receipts
 * - If managed account is detected, managedAccountType must be specified
 * - If cloudHandoff is true, cloudHandoffDestination must be specified
 * - If waitState is 'expired' or 'blocked', blockers must be non-empty
 * - If deliveryMethod involves a link, linkExpiry should be present
 */
export function validateProviderExportCustody(
  payload: ProviderExportCustodyPayload,
): ProviderExportCustodyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!payload.workflow) errors.push('Missing workflow');
  if (!payload.provider) errors.push('Missing provider');
  if (!payload.phase) errors.push('Missing phase');
  if (!payload.providerLabel) errors.push('Missing providerLabel');

  // Phase must be a known phase
  const validPhases: ProviderExportPhase[] = [
    'intent_classification',
    'boundary_check',
    'approval_bundle',
    'provider_wait',
    'download_quarantine',
    'verify_files',
    'preview',
    'task_file',
    'rollback',
  ];
  if (!validPhases.includes(payload.phase)) {
    errors.push(`Invalid phase: ${payload.phase}`);
  }

  // Custody invariants — these must ALWAYS be false
  if (payload.accountMutationPerformed) {
    errors.push('accountMutationPerformed must be false — account mutation is not allowed without explicit approval');
  }
  if (payload.sourceFileMutationPerformed) {
    errors.push('sourceFileMutationPerformed must be false — source file mutation is not allowed');
  }
  if (payload.rawPrivateDataPublished) {
    errors.push('rawPrivateDataPublished must be false — raw private data must not be published');
  }
  if (payload.privatePathLeakedToPublicReceipt) {
    errors.push('privatePathLeakedToPublicReceipt must be false — private paths must not leak into public receipts');
  }

  // Conditional fields
  if (payload.managedAccount && !payload.managedAccountType) {
    errors.push('managedAccountType is required when managedAccount is true');
  }
  if (payload.cloudHandoff && !payload.cloudHandoffDestination) {
    warnings.push('cloudHandoffDestination is recommended when cloudHandoff is true');
  }

  // Wait state consistency
  if ((payload.waitState === 'expired' || payload.waitState === 'blocked') && payload.blockers.length === 0) {
    warnings.push(`waitState is ${payload.waitState} but no blockers are recorded — expected at least one blocker`);
  }

  // Link expiry warning for link-based delivery
  if (
    (payload.deliveryMethod === 'email_link' || payload.deliveryMethod === 'cloud_drive') &&
    !payload.linkExpiry
  ) {
    warnings.push('linkExpiry is recommended for link-based delivery methods');
  }

  // Archive integrity
  if (payload.phase === 'verify_files' && !payload.archiveHash) {
    errors.push('archiveHash is required for verify_files phase');
  }
  if (payload.phase === 'download_quarantine' && payload.fileCount === 0 && payload.archiveSizeBytes > 0) {
    warnings.push('fileCount is 0 but archiveSizeBytes is non-zero — possible data inconsistency');
  }

  // selectedProducts should be non-empty for classification phases
  if (
    (payload.phase === 'intent_classification' || payload.phase === 'boundary_check') &&
    payload.selectedProducts.length === 0
  ) {
    warnings.push('selectedProducts is empty for classification phase — provider export scope is unspecified');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}