/**
 * HoloShell Cloud Drive Cleanup Receipts
 *
 * Links provider connected-app inventory, minimum-scope permission gates,
 * verified revocation, local account-export quarantine, and HoloLand
 * preview-only import into one replayable cleanup pack.
 */

import type { ArtifactHashAlgorithm } from './board-types';
import {
  type HoloShellAccountExportReceiptPack,
  validateHoloShellAccountExportReceiptPack,
  cloneHoloShellAccountExportReceiptPack,
} from './holoshell-account-export-receipts';
import {
  type HoloShellPermissionGateReceiptPack,
  type PermissionRevocationReceipt,
  validateHoloShellPermissionGateReceiptPack,
  validatePermissionRevocationReceipt,
  cloneHoloShellPermissionGateReceiptPack,
} from './holoshell-permission-gate-receipts';

export const HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION =
  'hololand.holoshell.cloud-drive-cleanup.v0.1.0';

export const CLOUD_DRIVE_CLEANUP_WORKFLOW = 'cloud-drive-permission-cleanup' as const;

export const CLOUD_DRIVE_PROVIDERS = ['google', 'microsoft', 'other'] as const;
export type CloudDriveProvider = (typeof CLOUD_DRIVE_PROVIDERS)[number];

export const CLOUD_DRIVE_CLEANUP_STATUSES = [
  'planned',
  'inventoried',
  'revoking',
  'revoked_verified',
  'archived',
  'preview_ready',
  'blocked',
  'failed',
] as const;
export type CloudDriveCleanupStatus = (typeof CLOUD_DRIVE_CLEANUP_STATUSES)[number];

export const CLOUD_DRIVE_APP_STATES = [
  'minimum_required',
  'stale',
  'overbroad',
  'unknown',
  'revoked',
] as const;
export type CloudDriveConnectedAppState = (typeof CLOUD_DRIVE_APP_STATES)[number];

export const CLOUD_DRIVE_SCOPE_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type CloudDriveScopeRiskLevel = (typeof CLOUD_DRIVE_SCOPE_RISK_LEVELS)[number];

export interface CloudDriveScopeRecord {
  scope: string;
  providerLabel: string;
  normalizedScope: string;
  purpose: string;
  riskLevel: CloudDriveScopeRiskLevel | string;
  minimumRequired: boolean;
  overbroad: boolean;
}

export interface CloudDriveConnectedAppRecord {
  appIdHash: string;
  redactedAppLabel: string;
  state: CloudDriveConnectedAppState | string;
  scopes: CloudDriveScopeRecord[];
  lastSeenAt?: string;
  revokeCandidate: boolean;
  residualAccessWarning?: string;
}

export interface CloudDriveConnectedAppInventoryReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_DRIVE_CLEANUP_WORKFLOW;
  provider: CloudDriveProvider | string;
  redactedAccountLabel: string;
  accountLabelHash: string;
  browserProfile: string;
  observedAt: string;
  connectedApps: CloudDriveConnectedAppRecord[];
  staleGrantCount: number;
  overbroadGrantCount: number;
  rawCredentialCaptured: false;
  cookieExported: false;
  publicReceiptMayContainAbsolutePath: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface CloudDriveCleanupReplayReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_DRIVE_CLEANUP_WORKFLOW;
  status: CloudDriveCleanupStatus | string;
  inventoryReceiptId: string;
  permissionPackId: string;
  accountExportPackId?: string;
  revocationReceiptIds: string[];
  replayKey: string;
  rawCredentialCaptured: false;
  sourceCloudDataMutated: false;
  previewOnlyImport: true;
  readyForHoloLandPreview: boolean;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellCloudDriveCleanupReceiptPack {
  id: string;
  schemaVersion: typeof HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION;
  workflow: typeof CLOUD_DRIVE_CLEANUP_WORKFLOW;
  status: CloudDriveCleanupStatus | string;
  inventory: CloudDriveConnectedAppInventoryReceipt;
  permissionGate: HoloShellPermissionGateReceiptPack;
  revocations: PermissionRevocationReceipt[];
  accountExport?: HoloShellAccountExportReceiptPack;
  replay: CloudDriveCleanupReplayReceipt;
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

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
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

export function isSupportedCloudDriveProvider(value: string): value is CloudDriveProvider {
  return isOneOf(CLOUD_DRIVE_PROVIDERS, value);
}

export function isSupportedCloudDriveCleanupStatus(
  value: string
): value is CloudDriveCleanupStatus {
  return isOneOf(CLOUD_DRIVE_CLEANUP_STATUSES, value);
}

export function isSupportedCloudDriveConnectedAppState(
  value: string
): value is CloudDriveConnectedAppState {
  return isOneOf(CLOUD_DRIVE_APP_STATES, value);
}

export function validateCloudDriveScopeRecord(
  scope: CloudDriveScopeRecord,
  label = 'CloudDriveScopeRecord'
): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(scope.scope)) errors.push(`${label}.scope is required.`);
  if (!isNonEmptyString(scope.providerLabel)) errors.push(`${label}.providerLabel is required.`);
  if (!isNonEmptyString(scope.normalizedScope)) {
    errors.push(`${label}.normalizedScope is required.`);
  }
  if (!isNonEmptyString(scope.purpose)) errors.push(`${label}.purpose is required.`);
  if (!isNonEmptyString(scope.riskLevel)) errors.push(`${label}.riskLevel is required.`);
  if (typeof scope.minimumRequired !== 'boolean') {
    errors.push(`${label}.minimumRequired must be a boolean.`);
  }
  if (typeof scope.overbroad !== 'boolean') {
    errors.push(`${label}.overbroad must be a boolean.`);
  }
  return errors;
}

export function validateCloudDriveConnectedAppRecord(
  app: CloudDriveConnectedAppRecord,
  label = 'CloudDriveConnectedAppRecord'
): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(app.appIdHash)) errors.push(`${label}.appIdHash is required.`);
  if (!isNonEmptyString(app.redactedAppLabel)) {
    errors.push(`${label}.redactedAppLabel is required.`);
  }
  if (!isSupportedCloudDriveConnectedAppState(String(app.state))) {
    errors.push(`${label}.state is unsupported: ${String(app.state)}.`);
  }
  if (!Array.isArray(app.scopes)) {
    errors.push(`${label}.scopes must be an array.`);
  } else {
    for (const [index, scope] of app.scopes.entries()) {
      errors.push(...validateCloudDriveScopeRecord(scope, `${label}.scopes[${index}]`));
    }
  }
  if (app.lastSeenAt) validateTimestamp(`${label}.lastSeenAt`, app.lastSeenAt, errors);
  if (typeof app.revokeCandidate !== 'boolean') {
    errors.push(`${label}.revokeCandidate must be a boolean.`);
  }
  return errors;
}

export function validateCloudDriveConnectedAppInventoryReceipt(
  receipt: CloudDriveConnectedAppInventoryReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudDriveConnectedAppInventoryReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudDriveConnectedAppInventoryReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== CLOUD_DRIVE_CLEANUP_WORKFLOW) {
    errors.push(
      `CloudDriveConnectedAppInventoryReceipt.workflow must be ${CLOUD_DRIVE_CLEANUP_WORKFLOW}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.id is required.');
  }
  if (!isSupportedCloudDriveProvider(String(receipt.provider))) {
    errors.push(
      `CloudDriveConnectedAppInventoryReceipt.provider is unsupported: ${String(receipt.provider)}.`
    );
  }
  if (!isNonEmptyString(receipt.redactedAccountLabel)) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.redactedAccountLabel is required.');
  }
  if (!isNonEmptyString(receipt.accountLabelHash)) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.accountLabelHash is required.');
  }
  if (!isNonEmptyString(receipt.browserProfile)) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.browserProfile is required.');
  }
  validateTimestamp(
    'CloudDriveConnectedAppInventoryReceipt.observedAt',
    receipt.observedAt,
    errors
  );
  if (!Array.isArray(receipt.connectedApps)) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.connectedApps must be an array.');
  } else {
    for (const [index, app] of receipt.connectedApps.entries()) {
      errors.push(
        ...validateCloudDriveConnectedAppRecord(
          app,
          `CloudDriveConnectedAppInventoryReceipt.connectedApps[${index}]`
        )
      );
    }
  }
  if (!isNonNegativeInteger(receipt.staleGrantCount)) {
    errors.push(
      'CloudDriveConnectedAppInventoryReceipt.staleGrantCount must be a non-negative integer.'
    );
  }
  if (!isNonNegativeInteger(receipt.overbroadGrantCount)) {
    errors.push(
      'CloudDriveConnectedAppInventoryReceipt.overbroadGrantCount must be a non-negative integer.'
    );
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.cookieExported !== false) {
    errors.push('CloudDriveConnectedAppInventoryReceipt.cookieExported must be false.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push(
      'CloudDriveConnectedAppInventoryReceipt.publicReceiptMayContainAbsolutePath must be false.'
    );
  }
  validateHash(
    'CloudDriveConnectedAppInventoryReceipt',
    receipt.hash,
    receipt.hashAlgorithm,
    errors
  );
  return errors;
}

export function validateCloudDriveCleanupReplayReceipt(
  receipt: CloudDriveCleanupReplayReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['CloudDriveCleanupReplayReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `CloudDriveCleanupReplayReceipt.schemaVersion must be ${HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== CLOUD_DRIVE_CLEANUP_WORKFLOW) {
    errors.push(`CloudDriveCleanupReplayReceipt.workflow must be ${CLOUD_DRIVE_CLEANUP_WORKFLOW}.`);
  }
  if (!isSupportedCloudDriveCleanupStatus(String(receipt.status))) {
    errors.push(`CloudDriveCleanupReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('CloudDriveCleanupReplayReceipt.id is required.');
  if (!isNonEmptyString(receipt.inventoryReceiptId)) {
    errors.push('CloudDriveCleanupReplayReceipt.inventoryReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.permissionPackId)) {
    errors.push('CloudDriveCleanupReplayReceipt.permissionPackId is required.');
  }
  if (!Array.isArray(receipt.revocationReceiptIds)) {
    errors.push('CloudDriveCleanupReplayReceipt.revocationReceiptIds must be an array.');
  }
  if (!isNonEmptyString(receipt.replayKey)) {
    errors.push('CloudDriveCleanupReplayReceipt.replayKey is required.');
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('CloudDriveCleanupReplayReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.sourceCloudDataMutated !== false) {
    errors.push('CloudDriveCleanupReplayReceipt.sourceCloudDataMutated must be false.');
  }
  if (receipt.previewOnlyImport !== true) {
    errors.push('CloudDriveCleanupReplayReceipt.previewOnlyImport must be true.');
  }
  if (receipt.readyForHoloLandPreview && receipt.status !== 'preview_ready') {
    errors.push(
      'CloudDriveCleanupReplayReceipt.readyForHoloLandPreview requires preview_ready status.'
    );
  }
  if (receipt.readyForHoloLandPreview && !isNonEmptyString(receipt.accountExportPackId)) {
    errors.push(
      'CloudDriveCleanupReplayReceipt.readyForHoloLandPreview requires accountExportPackId.'
    );
  }
  validateTimestamp('CloudDriveCleanupReplayReceipt.createdAt', receipt.createdAt, errors);
  validateHash('CloudDriveCleanupReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellCloudDriveCleanupReceiptPack(
  pack: HoloShellCloudDriveCleanupReceiptPack | undefined
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellCloudDriveCleanupReceiptPack is required.'];
  if (pack.schemaVersion !== HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION) {
    errors.push(
      `HoloShellCloudDriveCleanupReceiptPack.schemaVersion must be ${HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION}.`
    );
  }
  if (pack.workflow !== CLOUD_DRIVE_CLEANUP_WORKFLOW) {
    errors.push(
      `HoloShellCloudDriveCleanupReceiptPack.workflow must be ${CLOUD_DRIVE_CLEANUP_WORKFLOW}.`
    );
  }
  if (!isSupportedCloudDriveCleanupStatus(String(pack.status))) {
    errors.push(
      `HoloShellCloudDriveCleanupReceiptPack.status is unsupported: ${String(pack.status)}.`
    );
  }
  validateHash('HoloShellCloudDriveCleanupReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  errors.push(...validateCloudDriveConnectedAppInventoryReceipt(pack.inventory));
  errors.push(...validateHoloShellPermissionGateReceiptPack(pack.permissionGate));
  for (const [index, revocation] of (pack.revocations ?? []).entries()) {
    errors.push(
      ...validatePermissionRevocationReceipt(revocation).map(
        (error) => `revocations[${index}]: ${error}`
      )
    );
  }
  if (pack.accountExport) {
    errors.push(...validateHoloShellAccountExportReceiptPack(pack.accountExport));
  }
  errors.push(...validateCloudDriveCleanupReplayReceipt(pack.replay));

  if (pack.status !== pack.replay.status) {
    errors.push('HoloShellCloudDriveCleanupReceiptPack.status must match replay.status.');
  }
  if (pack.replay.inventoryReceiptId !== pack.inventory.id) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.replay.inventoryReceiptId must match inventory.id.'
    );
  }
  if (pack.replay.permissionPackId !== pack.permissionGate.id) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.replay.permissionPackId must match permissionGate.id.'
    );
  }
  if (pack.accountExport && pack.replay.accountExportPackId !== pack.accountExport.id) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.replay.accountExportPackId must match accountExport.id.'
    );
  }
  if (pack.status === 'preview_ready' && !pack.accountExport) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.accountExport is required for preview_ready.'
    );
  }
  if (pack.status === 'preview_ready' && pack.accountExport?.status !== 'verified') {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.preview_ready requires a verified accountExport pack.'
    );
  }
  if (pack.status === 'preview_ready' && pack.replay.readyForHoloLandPreview !== true) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.preview_ready requires replay.readyForHoloLandPreview.'
    );
  }
  if (
    pack.inventory.overbroadGrantCount > 0 &&
    ['revoking', 'revoked_verified', 'archived', 'preview_ready'].includes(String(pack.status)) &&
    pack.revocations.length === 0
  ) {
    errors.push(
      'HoloShellCloudDriveCleanupReceiptPack.revocations are required when overbroad grants are inventoried.'
    );
  }
  return errors;
}

function cloneScopeRecord(scope: CloudDriveScopeRecord): CloudDriveScopeRecord {
  return { ...scope };
}

function cloneConnectedAppRecord(app: CloudDriveConnectedAppRecord): CloudDriveConnectedAppRecord {
  return {
    ...app,
    scopes: app.scopes.map(cloneScopeRecord),
  };
}

export function cloneCloudDriveConnectedAppInventoryReceipt(
  receipt: CloudDriveConnectedAppInventoryReceipt
): CloudDriveConnectedAppInventoryReceipt {
  return {
    ...receipt,
    connectedApps: receipt.connectedApps.map(cloneConnectedAppRecord),
  };
}

export function cloneHoloShellCloudDriveCleanupReceiptPack(
  pack: HoloShellCloudDriveCleanupReceiptPack
): HoloShellCloudDriveCleanupReceiptPack {
  return {
    ...pack,
    inventory: cloneCloudDriveConnectedAppInventoryReceipt(pack.inventory),
    permissionGate: cloneHoloShellPermissionGateReceiptPack(pack.permissionGate),
    revocations: pack.revocations.map((revocation) => ({ ...revocation })),
    ...(pack.accountExport
      ? { accountExport: cloneHoloShellAccountExportReceiptPack(pack.accountExport) }
      : {}),
    replay: {
      ...pack.replay,
      revocationReceiptIds: [...pack.replay.revocationReceiptIds],
    },
  };
}
