/**
 * HoloShell Downloads Shelf Receipts
 *
 * Reusable substrate contracts for wrapping browser/provider downloads as
 * deterministic HoloShell operations: file proxy, inventory, archive quarantine,
 * executable block, duplicate grouping, safe preview, delete decision, and
 * shelf replay.
 *
 * task_1779150614671_37ao
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Download Sources ──

export const DOWNLOAD_SOURCES = [
  'browser',
  'email_attachment',
  'cloud_sync',
  'p2p_transfer',
  'local_copy',
  'other',
] as const;
export type DownloadSource = (typeof DOWNLOAD_SOURCES)[number];

// ── Download Categories ──

export const DOWNLOAD_CATEGORIES = [
  'document',
  'image',
  'video',
  'audio',
  'archive',
  'executable',
  'code',
  'data',
  'font',
  'other',
] as const;
export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];

// ── Quarantine Statuses ──

export const QUARANTINE_STATUSES = [
  'pending_scan',
  'scanning',
  'clean',
  'suspicious',
  'malicious',
  'blocked',
  'released',
] as const;
export type QuarantineStatus = (typeof QUARANTINE_STATUSES)[number];

// ── Delete Decision Reasons ──

export const DELETE_DECISION_REASONS = [
  'user_explicit',
  'user_fresh_gesture',
  'duplicate_cleanup',
  'storage_pressure',
  'security_risk',
  'expiry',
  'rollback',
] as const;
export type DeleteDecisionReason = (typeof DELETE_DECISION_REASONS)[number];

// ── Downloads Shelf Warning Kinds ──

export const DOWNLOADS_SHELF_WARNING_KINDS = [
  'executable_detected',
  'archive_contains_executable',
  'path_leakage',
  'partial_download',
  'hash_mismatch',
  'duplicate_detected',
  'sensitive_content',
  'cloud_handoff',
  'unexpected_format',
  'size_anomaly',
  'missing_preview',
  'import_not_preview_only',
] as const;
export type DownloadsShelfWarningKind = (typeof DOWNLOADS_SHELF_WARNING_KINDS)[number];

export const DOWNLOADS_SHELF_WARNING_SEVERITIES = ['info', 'warn', 'block'] as const;
export type DownloadsShelfWarningSeverity = (typeof DOWNLOADS_SHELF_WARNING_SEVERITIES)[number];

export interface DownloadsShelfWarning {
  kind: DownloadsShelfWarningKind;
  severity: DownloadsShelfWarningSeverity;
  message: string;
}

// ── Downloaded File Proxy ──

export const DOWNLOADED_FILE_PROXY_VERSION = 'holoscript-downloaded-file-proxy/v1';

export interface DownloadedFileProxy {
  /** Unique proxy identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DOWNLOADED_FILE_PROXY_VERSION;
  /** Redacted filename safe for public receipts. */
  redactedFilename: string;
  /** Hash of the full filename for verification. */
  filenameHash: string;
  /** File extension. */
  extension: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** SHA-256 hash of the file content. */
  contentHash: string;
  /** Hash algorithm used for content hash. */
  contentHashAlgorithm: ArtifactHashAlgorithm;
  /** Download source. */
  source: DownloadSource;
  /** Download category. */
  category: DownloadCategory;
  /** ISO-8601 timestamp of when the download completed. */
  downloadedAt: string;
  /** Whether the file contains an absolute local path (must be false for public receipts). */
  containsAbsolutePaths: false;
  /** Whether the file has been scanned for security. */
  scannedForSecurity: boolean;
  /** Whether the file is an executable. */
  isExecutable: boolean;
  /** Whether the file is a partial/incomplete download. */
  isPartial: boolean;
  /** Whether private data has been detected in the file. */
  containsPrivateData: boolean;
  /** Whether the file may be published in raw form (must be false). */
  rawPublishAllowed: false;
  /** Permission envelope governing file access. */
  permissionEnvelope: 'preview_only';
}

// ── Downloads Inventory Receipt ──

export const DOWNLOADS_INVENTORY_RECEIPT_VERSION = 'holoscript-downloads-inventory-receipt/v1';

export interface DownloadsInventoryReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DOWNLOADS_INVENTORY_RECEIPT_VERSION;
  /** ISO-8601 timestamp of when the inventory was taken. */
  inventoriedAt: string;
  /** Agent or process that performed the inventory. */
  inventoriedBy: string;
  /** File proxies in this inventory. */
  files: DownloadedFileProxy[];
  /** Total file count. */
  fileCount: number;
  /** Total size of all files in bytes. */
  totalSizeBytes: number;
  /** Categories found during inventory. */
  categoriesFound: DownloadCategory[];
  /** Whether any file has an absolute local path (must be false). */
  anyFileContainsAbsolutePath: false;
  /** Whether any file is an executable. */
  anyFileExecutable: boolean;
  /** Whether any file is a partial download. */
  anyFilePartial: boolean;
  /** Whether any file contains private data. */
  anyFileContainsPrivateData: boolean;
  /** Import mode governing all files in this inventory (must be preview_only). */
  importMode: 'preview_only';
  /** Integrity hash of the full receipt. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the inventory. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── Archive Quarantine Receipt ──

export const ARCHIVE_QUARANTINE_RECEIPT_VERSION = 'holoscript-archive-quarantine-receipt/v1';

export interface ArchiveQuarantineReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof ARCHIVE_QUARANTINE_RECEIPT_VERSION;
  /** The inventory receipt this quarantine applies to. */
  inventoryReceiptId: string;
  /** ISO-8601 timestamp of when quarantine started. */
  quarantinedAt: string;
  /** Total number of files in the archive. */
  totalFileCount: number;
  /** Number of files scanned. */
  scannedFileCount: number;
  /** Quarantine status. */
  status: QuarantineStatus;
  /** Number of executables found inside the archive. */
  executableCount: number;
  /** Whether any executable was launched (must be false). */
  anyExecutableLaunched: false;
  /** Number of files containing sensitive/private data. */
  sensitiveFileCount: number;
  /** Whether any private data was published in raw form (must be false). */
  rawPrivateDataPublished: false;
  /** Warnings from the quarantine scan. */
  warnings: DownloadsShelfWarning[];
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the quarantine. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── Executable Block Receipt ──

export const EXECUTABLE_BLOCK_RECEIPT_VERSION = 'holoscript-executable-block-receipt/v1';

export interface ExecutableBlockReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof EXECUTABLE_BLOCK_RECEIPT_VERSION;
  /** The file proxy that was blocked. */
  blockedFile: DownloadedFileProxy;
  /** ISO-8601 timestamp of when the block was applied. */
  blockedAt: string;
  /** Reason the executable was blocked. */
  blockReason: 'executable_detected' | 'archive_contains_executable' | 'security_risk' | 'not_scanned';
  /** Whether execution was attempted (must be false). */
  executionAttempted: false;
  /** Whether the executable was launched (must be false). */
  executableLaunched: false;
  /** Whether the user was shown a preview-only view. */
  previewShown: boolean;
  /** Rollback instruction if the block can be reversed. */
  rollbackNote: string;
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the block. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── Duplicate Group Receipt ──

export const DUPLICATE_GROUP_RECEIPT_VERSION = 'holoscript-duplicate-group-receipt/v1';

export interface DuplicateGroupEntry {
  /** File proxy in the duplicate group. */
  file: DownloadedFileProxy;
  /** Whether this file is the canonical representative. */
  isCanonical: boolean;
  /** Reason this file was included in the group. */
  matchReason: 'content_hash' | 'filename' | 'metadata';
}

export interface DuplicateGroupReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DUPLICATE_GROUP_RECEIPT_VERSION;
  /** ISO-8601 timestamp of when the duplicate group was identified. */
  identifiedAt: string;
  /** Content hash shared by all files in the group. */
  canonicalContentHash: string;
  /** Entries in the duplicate group. */
  entries: DuplicateGroupEntry[];
  /** Total number of files in the group. */
  groupSize: number;
  /** Number of canonical representatives (must be exactly 1). */
  canonicalCount: 1;
  /** Whether duplicate cleanup was performed. */
  cleanupPerformed: boolean;
  /** Whether any source file was mutated during cleanup (must be false). */
  sourceFileMutationPerformed: false;
  /** Rollback note explaining how to restore removed duplicates. */
  rollbackNote: string;
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
}

// ── Safe Preview Receipt ──

export const SAFE_PREVIEW_RECEIPT_VERSION = 'holoscript-safe-preview-receipt/v1';

export interface SafePreviewReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof SAFE_PREVIEW_RECEIPT_VERSION;
  /** The file proxy being previewed. */
  file: DownloadedFileProxy;
  /** ISO-8601 timestamp of when the preview was generated. */
  previewedAt: string;
  /** Whether the preview contains absolute local paths (must be false). */
  previewContainsAbsolutePaths: false;
  /** Whether the preview contains raw private data (must be false). */
  previewContainsRawPrivateData: false;
  /** Whether the import mode is preview-only (must be true). */
  importMode: 'preview_only';
  /** Whether partial downloads were marked as safe (must be false). */
  partialDownloadMarkedSafe: false;
  /** Whether file hashes are present for all previewed files. */
  allFileHashesPresent: boolean;
  /** Whether the preview allows modification of source files (must be false). */
  sourceFileModificationAllowed: false;
  /** Redacted preview path safe for public receipts. */
  redactedPreviewPath: string;
  /** Hash of the full preview content for integrity. */
  previewContentHash: string;
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the preview. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── Delete Decision Receipt ──

export const DELETE_DECISION_RECEIPT_VERSION = 'holoscript-delete-decision-receipt/v1';

export interface DeleteDecisionReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DELETE_DECISION_RECEIPT_VERSION;
  /** The file proxy targeted for deletion. */
  file: DownloadedFileProxy;
  /** ISO-8601 timestamp of when the delete decision was made. */
  decidedAt: string;
  /** Reason for the delete decision. */
  reason: DeleteDecisionReason;
  /** Whether the user provided a fresh gesture authorizing this deletion (must be true). */
  requiresFreshUserGesture: true;
  /** Whether a fresh user gesture was actually received (must be true for user-initiated deletes). */
  freshUserGestureReceived: true;
  /** Whether the deletion was performed without a fresh user gesture (must be false). */
  deleteWithoutFreshUserGesture: false;
  /** Whether source files were mutated by this delete (must be false for preview-only). */
  sourceFileMutationPerformed: false;
  /** Whether the deleted file can be recovered. */
  recoverable: boolean;
  /** Rollback instruction explaining how to recover. */
  rollbackNote: string;
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the decision. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── Downloads Shelf Replay Receipt ──

export const DOWNLOADS_SHELF_STATUSES = [
  'planned',
  'scanning',
  'quarantined',
  'previewing',
  'importing',
  'completed',
  'failed',
  'blocked',
] as const;
export type DownloadsShelfStatus = (typeof DOWNLOADS_SHELF_STATUSES)[number];

export const DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION = 'holoscript-downloads-shelf-replay-receipt/v1';

export interface DownloadsShelfReplayReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION;
  /** Workflow identifier. */
  workflow: 'downloads-import-shelf';
  /** Current workflow status. */
  status: DownloadsShelfStatus;
  /** The inventory receipt for this replay. */
  inventoryReceiptId: string;
  /** The quarantine receipt, if quarantine was performed. */
  quarantineReceiptId?: string;
  /** The safe preview receipt, if preview was generated. */
  previewReceiptId?: string;
  /** Replay key for re-executing the workflow. */
  replayKey: string;
  /** Whether any file was imported outside preview-only mode (must be false). */
  importOutsidePreviewOnly: false;
  /** Whether any executable was launched (must be false). */
  executableLaunched: false;
  /** Whether any raw private data was published (must be false). */
  rawPrivateDataPublished: false;
  /** Whether any deletion occurred without a fresh user gesture (must be false). */
  deleteWithoutFreshUserGesture: false;
  /** Whether any file had a missing hash (must be false). */
  anyFileHashMissing: false;
  /** Rollback note explaining how to reverse the import. */
  rollbackNote: string;
  /** ISO-8601 timestamp of when the replay was created. */
  createdAt: string;
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── Downloads Shelf Receipt Pack (composite) ──

export const DOWNLOADS_SHELF_RECEIPT_PACK_VERSION = 'holoscript-downloads-shelf-receipt-pack/v1';

export interface HoloShellDownloadsShelfReceiptPack {
  /** Unique pack identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DOWNLOADS_SHELF_RECEIPT_PACK_VERSION;
  /** The inventory of downloaded files. */
  inventory: DownloadsInventoryReceipt;
  /** Archive quarantine result, if quarantine was performed. */
  quarantine?: ArchiveQuarantineReceipt;
  /** Executable block receipts for blocked executables. */
  executableBlocks: ExecutableBlockReceipt[];
  /** Duplicate group receipts, if duplicates were found. */
  duplicateGroups: DuplicateGroupReceipt[];
  /** Safe preview receipt, if a preview was generated. */
  preview?: SafePreviewReceipt;
  /** Delete decision receipts, if deletions were made. */
  deleteDecisions: DeleteDecisionReceipt[];
  /** The replay receipt for the entire workflow. */
  replay: DownloadsShelfReplayReceipt;
  /** Overall workflow status. */
  status: DownloadsShelfStatus;
  /** Hash of the full pack for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── Validation Helpers ──

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function hasAbsolutePath(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(value)
  );
}

function validatePublicPath(label: string, value: string | undefined, errors: string[]): void {
  if (!value) {
    errors.push(`${label} is required.`);
  } else if (hasAbsolutePath(value)) {
    errors.push(`${label} must be redacted or repo-relative, not an absolute path.`);
  }
}

function validateHashFields(
  label: string,
  hash: string | undefined,
  algorithm: ArtifactHashAlgorithm | undefined,
  errors: string[]
): void {
  if (!hash) errors.push(`${label}.hash is required.`);
  if (!algorithm) errors.push(`${label}.hashAlgorithm is required.`);
}

function validateVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
  label: string,
  errors: string[]
): void {
  for (const command of commands ?? []) {
    if (!command.command) errors.push(`${label} has a verification command without command text.`);
  }
}

function validateWarnings(
  warnings: DownloadsShelfWarning[] | undefined,
  label: string,
  errors: string[]
): void {
  for (const warning of warnings ?? []) {
    if (!isOneOf(DOWNLOADS_SHELF_WARNING_KINDS, String(warning.kind))) {
      errors.push(`${label}.warnings kind is unsupported: ${String(warning.kind)}.`);
    }
    if (!isOneOf(DOWNLOADS_SHELF_WARNING_SEVERITIES, String(warning.severity))) {
      errors.push(`${label}.warnings severity is unsupported: ${String(warning.severity)}.`);
    }
    if (!warning.message) errors.push(`${label}.warnings message is required.`);
  }
}

function validateFileProxyFields(
  file: DownloadedFileProxy,
  label: string,
  errors: string[]
): void {
  if (!file.id) errors.push(`${label}.id is required.`);
  if (file.schemaVersion !== DOWNLOADED_FILE_PROXY_VERSION) {
    errors.push(`${label}.schemaVersion must be ${DOWNLOADED_FILE_PROXY_VERSION}.`);
  }
  if (!file.redactedFilename) errors.push(`${label}.redactedFilename is required.`);
  if (!file.filenameHash) errors.push(`${label}.filenameHash is required.`);
  if (!file.extension) errors.push(`${label}.extension is required.`);
  if (!isNonNegativeInteger(file.sizeBytes)) {
    errors.push(`${label}.sizeBytes must be a non-negative integer.`);
  }
  if (!file.contentHash) errors.push(`${label}.contentHash is required.`);
  validateHashFields(label, file.contentHash, file.contentHashAlgorithm, errors);
  if (!isOneOf(DOWNLOAD_SOURCES, String(file.source))) {
    errors.push(`${label}.source is unsupported: ${String(file.source)}.`);
  }
  if (!isOneOf(DOWNLOAD_CATEGORIES, String(file.category))) {
    errors.push(`${label}.category is unsupported: ${String(file.category)}.`);
  }
  if (!isIsoTimestamp(file.downloadedAt)) {
    errors.push(`${label}.downloadedAt must be a valid ISO-8601 timestamp.`);
  }
  if (file.containsAbsolutePaths !== false) {
    errors.push(`${label}.containsAbsolutePaths must be false.`);
  }
  if (typeof file.scannedForSecurity !== 'boolean') {
    errors.push(`${label}.scannedForSecurity must be a boolean.`);
  }
  if (typeof file.isExecutable !== 'boolean') {
    errors.push(`${label}.isExecutable must be a boolean.`);
  }
  if (typeof file.isPartial !== 'boolean') {
    errors.push(`${label}.isPartial must be a boolean.`);
  }
  if (typeof file.containsPrivateData !== 'boolean') {
    errors.push(`${label}.containsPrivateData must be a boolean.`);
  }
  if (file.rawPublishAllowed !== false) {
    errors.push(`${label}.rawPublishAllowed must be false.`);
  }
  if (file.permissionEnvelope !== 'preview_only') {
    errors.push(`${label}.permissionEnvelope must be preview_only.`);
  }
}

// ── Public Validators ──

export function isSupportedDownloadSource(value: string): value is DownloadSource {
  return isOneOf(DOWNLOAD_SOURCES, value);
}

export function isSupportedDownloadCategory(value: string): value is DownloadCategory {
  return isOneOf(DOWNLOAD_CATEGORIES, value);
}

export function isSupportedQuarantineStatus(value: string): value is QuarantineStatus {
  return isOneOf(QUARANTINE_STATUSES, value);
}

export function isSupportedDeleteDecisionReason(value: string): value is DeleteDecisionReason {
  return isOneOf(DELETE_DECISION_REASONS, value);
}

export function isSupportedDownloadsShelfWarningKind(value: string): value is DownloadsShelfWarningKind {
  return isOneOf(DOWNLOADS_SHELF_WARNING_KINDS, value);
}

export function isSupportedDownloadsShelfWarningSeverity(value: string): value is DownloadsShelfWarningSeverity {
  return isOneOf(DOWNLOADS_SHELF_WARNING_SEVERITIES, value);
}

export function isSupportedDownloadsShelfStatus(value: string): value is DownloadsShelfStatus {
  return isOneOf(DOWNLOADS_SHELF_STATUSES, value);
}

export function validateDownloadedFileProxy(receipt: DownloadedFileProxy): string[] {
  const errors: string[] = [];
  validateFileProxyFields(receipt, 'DownloadedFileProxy', errors);
  return errors;
}

export function validateDownloadsInventoryReceipt(receipt: DownloadsInventoryReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadsInventoryReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOADS_INVENTORY_RECEIPT_VERSION) {
    errors.push(`DownloadsInventoryReceipt.schemaVersion must be ${DOWNLOADS_INVENTORY_RECEIPT_VERSION}.`);
  }
  if (!isIsoTimestamp(receipt.inventoriedAt)) {
    errors.push('DownloadsInventoryReceipt.inventoriedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.inventoriedBy) errors.push('DownloadsInventoryReceipt.inventoriedBy is required.');
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    errors.push('DownloadsInventoryReceipt.files must include at least one file.');
  } else {
    for (const file of receipt.files) {
      validateFileProxyFields(file, 'DownloadsInventoryReceipt.files[]', errors);
    }
  }
  if (!isNonNegativeInteger(receipt.fileCount)) {
    errors.push('DownloadsInventoryReceipt.fileCount must be a non-negative integer.');
  }
  if (receipt.fileCount !== receipt.files.length) {
    errors.push('DownloadsInventoryReceipt.fileCount must match files array length.');
  }
  if (typeof receipt.totalSizeBytes !== 'number' || !Number.isFinite(receipt.totalSizeBytes) || receipt.totalSizeBytes < 0) {
    errors.push('DownloadsInventoryReceipt.totalSizeBytes must be a non-negative finite number.');
  }
  if (!Array.isArray(receipt.categoriesFound)) {
    errors.push('DownloadsInventoryReceipt.categoriesFound must be an array.');
  } else {
    for (const category of receipt.categoriesFound) {
      if (!isSupportedDownloadCategory(String(category))) {
        errors.push(`DownloadsInventoryReceipt.categoriesFound has unsupported category: ${String(category)}.`);
      }
    }
  }
  if (receipt.anyFileContainsAbsolutePath !== false) {
    errors.push('DownloadsInventoryReceipt.anyFileContainsAbsolutePath must be false.');
  }
  if (typeof receipt.anyFileExecutable !== 'boolean') {
    errors.push('DownloadsInventoryReceipt.anyFileExecutable must be a boolean.');
  }
  if (typeof receipt.anyFilePartial !== 'boolean') {
    errors.push('DownloadsInventoryReceipt.anyFilePartial must be a boolean.');
  }
  if (typeof receipt.anyFileContainsPrivateData !== 'boolean') {
    errors.push('DownloadsInventoryReceipt.anyFileContainsPrivateData must be a boolean.');
  }
  if (receipt.importMode !== 'preview_only') {
    errors.push('DownloadsInventoryReceipt.importMode must be preview_only.');
  }
  validateHashFields('DownloadsInventoryReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DownloadsInventoryReceipt', errors);
  return errors;
}

export function validateArchiveQuarantineReceipt(receipt: ArchiveQuarantineReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ArchiveQuarantineReceipt.id is required.');
  if (receipt.schemaVersion !== ARCHIVE_QUARANTINE_RECEIPT_VERSION) {
    errors.push(`ArchiveQuarantineReceipt.schemaVersion must be ${ARCHIVE_QUARANTINE_RECEIPT_VERSION}.`);
  }
  if (!receipt.inventoryReceiptId) errors.push('ArchiveQuarantineReceipt.inventoryReceiptId is required.');
  if (!isIsoTimestamp(receipt.quarantinedAt)) {
    errors.push('ArchiveQuarantineReceipt.quarantinedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isNonNegativeInteger(receipt.totalFileCount)) {
    errors.push('ArchiveQuarantineReceipt.totalFileCount must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(receipt.scannedFileCount)) {
    errors.push('ArchiveQuarantineReceipt.scannedFileCount must be a non-negative integer.');
  }
  if (receipt.scannedFileCount > receipt.totalFileCount) {
    errors.push('ArchiveQuarantineReceipt.scannedFileCount must be <= totalFileCount.');
  }
  if (!isSupportedQuarantineStatus(String(receipt.status))) {
    errors.push(`ArchiveQuarantineReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isNonNegativeInteger(receipt.executableCount)) {
    errors.push('ArchiveQuarantineReceipt.executableCount must be a non-negative integer.');
  }
  if (receipt.anyExecutableLaunched !== false) {
    errors.push('ArchiveQuarantineReceipt.anyExecutableLaunched must be false.');
  }
  if (!isNonNegativeInteger(receipt.sensitiveFileCount)) {
    errors.push('ArchiveQuarantineReceipt.sensitiveFileCount must be a non-negative integer.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('ArchiveQuarantineReceipt.rawPrivateDataPublished must be false.');
  }
  validateWarnings(receipt.warnings, 'ArchiveQuarantineReceipt', errors);
  validateHashFields('ArchiveQuarantineReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'ArchiveQuarantineReceipt', errors);
  return errors;
}

export function validateExecutableBlockReceipt(receipt: ExecutableBlockReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ExecutableBlockReceipt.id is required.');
  if (receipt.schemaVersion !== EXECUTABLE_BLOCK_RECEIPT_VERSION) {
    errors.push(`ExecutableBlockReceipt.schemaVersion must be ${EXECUTABLE_BLOCK_RECEIPT_VERSION}.`);
  }
  validateFileProxyFields(receipt.blockedFile, 'ExecutableBlockReceipt.blockedFile', errors);
  if (!isIsoTimestamp(receipt.blockedAt)) {
    errors.push('ExecutableBlockReceipt.blockedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isOneOf(['executable_detected', 'archive_contains_executable', 'security_risk', 'not_scanned'] as const, String(receipt.blockReason))) {
    errors.push(`ExecutableBlockReceipt.blockReason is unsupported: ${String(receipt.blockReason)}.`);
  }
  if (receipt.executionAttempted !== false) {
    errors.push('ExecutableBlockReceipt.executionAttempted must be false.');
  }
  if (receipt.executableLaunched !== false) {
    errors.push('ExecutableBlockReceipt.executableLaunched must be false.');
  }
  if (typeof receipt.previewShown !== 'boolean') {
    errors.push('ExecutableBlockReceipt.previewShown must be a boolean.');
  }
  if (!receipt.rollbackNote) errors.push('ExecutableBlockReceipt.rollbackNote is required.');
  validateHashFields('ExecutableBlockReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'ExecutableBlockReceipt', errors);
  return errors;
}

export function validateDuplicateGroupReceipt(receipt: DuplicateGroupReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DuplicateGroupReceipt.id is required.');
  if (receipt.schemaVersion !== DUPLICATE_GROUP_RECEIPT_VERSION) {
    errors.push(`DuplicateGroupReceipt.schemaVersion must be ${DUPLICATE_GROUP_RECEIPT_VERSION}.`);
  }
  if (!isIsoTimestamp(receipt.identifiedAt)) {
    errors.push('DuplicateGroupReceipt.identifiedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.canonicalContentHash) {
    errors.push('DuplicateGroupReceipt.canonicalContentHash is required.');
  }
  if (!Array.isArray(receipt.entries) || receipt.entries.length < 2) {
    errors.push('DuplicateGroupReceipt.entries must include at least 2 entries.');
  } else {
    for (const entry of receipt.entries) {
      validateFileProxyFields(entry.file, 'DuplicateGroupReceipt.entries[].file', errors);
      if (typeof entry.isCanonical !== 'boolean') {
        errors.push('DuplicateGroupEntry.isCanonical must be a boolean.');
      }
      if (!isOneOf(['content_hash', 'filename', 'metadata'] as const, String(entry.matchReason))) {
        errors.push(`DuplicateGroupEntry.matchReason is unsupported: ${String(entry.matchReason)}.`);
      }
    }
  }
  if (receipt.groupSize !== receipt.entries.length) {
    errors.push('DuplicateGroupReceipt.groupSize must match entries array length.');
  }
  if (receipt.canonicalCount !== 1) {
    errors.push('DuplicateGroupReceipt.canonicalCount must be 1.');
  }
  const canonicalCount = receipt.entries.filter((e) => e.isCanonical).length;
  if (canonicalCount !== 1) {
    errors.push('DuplicateGroupReceipt must have exactly 1 canonical entry.');
  }
  if (typeof receipt.cleanupPerformed !== 'boolean') {
    errors.push('DuplicateGroupReceipt.cleanupPerformed must be a boolean.');
  }
  if (receipt.sourceFileMutationPerformed !== false) {
    errors.push('DuplicateGroupReceipt.sourceFileMutationPerformed must be false.');
  }
  if (!receipt.rollbackNote) errors.push('DuplicateGroupReceipt.rollbackNote is required.');
  validateHashFields('DuplicateGroupReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateSafePreviewReceipt(receipt: SafePreviewReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('SafePreviewReceipt.id is required.');
  if (receipt.schemaVersion !== SAFE_PREVIEW_RECEIPT_VERSION) {
    errors.push(`SafePreviewReceipt.schemaVersion must be ${SAFE_PREVIEW_RECEIPT_VERSION}.`);
  }
  validateFileProxyFields(receipt.file, 'SafePreviewReceipt.file', errors);
  if (!isIsoTimestamp(receipt.previewedAt)) {
    errors.push('SafePreviewReceipt.previewedAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.previewContainsAbsolutePaths !== false) {
    errors.push('SafePreviewReceipt.previewContainsAbsolutePaths must be false.');
  }
  if (receipt.previewContainsRawPrivateData !== false) {
    errors.push('SafePreviewReceipt.previewContainsRawPrivateData must be false.');
  }
  if (receipt.importMode !== 'preview_only') {
    errors.push('SafePreviewReceipt.importMode must be preview_only.');
  }
  if (receipt.partialDownloadMarkedSafe !== false) {
    errors.push('SafePreviewReceipt.partialDownloadMarkedSafe must be false.');
  }
  if (typeof receipt.allFileHashesPresent !== 'boolean') {
    errors.push('SafePreviewReceipt.allFileHashesPresent must be a boolean.');
  }
  if (receipt.sourceFileModificationAllowed !== false) {
    errors.push('SafePreviewReceipt.sourceFileModificationAllowed must be false.');
  }
  validatePublicPath('SafePreviewReceipt.redactedPreviewPath', receipt.redactedPreviewPath, errors);
  if (!receipt.previewContentHash) {
    errors.push('SafePreviewReceipt.previewContentHash is required.');
  }
  validateHashFields('SafePreviewReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'SafePreviewReceipt', errors);
  return errors;
}

export function validateDeleteDecisionReceipt(receipt: DeleteDecisionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DeleteDecisionReceipt.id is required.');
  if (receipt.schemaVersion !== DELETE_DECISION_RECEIPT_VERSION) {
    errors.push(`DeleteDecisionReceipt.schemaVersion must be ${DELETE_DECISION_RECEIPT_VERSION}.`);
  }
  validateFileProxyFields(receipt.file, 'DeleteDecisionReceipt.file', errors);
  if (!isIsoTimestamp(receipt.decidedAt)) {
    errors.push('DeleteDecisionReceipt.decidedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isSupportedDeleteDecisionReason(String(receipt.reason))) {
    errors.push(`DeleteDecisionReceipt.reason is unsupported: ${String(receipt.reason)}.`);
  }
  if (receipt.requiresFreshUserGesture !== true) {
    errors.push('DeleteDecisionReceipt.requiresFreshUserGesture must be true.');
  }
  if (receipt.freshUserGestureReceived !== true) {
    errors.push('DeleteDecisionReceipt.freshUserGestureReceived must be true.');
  }
  if (receipt.deleteWithoutFreshUserGesture !== false) {
    errors.push('DeleteDecisionReceipt.deleteWithoutFreshUserGesture must be false.');
  }
  if (receipt.sourceFileMutationPerformed !== false) {
    errors.push('DeleteDecisionReceipt.sourceFileMutationPerformed must be false.');
  }
  if (typeof receipt.recoverable !== 'boolean') {
    errors.push('DeleteDecisionReceipt.recoverable must be a boolean.');
  }
  if (!receipt.rollbackNote) errors.push('DeleteDecisionReceipt.rollbackNote is required.');
  validateHashFields('DeleteDecisionReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DeleteDecisionReceipt', errors);
  return errors;
}

export function validateDownloadsShelfReplayReceipt(receipt: DownloadsShelfReplayReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadsShelfReplayReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION) {
    errors.push(`DownloadsShelfReplayReceipt.schemaVersion must be ${DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION}.`);
  }
  if (receipt.workflow !== 'downloads-import-shelf') {
    errors.push('DownloadsShelfReplayReceipt.workflow must be downloads-import-shelf.');
  }
  if (!isSupportedDownloadsShelfStatus(String(receipt.status))) {
    errors.push(`DownloadsShelfReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!receipt.inventoryReceiptId) errors.push('DownloadsShelfReplayReceipt.inventoryReceiptId is required.');
  if (!receipt.replayKey) errors.push('DownloadsShelfReplayReceipt.replayKey is required.');
  if (receipt.importOutsidePreviewOnly !== false) {
    errors.push('DownloadsShelfReplayReceipt.importOutsidePreviewOnly must be false.');
  }
  if (receipt.executableLaunched !== false) {
    errors.push('DownloadsShelfReplayReceipt.executableLaunched must be false.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('DownloadsShelfReplayReceipt.rawPrivateDataPublished must be false.');
  }
  if (receipt.deleteWithoutFreshUserGesture !== false) {
    errors.push('DownloadsShelfReplayReceipt.deleteWithoutFreshUserGesture must be false.');
  }
  if (receipt.anyFileHashMissing !== false) {
    errors.push('DownloadsShelfReplayReceipt.anyFileHashMissing must be false.');
  }
  if (!receipt.rollbackNote) errors.push('DownloadsShelfReplayReceipt.rollbackNote is required.');
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('DownloadsShelfReplayReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('DownloadsShelfReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellDownloadsShelfReceiptPack(
  pack: HoloShellDownloadsShelfReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellDownloadsShelfReceiptPack.id is required.');
  if (pack.schemaVersion !== DOWNLOADS_SHELF_RECEIPT_PACK_VERSION) {
    errors.push(`HoloShellDownloadsShelfReceiptPack.schemaVersion must be ${DOWNLOADS_SHELF_RECEIPT_PACK_VERSION}.`);
  }
  if (!pack.inventory) {
    errors.push('HoloShellDownloadsShelfReceiptPack.inventory is required.');
  } else {
    errors.push(...validateDownloadsInventoryReceipt(pack.inventory));
  }
  if (pack.quarantine) errors.push(...validateArchiveQuarantineReceipt(pack.quarantine));
  if (!Array.isArray(pack.executableBlocks)) {
    errors.push('HoloShellDownloadsShelfReceiptPack.executableBlocks must be an array.');
  } else {
    for (const block of pack.executableBlocks) {
      errors.push(...validateExecutableBlockReceipt(block));
    }
  }
  if (!Array.isArray(pack.duplicateGroups)) {
    errors.push('HoloShellDownloadsShelfReceiptPack.duplicateGroups must be an array.');
  } else {
    for (const group of pack.duplicateGroups) {
      errors.push(...validateDuplicateGroupReceipt(group));
    }
  }
  if (pack.preview) errors.push(...validateSafePreviewReceipt(pack.preview));
  if (!Array.isArray(pack.deleteDecisions)) {
    errors.push('HoloShellDownloadsShelfReceiptPack.deleteDecisions must be an array.');
  } else {
    for (const decision of pack.deleteDecisions) {
      errors.push(...validateDeleteDecisionReceipt(decision));
    }
  }
  if (!pack.replay) {
    errors.push('HoloShellDownloadsShelfReceiptPack.replay is required.');
  } else {
    errors.push(...validateDownloadsShelfReplayReceipt(pack.replay));
  }
  if (!isSupportedDownloadsShelfStatus(String(pack.status))) {
    errors.push(`HoloShellDownloadsShelfReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  if (pack.status === 'completed' && !pack.preview) {
    errors.push('HoloShellDownloadsShelfReceiptPack.preview is required when status=completed.');
  }
  validateHashFields('HoloShellDownloadsShelfReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

// ── Clone Helpers ──

export function cloneDownloadedFileProxy(file: DownloadedFileProxy): DownloadedFileProxy {
  return { ...file };
}

export function cloneDownloadsInventoryReceipt(receipt: DownloadsInventoryReceipt): DownloadsInventoryReceipt {
  return {
    ...receipt,
    files: receipt.files.map(cloneDownloadedFileProxy),
    categoriesFound: [...receipt.categoriesFound],
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneArchiveQuarantineReceipt(receipt: ArchiveQuarantineReceipt): ArchiveQuarantineReceipt {
  return {
    ...receipt,
    warnings: receipt.warnings.map((w) => ({ ...w })),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneExecutableBlockReceipt(receipt: ExecutableBlockReceipt): ExecutableBlockReceipt {
  return {
    ...receipt,
    blockedFile: cloneDownloadedFileProxy(receipt.blockedFile),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneDuplicateGroupEntry(entry: DuplicateGroupEntry): DuplicateGroupEntry {
  return {
    ...entry,
    file: cloneDownloadedFileProxy(entry.file),
  };
}

export function cloneDuplicateGroupReceipt(receipt: DuplicateGroupReceipt): DuplicateGroupReceipt {
  return {
    ...receipt,
    entries: receipt.entries.map(cloneDuplicateGroupEntry),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
  };
}

export function cloneSafePreviewReceipt(receipt: SafePreviewReceipt): SafePreviewReceipt {
  return {
    ...receipt,
    file: cloneDownloadedFileProxy(receipt.file),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneDeleteDecisionReceipt(receipt: DeleteDecisionReceipt): DeleteDecisionReceipt {
  return {
    ...receipt,
    file: cloneDownloadedFileProxy(receipt.file),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneDownloadsShelfReplayReceipt(receipt: DownloadsShelfReplayReceipt): DownloadsShelfReplayReceipt {
  return { ...receipt };
}

export function cloneHoloShellDownloadsShelfReceiptPack(
  pack: HoloShellDownloadsShelfReceiptPack
): HoloShellDownloadsShelfReceiptPack {
  return {
    ...pack,
    inventory: cloneDownloadsInventoryReceipt(pack.inventory),
    ...(pack.quarantine ? { quarantine: cloneArchiveQuarantineReceipt(pack.quarantine) } : {}),
    executableBlocks: pack.executableBlocks.map(cloneExecutableBlockReceipt),
    duplicateGroups: pack.duplicateGroups.map(cloneDuplicateGroupReceipt),
    ...(pack.preview ? { preview: cloneSafePreviewReceipt(pack.preview) } : {}),
    deleteDecisions: pack.deleteDecisions.map(cloneDeleteDecisionReceipt),
    replay: cloneDownloadsShelfReplayReceipt(pack.replay),
  };
}