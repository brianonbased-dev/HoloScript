/**
 * HoloShell Provider Export Repair Receipts
 *
 * Substrate for failed provider exports and partial archive recovery. The
 * contracts keep failed evidence, retry plans, and replay lessons separate so
 * HoloShell can block import/delete/share until verification is explicit.
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';
import type {
  AccountExportArchiveFormat,
  AccountExportDeliveryMethod,
  AccountExportProvider,
  ProviderExportWaitState,
} from './holoshell-account-export-receipts';
import {
  isSupportedAccountExportArchiveFormat,
  isSupportedAccountExportDeliveryMethod,
  isSupportedAccountExportProvider,
  isSupportedProviderExportWaitState,
} from './holoshell-account-export-receipts';

export const PROVIDER_EXPORT_FAILURE_KINDS = [
  'provider_delay',
  'provider_failed',
  'link_expired',
  'admin_blocked',
  'missing_archive_part',
  'corrupt_archive',
  'cloud_handoff_block',
  'managed_account_block',
  'unknown',
] as const;
export type ProviderExportFailureKind = (typeof PROVIDER_EXPORT_FAILURE_KINDS)[number];

export const PROVIDER_EXPORT_REPAIR_ACTIONS = [
  'wait',
  'resume_download',
  're_download_same_link',
  'split_product_scope',
  'change_archive_size',
  'change_delivery_method',
  'manual_provider_ticket',
] as const;
export type ProviderExportRepairAction = (typeof PROVIDER_EXPORT_REPAIR_ACTIONS)[number];

export const PROVIDER_EXPORT_REPAIR_STATUSES = [
  'failure_observed',
  'parts_preserved',
  'repair_planned',
  'approval_pending',
  'retry_waiting',
  'verified',
  'blocked',
  'failed',
] as const;
export type ProviderExportRepairStatus = (typeof PROVIDER_EXPORT_REPAIR_STATUSES)[number];

export const PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION =
  'holoscript-provider-export-failure-receipt/v1';
export const PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION =
  'holoscript-partial-archive-evidence-receipt/v1';
export const PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION =
  'holoscript-provider-export-repair-plan-receipt/v1';
export const EXPORT_REPAIR_REPLAY_RECEIPT_VERSION =
  'holoscript-export-repair-replay-receipt/v1';
export const PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION =
  'holoscript-provider-export-repair-receipt-pack/v1';

export interface ProviderExportFailureReceipt {
  id: string;
  schemaVersion: typeof PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION;
  provider: AccountExportProvider;
  redactedAccountLabel: string;
  accountLabelHash: string;
  exportIdHash?: string;
  failureKind: ProviderExportFailureKind;
  providerWaitState: ProviderExportWaitState;
  deliveryMethod: AccountExportDeliveryMethod;
  archiveFormat: AccountExportArchiveFormat;
  observedAt: string;
  linkExpiresAt?: string;
  adminOrManagedAccountBlock: boolean;
  connectedAppAccessInvolved: boolean;
  accountMutationPerformed: false;
  rawPrivateDataPublished: false;
  privatePathLeakedToPublicReceipt: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface PartialArchivePartEvidence {
  partId: string;
  redactedPath: string;
  sizeBytes: number;
  sha256: string;
  complete: boolean;
  openTest: 'pass' | 'fail' | 'not_tested';
}

export interface PartialArchiveEvidenceReceipt {
  id: string;
  schemaVersion: typeof PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION;
  failureReceiptId: string;
  quarantineReceiptId?: string;
  destinationFolderLabel: string;
  destinationFolderHash: string;
  observedParts: PartialArchivePartEvidence[];
  expectedPartCount?: number;
  missingPartCount: number;
  verifiedPartCount: number;
  unzipError?: string;
  unexpectedExecutableCount: number;
  sensitivityScanStatus: 'pass' | 'warn' | 'blocked' | 'not_run';
  missingEvidence: string[];
  importAllowed: false;
  deleteAllowed: false;
  shareAllowed: false;
  rawPrivateDataPublished: false;
  privateAbsolutePathReceipt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface ProviderExportRepairPlanReceipt {
  id: string;
  schemaVersion: typeof PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION;
  failureReceiptId: string;
  partialArchiveEvidenceReceiptId: string;
  repairAction: ProviderExportRepairAction;
  safeReason: string;
  selectedProductsHash: string;
  userApprovalNonce: string;
  requiresFreshUserGesture: true;
  retryWillMutateProviderState: boolean;
  previousEvidencePreserved: true;
  importBlockedUntilVerified: true;
  deleteBlockedUntilApproved: true;
  rawPrivateDataPublished: false;
  rollbackNote: string;
  plannedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface ExportRepairReplayReceipt {
  id: string;
  schemaVersion: typeof EXPORT_REPAIR_REPLAY_RECEIPT_VERSION;
  failureReceiptId: string;
  repairPlanReceiptId: string;
  replayKey: string;
  originalFailureKind: ProviderExportFailureKind;
  repairedOutcome?: 'verified' | 'still_blocked' | 'waiting' | 'failed';
  missingEvidenceListed: true;
  replayableWithoutProviderAccess: true;
  rawPrivateDataPublished: false;
  lesson: string;
  nextSafeAction: string;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellProviderExportRepairReceiptPack {
  id: string;
  schemaVersion: typeof PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION;
  status: ProviderExportRepairStatus;
  failure: ProviderExportFailureReceipt;
  archiveEvidence?: PartialArchiveEvidenceReceipt;
  repairPlan?: ProviderExportRepairPlanReceipt;
  replay?: ExportRepairReplayReceipt;
  importAllowed: false;
  deleteAllowed: false;
  shareAllowed: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface BuildProviderExportRepairPlanOptions {
  id: string;
  selectedProductsHash: string;
  userApprovalNonce: string;
  plannedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  preferredAction?: ProviderExportRepairAction;
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
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

function validatePublicLabel(label: string, value: string | undefined, errors: string[]): void {
  if (!value) {
    errors.push(`${label} is required.`);
  } else if (hasAbsolutePath(value)) {
    errors.push(`${label} must be redacted or hashed, not an absolute path.`);
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

export function isSupportedProviderExportFailureKind(
  kind: string
): kind is ProviderExportFailureKind {
  return isOneOf(PROVIDER_EXPORT_FAILURE_KINDS, kind);
}

export function isSupportedProviderExportRepairAction(
  action: string
): action is ProviderExportRepairAction {
  return isOneOf(PROVIDER_EXPORT_REPAIR_ACTIONS, action);
}

export function isSupportedProviderExportRepairStatus(
  status: string
): status is ProviderExportRepairStatus {
  return isOneOf(PROVIDER_EXPORT_REPAIR_STATUSES, status);
}

export function validateProviderExportFailureReceipt(
  receipt: ProviderExportFailureReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportFailureReceipt.id is required.');
  if (receipt.schemaVersion !== PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION) {
    errors.push(`ProviderExportFailureReceipt.schemaVersion must be ${PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION}.`);
  }
  if (!isSupportedAccountExportProvider(String(receipt.provider))) {
    errors.push(`ProviderExportFailureReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  validatePublicLabel('ProviderExportFailureReceipt.redactedAccountLabel', receipt.redactedAccountLabel, errors);
  if (!receipt.accountLabelHash) errors.push('ProviderExportFailureReceipt.accountLabelHash is required.');
  if (!isSupportedProviderExportFailureKind(String(receipt.failureKind))) {
    errors.push(`ProviderExportFailureReceipt.failureKind is unsupported: ${String(receipt.failureKind)}.`);
  }
  if (!isSupportedProviderExportWaitState(String(receipt.providerWaitState))) {
    errors.push(`ProviderExportFailureReceipt.providerWaitState is unsupported: ${String(receipt.providerWaitState)}.`);
  }
  if (!isSupportedAccountExportDeliveryMethod(String(receipt.deliveryMethod))) {
    errors.push(`ProviderExportFailureReceipt.deliveryMethod is unsupported: ${String(receipt.deliveryMethod)}.`);
  }
  if (!isSupportedAccountExportArchiveFormat(String(receipt.archiveFormat))) {
    errors.push(`ProviderExportFailureReceipt.archiveFormat is unsupported: ${String(receipt.archiveFormat)}.`);
  }
  if (!isIsoTimestamp(receipt.observedAt)) {
    errors.push('ProviderExportFailureReceipt.observedAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.linkExpiresAt !== undefined && !isIsoTimestamp(receipt.linkExpiresAt)) {
    errors.push('ProviderExportFailureReceipt.linkExpiresAt must be a valid ISO-8601 timestamp when present.');
  }
  if (typeof receipt.adminOrManagedAccountBlock !== 'boolean') {
    errors.push('ProviderExportFailureReceipt.adminOrManagedAccountBlock must be a boolean.');
  }
  if (typeof receipt.connectedAppAccessInvolved !== 'boolean') {
    errors.push('ProviderExportFailureReceipt.connectedAppAccessInvolved must be a boolean.');
  }
  if (receipt.accountMutationPerformed !== false) {
    errors.push('ProviderExportFailureReceipt.accountMutationPerformed must be false.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('ProviderExportFailureReceipt.rawPrivateDataPublished must be false.');
  }
  if (receipt.privatePathLeakedToPublicReceipt !== false) {
    errors.push('ProviderExportFailureReceipt.privatePathLeakedToPublicReceipt must be false.');
  }
  validateHashFields('ProviderExportFailureReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'ProviderExportFailureReceipt', errors);
  return errors;
}

export function validatePartialArchiveEvidenceReceipt(
  receipt: PartialArchiveEvidenceReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('PartialArchiveEvidenceReceipt.id is required.');
  if (receipt.schemaVersion !== PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION) {
    errors.push(`PartialArchiveEvidenceReceipt.schemaVersion must be ${PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION}.`);
  }
  if (!receipt.failureReceiptId) errors.push('PartialArchiveEvidenceReceipt.failureReceiptId is required.');
  validatePublicLabel('PartialArchiveEvidenceReceipt.destinationFolderLabel', receipt.destinationFolderLabel, errors);
  if (!receipt.destinationFolderHash) errors.push('PartialArchiveEvidenceReceipt.destinationFolderHash is required.');
  if (!Array.isArray(receipt.observedParts) || receipt.observedParts.length === 0) {
    errors.push('PartialArchiveEvidenceReceipt.observedParts must include at least one part.');
  } else {
    for (const part of receipt.observedParts) {
      if (!part.partId) errors.push('PartialArchivePartEvidence.partId is required.');
      validatePublicLabel('PartialArchivePartEvidence.redactedPath', part.redactedPath, errors);
      if (!isNonNegativeInteger(part.sizeBytes)) {
        errors.push('PartialArchivePartEvidence.sizeBytes must be a non-negative integer.');
      }
      if (!part.sha256) errors.push('PartialArchivePartEvidence.sha256 is required.');
      if (typeof part.complete !== 'boolean') {
        errors.push('PartialArchivePartEvidence.complete must be a boolean.');
      }
      if (!isOneOf(['pass', 'fail', 'not_tested'] as const, String(part.openTest))) {
        errors.push(`PartialArchivePartEvidence.openTest is unsupported: ${String(part.openTest)}.`);
      }
    }
  }
  if (receipt.expectedPartCount !== undefined && !isNonNegativeInteger(receipt.expectedPartCount)) {
    errors.push('PartialArchiveEvidenceReceipt.expectedPartCount must be a non-negative integer when present.');
  }
  if (!isNonNegativeInteger(receipt.missingPartCount)) {
    errors.push('PartialArchiveEvidenceReceipt.missingPartCount must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(receipt.verifiedPartCount)) {
    errors.push('PartialArchiveEvidenceReceipt.verifiedPartCount must be a non-negative integer.');
  }
  if (receipt.verifiedPartCount > receipt.observedParts.length) {
    errors.push('PartialArchiveEvidenceReceipt.verifiedPartCount cannot exceed observedParts length.');
  }
  if (!isNonNegativeInteger(receipt.unexpectedExecutableCount)) {
    errors.push('PartialArchiveEvidenceReceipt.unexpectedExecutableCount must be a non-negative integer.');
  }
  if (!isOneOf(['pass', 'warn', 'blocked', 'not_run'] as const, String(receipt.sensitivityScanStatus))) {
    errors.push(`PartialArchiveEvidenceReceipt.sensitivityScanStatus is unsupported: ${String(receipt.sensitivityScanStatus)}.`);
  }
  if (!Array.isArray(receipt.missingEvidence)) {
    errors.push('PartialArchiveEvidenceReceipt.missingEvidence must be an array.');
  } else if (receipt.missingPartCount > 0 && receipt.missingEvidence.length === 0) {
    errors.push('PartialArchiveEvidenceReceipt.missingEvidence must list missing parts when missingPartCount > 0.');
  }
  if (receipt.importAllowed !== false) errors.push('PartialArchiveEvidenceReceipt.importAllowed must be false.');
  if (receipt.deleteAllowed !== false) errors.push('PartialArchiveEvidenceReceipt.deleteAllowed must be false.');
  if (receipt.shareAllowed !== false) errors.push('PartialArchiveEvidenceReceipt.shareAllowed must be false.');
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('PartialArchiveEvidenceReceipt.rawPrivateDataPublished must be false.');
  }
  if (!receipt.privateAbsolutePathReceipt) {
    errors.push('PartialArchiveEvidenceReceipt.privateAbsolutePathReceipt is required.');
  }
  validateHashFields('PartialArchiveEvidenceReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'PartialArchiveEvidenceReceipt', errors);
  return errors;
}

export function validateProviderExportRepairPlanReceipt(
  receipt: ProviderExportRepairPlanReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ProviderExportRepairPlanReceipt.id is required.');
  if (receipt.schemaVersion !== PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION) {
    errors.push(`ProviderExportRepairPlanReceipt.schemaVersion must be ${PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION}.`);
  }
  if (!receipt.failureReceiptId) errors.push('ProviderExportRepairPlanReceipt.failureReceiptId is required.');
  if (!receipt.partialArchiveEvidenceReceiptId) {
    errors.push('ProviderExportRepairPlanReceipt.partialArchiveEvidenceReceiptId is required.');
  }
  if (!isSupportedProviderExportRepairAction(String(receipt.repairAction))) {
    errors.push(`ProviderExportRepairPlanReceipt.repairAction is unsupported: ${String(receipt.repairAction)}.`);
  }
  if (!receipt.safeReason) errors.push('ProviderExportRepairPlanReceipt.safeReason is required.');
  if (!receipt.selectedProductsHash) errors.push('ProviderExportRepairPlanReceipt.selectedProductsHash is required.');
  if (!receipt.userApprovalNonce) errors.push('ProviderExportRepairPlanReceipt.userApprovalNonce is required.');
  if (receipt.requiresFreshUserGesture !== true) {
    errors.push('ProviderExportRepairPlanReceipt.requiresFreshUserGesture must be true.');
  }
  if (typeof receipt.retryWillMutateProviderState !== 'boolean') {
    errors.push('ProviderExportRepairPlanReceipt.retryWillMutateProviderState must be a boolean.');
  }
  if (receipt.previousEvidencePreserved !== true) {
    errors.push('ProviderExportRepairPlanReceipt.previousEvidencePreserved must be true.');
  }
  if (receipt.importBlockedUntilVerified !== true) {
    errors.push('ProviderExportRepairPlanReceipt.importBlockedUntilVerified must be true.');
  }
  if (receipt.deleteBlockedUntilApproved !== true) {
    errors.push('ProviderExportRepairPlanReceipt.deleteBlockedUntilApproved must be true.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('ProviderExportRepairPlanReceipt.rawPrivateDataPublished must be false.');
  }
  if (!receipt.rollbackNote) errors.push('ProviderExportRepairPlanReceipt.rollbackNote is required.');
  if (!isIsoTimestamp(receipt.plannedAt)) {
    errors.push('ProviderExportRepairPlanReceipt.plannedAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('ProviderExportRepairPlanReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'ProviderExportRepairPlanReceipt', errors);
  return errors;
}

export function validateExportRepairReplayReceipt(receipt: ExportRepairReplayReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ExportRepairReplayReceipt.id is required.');
  if (receipt.schemaVersion !== EXPORT_REPAIR_REPLAY_RECEIPT_VERSION) {
    errors.push(`ExportRepairReplayReceipt.schemaVersion must be ${EXPORT_REPAIR_REPLAY_RECEIPT_VERSION}.`);
  }
  if (!receipt.failureReceiptId) errors.push('ExportRepairReplayReceipt.failureReceiptId is required.');
  if (!receipt.repairPlanReceiptId) errors.push('ExportRepairReplayReceipt.repairPlanReceiptId is required.');
  if (!receipt.replayKey) errors.push('ExportRepairReplayReceipt.replayKey is required.');
  if (!isSupportedProviderExportFailureKind(String(receipt.originalFailureKind))) {
    errors.push(`ExportRepairReplayReceipt.originalFailureKind is unsupported: ${String(receipt.originalFailureKind)}.`);
  }
  if (
    receipt.repairedOutcome !== undefined &&
    !isOneOf(['verified', 'still_blocked', 'waiting', 'failed'] as const, String(receipt.repairedOutcome))
  ) {
    errors.push(`ExportRepairReplayReceipt.repairedOutcome is unsupported: ${String(receipt.repairedOutcome)}.`);
  }
  if (receipt.missingEvidenceListed !== true) {
    errors.push('ExportRepairReplayReceipt.missingEvidenceListed must be true.');
  }
  if (receipt.replayableWithoutProviderAccess !== true) {
    errors.push('ExportRepairReplayReceipt.replayableWithoutProviderAccess must be true.');
  }
  if (receipt.rawPrivateDataPublished !== false) {
    errors.push('ExportRepairReplayReceipt.rawPrivateDataPublished must be false.');
  }
  if (!receipt.lesson) errors.push('ExportRepairReplayReceipt.lesson is required.');
  if (!receipt.nextSafeAction) errors.push('ExportRepairReplayReceipt.nextSafeAction is required.');
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('ExportRepairReplayReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('ExportRepairReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellProviderExportRepairReceiptPack(
  pack: HoloShellProviderExportRepairReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellProviderExportRepairReceiptPack.id is required.');
  if (pack.schemaVersion !== PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION) {
    errors.push(`HoloShellProviderExportRepairReceiptPack.schemaVersion must be ${PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION}.`);
  }
  if (!isSupportedProviderExportRepairStatus(String(pack.status))) {
    errors.push(`HoloShellProviderExportRepairReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  if (!pack.failure) {
    errors.push('HoloShellProviderExportRepairReceiptPack.failure is required.');
  } else {
    errors.push(...validateProviderExportFailureReceipt(pack.failure));
  }
  if (pack.archiveEvidence) {
    errors.push(...validatePartialArchiveEvidenceReceipt(pack.archiveEvidence));
  }
  if (pack.repairPlan) {
    errors.push(...validateProviderExportRepairPlanReceipt(pack.repairPlan));
  }
  if (pack.replay) {
    errors.push(...validateExportRepairReplayReceipt(pack.replay));
  }
  if (pack.status === 'parts_preserved' && !pack.archiveEvidence) {
    errors.push('HoloShellProviderExportRepairReceiptPack.archiveEvidence is required when status=parts_preserved.');
  }
  if (pack.status === 'repair_planned' && !pack.repairPlan) {
    errors.push('HoloShellProviderExportRepairReceiptPack.repairPlan is required when status=repair_planned.');
  }
  if (pack.status === 'verified' && !pack.replay) {
    errors.push('HoloShellProviderExportRepairReceiptPack.replay is required when status=verified.');
  }
  if (pack.importAllowed !== false) errors.push('HoloShellProviderExportRepairReceiptPack.importAllowed must be false.');
  if (pack.deleteAllowed !== false) errors.push('HoloShellProviderExportRepairReceiptPack.deleteAllowed must be false.');
  if (pack.shareAllowed !== false) errors.push('HoloShellProviderExportRepairReceiptPack.shareAllowed must be false.');
  validateHashFields('HoloShellProviderExportRepairReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

export function buildProviderExportRepairPlanReceipt(
  failure: ProviderExportFailureReceipt,
  archiveEvidence: PartialArchiveEvidenceReceipt,
  options: BuildProviderExportRepairPlanOptions
): ProviderExportRepairPlanReceipt {
  const repairAction = options.preferredAction ?? chooseRepairAction(failure, archiveEvidence);
  return {
    id: options.id,
    schemaVersion: PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION,
    failureReceiptId: failure.id,
    partialArchiveEvidenceReceiptId: archiveEvidence.id,
    repairAction,
    safeReason: describeRepairReason(repairAction, failure, archiveEvidence),
    selectedProductsHash: options.selectedProductsHash,
    userApprovalNonce: options.userApprovalNonce,
    requiresFreshUserGesture: true,
    retryWillMutateProviderState: repairActionMutatesProviderState(repairAction),
    previousEvidencePreserved: true,
    importBlockedUntilVerified: true,
    deleteBlockedUntilApproved: true,
    rawPrivateDataPublished: false,
    rollbackNote: 'Prior failed export evidence remains quarantined; provider mutations require a new approval receipt.',
    plannedAt: options.plannedAt,
    hash: options.hash,
    hashAlgorithm: options.hashAlgorithm,
  };
}

function chooseRepairAction(
  failure: ProviderExportFailureReceipt,
  archiveEvidence: PartialArchiveEvidenceReceipt
): ProviderExportRepairAction {
  if (failure.adminOrManagedAccountBlock || failure.failureKind === 'admin_blocked' || failure.failureKind === 'managed_account_block') {
    return 'manual_provider_ticket';
  }
  if (failure.failureKind === 'provider_delay' || failure.providerWaitState === 'provider_waiting') {
    return 'wait';
  }
  if (failure.failureKind === 'link_expired') {
    return 're_download_same_link';
  }
  if (archiveEvidence.missingPartCount > 0) {
    return 'resume_download';
  }
  if (failure.failureKind === 'cloud_handoff_block') {
    return 'change_delivery_method';
  }
  if (failure.failureKind === 'corrupt_archive') {
    return 'change_archive_size';
  }
  return 'split_product_scope';
}

function repairActionMutatesProviderState(action: ProviderExportRepairAction): boolean {
  return ['split_product_scope', 'change_archive_size', 'change_delivery_method'].includes(action);
}

function describeRepairReason(
  action: ProviderExportRepairAction,
  failure: ProviderExportFailureReceipt,
  archiveEvidence: PartialArchiveEvidenceReceipt
): string {
  if (action === 'wait') {
    return 'Provider is still preparing the export; preserve local evidence and wait for a new ready state.';
  }
  if (action === 'resume_download') {
    return `Archive evidence is missing ${archiveEvidence.missingPartCount} part(s); resume or re-download into quarantine before import.`;
  }
  if (action === 'manual_provider_ticket') {
    return 'Provider or managed account policy blocked the export; escalate through the provider-visible support path.';
  }
  if (action === 'change_delivery_method') {
    return 'Cloud handoff is blocked; choose a delivery method with a receipt-backed local download path.';
  }
  if (action === 'change_archive_size') {
    return 'Archive integrity failed; request smaller archive parts to reduce corrupt retry cost.';
  }
  if (action === 're_download_same_link') {
    return 'The visible link state failed or expired; re-download only after binding the current provider state to approval.';
  }
  return `Failure kind ${failure.failureKind} needs a smaller verified scope before HoloLand import is safe.`;
}

export function cloneProviderExportFailureReceipt(
  receipt: ProviderExportFailureReceipt
): ProviderExportFailureReceipt {
  return {
    ...receipt,
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
  };
}

export function clonePartialArchiveEvidenceReceipt(
  receipt: PartialArchiveEvidenceReceipt
): PartialArchiveEvidenceReceipt {
  return {
    ...receipt,
    observedParts: receipt.observedParts.map((part) => ({ ...part })),
    missingEvidence: [...receipt.missingEvidence],
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
  };
}

export function cloneProviderExportRepairPlanReceipt(
  receipt: ProviderExportRepairPlanReceipt
): ProviderExportRepairPlanReceipt {
  return {
    ...receipt,
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
  };
}

export function cloneExportRepairReplayReceipt(
  receipt: ExportRepairReplayReceipt
): ExportRepairReplayReceipt {
  return { ...receipt };
}

export function cloneHoloShellProviderExportRepairReceiptPack(
  pack: HoloShellProviderExportRepairReceiptPack
): HoloShellProviderExportRepairReceiptPack {
  return {
    ...pack,
    failure: cloneProviderExportFailureReceipt(pack.failure),
    ...(pack.archiveEvidence ? { archiveEvidence: clonePartialArchiveEvidenceReceipt(pack.archiveEvidence) } : {}),
    ...(pack.repairPlan ? { repairPlan: cloneProviderExportRepairPlanReceipt(pack.repairPlan) } : {}),
    ...(pack.replay ? { replay: cloneExportRepairReplayReceipt(pack.replay) } : {}),
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
