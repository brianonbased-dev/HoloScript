/**
 * HoloShell Download / Import Shelf Receipts
 *
 * Generic substrate for observing Downloads folder (or equivalent "shelf"),
 * quarantining imports, consent, result, privacy, replay.
 * Fits validator + dry-run (preview) + MCP preflight pattern.
 *
 * Reuses exact patterns from device-safety-receipts.ts (flat interfaces,
 * *_VERSION, hasAbsolutePath guards, mutation=false invariants,
 * freshUserGesture, verificationCommands + provenance) and account-export
 * (quarantine, guarded_download, publicRelativePaths, privateAbsolutePathReceipt).
 *
 * Includes optional substrateMetadata hook for heartbeat/presence substrate
 * integration (hardware custody proofs, continuous participation contract).
 *
 * task_1779150614671_37ao
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Shelf Identity ──

export const DOWNLOAD_SHELF_SOURCES = [
  'browser_downloads',
  'user_downloads',
  'temp_downloads',
  'custom_shelf',
] as const;
export type DownloadShelfSource = (typeof DOWNLOAD_SHELF_SOURCES)[number];

export interface DownloadShelfIdentityEntry {
  shelfId: string;
  redactedLabel: string;
  shelfIdHash: string;
  source: DownloadShelfSource;
  osPathPolicy: 'absolute_path_kept_in_private_receipt_only';
  probedByHardwareAudit: boolean;
}

// ── Quarantine (core safety for downloads) ──

export const DOWNLOAD_QUARANTINE_MODES = [
  'preview_only',
  'quarantined',
  'verified_import',
] as const;
export type DownloadQuarantineMode = (typeof DOWNLOAD_QUARANTINE_MODES)[number];

export const DOWNLOAD_SHELF_PERMISSION_ENVELOPES = [
  'guarded_download',
  'read_only',
] as const;
export type DownloadShelfPermissionEnvelope =
  (typeof DOWNLOAD_SHELF_PERMISSION_ENVELOPES)[number];

export const DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION =
  'holoscript-download-shelf-quarantine-receipt/v1';

export interface DownloadShelfQuarantineReceipt {
  id: string;
  schemaVersion: typeof DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION;
  quarantinedAt: string;
  shelf: DownloadShelfIdentityEntry;
  quarantineMode: DownloadQuarantineMode;
  fileCount: number;
  publicRelativePaths: string[]; // never absolute
  archiveOrFileHashes: Record<string, string>; // sha256 etc.
  privateAbsolutePathReceipt: string; // opaque handle
  downloadedFilesExecutable: false;
  rawPrivateDataPublished: false;
  sourceFileMutationPerformed: false;
  permissionEnvelope: DownloadShelfPermissionEnvelope;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
  // Integration point for heartbeat/presence substrate (sovereign custody proofs)
  substrateMetadata?: Record<string, unknown>;
}

// ── Consent (dry-run to execution gate) ──

export const DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION =
  'holoscript-download-shelf-consent-receipt/v1';

export interface DownloadShelfConsentReceipt {
  id: string;
  schemaVersion: typeof DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION;
  shelfId: string;
  consentedScopes: string[]; // e.g. 'allowPreviewImport', 'allowHoloLandShard'
  riskLevel: 'low' | 'medium' | 'high';
  consentedAt: string;
  expiresAt?: string;
  freshUserGesture: true;
  hiddenAutomationUsed: false;
  nonce: string; // binds to preview/envelope
  credentialAdjacent: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
  substrateMetadata?: Record<string, unknown>;
}

// ── Result / Import Receipt ──

export const DOWNLOAD_IMPORT_OUTCOMES = [
  'success',
  'partial',
  'quarantine_blocked',
  'consent_expired',
  'hash_mismatch',
  'blocked',
  'failed',
] as const;
export type DownloadImportOutcome = (typeof DOWNLOAD_IMPORT_OUTCOMES)[number];

export const DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION =
  'holoscript-download-shelf-import-result-receipt/v1';

export interface DownloadShelfImportResultReceipt {
  id: string;
  schemaVersion: typeof DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION;
  quarantineReceiptId: string;
  consentReceiptId: string;
  shelf: DownloadShelfIdentityEntry;
  outcome: DownloadImportOutcome;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  importedRelativePaths: string[];
  targetShardOrAssetId?: string;
  beforeHash?: string;
  afterHash?: string;
  mutationPerformed: false; // until explicit later
  warnings: string[];
  replayable: boolean;
  rollbackNote: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
  // Integration point for heartbeat/presence substrate
  substrateMetadata?: Record<string, unknown>;
}

// ── Replay (lesson from import) ──

export const REPLAY_LESSON_KINDS = [
  'command_success',
  'command_failure',
  'safe_stop',
  'range_violation',
  'consent_expired',
  'timeout',
  'device_error',
  'blocked_action',
  'recovered_state',
  'import_success',
  'import_blocked',
  'hash_mismatch',
  'quarantine_violation',
] as const;
export type ReplayLessonKind = (typeof REPLAY_LESSON_KINDS)[number];

export interface ReplayLessonEntry {
  lesson: string;
  kind: ReplayLessonKind;
  sourceOutcome: DownloadImportOutcome;
  autoDerived: boolean;
  showToNonDevelopers: boolean;
  insight: string;
  recommendedAction: string;
}

export const DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION =
  'holoscript-download-shelf-replay-lesson-receipt/v1';

export interface DownloadShelfReplayLessonReceipt {
  id: string;
  schemaVersion: typeof DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION;
  sourceImportReceiptId: string;
  shelf: DownloadShelfIdentityEntry;
  lessons: ReplayLessonEntry[];
  generatedAt: string;
  replayable: boolean;
  replayKey?: string;
  originalMutationPerformed: false;
  originalRollbackNote: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
}

// ── Privacy (reused pattern) ──

export const PRIVACY_REDACTION_LEVELS = [
  'full',
  'hash_only',
  'label_only',
  'none',
] as const;
export type PrivacyRedactionLevel = (typeof PRIVACY_REDACTION_LEVELS)[number];

export interface PrivacyRedactionEntry {
  field: string;
  level: PrivacyRedactionLevel;
  reason: string;
}

// ── Composite Pack (for MCP / dry-run / HoloLand) ──

export interface HoloShellDownloadShelfReceiptPack {
  id: string;
  shelfIdentity: DownloadShelfIdentityEntry;
  quarantine?: DownloadShelfQuarantineReceipt;
  consent?: DownloadShelfConsentReceipt;
  result?: DownloadShelfImportResultReceipt;
  replay?: DownloadShelfReplayLessonReceipt;
  status: 'planned' | 'quarantined' | 'consented' | 'imported' | 'blocked' | 'failed';
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  substrateRef?: string; // ties to heartbeat substrate metadata
  substrateMetadata?: Record<string, unknown>;
}

// ── Validation Helpers (exact style from device-safety + account-export) ──

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
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

function validateDownloadShelfIdentityEntry(
  entry: DownloadShelfIdentityEntry,
  label: string,
  errors: string[]
): void {
  if (!entry.shelfId) errors.push(`${label}.shelfId is required.`);
  if (!entry.redactedLabel) errors.push(`${label}.redactedLabel is required.`);
  if (!entry.shelfIdHash) errors.push(`${label}.shelfIdHash is required.`);
  if (!isOneOf(DOWNLOAD_SHELF_SOURCES, String(entry.source))) {
    errors.push(`${label}.source is unsupported: ${String(entry.source)}.`);
  }
  if (entry.osPathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push(
      `${label}.osPathPolicy must be 'absolute_path_kept_in_private_receipt_only'.`
    );
  }
  if (typeof entry.probedByHardwareAudit !== 'boolean') {
    errors.push(`${label}.probedByHardwareAudit must be a boolean.`);
  }
}

function validatePrivacyRedactions(
  redactions: PrivacyRedactionEntry[] | undefined,
  label: string,
  errors: string[]
): void {
  if (!Array.isArray(redactions)) return;
  for (const entry of redactions) {
    if (!entry.field) errors.push(`${label}.field is required.`);
    if (!isOneOf(PRIVACY_REDACTION_LEVELS, String(entry.level))) {
      errors.push(`${label}.level is unsupported: ${String(entry.level)}.`);
    }
    if (!entry.reason) errors.push(`${label}.reason is required.`);
  }
}

// ── Public Type Guards ──

export function isSupportedDownloadShelfSource(v: string): v is DownloadShelfSource {
  return isOneOf(DOWNLOAD_SHELF_SOURCES, v);
}

export function isSupportedDownloadQuarantineMode(v: string): v is DownloadQuarantineMode {
  return isOneOf(DOWNLOAD_QUARANTINE_MODES, v);
}

export function isSupportedDownloadShelfPermissionEnvelope(
  v: string
): v is DownloadShelfPermissionEnvelope {
  return isOneOf(DOWNLOAD_SHELF_PERMISSION_ENVELOPES, v);
}

export function isSupportedDownloadImportOutcome(v: string): v is DownloadImportOutcome {
  return isOneOf(DOWNLOAD_IMPORT_OUTCOMES, v);
}

export function isSupportedReplayLessonKind(v: string): v is ReplayLessonKind {
  return isOneOf(REPLAY_LESSON_KINDS, v);
}

export function isSupportedPrivacyRedactionLevel(v: string): v is PrivacyRedactionLevel {
  return isOneOf(PRIVACY_REDACTION_LEVELS, v);
}

// ── Public Validators ──

export function validateDownloadShelfQuarantineReceipt(
  receipt: DownloadShelfQuarantineReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadShelfQuarantineReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION) {
    errors.push(
      `DownloadShelfQuarantineReceipt.schemaVersion must be ${DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION}.`
    );
  }
  if (!isIsoTimestamp(receipt.quarantinedAt)) {
    errors.push('DownloadShelfQuarantineReceipt.quarantinedAt must be a valid ISO-8601 timestamp.');
  }
  validateDownloadShelfIdentityEntry(receipt.shelf, 'DownloadShelfQuarantineReceipt.shelf', errors);
  if (!isSupportedDownloadQuarantineMode(String(receipt.quarantineMode))) {
    errors.push(
      `DownloadShelfQuarantineReceipt.quarantineMode is unsupported: ${String(receipt.quarantineMode)}.`
    );
  }
  if (!isNonNegativeInteger(receipt.fileCount)) {
    errors.push('DownloadShelfQuarantineReceipt.fileCount must be a non-negative integer.');
  }
  if (!Array.isArray(receipt.publicRelativePaths)) {
    errors.push('DownloadShelfQuarantineReceipt.publicRelativePaths must be an array.');
  } else {
    for (const p of receipt.publicRelativePaths) {
      validatePublicPath('DownloadShelfQuarantineReceipt.publicRelativePaths[]', p, errors);
    }
    if (receipt.publicRelativePaths.length !== receipt.fileCount) {
      errors.push(
        'DownloadShelfQuarantineReceipt.publicRelativePaths length must match fileCount.'
      );
    }
  }
  if (!receipt.archiveOrFileHashes || typeof receipt.archiveOrFileHashes !== 'object') {
    errors.push('DownloadShelfQuarantineReceipt.archiveOrFileHashes must be an object.');
  }
  if (!receipt.privateAbsolutePathReceipt) {
    errors.push('DownloadShelfQuarantineReceipt.privateAbsolutePathReceipt is required.');
  }
  if (receipt.downloadedFilesExecutable !== false) {
    errors.push('DownloadShelfQuarantineReceipt.downloadedFilesExecutable must be false.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('DownloadShelfQuarantineReceipt.rawPrivateDataPublished must be false.');
  }
  if (receipt.sourceFileMutationPerformed !== false) {
    errors.push('DownloadShelfQuarantineReceipt.sourceFileMutationPerformed must be false.');
  }
  if (!isSupportedDownloadShelfPermissionEnvelope(String(receipt.permissionEnvelope))) {
    errors.push(
      `DownloadShelfQuarantineReceipt.permissionEnvelope is unsupported: ${String(receipt.permissionEnvelope)}.`
    );
  }
  validateHashFields(
    'DownloadShelfQuarantineReceipt',
    receipt.hash,
    receipt.hashAlgorithm,
    errors
  );
  validateVerificationCommands(receipt.verificationCommands, 'DownloadShelfQuarantineReceipt', errors);
  return errors;
}

export function validateDownloadShelfConsentReceipt(
  receipt: DownloadShelfConsentReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadShelfConsentReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION) {
    errors.push(
      `DownloadShelfConsentReceipt.schemaVersion must be ${DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION}.`
    );
  }
  if (!receipt.shelfId) errors.push('DownloadShelfConsentReceipt.shelfId is required.');
  if (!Array.isArray(receipt.consentedScopes) || receipt.consentedScopes.length === 0) {
    errors.push('DownloadShelfConsentReceipt.consentedScopes must include at least one scope.');
  }
  if (!isOneOf(['low', 'medium', 'high'] as const, String(receipt.riskLevel))) {
    errors.push(`DownloadShelfConsentReceipt.riskLevel is unsupported: ${String(receipt.riskLevel)}.`);
  }
  if (!isIsoTimestamp(receipt.consentedAt)) {
    errors.push('DownloadShelfConsentReceipt.consentedAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.expiresAt !== undefined && !isIsoTimestamp(receipt.expiresAt)) {
    errors.push('DownloadShelfConsentReceipt.expiresAt must be a valid ISO-8601 timestamp when present.');
  }
  if (receipt.freshUserGesture !== true) {
    errors.push('DownloadShelfConsentReceipt.freshUserGesture must be true.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('DownloadShelfConsentReceipt.hiddenAutomationUsed must be false.');
  }
  if (!receipt.nonce) errors.push('DownloadShelfConsentReceipt.nonce is required.');
  if (receipt.credentialAdjacent !== false) {
    errors.push('DownloadShelfConsentReceipt.credentialAdjacent must be false.');
  }
  validateHashFields('DownloadShelfConsentReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DownloadShelfConsentReceipt', errors);
  return errors;
}

export function validateDownloadShelfImportResultReceipt(
  receipt: DownloadShelfImportResultReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadShelfImportResultReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION) {
    errors.push(
      `DownloadShelfImportResultReceipt.schemaVersion must be ${DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION}.`
    );
  }
  if (!receipt.quarantineReceiptId) {
    errors.push('DownloadShelfImportResultReceipt.quarantineReceiptId is required.');
  }
  if (!receipt.consentReceiptId) {
    errors.push('DownloadShelfImportResultReceipt.consentReceiptId is required.');
  }
  validateDownloadShelfIdentityEntry(receipt.shelf, 'DownloadShelfImportResultReceipt.shelf', errors);
  if (!isSupportedDownloadImportOutcome(String(receipt.outcome))) {
    errors.push(`DownloadShelfImportResultReceipt.outcome is unsupported: ${String(receipt.outcome)}.`);
  }
  if (!isIsoTimestamp(receipt.startedAt)) {
    errors.push('DownloadShelfImportResultReceipt.startedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isIsoTimestamp(receipt.completedAt)) {
    errors.push('DownloadShelfImportResultReceipt.completedAt must be a valid ISO-8601 timestamp.');
  }
  if (typeof receipt.durationMs !== 'number' || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) {
    errors.push('DownloadShelfImportResultReceipt.durationMs must be a non-negative finite number.');
  }
  if (!Array.isArray(receipt.importedRelativePaths)) {
    errors.push('DownloadShelfImportResultReceipt.importedRelativePaths must be an array.');
  } else {
    for (const p of receipt.importedRelativePaths) {
      validatePublicPath('DownloadShelfImportResultReceipt.importedRelativePaths[]', p, errors);
    }
  }
  if (typeof receipt.mutationPerformed !== 'boolean' || receipt.mutationPerformed !== false) {
    errors.push('DownloadShelfImportResultReceipt.mutationPerformed must be false.');
  }
  if (!Array.isArray(receipt.warnings)) {
    errors.push('DownloadShelfImportResultReceipt.warnings must be an array.');
  }
  if (typeof receipt.replayable !== 'boolean') {
    errors.push('DownloadShelfImportResultReceipt.replayable must be a boolean.');
  }
  if (!receipt.rollbackNote && receipt.rollbackNote !== '') {
    // allow empty string for non-reversible
    errors.push('DownloadShelfImportResultReceipt.rollbackNote is required (may be empty).');
  }
  validateHashFields('DownloadShelfImportResultReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DownloadShelfImportResultReceipt', errors);
  return errors;
}

export function validateDownloadShelfReplayLessonReceipt(
  receipt: DownloadShelfReplayLessonReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DownloadShelfReplayLessonReceipt.id is required.');
  if (receipt.schemaVersion !== DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION) {
    errors.push(
      `DownloadShelfReplayLessonReceipt.schemaVersion must be ${DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION}.`
    );
  }
  if (!receipt.sourceImportReceiptId) {
    errors.push('DownloadShelfReplayLessonReceipt.sourceImportReceiptId is required.');
  }
  validateDownloadShelfIdentityEntry(receipt.shelf, 'DownloadShelfReplayLessonReceipt.shelf', errors);
  if (!Array.isArray(receipt.lessons) || receipt.lessons.length === 0) {
    errors.push('DownloadShelfReplayLessonReceipt.lessons must include at least one lesson.');
  } else {
    for (const lesson of receipt.lessons) {
      if (!lesson.lesson) errors.push('ReplayLessonEntry.lesson is required.');
      if (!isSupportedReplayLessonKind(String(lesson.kind))) {
        errors.push(`ReplayLessonEntry.kind is unsupported: ${String(lesson.kind)}.`);
      }
      if (!isSupportedDownloadImportOutcome(String(lesson.sourceOutcome))) {
        errors.push(`ReplayLessonEntry.sourceOutcome is unsupported: ${String(lesson.sourceOutcome)}.`);
      }
      if (typeof lesson.autoDerived !== 'boolean') {
        errors.push('ReplayLessonEntry.autoDerived must be a boolean.');
      }
      if (typeof lesson.showToNonDevelopers !== 'boolean') {
        errors.push('ReplayLessonEntry.showToNonDevelopers must be a boolean.');
      }
      if (!lesson.insight) errors.push('ReplayLessonEntry.insight is required.');
      if (!lesson.recommendedAction) errors.push('ReplayLessonEntry.recommendedAction is required.');
    }
  }
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('DownloadShelfReplayLessonReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (typeof receipt.replayable !== 'boolean') {
    errors.push('DownloadShelfReplayLessonReceipt.replayable must be a boolean.');
  }
  if (receipt.originalMutationPerformed !== false) {
    errors.push('DownloadShelfReplayLessonReceipt.originalMutationPerformed must be false.');
  }
  if (typeof receipt.originalRollbackNote !== 'string') {
    errors.push('DownloadShelfReplayLessonReceipt.originalRollbackNote is required.');
  }
  validateHashFields('DownloadShelfReplayLessonReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellDownloadShelfReceiptPack(
  pack: HoloShellDownloadShelfReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellDownloadShelfReceiptPack.id is required.');
  if (!pack.shelfIdentity) {
    errors.push('HoloShellDownloadShelfReceiptPack.shelfIdentity is required.');
  } else {
    validateDownloadShelfIdentityEntry(pack.shelfIdentity, 'HoloShellDownloadShelfReceiptPack.shelfIdentity', errors);
  }
  if (pack.quarantine) {
    errors.push(...validateDownloadShelfQuarantineReceipt(pack.quarantine));
  }
  if (pack.consent) {
    errors.push(...validateDownloadShelfConsentReceipt(pack.consent));
  }
  if (pack.result) {
    errors.push(...validateDownloadShelfImportResultReceipt(pack.result));
  }
  if (pack.replay) {
    errors.push(...validateDownloadShelfReplayLessonReceipt(pack.replay));
  }
  const validStatuses = ['planned', 'quarantined', 'consented', 'imported', 'blocked', 'failed'] as const;
  if (!isOneOf(validStatuses, String(pack.status))) {
    errors.push(`HoloShellDownloadShelfReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  // Status machine basic enforcement (per acceptance)
  if (pack.status === 'imported' || pack.status === 'failed' || pack.status === 'blocked') {
    if (!pack.result) {
      errors.push(`HoloShellDownloadShelfReceiptPack.result is required when status=${pack.status}.`);
    }
  }
  if (pack.status === 'consented' && !pack.consent) {
    errors.push('HoloShellDownloadShelfReceiptPack.consent is required when status=consented.');
  }
  if (pack.status === 'quarantined' && !pack.quarantine) {
    errors.push('HoloShellDownloadShelfReceiptPack.quarantine is required when status=quarantined.');
  }
  validateHashFields('HoloShellDownloadShelfReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

// Dry-run / preview support (MCP preflight pattern)
export function dryRunValidateDownloadShelfPreview(
  preview: Partial<DownloadShelfQuarantineReceipt>
): string[] {
  const errors: string[] = [];
  if (preview.schemaVersion && preview.schemaVersion !== DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION) {
    errors.push(
      `preview.schemaVersion must be ${DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION} when provided.`
    );
  }
  if (preview.quarantinedAt && !isIsoTimestamp(preview.quarantinedAt)) {
    errors.push('preview.quarantinedAt must be a valid ISO-8601 timestamp when provided.');
  }
  if (preview.shelf) {
    validateDownloadShelfIdentityEntry(preview.shelf, 'preview.shelf', errors);
  }
  if (preview.fileCount !== undefined && !isNonNegativeInteger(preview.fileCount)) {
    errors.push('preview.fileCount must be a non-negative integer when provided.');
  }
  if (Array.isArray(preview.publicRelativePaths)) {
    for (const p of preview.publicRelativePaths) {
      validatePublicPath('preview.publicRelativePaths[]', p, errors);
    }
  }
  if (preview.downloadedFilesExecutable !== undefined && preview.downloadedFilesExecutable !== false) {
    errors.push('preview.downloadedFilesExecutable must be false when provided.');
  }
  if (preview.sourceFileMutationPerformed !== undefined && preview.sourceFileMutationPerformed !== false) {
    errors.push('preview.sourceFileMutationPerformed must be false when provided.');
  }
  if (preview.permissionEnvelope && !isSupportedDownloadShelfPermissionEnvelope(String(preview.permissionEnvelope))) {
    errors.push(`preview.permissionEnvelope is unsupported: ${String(preview.permissionEnvelope)}.`);
  }
  return errors;
}

// ── Clone Helpers (deep safe clones, mutation=false safe) ──

export function cloneDownloadShelfIdentityEntry(
  entry: DownloadShelfIdentityEntry
): DownloadShelfIdentityEntry {
  return { ...entry };
}

export function cloneDownloadShelfQuarantineReceipt(
  receipt: DownloadShelfQuarantineReceipt
): DownloadShelfQuarantineReceipt {
  return {
    ...receipt,
    shelf: cloneDownloadShelfIdentityEntry(receipt.shelf),
    publicRelativePaths: [...receipt.publicRelativePaths],
    archiveOrFileHashes: { ...receipt.archiveOrFileHashes },
    ...(receipt.provenance
      ? {
          provenance: {
            ...receipt.provenance,
            parentArtifactIds: receipt.provenance.parentArtifactIds
              ? [...receipt.provenance.parentArtifactIds]
              : undefined,
          },
        }
      : {}),
    ...(receipt.verificationCommands
      ? {
          verificationCommands: receipt.verificationCommands.map((c) => ({
            ...c,
            artifactIds: c.artifactIds ? [...c.artifactIds] : undefined,
          })),
        }
      : {}),
    ...(receipt.substrateMetadata ? { substrateMetadata: { ...receipt.substrateMetadata } } : {}),
  };
}

export function cloneDownloadShelfConsentReceipt(
  receipt: DownloadShelfConsentReceipt
): DownloadShelfConsentReceipt {
  return {
    ...receipt,
    consentedScopes: [...receipt.consentedScopes],
    ...(receipt.provenance
      ? {
          provenance: {
            ...receipt.provenance,
            parentArtifactIds: receipt.provenance.parentArtifactIds
              ? [...receipt.provenance.parentArtifactIds]
              : undefined,
          },
        }
      : {}),
    ...(receipt.verificationCommands
      ? {
          verificationCommands: receipt.verificationCommands.map((c) => ({
            ...c,
            artifactIds: c.artifactIds ? [...c.artifactIds] : undefined,
          })),
        }
      : {}),
    ...(receipt.substrateMetadata ? { substrateMetadata: { ...receipt.substrateMetadata } } : {}),
  };
}

export function cloneDownloadShelfImportResultReceipt(
  receipt: DownloadShelfImportResultReceipt
): DownloadShelfImportResultReceipt {
  return {
    ...receipt,
    shelf: cloneDownloadShelfIdentityEntry(receipt.shelf),
    importedRelativePaths: [...receipt.importedRelativePaths],
    warnings: [...receipt.warnings],
    ...(receipt.provenance
      ? {
          provenance: {
            ...receipt.provenance,
            parentArtifactIds: receipt.provenance.parentArtifactIds
              ? [...receipt.provenance.parentArtifactIds]
              : undefined,
          },
        }
      : {}),
    ...(receipt.verificationCommands
      ? {
          verificationCommands: receipt.verificationCommands.map((c) => ({
            ...c,
            artifactIds: c.artifactIds ? [...c.artifactIds] : undefined,
          })),
        }
      : {}),
    ...(receipt.substrateMetadata ? { substrateMetadata: { ...receipt.substrateMetadata } } : {}),
  };
}

export function cloneDownloadShelfReplayLessonReceipt(
  receipt: DownloadShelfReplayLessonReceipt
): DownloadShelfReplayLessonReceipt {
  return {
    ...receipt,
    shelf: cloneDownloadShelfIdentityEntry(receipt.shelf),
    lessons: receipt.lessons.map((l) => ({ ...l })),
    ...(receipt.provenance
      ? {
          provenance: {
            ...receipt.provenance,
            parentArtifactIds: receipt.provenance.parentArtifactIds
              ? [...receipt.provenance.parentArtifactIds]
              : undefined,
          },
        }
      : {}),
  };
}

export function cloneHoloShellDownloadShelfReceiptPack(
  pack: HoloShellDownloadShelfReceiptPack
): HoloShellDownloadShelfReceiptPack {
  return {
    ...pack,
    shelfIdentity: cloneDownloadShelfIdentityEntry(pack.shelfIdentity),
    ...(pack.quarantine ? { quarantine: cloneDownloadShelfQuarantineReceipt(pack.quarantine) } : {}),
    ...(pack.consent ? { consent: cloneDownloadShelfConsentReceipt(pack.consent) } : {}),
    ...(pack.result ? { result: cloneDownloadShelfImportResultReceipt(pack.result) } : {}),
    ...(pack.replay ? { replay: cloneDownloadShelfReplayLessonReceipt(pack.replay) } : {}),
    ...(pack.substrateMetadata ? { substrateMetadata: { ...pack.substrateMetadata } } : {}),
  };
}
