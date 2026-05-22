/**
 * HoloShell Cloud Permission Cleanup Receipts
 *
 * Reusable substrate contract for cloud-drive sharing cleanup. HoloLand renders
 * the room; HoloScript validates provider-account custody, shared inventory,
 * exposure diffs, itemized revoke plans, residual access, and replay claims.
 */

import type { ArtifactHashAlgorithm } from './board-types';

export const HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION =
  'hololand.holoshell.cloud-permission-cleanup.v0.1.0';

export const CLOUD_PERMISSION_CLEANUP_WORKFLOW = 'cloud-drive-permission-cleanup' as const;

export const CLOUD_PERMISSION_PROVIDERS = [
  'google_drive',
  'onedrive',
  'icloud_drive',
  'dropbox',
  'box',
  'generic_cloud_drive',
] as const;
export type CloudPermissionProvider = (typeof CLOUD_PERMISSION_PROVIDERS)[number];

export const CLOUD_PERMISSION_CLEANUP_STATUSES = [
  'planned',
  'inventory_written',
  'exposure_classified',
  'approval_required',
  'revocation_verified',
  'clean',
  'residual_access_warning',
  'blocked',
  'failed',
] as const;
export type CloudPermissionCleanupStatus =
  (typeof CLOUD_PERMISSION_CLEANUP_STATUSES)[number];

export const CLOUD_LINK_VISIBILITIES = [
  'private',
  'restricted',
  'domain',
  'public',
  'unknown',
] as const;
export type CloudLinkVisibility = (typeof CLOUD_LINK_VISIBILITIES)[number];

export const CLOUD_SHARE_ROLES = ['viewer', 'commenter', 'editor', 'owner', 'unknown'] as const;
export type CloudShareRole = (typeof CLOUD_SHARE_ROLES)[number];

export const CLOUD_SHARE_SUBJECT_BOUNDARIES = [
  'self',
  'household',
  'organization',
  'external',
  'public',
  'unknown',
] as const;
export type CloudShareSubjectBoundary =
  (typeof CLOUD_SHARE_SUBJECT_BOUNDARIES)[number];

export const CLOUD_PERMISSION_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type CloudPermissionRiskLevel = (typeof CLOUD_PERMISSION_RISK_LEVELS)[number];

export const PROVIDER_METADATA_INPUT_FORMATS = [
  'google_drive_permissions',
  'microsoft_graph_driveitems',
  'generic_items',
] as const;
export type ProviderMetadataInputFormat = (typeof PROVIDER_METADATA_INPUT_FORMATS)[number];

export const PROVIDER_METADATA_SOURCE_KINDS = [
  'provider_api',
  'local_metadata_export',
  'manual_fixture',
] as const;
export type ProviderMetadataSourceKind = (typeof PROVIDER_METADATA_SOURCE_KINDS)[number];

export interface ProviderMetadataInventoryWitnessReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_PERMISSION_CLEANUP_WORKFLOW;
  provider: CloudPermissionProvider | string;
  providerInputFormat: ProviderMetadataInputFormat | string;
  sourceKind: ProviderMetadataSourceKind | string;
  exportHash: string;
  exportHashAlgorithm: ArtifactHashAlgorithm;
  exportRecordCount: number;
  skippedRecordCount: number;
  unsupportedRecordCount: number;
  fieldAllowlist: string[];
  redactionPolicy: string;
  redactionApplied: true;
  metadataOnly: true;
  blockedFieldsAbsent: true;
  rawContentCaptured: false;
  rawCredentialCaptured: false;
  cookieCaptured: false;
  absolutePathCaptured: false;
  publicReceiptMayContainAbsolutePath: false;
  observedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudShareSubject {
  subjectKind: 'user' | 'group' | 'domain' | 'link' | 'unknown' | string;
  redactedLabel: string;
  labelHash: string;
  boundary: CloudShareSubjectBoundary | string;
  role: CloudShareRole | string;
  inherited: boolean;
}

export interface CloudSharedItemExposure {
  id: string;
  providerItemIdHash: string;
  redactedName: string;
  itemKind: 'file' | 'folder' | 'shortcut' | 'unknown' | string;
  linkVisibility: CloudLinkVisibility | string;
  subjects: CloudShareSubject[];
  inheritedFromItemId?: string;
  riskLevel: CloudPermissionRiskLevel | string;
  intendedPolicy?: 'keep' | 'review' | 'revoke' | string;
}

export interface CloudShareInventoryReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  subjectReceiptId: string;
  provider: CloudPermissionProvider | string;
  redactedAccountLabel: string;
  accountLabelHash: string;
  items: CloudSharedItemExposure[];
  skippedItemCount: number;
  inventoryComplete: boolean;
  publicReceiptMayContainAbsolutePath: false;
  rawContentCaptured: false;
  credentialExtrusionAllowed: false;
  providerMetadataWitnessReceiptId?: string;
  observedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudExposureDiffReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  inventoryReceiptId: string;
  publicLinkItemIds: string[];
  externalEditorItemIds: string[];
  inheritedAccessItemIds: string[];
  unknownGroupItemIds: string[];
  domainWideItemIds: string[];
  residualAccessCount: number;
  readyForRevocationPlan: boolean;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudPermissionRevokePlanReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  exposureDiffReceiptId: string;
  selectedItemIds: string[];
  approvedExposureIds: string[];
  blockedActions: string[];
  permissionEnvelope: 'guarded_execute' | 'break_glass' | string;
  freshApproval: boolean;
  approvalId: string;
  bulkMutationRequested: false;
  deleteOrMoveRequested: false;
  ownerTransferRequested: false;
  rawCredentialCaptured: false;
  hiddenAutomationUsed: false;
  approvedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudPermissionCleanupVerificationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  revokePlanReceiptId: string;
  providerStateVerified: boolean;
  revokedExposureIds: string[];
  residualAccessItemIds: string[];
  residualAccessCount: number;
  readyToClaimClean: boolean;
  verificationMethod:
    | 'provider_settings'
    | 'provider_activity_log'
    | 'manual_redacted_witness'
    | string;
  verifiedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudPermissionCleanupReplayReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_PERMISSION_CLEANUP_WORKFLOW;
  status: CloudPermissionCleanupStatus | string;
  inventoryReceiptId: string;
  exposureDiffReceiptId: string;
  revokePlanReceiptId?: string;
  verificationReceiptId?: string;
  replayKey: string;
  residualAccessCount: number;
  readyToClaimClean: boolean;
  rawCredentialCaptured: false;
  hiddenAutomationUsed: false;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellCloudPermissionCleanupReceiptPack {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_PERMISSION_CLEANUP_WORKFLOW;
  status: CloudPermissionCleanupStatus | string;
  providerMetadataWitness?: ProviderMetadataInventoryWitnessReceipt;
  inventory: CloudShareInventoryReceipt;
  exposureDiff: CloudExposureDiffReceipt;
  revokePlan?: CloudPermissionRevokePlanReceipt;
  verification?: CloudPermissionCleanupVerificationReceipt;
  replay: CloudPermissionCleanupReplayReceipt;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateHash(
  label: string,
  hash: string | undefined,
  algorithm: string | undefined,
  errors: string[]
): void {
  if (!isNonEmptyString(hash)) errors.push(`${label}.hash is required.`);
  if (algorithm !== 'sha256') errors.push(`${label}.hashAlgorithm must be sha256.`);
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
}

function validateNoRawLeak(label: string, value: string | undefined, errors: string[]): void {
  if (!isNonEmptyString(value)) {
    errors.push(`${label} is required.`);
    return;
  }
  if (
    /([A-Z]:\\|\/Users\/|\/home\/|access_token=|refresh_token=|Bearer\s+)/i.test(value) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
  ) {
    errors.push(`${label} must be redacted before public receipts.`);
  }
}

export function isSupportedCloudPermissionProvider(
  value: string
): value is CloudPermissionProvider {
  return isOneOf(CLOUD_PERMISSION_PROVIDERS, value);
}

export function isSupportedCloudPermissionCleanupStatus(
  value: string
): value is CloudPermissionCleanupStatus {
  return isOneOf(CLOUD_PERMISSION_CLEANUP_STATUSES, value);
}

export function isSupportedCloudLinkVisibility(value: string): value is CloudLinkVisibility {
  return isOneOf(CLOUD_LINK_VISIBILITIES, value);
}

export function isSupportedCloudShareRole(value: string): value is CloudShareRole {
  return isOneOf(CLOUD_SHARE_ROLES, value);
}

export function isSupportedCloudShareSubjectBoundary(
  value: string
): value is CloudShareSubjectBoundary {
  return isOneOf(CLOUD_SHARE_SUBJECT_BOUNDARIES, value);
}

export function isSupportedProviderMetadataInputFormat(
  value: string
): value is ProviderMetadataInputFormat {
  return isOneOf(PROVIDER_METADATA_INPUT_FORMATS, value);
}

export function isSupportedProviderMetadataSourceKind(
  value: string
): value is ProviderMetadataSourceKind {
  return isOneOf(PROVIDER_METADATA_SOURCE_KINDS, value);
}

export function cloudExposureRisk(item: CloudSharedItemExposure): CloudPermissionRiskLevel {
  if (item.linkVisibility === 'public') return 'critical';
  if (item.linkVisibility === 'domain') return 'high';
  if (
    item.subjects.some(
      (subject) =>
        subject.boundary === 'external' &&
        (subject.role === 'editor' || subject.role === 'owner')
    )
  ) {
    return 'high';
  }
  if (item.subjects.some((subject) => subject.inherited || subject.boundary === 'unknown')) {
    return 'medium';
  }
  return 'low';
}

export function summarizeCloudExposure(items: CloudSharedItemExposure[]): {
  publicLinkItemIds: string[];
  externalEditorItemIds: string[];
  inheritedAccessItemIds: string[];
  unknownGroupItemIds: string[];
  domainWideItemIds: string[];
} {
  return {
    publicLinkItemIds: items
      .filter((item) => item.linkVisibility === 'public')
      .map((item) => item.id),
    externalEditorItemIds: items
      .filter((item) =>
        item.subjects.some(
          (subject) =>
            subject.boundary === 'external' &&
            (subject.role === 'editor' || subject.role === 'owner')
        )
      )
      .map((item) => item.id),
    inheritedAccessItemIds: items
      .filter((item) => Boolean(item.inheritedFromItemId) || item.subjects.some((s) => s.inherited))
      .map((item) => item.id),
    unknownGroupItemIds: items
      .filter((item) =>
        item.subjects.some((subject) => subject.subjectKind === 'group' && subject.boundary === 'unknown')
      )
      .map((item) => item.id),
    domainWideItemIds: items
      .filter((item) => item.linkVisibility === 'domain')
      .map((item) => item.id),
  };
}

function validateCloudShareSubject(
  label: string,
  subject: CloudShareSubject,
  errors: string[]
): void {
  if (!isNonEmptyString(subject.subjectKind)) errors.push(`${label}.subjectKind is required.`);
  validateNoRawLeak(`${label}.redactedLabel`, subject.redactedLabel, errors);
  if (!isNonEmptyString(subject.labelHash)) errors.push(`${label}.labelHash is required.`);
  if (!isSupportedCloudShareSubjectBoundary(String(subject.boundary))) {
    errors.push(`${label}.boundary is unsupported: ${String(subject.boundary)}.`);
  }
  if (!isSupportedCloudShareRole(String(subject.role))) {
    errors.push(`${label}.role is unsupported: ${String(subject.role)}.`);
  }
  if (typeof subject.inherited !== 'boolean') errors.push(`${label}.inherited must be boolean.`);
}

function validateCloudSharedItem(
  label: string,
  item: CloudSharedItemExposure,
  errors: string[]
): void {
  if (!isNonEmptyString(item.id)) errors.push(`${label}.id is required.`);
  if (!isNonEmptyString(item.providerItemIdHash)) {
    errors.push(`${label}.providerItemIdHash is required.`);
  }
  validateNoRawLeak(`${label}.redactedName`, item.redactedName, errors);
  if (!isSupportedCloudLinkVisibility(String(item.linkVisibility))) {
    errors.push(`${label}.linkVisibility is unsupported: ${String(item.linkVisibility)}.`);
  }
  if (!Array.isArray(item.subjects)) {
    errors.push(`${label}.subjects must be an array.`);
  } else {
    item.subjects.forEach((subject, index) =>
      validateCloudShareSubject(`${label}.subjects[${index}]`, subject, errors)
    );
  }
  if (!isOneOf(CLOUD_PERMISSION_RISK_LEVELS, String(item.riskLevel))) {
    errors.push(`${label}.riskLevel is unsupported: ${String(item.riskLevel)}.`);
  }
}

function knownItemIds(inventory: CloudShareInventoryReceipt): Set<string> {
  return new Set(inventory.items.map((item) => item.id));
}

function validateKnownIds(label: string, ids: unknown, known: Set<string>, errors: string[]): void {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (!known.has(id)) errors.push(`${label} references unknown inventory item: ${id}.`);
  }
}

function exposureItemIds(receipt: CloudExposureDiffReceipt): Set<string> {
  const idsOrEmpty = (ids: unknown): string[] => (Array.isArray(ids) ? ids : []);
  return new Set([
    ...idsOrEmpty(receipt.publicLinkItemIds),
    ...idsOrEmpty(receipt.externalEditorItemIds),
    ...idsOrEmpty(receipt.inheritedAccessItemIds),
    ...idsOrEmpty(receipt.unknownGroupItemIds),
    ...idsOrEmpty(receipt.domainWideItemIds),
  ]);
}

export function validateProviderMetadataInventoryWitnessReceipt(
  receipt: ProviderMetadataInventoryWitnessReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['ProviderMetadataInventoryWitnessReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `ProviderMetadataInventoryWitnessReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== CLOUD_PERMISSION_CLEANUP_WORKFLOW) {
    errors.push(`ProviderMetadataInventoryWitnessReceipt.workflow must be ${CLOUD_PERMISSION_CLEANUP_WORKFLOW}.`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('ProviderMetadataInventoryWitnessReceipt.id is required.');
  if (!isSupportedCloudPermissionProvider(String(receipt.provider))) {
    errors.push(`ProviderMetadataInventoryWitnessReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  if (!isSupportedProviderMetadataInputFormat(String(receipt.providerInputFormat))) {
    errors.push(
      `ProviderMetadataInventoryWitnessReceipt.providerInputFormat is unsupported: ${String(receipt.providerInputFormat)}.`
    );
  }
  if (!isSupportedProviderMetadataSourceKind(String(receipt.sourceKind))) {
    errors.push(`ProviderMetadataInventoryWitnessReceipt.sourceKind is unsupported: ${String(receipt.sourceKind)}.`);
  }
  if (!isNonEmptyString(receipt.exportHash)) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.exportHash is required.');
  }
  if (receipt.exportHashAlgorithm !== 'sha256') {
    errors.push('ProviderMetadataInventoryWitnessReceipt.exportHashAlgorithm must be sha256.');
  }
  for (const [key, value] of Object.entries({
    exportRecordCount: receipt.exportRecordCount,
    skippedRecordCount: receipt.skippedRecordCount,
    unsupportedRecordCount: receipt.unsupportedRecordCount,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`ProviderMetadataInventoryWitnessReceipt.${key} must be a non-negative integer.`);
    }
  }
  if (!Array.isArray(receipt.fieldAllowlist) || receipt.fieldAllowlist.length === 0) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.fieldAllowlist must include at least one field.');
  } else {
    receipt.fieldAllowlist.forEach((field, index) => {
      if (!isNonEmptyString(field)) {
        errors.push(`ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[${index}] is required.`);
      }
      if (/token|cookie|content|body|password|secret/i.test(field)) {
        errors.push(`ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[${index}] contains blocked field: ${field}.`);
      }
      if (field.includes('*') || /\[\]$/.test(field)) {
        errors.push(
          `ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[${index}] must name a specific metadata field, not an overbroad collection: ${field}.`
        );
      }
    });
  }
  if (!isNonEmptyString(receipt.redactionPolicy)) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.redactionPolicy is required.');
  }
  if (receipt.redactionApplied !== true) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.redactionApplied must be true.');
  }
  if (receipt.metadataOnly !== true) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.metadataOnly must be true.');
  }
  if (receipt.blockedFieldsAbsent !== true) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.blockedFieldsAbsent must be true.');
  }
  if (receipt.rawContentCaptured !== false) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.rawContentCaptured must be false.');
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.cookieCaptured !== false) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.cookieCaptured must be false.');
  }
  if (receipt.absolutePathCaptured !== false) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.absolutePathCaptured must be false.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('ProviderMetadataInventoryWitnessReceipt.publicReceiptMayContainAbsolutePath must be false.');
  }
  validateTimestamp('ProviderMetadataInventoryWitnessReceipt.observedAt', receipt.observedAt, errors);
  validateHash('ProviderMetadataInventoryWitnessReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateCloudShareInventoryReceipt(
  receipt: CloudShareInventoryReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudShareInventoryReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudShareInventoryReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('CloudShareInventoryReceipt.id is required.');
  if (!isNonEmptyString(receipt.subjectReceiptId)) {
    errors.push('CloudShareInventoryReceipt.subjectReceiptId is required.');
  }
  if (!isSupportedCloudPermissionProvider(String(receipt.provider))) {
    errors.push(`CloudShareInventoryReceipt.provider is unsupported: ${String(receipt.provider)}.`);
  }
  validateNoRawLeak('CloudShareInventoryReceipt.redactedAccountLabel', receipt.redactedAccountLabel, errors);
  if (!isNonEmptyString(receipt.accountLabelHash)) {
    errors.push('CloudShareInventoryReceipt.accountLabelHash is required.');
  }
  if (!Array.isArray(receipt.items)) {
    errors.push('CloudShareInventoryReceipt.items must be an array.');
  } else {
    receipt.items.forEach((item, index) =>
      validateCloudSharedItem(`CloudShareInventoryReceipt.items[${index}]`, item, errors)
    );
  }
  if (!Number.isInteger(receipt.skippedItemCount) || receipt.skippedItemCount < 0) {
    errors.push('CloudShareInventoryReceipt.skippedItemCount must be a non-negative integer.');
  }
  if (typeof receipt.inventoryComplete !== 'boolean') {
    errors.push('CloudShareInventoryReceipt.inventoryComplete must be boolean.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('CloudShareInventoryReceipt.publicReceiptMayContainAbsolutePath must be false.');
  }
  if (receipt.rawContentCaptured !== false) {
    errors.push('CloudShareInventoryReceipt.rawContentCaptured must be false.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('CloudShareInventoryReceipt.credentialExtrusionAllowed must be false.');
  }
  if (
    receipt.providerMetadataWitnessReceiptId !== undefined &&
    !isNonEmptyString(receipt.providerMetadataWitnessReceiptId)
  ) {
    errors.push('CloudShareInventoryReceipt.providerMetadataWitnessReceiptId must be non-empty when present.');
  }
  validateTimestamp('CloudShareInventoryReceipt.observedAt', receipt.observedAt, errors);
  validateHash('CloudShareInventoryReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateCloudExposureDiffReceipt(
  receipt: CloudExposureDiffReceipt | undefined,
  inventory?: CloudShareInventoryReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudExposureDiffReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudExposureDiffReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('CloudExposureDiffReceipt.id is required.');
  if (!isNonEmptyString(receipt.inventoryReceiptId)) {
    errors.push('CloudExposureDiffReceipt.inventoryReceiptId is required.');
  }
  for (const [key, value] of Object.entries({
    publicLinkItemIds: receipt.publicLinkItemIds,
    externalEditorItemIds: receipt.externalEditorItemIds,
    inheritedAccessItemIds: receipt.inheritedAccessItemIds,
    unknownGroupItemIds: receipt.unknownGroupItemIds,
    domainWideItemIds: receipt.domainWideItemIds,
  })) {
    if (!Array.isArray(value)) errors.push(`CloudExposureDiffReceipt.${key} must be an array.`);
  }
  if (!Number.isInteger(receipt.residualAccessCount) || receipt.residualAccessCount < 0) {
    errors.push('CloudExposureDiffReceipt.residualAccessCount must be a non-negative integer.');
  }
  if (typeof receipt.readyForRevocationPlan !== 'boolean') {
    errors.push('CloudExposureDiffReceipt.readyForRevocationPlan must be boolean.');
  }
  if (inventory) {
    const known = knownItemIds(inventory);
    validateKnownIds('CloudExposureDiffReceipt.publicLinkItemIds', receipt.publicLinkItemIds, known, errors);
    validateKnownIds(
      'CloudExposureDiffReceipt.externalEditorItemIds',
      receipt.externalEditorItemIds,
      known,
      errors
    );
    validateKnownIds(
      'CloudExposureDiffReceipt.inheritedAccessItemIds',
      receipt.inheritedAccessItemIds,
      known,
      errors
    );
    validateKnownIds('CloudExposureDiffReceipt.unknownGroupItemIds', receipt.unknownGroupItemIds, known, errors);
    validateKnownIds('CloudExposureDiffReceipt.domainWideItemIds', receipt.domainWideItemIds, known, errors);
  }
  validateHash('CloudExposureDiffReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateCloudPermissionRevokePlanReceipt(
  receipt: CloudPermissionRevokePlanReceipt | undefined,
  exposureDiff?: CloudExposureDiffReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudPermissionRevokePlanReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudPermissionRevokePlanReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('CloudPermissionRevokePlanReceipt.id is required.');
  if (!isNonEmptyString(receipt.exposureDiffReceiptId)) {
    errors.push('CloudPermissionRevokePlanReceipt.exposureDiffReceiptId is required.');
  }
  if (!Array.isArray(receipt.selectedItemIds) || receipt.selectedItemIds.length === 0) {
    errors.push('CloudPermissionRevokePlanReceipt.selectedItemIds must include at least one item.');
  }
  if (!Array.isArray(receipt.approvedExposureIds)) {
    errors.push('CloudPermissionRevokePlanReceipt.approvedExposureIds must be an array.');
  } else if (
    Array.isArray(receipt.selectedItemIds) &&
    receipt.selectedItemIds.some((id) => !receipt.approvedExposureIds.includes(id))
  ) {
    errors.push(
      'CloudPermissionRevokePlanReceipt.selectedItemIds must each have itemized approvedExposureIds review.'
    );
  }
  if (receipt.permissionEnvelope !== 'guarded_execute') {
    errors.push('CloudPermissionRevokePlanReceipt.permissionEnvelope must be guarded_execute.');
  }
  if (receipt.freshApproval !== true) {
    errors.push('CloudPermissionRevokePlanReceipt.freshApproval must be true.');
  }
  if (!isNonEmptyString(receipt.approvalId)) {
    errors.push('CloudPermissionRevokePlanReceipt.approvalId is required.');
  }
  if (receipt.bulkMutationRequested !== false) {
    errors.push('CloudPermissionRevokePlanReceipt.bulkMutationRequested must be false.');
  }
  if (receipt.deleteOrMoveRequested !== false) {
    errors.push('CloudPermissionRevokePlanReceipt.deleteOrMoveRequested must be false.');
  }
  if (receipt.ownerTransferRequested !== false) {
    errors.push('CloudPermissionRevokePlanReceipt.ownerTransferRequested must be false.');
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('CloudPermissionRevokePlanReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('CloudPermissionRevokePlanReceipt.hiddenAutomationUsed must be false.');
  }
  if (exposureDiff && exposureDiff.readyForRevocationPlan !== true) {
    errors.push('CloudPermissionRevokePlanReceipt requires exposureDiff.readyForRevocationPlan.');
  }
  if (exposureDiff && Array.isArray(receipt.selectedItemIds)) {
    const exposureIds = exposureItemIds(exposureDiff);
    for (const id of receipt.selectedItemIds) {
      if (!exposureIds.has(id)) {
        errors.push(`CloudPermissionRevokePlanReceipt.selectedItemIds references non-exposure item: ${id}.`);
      }
    }
  }
  validateTimestamp('CloudPermissionRevokePlanReceipt.approvedAt', receipt.approvedAt, errors);
  validateHash('CloudPermissionRevokePlanReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateCloudPermissionCleanupVerificationReceipt(
  receipt: CloudPermissionCleanupVerificationReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudPermissionCleanupVerificationReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudPermissionCleanupVerificationReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) {
    errors.push('CloudPermissionCleanupVerificationReceipt.id is required.');
  }
  if (!isNonEmptyString(receipt.revokePlanReceiptId)) {
    errors.push('CloudPermissionCleanupVerificationReceipt.revokePlanReceiptId is required.');
  }
  if (receipt.providerStateVerified !== true) {
    errors.push('CloudPermissionCleanupVerificationReceipt.providerStateVerified must be true.');
  }
  if (!Number.isInteger(receipt.residualAccessCount) || receipt.residualAccessCount < 0) {
    errors.push(
      'CloudPermissionCleanupVerificationReceipt.residualAccessCount must be a non-negative integer.'
    );
  }
  if (!Array.isArray(receipt.revokedExposureIds)) {
    errors.push('CloudPermissionCleanupVerificationReceipt.revokedExposureIds must be an array.');
  }
  if (!Array.isArray(receipt.residualAccessItemIds)) {
    errors.push('CloudPermissionCleanupVerificationReceipt.residualAccessItemIds must be an array.');
  } else if (receipt.residualAccessItemIds.length !== receipt.residualAccessCount) {
    errors.push(
      'CloudPermissionCleanupVerificationReceipt.residualAccessCount must match residualAccessItemIds length.'
    );
  }
  if (receipt.readyToClaimClean && receipt.residualAccessCount !== 0) {
    errors.push('CloudPermissionCleanupVerificationReceipt.readyToClaimClean requires zero residual access.');
  }
  validateTimestamp('CloudPermissionCleanupVerificationReceipt.verifiedAt', receipt.verifiedAt, errors);
  validateHash('CloudPermissionCleanupVerificationReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateCloudPermissionCleanupReplayReceipt(
  receipt: CloudPermissionCleanupReplayReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudPermissionCleanupReplayReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudPermissionCleanupReplayReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== CLOUD_PERMISSION_CLEANUP_WORKFLOW) {
    errors.push(`CloudPermissionCleanupReplayReceipt.workflow must be ${CLOUD_PERMISSION_CLEANUP_WORKFLOW}.`);
  }
  if (!isSupportedCloudPermissionCleanupStatus(String(receipt.status))) {
    errors.push(`CloudPermissionCleanupReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isNonEmptyString(receipt.inventoryReceiptId)) {
    errors.push('CloudPermissionCleanupReplayReceipt.inventoryReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.exposureDiffReceiptId)) {
    errors.push('CloudPermissionCleanupReplayReceipt.exposureDiffReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.replayKey)) {
    errors.push('CloudPermissionCleanupReplayReceipt.replayKey is required.');
  }
  if (!Number.isInteger(receipt.residualAccessCount) || receipt.residualAccessCount < 0) {
    errors.push('CloudPermissionCleanupReplayReceipt.residualAccessCount must be a non-negative integer.');
  }
  if (receipt.readyToClaimClean && receipt.residualAccessCount !== 0) {
    errors.push('CloudPermissionCleanupReplayReceipt.readyToClaimClean requires zero residual access.');
  }
  if (receipt.readyToClaimClean && !isNonEmptyString(receipt.verificationReceiptId)) {
    errors.push('CloudPermissionCleanupReplayReceipt.readyToClaimClean requires verificationReceiptId.');
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('CloudPermissionCleanupReplayReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('CloudPermissionCleanupReplayReceipt.hiddenAutomationUsed must be false.');
  }
  validateTimestamp('CloudPermissionCleanupReplayReceipt.createdAt', receipt.createdAt, errors);
  validateHash('CloudPermissionCleanupReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellCloudPermissionCleanupReceiptPack(
  pack: HoloShellCloudPermissionCleanupReceiptPack | undefined
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellCloudPermissionCleanupReceiptPack is required.'];
  if (pack.schemaVersion !== HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `HoloShellCloudPermissionCleanupReceiptPack.schemaVersion must be ${HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (pack.workflow !== CLOUD_PERMISSION_CLEANUP_WORKFLOW) {
    errors.push(
      `HoloShellCloudPermissionCleanupReceiptPack.workflow must be ${CLOUD_PERMISSION_CLEANUP_WORKFLOW}.`
    );
  }
  if (!isSupportedCloudPermissionCleanupStatus(String(pack.status))) {
    errors.push(
      `HoloShellCloudPermissionCleanupReceiptPack.status is unsupported: ${String(pack.status)}.`
    );
  }
  validateHash('HoloShellCloudPermissionCleanupReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  if (pack.providerMetadataWitness) {
    errors.push(...validateProviderMetadataInventoryWitnessReceipt(pack.providerMetadataWitness));
    if (pack.providerMetadataWitness.id !== pack.inventory.providerMetadataWitnessReceiptId) {
      errors.push(
        'HoloShellCloudPermissionCleanupReceiptPack.providerMetadataWitness.id must match inventory.providerMetadataWitnessReceiptId.'
      );
    }
  }
  errors.push(...validateCloudShareInventoryReceipt(pack.inventory));
  errors.push(...validateCloudExposureDiffReceipt(pack.exposureDiff, pack.inventory));
  if (pack.revokePlan) {
    errors.push(...validateCloudPermissionRevokePlanReceipt(pack.revokePlan, pack.exposureDiff));
  }
  if (pack.verification) {
    errors.push(...validateCloudPermissionCleanupVerificationReceipt(pack.verification));
  }
  errors.push(...validateCloudPermissionCleanupReplayReceipt(pack.replay));
  if (pack.status !== pack.replay.status) {
    errors.push('HoloShellCloudPermissionCleanupReceiptPack.status must match replay.status.');
  }
  if ((pack.status === 'clean' || pack.replay.readyToClaimClean) && !pack.verification) {
    errors.push('HoloShellCloudPermissionCleanupReceiptPack.verification is required before clean claim.');
  }
  if ((pack.status === 'revocation_verified' || pack.status === 'clean') && !pack.revokePlan) {
    errors.push('HoloShellCloudPermissionCleanupReceiptPack.revokePlan is required after revocation.');
  }
  if (pack.verification && (pack.status === 'clean' || pack.replay.readyToClaimClean)) {
    const exposureIds = exposureItemIds(pack.exposureDiff);
    const revokedExposureIds = new Set(
      Array.isArray(pack.verification.revokedExposureIds)
        ? pack.verification.revokedExposureIds
        : []
    );
    for (const id of exposureIds) {
      if (!revokedExposureIds.has(id)) {
        errors.push(
          `HoloShellCloudPermissionCleanupReceiptPack.clean claim leaves exposure unverified or residual: ${id}.`
        );
      }
    }
  }
  return errors;
}

function cloneSubject(subject: CloudShareSubject): CloudShareSubject {
  return { ...subject };
}

function cloneItem(item: CloudSharedItemExposure): CloudSharedItemExposure {
  return { ...item, subjects: item.subjects.map(cloneSubject) };
}

export function cloneHoloShellCloudPermissionCleanupReceiptPack(
  pack: HoloShellCloudPermissionCleanupReceiptPack
): HoloShellCloudPermissionCleanupReceiptPack {
  return {
    ...pack,
    inventory: {
      ...pack.inventory,
      items: pack.inventory.items.map(cloneItem),
    },
    ...(pack.providerMetadataWitness
      ? {
          providerMetadataWitness: {
            ...pack.providerMetadataWitness,
            fieldAllowlist: [...pack.providerMetadataWitness.fieldAllowlist],
          },
        }
      : {}),
    exposureDiff: {
      ...pack.exposureDiff,
      publicLinkItemIds: [...pack.exposureDiff.publicLinkItemIds],
      externalEditorItemIds: [...pack.exposureDiff.externalEditorItemIds],
      inheritedAccessItemIds: [...pack.exposureDiff.inheritedAccessItemIds],
      unknownGroupItemIds: [...pack.exposureDiff.unknownGroupItemIds],
      domainWideItemIds: [...pack.exposureDiff.domainWideItemIds],
    },
    ...(pack.revokePlan
      ? {
          revokePlan: {
            ...pack.revokePlan,
            selectedItemIds: [...pack.revokePlan.selectedItemIds],
            approvedExposureIds: [...pack.revokePlan.approvedExposureIds],
            blockedActions: [...pack.revokePlan.blockedActions],
          },
        }
      : {}),
    ...(pack.verification
      ? {
          verification: {
            ...pack.verification,
            revokedExposureIds: [...pack.verification.revokedExposureIds],
            residualAccessItemIds: [...pack.verification.residualAccessItemIds],
          },
        }
      : {}),
    replay: { ...pack.replay },
  };
}
