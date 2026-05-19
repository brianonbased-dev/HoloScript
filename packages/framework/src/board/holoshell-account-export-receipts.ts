/**
 * HoloShell Account Export Receipts
 *
 * Reusable substrate contracts for wrapping browser/provider data exports as
 * deterministic HoloShell operations: explicit account boundary, provider plan,
 * async wait state, local archive verification, and replay.
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

export const ACCOUNT_EXPORT_PROVIDERS = [
  'google',
  'microsoft',
  'browser-profile',
  'other',
] as const;
export type AccountExportProvider = (typeof ACCOUNT_EXPORT_PROVIDERS)[number];

export const ACCOUNT_EXPORT_DELIVERY_METHODS = [
  'email_link',
  'direct_download',
  'google_drive',
  'onedrive',
  'third_party_cloud',
  'unknown',
] as const;
export type AccountExportDeliveryMethod = (typeof ACCOUNT_EXPORT_DELIVERY_METHODS)[number];

export const ACCOUNT_EXPORT_ARCHIVE_FORMATS = ['zip', 'tgz', 'json', 'csv', 'mixed', 'unknown'] as const;
export type AccountExportArchiveFormat = (typeof ACCOUNT_EXPORT_ARCHIVE_FORMATS)[number];

export const ACCOUNT_EXPORT_STATUSES = [
  'planned',
  'requested',
  'waiting',
  'ready',
  'downloaded',
  'verified',
  'needs_attention',
  'blocked',
  'failed',
] as const;
export type AccountExportStatus = (typeof ACCOUNT_EXPORT_STATUSES)[number];

export const PROVIDER_EXPORT_WAIT_STATES = [
  'not_requested',
  'requested',
  'provider_waiting',
  'ready_to_download',
  'expired',
  'blocked',
] as const;
export type ProviderExportWaitState = (typeof PROVIDER_EXPORT_WAIT_STATES)[number];

export const ACCOUNT_EXPORT_PERMISSION_ENVELOPES = [
  'read_only',
  'draft_only',
  'fresh_user_gesture',
  'guarded_download',
  'read_only_verify',
  'break_glass',
] as const;
export type AccountExportPermissionEnvelope =
  (typeof ACCOUNT_EXPORT_PERMISSION_ENVELOPES)[number];

export const ACCOUNT_EXPORT_WARNING_KINDS = [
  'provider_delay',
  'managed_account_blocker',
  'cloud_handoff',
  'link_expiry',
  'storage_limit',
  'partial_download',
  'sensitive_archive',
  'unexpected_executable',
] as const;
export type AccountExportWarningKind = (typeof ACCOUNT_EXPORT_WARNING_KINDS)[number];

export interface AccountExportWarning {
  kind: AccountExportWarningKind;
  severity: 'info' | 'warn' | 'block';
  message: string;
}

export interface ProviderExportProductSelection {
  id: string;
  label: string;
  included: boolean;
  selectionHash: string;
}

export interface ProviderExportPlanReceipt {
  id: string;
  provider: AccountExportProvider;
  redactedAccountLabel: string;
  accountLabelHash: string;
  selectedProducts: ProviderExportProductSelection[];
  deliveryMethod: AccountExportDeliveryMethod;
  archiveFormat: AccountExportArchiveFormat;
  archiveSizeLimitMb: number;
  cloudDestination?: string;
  cloudHandoffWarning: boolean;
  connectedAppRemovalInstruction?: string;
  accountMutationAllowed: false;
  requiresFreshUserGesture: true;
  createdAt: string;
  warnings: AccountExportWarning[];
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface ProviderExportRequestReceipt {
  id: string;
  planReceiptId: string;
  provider: AccountExportProvider;
  requestedProductsHash: string;
  requestedAt: string;
  requestedBy: string;
  freshUserGesture: true;
  hiddenAutomationUsed: false;
  providerRequestState: 'submitted' | 'blocked' | 'unknown';
  expectedWaitState: 'minutes' | 'hours' | 'days' | 'unknown';
  accountMutationPerformed: false;
  rollbackNote: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface ProviderExportReadyReceipt {
  id: string;
  requestReceiptId: string;
  observedAt: string;
  readyState: 'not_ready' | 'ready' | 'expired' | 'blocked' | 'unknown';
  notificationHash?: string;
  downloadLinkHash?: string;
  expiresAt?: string;
  cloudDestinationReady: boolean;
  warning?: AccountExportWarning;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface AccountExportArchivePart {
  id: string;
  redactedPath: string;
  sizeBytes: number;
  sha256: string;
  complete: boolean;
}

export interface LocalArchiveDownloadReceipt {
  id: string;
  requestReceiptId: string;
  downloadedAt: string;
  downloadDirectory: string;
  permissionEnvelope: 'guarded_download';
  archiveParts: AccountExportArchivePart[];
  partialFilesPresent: boolean;
  diskSpaceChecked: boolean;
  sourceCloudDataMutated: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface BrowserAccountBoundaryReceipt {
  id: string;
  provider: AccountExportProvider;
  redactedAccountLabel: string;
  scopes: string[];
  browserProfile: string;
  browserSession: string;
  cookiePolicy: string;
  screenshotPolicy: string;
  credentialAdjacent: true;
  credentialExtrusionAllowed: false;
  accountMutationAllowedWithoutApproval: false;
  publicReceiptMayContainAbsolutePath: false;
}

export interface AccountExportApprovalReceipt {
  id: string;
  nonce: string;
  provider: AccountExportProvider;
  exportKind: string;
  exportFormat: AccountExportArchiveFormat;
  destinationFolder: string;
  requiresFreshUserGesture: true;
  executionAllowed: boolean;
  credentialExtrusionAllowed: false;
  commandPreview?: string;
}

export interface ProviderExportWaitReceipt {
  id: string;
  provider: AccountExportProvider;
  exportKind: string;
  state: ProviderExportWaitState;
  providerRequestId?: string;
  requestedAt?: string;
  readyAt?: string;
  expiresAt?: string;
  mutationPerformed: boolean;
}

export interface LocalDownloadQuarantineReceipt {
  id: string;
  provider: AccountExportProvider;
  exportKind: string;
  importMode: 'preview_only';
  fileCount: number;
  archiveHash: string;
  archiveHashAlgorithm: 'sha256';
  publicRelativePaths: string[];
  privateAbsolutePathReceipt: string;
  downloadedArchiveExecuted: false;
  downloadedFilesExecutable: false;
  rawPrivateDataPublished: false;
  sourceFileMutationPerformed: false;
}

export interface ProviderExportRollbackLimitReceipt {
  id: string;
  provider: AccountExportProvider;
  mutation: 'export_request' | 'archive_download' | 'local_preview_import';
  rollback: 'provider_cancel' | 'local_delete' | 'receipt_delete' | 'not_supported';
  reversible: boolean;
  explanation: string;
}

export interface AccountExportArchiveReceipt {
  id: string;
  downloadReceiptId: string;
  verifiedAt: string;
  archivePartCount: number;
  verifiedArchivePartCount: number;
  unpackManifestHash: string;
  sensitivityScanStatus: 'pass' | 'warn' | 'blocked';
  unexpectedExecutableCount: number;
  importAllowed: boolean;
  shareAllowed: boolean;
  deleteOriginalsAllowed: false;
  replayKey: string;
  warnings: AccountExportWarning[];
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface AccountExportReplayReceipt {
  id: string;
  workflow: 'browser-account-export';
  provider: AccountExportProvider;
  status: AccountExportStatus;
  planReceiptId: string;
  requestReceiptId?: string;
  readyReceiptId?: string;
  downloadReceiptId?: string;
  archiveReceiptId?: string;
  replayKey: string;
  rollbackNote: string;
  exportIsNotDeletion: true;
  accountMutationPerformed: false;
  sourceCloudDataMutated: false;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellAccountExportReceiptPack {
  id: string;
  plan: ProviderExportPlanReceipt;
  request?: ProviderExportRequestReceipt;
  ready?: ProviderExportReadyReceipt;
  download?: LocalArchiveDownloadReceipt;
  archive?: AccountExportArchiveReceipt;
  replay: AccountExportReplayReceipt;
  status: AccountExportStatus;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
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

function validateWarnings(
  warnings: AccountExportWarning[] | undefined,
  label: string,
  errors: string[]
): void {
  for (const warning of warnings ?? []) {
    if (!isOneOf(ACCOUNT_EXPORT_WARNING_KINDS, String(warning.kind))) {
      errors.push(`${label}.warnings kind is unsupported: ${String(warning.kind)}.`);
    }
    if (!isOneOf(['info', 'warn', 'block'] as const, String(warning.severity))) {
      errors.push(`${label}.warnings severity is unsupported: ${String(warning.severity)}.`);
    }
    if (!warning.message) errors.push(`${label}.warnings message is required.`);
  }
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

export function isSupportedAccountExportProvider(
  provider: string
): provider is AccountExportProvider {
  return isOneOf(ACCOUNT_EXPORT_PROVIDERS, provider);
}

export function isSupportedAccountExportDeliveryMethod(
  method: string
): method is AccountExportDeliveryMethod {
  return isOneOf(ACCOUNT_EXPORT_DELIVERY_METHODS, method);
}

export function isSupportedAccountExportArchiveFormat(
  format: string
): format is AccountExportArchiveFormat {
  return isOneOf(ACCOUNT_EXPORT_ARCHIVE_FORMATS, format);
}

export function isSupportedAccountExportStatus(status: string): status is AccountExportStatus {
  return isOneOf(ACCOUNT_EXPORT_STATUSES, status);
}

export function isSupportedProviderExportWaitState(
  state: string
): state is ProviderExportWaitState {
  return isOneOf(PROVIDER_EXPORT_WAIT_STATES, state);
}

export function validateBrowserAccountBoundaryReceipt(
  receipt: BrowserAccountBoundaryReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('BrowserAccountBoundaryReceipt.id is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`BrowserAccountBoundaryReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!receipt.redactedAccountLabel) {
    errors.push('BrowserAccountBoundaryReceipt.redactedAccountLabel is required.');
  }
  if (!Array.isArray(receipt.scopes) || receipt.scopes.length === 0) {
    errors.push('BrowserAccountBoundaryReceipt.scopes must include at least one export scope.');
  }
  if (!receipt.browserProfile) errors.push('BrowserAccountBoundaryReceipt.browserProfile is required.');
  if (!receipt.browserSession) errors.push('BrowserAccountBoundaryReceipt.browserSession is required.');
  if (!receipt.cookiePolicy) errors.push('BrowserAccountBoundaryReceipt.cookiePolicy is required.');
  if (!receipt.screenshotPolicy) errors.push('BrowserAccountBoundaryReceipt.screenshotPolicy is required.');
  if (receipt.credentialAdjacent !== true) {
    errors.push('BrowserAccountBoundaryReceipt.credentialAdjacent must be true.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('BrowserAccountBoundaryReceipt.credentialExtrusionAllowed must be false.');
  }
  if (receipt.accountMutationAllowedWithoutApproval !== false) {
    errors.push('BrowserAccountBoundaryReceipt.accountMutationAllowedWithoutApproval must be false.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('BrowserAccountBoundaryReceipt.publicReceiptMayContainAbsolutePath must be false.');
  }
  return errors;
}

export function validateAccountExportApprovalReceipt(
  receipt: AccountExportApprovalReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('AccountExportApprovalReceipt.id is required.');
  if (!receipt.nonce) errors.push('AccountExportApprovalReceipt.nonce is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`AccountExportApprovalReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!receipt.exportKind) errors.push('AccountExportApprovalReceipt.exportKind is required.');
  if (!isSupportedAccountExportArchiveFormat(String(receipt.exportFormat))) {
    errors.push(`AccountExportApprovalReceipt.exportFormat is unsupported: ${String(receipt.exportFormat)}.`);
  }
  validatePublicPath('AccountExportApprovalReceipt.destinationFolder', receipt.destinationFolder, errors);
  if (receipt.requiresFreshUserGesture !== true) {
    errors.push('AccountExportApprovalReceipt.requiresFreshUserGesture must be true.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('AccountExportApprovalReceipt.credentialExtrusionAllowed must be false.');
  }
  if (hasAbsolutePath(receipt.commandPreview)) {
    errors.push('AccountExportApprovalReceipt.commandPreview must not expose absolute local paths.');
  }
  return errors;
}

export function validateProviderExportWaitReceipt(
  receipt: ProviderExportWaitReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportWaitReceipt.id is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`ProviderExportWaitReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!receipt.exportKind) errors.push('ProviderExportWaitReceipt.exportKind is required.');
  if (!isSupportedProviderExportWaitState(String(receipt.state))) {
    errors.push(`ProviderExportWaitReceipt.state is unsupported: ${String(receipt.state)}.`);
  }
  for (const [label, value] of [
    ['ProviderExportWaitReceipt.requestedAt', receipt.requestedAt],
    ['ProviderExportWaitReceipt.readyAt', receipt.readyAt],
    ['ProviderExportWaitReceipt.expiresAt', receipt.expiresAt],
  ] as const) {
    if (value !== undefined && !isIsoTimestamp(value)) {
      errors.push(`${label} must be a valid ISO-8601 timestamp when present.`);
    }
  }
  if (typeof receipt.mutationPerformed !== 'boolean') {
    errors.push('ProviderExportWaitReceipt.mutationPerformed must be a boolean.');
  }
  return errors;
}

export function validateLocalDownloadQuarantineReceipt(
  receipt: LocalDownloadQuarantineReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('LocalDownloadQuarantineReceipt.id is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`LocalDownloadQuarantineReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!receipt.exportKind) errors.push('LocalDownloadQuarantineReceipt.exportKind is required.');
  if (receipt.importMode !== 'preview_only') {
    errors.push('LocalDownloadQuarantineReceipt.importMode must be preview_only.');
  }
  if (!isNonNegativeInteger(receipt.fileCount)) {
    errors.push('LocalDownloadQuarantineReceipt.fileCount must be a non-negative integer.');
  }
  if (!receipt.archiveHash) errors.push('LocalDownloadQuarantineReceipt.archiveHash is required.');
  if (receipt.archiveHashAlgorithm !== 'sha256') {
    errors.push('LocalDownloadQuarantineReceipt.archiveHashAlgorithm must be sha256.');
  }
  if (!Array.isArray(receipt.publicRelativePaths)) {
    errors.push('LocalDownloadQuarantineReceipt.publicRelativePaths must be an array.');
  } else {
    for (const publicPath of receipt.publicRelativePaths) {
      validatePublicPath('LocalDownloadQuarantineReceipt.publicRelativePaths[]', publicPath, errors);
    }
    if (receipt.publicRelativePaths.length !== receipt.fileCount) {
      errors.push('LocalDownloadQuarantineReceipt.publicRelativePaths length must match fileCount.');
    }
  }
  if (!receipt.privateAbsolutePathReceipt) {
    errors.push('LocalDownloadQuarantineReceipt.privateAbsolutePathReceipt is required.');
  }
  if (receipt.downloadedArchiveExecuted !== false) {
    errors.push('LocalDownloadQuarantineReceipt.downloadedArchiveExecuted must be false.');
  }
  if (receipt.downloadedFilesExecutable !== false) {
    errors.push('LocalDownloadQuarantineReceipt.downloadedFilesExecutable must be false.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('LocalDownloadQuarantineReceipt.rawPrivateDataPublished must be false.');
  }
  if (receipt.sourceFileMutationPerformed !== false) {
    errors.push('LocalDownloadQuarantineReceipt.sourceFileMutationPerformed must be false.');
  }
  return errors;
}

export function validateProviderExportRollbackLimitReceipt(
  receipt: ProviderExportRollbackLimitReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportRollbackLimitReceipt.id is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`ProviderExportRollbackLimitReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!isOneOf(['export_request', 'archive_download', 'local_preview_import'] as const, String(receipt.mutation))) {
    errors.push(`ProviderExportRollbackLimitReceipt.mutation is unsupported: ${String(receipt.mutation)}.`);
  }
  if (!isOneOf(['provider_cancel', 'local_delete', 'receipt_delete', 'not_supported'] as const, String(receipt.rollback))) {
    errors.push(`ProviderExportRollbackLimitReceipt.rollback is unsupported: ${String(receipt.rollback)}.`);
  }
  if (typeof receipt.reversible !== 'boolean') {
    errors.push('ProviderExportRollbackLimitReceipt.reversible must be a boolean.');
  }
  if (!receipt.explanation) errors.push('ProviderExportRollbackLimitReceipt.explanation is required.');
  return errors;
}

export function validateProviderExportPlanReceipt(
  receipt: ProviderExportPlanReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportPlanReceipt.id is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`ProviderExportPlanReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!receipt.redactedAccountLabel) {
    errors.push('ProviderExportPlanReceipt.redactedAccountLabel is required.');
  }
  if (!receipt.accountLabelHash) {
    errors.push('ProviderExportPlanReceipt.accountLabelHash is required.');
  }
  if (!Array.isArray(receipt.selectedProducts) || receipt.selectedProducts.length === 0) {
    errors.push('ProviderExportPlanReceipt.selectedProducts must include at least one product.');
  } else {
    for (const product of receipt.selectedProducts) {
      if (!product.id) errors.push('ProviderExportProductSelection.id is required.');
      if (!product.label) errors.push('ProviderExportProductSelection.label is required.');
      if (typeof product.included !== 'boolean') {
        errors.push('ProviderExportProductSelection.included must be a boolean.');
      }
      if (!product.selectionHash) {
        errors.push('ProviderExportProductSelection.selectionHash is required.');
      }
    }
    if (!receipt.selectedProducts.some((product) => product.included)) {
      errors.push('ProviderExportPlanReceipt must include at least one selected product.');
    }
  }
  if (!isSupportedAccountExportDeliveryMethod(String(receipt.deliveryMethod))) {
    errors.push(
      `ProviderExportPlanReceipt.deliveryMethod is unsupported: ${String(receipt.deliveryMethod)}.`
    );
  }
  if (!isSupportedAccountExportArchiveFormat(String(receipt.archiveFormat))) {
    errors.push(
      `ProviderExportPlanReceipt.archiveFormat is unsupported: ${String(receipt.archiveFormat)}.`
    );
  }
  if (!isPositiveNumber(receipt.archiveSizeLimitMb)) {
    errors.push('ProviderExportPlanReceipt.archiveSizeLimitMb must be a positive number.');
  }
  if (receipt.deliveryMethod === 'third_party_cloud' && !receipt.connectedAppRemovalInstruction) {
    errors.push(
      'ProviderExportPlanReceipt.connectedAppRemovalInstruction is required for third_party_cloud delivery.'
    );
  }
  if (
    ['google_drive', 'onedrive', 'third_party_cloud'].includes(receipt.deliveryMethod) &&
    !receipt.cloudHandoffWarning
  ) {
    errors.push('ProviderExportPlanReceipt.cloudHandoffWarning must be true for cloud delivery.');
  }
  if (receipt.accountMutationAllowed !== false) {
    errors.push('ProviderExportPlanReceipt.accountMutationAllowed must be false.');
  }
  if (receipt.requiresFreshUserGesture !== true) {
    errors.push('ProviderExportPlanReceipt.requiresFreshUserGesture must be true.');
  }
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('ProviderExportPlanReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateWarnings(receipt.warnings, 'ProviderExportPlanReceipt', errors);
  validateVerificationCommands(
    receipt.verificationCommands,
    'ProviderExportPlanReceipt',
    errors
  );
  validateHashFields('ProviderExportPlanReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateProviderExportRequestReceipt(
  receipt: ProviderExportRequestReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportRequestReceipt.id is required.');
  if (!receipt.planReceiptId) errors.push('ProviderExportRequestReceipt.planReceiptId is required.');
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(
      `ProviderExportRequestReceipt.provider is unsupported: ${String(receipt.provider)}.`
    );
  }
  if (!receipt.requestedProductsHash) {
    errors.push('ProviderExportRequestReceipt.requestedProductsHash is required.');
  }
  if (!isIsoTimestamp(receipt.requestedAt)) {
    errors.push('ProviderExportRequestReceipt.requestedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.requestedBy) errors.push('ProviderExportRequestReceipt.requestedBy is required.');
  if (receipt.freshUserGesture !== true) {
    errors.push('ProviderExportRequestReceipt.freshUserGesture must be true.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('ProviderExportRequestReceipt.hiddenAutomationUsed must be false.');
  }
  if (!isOneOf(['submitted', 'blocked', 'unknown'] as const, String(receipt.providerRequestState))) {
    errors.push(
      `ProviderExportRequestReceipt.providerRequestState is unsupported: ${String(receipt.providerRequestState)}.`
    );
  }
  if (!isOneOf(['minutes', 'hours', 'days', 'unknown'] as const, String(receipt.expectedWaitState))) {
    errors.push(
      `ProviderExportRequestReceipt.expectedWaitState is unsupported: ${String(receipt.expectedWaitState)}.`
    );
  }
  if (receipt.accountMutationPerformed !== false) {
    errors.push('ProviderExportRequestReceipt.accountMutationPerformed must be false.');
  }
  if (!receipt.rollbackNote) errors.push('ProviderExportRequestReceipt.rollbackNote is required.');
  validateHashFields('ProviderExportRequestReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateProviderExportReadyReceipt(receipt: ProviderExportReadyReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportReadyReceipt.id is required.');
  if (!receipt.requestReceiptId)
    errors.push('ProviderExportReadyReceipt.requestReceiptId is required.');
  if (!isIsoTimestamp(receipt.observedAt)) {
    errors.push('ProviderExportReadyReceipt.observedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isOneOf(['not_ready', 'ready', 'expired', 'blocked', 'unknown'] as const, String(receipt.readyState))) {
    errors.push(`ProviderExportReadyReceipt.readyState is unsupported: ${String(receipt.readyState)}.`);
  }
  if (receipt.readyState === 'ready' && !receipt.downloadLinkHash && !receipt.cloudDestinationReady) {
    errors.push(
      'ProviderExportReadyReceipt ready state requires a downloadLinkHash or cloudDestinationReady=true.'
    );
  }
  if (receipt.expiresAt && !isIsoTimestamp(receipt.expiresAt)) {
    errors.push('ProviderExportReadyReceipt.expiresAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.warning) validateWarnings([receipt.warning], 'ProviderExportReadyReceipt', errors);
  validateHashFields('ProviderExportReadyReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateLocalArchiveDownloadReceipt(
  receipt: LocalArchiveDownloadReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('LocalArchiveDownloadReceipt.id is required.');
  if (!receipt.requestReceiptId)
    errors.push('LocalArchiveDownloadReceipt.requestReceiptId is required.');
  if (!isIsoTimestamp(receipt.downloadedAt)) {
    errors.push('LocalArchiveDownloadReceipt.downloadedAt must be a valid ISO-8601 timestamp.');
  }
  validatePublicPath(
    'LocalArchiveDownloadReceipt.downloadDirectory',
    receipt.downloadDirectory,
    errors
  );
  if (receipt.permissionEnvelope !== 'guarded_download') {
    errors.push('LocalArchiveDownloadReceipt.permissionEnvelope must be guarded_download.');
  }
  if (!Array.isArray(receipt.archiveParts) || receipt.archiveParts.length === 0) {
    errors.push('LocalArchiveDownloadReceipt.archiveParts must include at least one archive part.');
  } else {
    for (const part of receipt.archiveParts) {
      if (!part.id) errors.push('AccountExportArchivePart.id is required.');
      validatePublicPath('AccountExportArchivePart.redactedPath', part.redactedPath, errors);
      if (!isNonNegativeInteger(part.sizeBytes)) {
        errors.push('AccountExportArchivePart.sizeBytes must be a non-negative integer.');
      }
      if (!part.sha256) errors.push('AccountExportArchivePart.sha256 is required.');
      if (part.complete !== true) {
        errors.push('AccountExportArchivePart.complete must be true before verification.');
      }
    }
  }
  if (receipt.partialFilesPresent) {
    errors.push('LocalArchiveDownloadReceipt.partialFilesPresent must be false before verification.');
  }
  if (receipt.diskSpaceChecked !== true) {
    errors.push('LocalArchiveDownloadReceipt.diskSpaceChecked must be true.');
  }
  if (receipt.sourceCloudDataMutated !== false) {
    errors.push('LocalArchiveDownloadReceipt.sourceCloudDataMutated must be false.');
  }
  validateVerificationCommands(
    receipt.verificationCommands,
    'LocalArchiveDownloadReceipt',
    errors
  );
  validateHashFields('LocalArchiveDownloadReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateAccountExportArchiveReceipt(
  receipt: AccountExportArchiveReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('AccountExportArchiveReceipt.id is required.');
  if (!receipt.downloadReceiptId)
    errors.push('AccountExportArchiveReceipt.downloadReceiptId is required.');
  if (!isIsoTimestamp(receipt.verifiedAt)) {
    errors.push('AccountExportArchiveReceipt.verifiedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isNonNegativeInteger(receipt.archivePartCount)) {
    errors.push('AccountExportArchiveReceipt.archivePartCount must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(receipt.verifiedArchivePartCount)) {
    errors.push(
      'AccountExportArchiveReceipt.verifiedArchivePartCount must be a non-negative integer.'
    );
  }
  if (receipt.verifiedArchivePartCount !== receipt.archivePartCount) {
    errors.push(
      'AccountExportArchiveReceipt.verifiedArchivePartCount must match archivePartCount before completion.'
    );
  }
  if (!receipt.unpackManifestHash) {
    errors.push('AccountExportArchiveReceipt.unpackManifestHash is required.');
  }
  if (!isOneOf(['pass', 'warn', 'blocked'] as const, String(receipt.sensitivityScanStatus))) {
    errors.push(
      `AccountExportArchiveReceipt.sensitivityScanStatus is unsupported: ${String(receipt.sensitivityScanStatus)}.`
    );
  }
  if (!isNonNegativeInteger(receipt.unexpectedExecutableCount)) {
    errors.push(
      'AccountExportArchiveReceipt.unexpectedExecutableCount must be a non-negative integer.'
    );
  }
  if (receipt.unexpectedExecutableCount > 0 && receipt.importAllowed) {
    errors.push(
      'AccountExportArchiveReceipt.importAllowed must be false when unexpected executables are present.'
    );
  }
  if (receipt.deleteOriginalsAllowed !== false) {
    errors.push('AccountExportArchiveReceipt.deleteOriginalsAllowed must be false.');
  }
  if (!receipt.replayKey) errors.push('AccountExportArchiveReceipt.replayKey is required.');
  validateWarnings(receipt.warnings, 'AccountExportArchiveReceipt', errors);
  validateHashFields('AccountExportArchiveReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateAccountExportReplayReceipt(
  receipt: AccountExportReplayReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('AccountExportReplayReceipt.id is required.');
  if (receipt.workflow !== 'browser-account-export') {
    errors.push('AccountExportReplayReceipt.workflow must be browser-account-export.');
  }
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`AccountExportReplayReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!isSupportedAccountExportStatus(String(receipt.status))) {
    errors.push(`AccountExportReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!receipt.planReceiptId) errors.push('AccountExportReplayReceipt.planReceiptId is required.');
  if (!receipt.replayKey) errors.push('AccountExportReplayReceipt.replayKey is required.');
  if (!receipt.rollbackNote) errors.push('AccountExportReplayReceipt.rollbackNote is required.');
  if (receipt.exportIsNotDeletion !== true) {
    errors.push('AccountExportReplayReceipt.exportIsNotDeletion must be true.');
  }
  if (receipt.accountMutationPerformed !== false) {
    errors.push('AccountExportReplayReceipt.accountMutationPerformed must be false.');
  }
  if (receipt.sourceCloudDataMutated !== false) {
    errors.push('AccountExportReplayReceipt.sourceCloudDataMutated must be false.');
  }
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('AccountExportReplayReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('AccountExportReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellAccountExportReceiptPack(
  pack: HoloShellAccountExportReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellAccountExportReceiptPack.id is required.');
  if (!pack.plan) {
    errors.push('HoloShellAccountExportReceiptPack.plan is required.');
  } else {
    errors.push(...validateProviderExportPlanReceipt(pack.plan));
  }
  if (pack.request) errors.push(...validateProviderExportRequestReceipt(pack.request));
  if (pack.ready) errors.push(...validateProviderExportReadyReceipt(pack.ready));
  if (pack.download) errors.push(...validateLocalArchiveDownloadReceipt(pack.download));
  if (pack.archive) errors.push(...validateAccountExportArchiveReceipt(pack.archive));
  if (!pack.replay) {
    errors.push('HoloShellAccountExportReceiptPack.replay is required.');
  } else {
    errors.push(...validateAccountExportReplayReceipt(pack.replay));
  }
  if (!isSupportedAccountExportStatus(String(pack.status))) {
    errors.push(`HoloShellAccountExportReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  if (pack.status === 'verified' && !pack.archive) {
    errors.push('HoloShellAccountExportReceiptPack.archive is required when status=verified.');
  }
  validateHashFields('HoloShellAccountExportReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

export function cloneProviderExportPlanReceipt(
  receipt: ProviderExportPlanReceipt
): ProviderExportPlanReceipt {
  return {
    ...receipt,
    selectedProducts: receipt.selectedProducts.map((product) => ({ ...product })),
    warnings: receipt.warnings.map((warning) => ({ ...warning })),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
  };
}

export function cloneHoloShellAccountExportReceiptPack(
  pack: HoloShellAccountExportReceiptPack
): HoloShellAccountExportReceiptPack {
  return {
    ...pack,
    plan: cloneProviderExportPlanReceipt(pack.plan),
    ...(pack.request ? { request: { ...pack.request } } : {}),
    ...(pack.ready ? { ready: { ...pack.ready, warning: pack.ready.warning ? { ...pack.ready.warning } : undefined } } : {}),
    ...(pack.download
      ? {
          download: {
            ...pack.download,
            archiveParts: pack.download.archiveParts.map((part) => ({ ...part })),
            ...(pack.download.verificationCommands
              ? { verificationCommands: cloneVerificationCommands(pack.download.verificationCommands) }
              : {}),
          },
        }
      : {}),
    ...(pack.archive
      ? {
          archive: {
            ...pack.archive,
            warnings: pack.archive.warnings.map((warning) => ({ ...warning })),
          },
        }
      : {}),
    replay: { ...pack.replay },
  };
}

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[]
): ArtifactVerificationCommand[] {
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

function cloneProvenance(provenance: ArtifactProvenanceLink): ArtifactProvenanceLink {
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}
