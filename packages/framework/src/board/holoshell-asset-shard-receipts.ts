/**
 * HoloShell Asset Shard Receipts
 *
 * Reusable substrate contract for turning local asset folders into HoloLand
 * shard previews without leaking absolute paths or mutating source assets.
 */

export const ASSET_SHARD_KINDS = [
  'model',
  'image',
  'audio',
  'media',
  'source',
  'manifest',
  'unknown',
] as const;
export type AssetShardKind = (typeof ASSET_SHARD_KINDS)[number];

export const ASSET_SHARD_STATUSES = ['staged', 'blocked', 'empty', 'completed', 'failed'] as const;
export type AssetShardStatus = (typeof ASSET_SHARD_STATUSES)[number];

export const ASSET_SHARD_PERMISSION_ENVELOPES = [
  'read_only',
  'write_tmp',
  'guarded_execute',
  'break_glass',
] as const;
export type AssetShardPermissionEnvelope = (typeof ASSET_SHARD_PERMISSION_ENVELOPES)[number];

export interface AssetShardFileProxy {
  id: string;
  name: string;
  relativePath: string;
  kind: AssetShardKind;
  sizeBytes: number;
  hashSha256?: string;
  hashStatus: string;
  blocked: boolean;
  blockReason?: string;
}

export interface AssetShardWorkflowReceipt {
  schemaVersion: string;
  workflowId: string;
  generatedAt: string;
  source: {
    assetFolderName: string;
    assetFolderFingerprint: string;
    pathPolicy: 'absolute_path_kept_in_private_receipt_only';
    privacyClass: 'local_private';
  };
  summary: {
    status: AssetShardStatus;
    assetCount: number;
    previewObjectCount: number;
    blockedAssetCount: number;
    approvalRequired: boolean;
    mutationExecuted: false;
  };
  validation: {
    secretLikeAssetGate: 'pass' | 'blocked';
    previewSourceValidation: 'pass' | 'blocked' | 'fail';
    browserPathRedaction: 'pass' | 'fail';
    sourceMutation: 'none';
    previewSourceHash?: string;
  };
  shardPlan: {
    shardId: string;
    worldName: string;
    importMode: 'guarded_execute_after_preview';
    assets: AssetShardFileProxy[];
  };
  approvals: Array<{
    id: string;
    operation: string;
    permissionEnvelope: AssetShardPermissionEnvelope;
    status: string;
    executionAllowed: boolean;
  }>;
  rollback: {
    sourceAssetsMutated: false;
    generatedTmpPaths: string[];
  };
  output: {
    previewSourcePath: string;
    privateReceiptPath: string;
    latestPath?: string;
  };
}

export interface AssetShardImportApprovalReceipt {
  schemaVersion: string;
  approvalId: string;
  nonce: string;
  status: string;
  sourceAnchors: {
    workflowReceipt: string;
    previewSource: string;
    privateReceipt: string;
  };
  approval: {
    approvalRequired: boolean;
    requiresFreshUserGesture: boolean;
    expiresAt: string;
  };
  execution: {
    allowed: boolean;
    commandPreview: string;
    blockedReason?: string;
  };
  witness: {
    workflowHash: string;
    secretsCaptured: false;
    sourceAssetsMutated: false;
  };
  summary: {
    status: string;
    shardId: string;
    executionAllowed: boolean;
    sourceAssetsMutated: false;
    runtimeMutationExecuted: false;
  };
}

export interface AssetShardImportReceipt {
  schemaVersion: string;
  importId: string;
  approval: {
    approvalId: string;
    nonceBound: true;
    workflowHash: string;
  };
  summary: {
    status: 'completed' | 'failed' | 'not_run';
    shardId: string;
    assetCount: number;
    runtimeMutationExecuted: boolean;
    sourceAssetsMutated: false;
  };
  output: {
    manifestPath: string;
    shardSourcePath: string;
    receiptPath: string;
  };
  rollback: {
    sourceAssetsMutated: false;
    generatedTmpPaths: string[];
  };
}

export interface PlayableShardWitnessReceipt {
  schemaVersion: string;
  generatedAt: string;
  status: 'pass' | 'fail';
  shardWitness?: {
    enabled: boolean;
    workflowReceipt: string;
    previewSource: string;
    shardId: string;
    previewHash: string;
    assetCount: number;
    sourceAssetsMutated: false;
  };
  screenshot?: {
    path: string;
    sizeBytes: number;
    sha256: string | null;
  } | null;
  domWitness?: {
    path: string;
    sha256: string;
    missingText: string[];
  } | null;
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

function pushPathErrors(label: string, value: string | undefined, errors: string[]): void {
  if (!value) {
    errors.push(`${label} is required.`);
  } else if (hasAbsolutePath(value)) {
    errors.push(`${label} must be repo-relative/redacted, not an absolute path.`);
  }
}

export function isSupportedAssetShardKind(kind: string): kind is AssetShardKind {
  return isOneOf(ASSET_SHARD_KINDS, kind);
}

export function isSupportedAssetShardStatus(status: string): status is AssetShardStatus {
  return isOneOf(ASSET_SHARD_STATUSES, status);
}

export function validateAssetShardWorkflowReceipt(receipt: AssetShardWorkflowReceipt): string[] {
  const errors: string[] = [];

  if (!receipt.workflowId) errors.push('AssetShardWorkflowReceipt.workflowId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('AssetShardWorkflowReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.source?.assetFolderName) {
    errors.push('AssetShardWorkflowReceipt.source.assetFolderName is required.');
  }
  if (!receipt.source?.assetFolderFingerprint) {
    errors.push('AssetShardWorkflowReceipt.source.assetFolderFingerprint is required.');
  }
  if (receipt.source?.pathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push('AssetShardWorkflowReceipt.source.pathPolicy must keep absolute paths private.');
  }
  if (receipt.source?.privacyClass !== 'local_private') {
    errors.push('AssetShardWorkflowReceipt.source.privacyClass must be local_private.');
  }

  if (!isSupportedAssetShardStatus(String(receipt.summary?.status))) {
    errors.push(`AssetShardWorkflowReceipt.summary.status is unsupported: ${String(receipt.summary?.status)}.`);
  }
  for (const [field, value] of [
    ['assetCount', receipt.summary?.assetCount],
    ['previewObjectCount', receipt.summary?.previewObjectCount],
    ['blockedAssetCount', receipt.summary?.blockedAssetCount],
  ] as const) {
    if (!isNonNegativeInteger(Number(value))) {
      errors.push(`AssetShardWorkflowReceipt.summary.${field} must be a non-negative integer.`);
    }
  }
  if (receipt.summary?.approvalRequired !== true) {
    errors.push('AssetShardWorkflowReceipt.summary.approvalRequired must be true.');
  }
  if (receipt.summary?.mutationExecuted !== false) {
    errors.push('AssetShardWorkflowReceipt.summary.mutationExecuted must be false.');
  }
  if (receipt.validation?.browserPathRedaction !== 'pass') {
    errors.push('AssetShardWorkflowReceipt.validation.browserPathRedaction must pass.');
  }
  if (receipt.validation?.sourceMutation !== 'none') {
    errors.push('AssetShardWorkflowReceipt.validation.sourceMutation must be none.');
  }
  if (!receipt.validation?.previewSourceHash) {
    errors.push('AssetShardWorkflowReceipt.validation.previewSourceHash is required.');
  }
  if (receipt.rollback?.sourceAssetsMutated !== false) {
    errors.push('AssetShardWorkflowReceipt.rollback.sourceAssetsMutated must be false.');
  }

  pushPathErrors('AssetShardWorkflowReceipt.output.previewSourcePath', receipt.output?.previewSourcePath, errors);
  pushPathErrors('AssetShardWorkflowReceipt.output.privateReceiptPath', receipt.output?.privateReceiptPath, errors);

  if (!receipt.shardPlan?.shardId) errors.push('AssetShardWorkflowReceipt.shardPlan.shardId is required.');
  if (receipt.shardPlan?.importMode !== 'guarded_execute_after_preview') {
    errors.push('AssetShardWorkflowReceipt.shardPlan.importMode must be guarded_execute_after_preview.');
  }
  for (const asset of receipt.shardPlan?.assets ?? []) {
    validateAssetProxy(asset, errors);
  }
  if ((receipt.shardPlan?.assets?.length ?? 0) !== receipt.summary?.assetCount) {
    errors.push('AssetShardWorkflowReceipt.shardPlan.assets length must match summary.assetCount.');
  }
  if (!receipt.approvals?.some((approval) => approval.permissionEnvelope === 'guarded_execute')) {
    errors.push('AssetShardWorkflowReceipt requires a guarded_execute approval.');
  }
  if (receipt.approvals?.some((approval) => approval.executionAllowed)) {
    errors.push('AssetShardWorkflowReceipt approvals must not be executable before human approval.');
  }

  return errors;
}

function validateAssetProxy(asset: AssetShardFileProxy, errors: string[]): void {
  if (!asset.id) errors.push('AssetShardFileProxy.id is required.');
  if (!asset.name) errors.push('AssetShardFileProxy.name is required.');
  pushPathErrors(`AssetShardFileProxy(${asset.id || 'unknown'}).relativePath`, asset.relativePath, errors);
  if (!isSupportedAssetShardKind(String(asset.kind))) {
    errors.push(`AssetShardFileProxy.kind is unsupported: ${String(asset.kind)}.`);
  }
  if (!isNonNegativeInteger(asset.sizeBytes)) {
    errors.push(`AssetShardFileProxy(${asset.id || 'unknown'}).sizeBytes must be a non-negative integer.`);
  }
  if (asset.blocked && !asset.blockReason) {
    errors.push(`AssetShardFileProxy(${asset.id || 'unknown'}).blockReason is required when blocked.`);
  }
  if (!asset.blocked && !asset.hashSha256) {
    errors.push(`AssetShardFileProxy(${asset.id || 'unknown'}).hashSha256 is required for non-blocked assets.`);
  }
}

export function validateAssetShardImportApprovalReceipt(
  receipt: AssetShardImportApprovalReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.approvalId) errors.push('AssetShardImportApprovalReceipt.approvalId is required.');
  if (!receipt.nonce) errors.push('AssetShardImportApprovalReceipt.nonce is required.');
  if (!isIsoTimestamp(receipt.approval?.expiresAt)) {
    errors.push('AssetShardImportApprovalReceipt.approval.expiresAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.approval?.requiresFreshUserGesture !== true) {
    errors.push('AssetShardImportApprovalReceipt.approval.requiresFreshUserGesture must be true.');
  }
  if (receipt.execution?.allowed !== true) {
    errors.push('AssetShardImportApprovalReceipt.execution.allowed must be true only after approval bundle creation.');
  }
  if (!receipt.execution?.commandPreview) {
    errors.push('AssetShardImportApprovalReceipt.execution.commandPreview is required.');
  } else if (hasAbsolutePath(receipt.execution.commandPreview)) {
    errors.push('AssetShardImportApprovalReceipt.execution.commandPreview must not expose absolute local paths.');
  }
  if (!receipt.witness?.workflowHash) {
    errors.push('AssetShardImportApprovalReceipt.witness.workflowHash is required.');
  }
  if (receipt.witness?.secretsCaptured !== false) {
    errors.push('AssetShardImportApprovalReceipt.witness.secretsCaptured must be false.');
  }
  if (receipt.summary?.sourceAssetsMutated !== false) {
    errors.push('AssetShardImportApprovalReceipt.summary.sourceAssetsMutated must be false.');
  }
  if (receipt.summary?.runtimeMutationExecuted !== false) {
    errors.push('AssetShardImportApprovalReceipt.summary.runtimeMutationExecuted must be false.');
  }
  return errors;
}

export function validateAssetShardImportReceipt(receipt: AssetShardImportReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.importId && receipt.summary?.status !== 'not_run') {
    errors.push('AssetShardImportReceipt.importId is required for executed imports.');
  }
  if (receipt.approval?.nonceBound !== true && receipt.summary?.status !== 'not_run') {
    errors.push('AssetShardImportReceipt.approval.nonceBound must be true for executed imports.');
  }
  if (receipt.summary?.sourceAssetsMutated !== false) {
    errors.push('AssetShardImportReceipt.summary.sourceAssetsMutated must be false.');
  }
  if (receipt.rollback?.sourceAssetsMutated !== false) {
    errors.push('AssetShardImportReceipt.rollback.sourceAssetsMutated must be false.');
  }
  if (receipt.summary?.status === 'completed') {
    if (receipt.summary.runtimeMutationExecuted !== true) {
      errors.push('AssetShardImportReceipt.summary.runtimeMutationExecuted must be true for completed imports.');
    }
    pushPathErrors('AssetShardImportReceipt.output.manifestPath', receipt.output?.manifestPath, errors);
    pushPathErrors('AssetShardImportReceipt.output.shardSourcePath', receipt.output?.shardSourcePath, errors);
    pushPathErrors('AssetShardImportReceipt.output.receiptPath', receipt.output?.receiptPath, errors);
  }
  return errors;
}

export function validatePlayableShardWitnessReceipt(
  receipt: PlayableShardWitnessReceipt
): string[] {
  const errors: string[] = [];
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('PlayableShardWitnessReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.status !== 'pass') {
    errors.push('PlayableShardWitnessReceipt.status must be pass before publishing/import completion can be trusted.');
  }
  if (!receipt.shardWitness?.enabled) {
    errors.push('PlayableShardWitnessReceipt.shardWitness.enabled must be true.');
  }
  if (!receipt.shardWitness?.previewHash) {
    errors.push('PlayableShardWitnessReceipt.shardWitness.previewHash is required.');
  }
  if (receipt.shardWitness?.sourceAssetsMutated !== false) {
    errors.push('PlayableShardWitnessReceipt.shardWitness.sourceAssetsMutated must be false.');
  }
  if (!receipt.screenshot?.sha256) {
    errors.push('PlayableShardWitnessReceipt.screenshot.sha256 is required.');
  }
  if (!receipt.domWitness?.sha256) {
    errors.push('PlayableShardWitnessReceipt.domWitness.sha256 is required.');
  }
  if ((receipt.domWitness?.missingText?.length ?? 0) > 0) {
    errors.push('PlayableShardWitnessReceipt.domWitness.missingText must be empty.');
  }
  return errors;
}

export function validateAssetShardReceiptBundle(bundle: {
  workflow?: AssetShardWorkflowReceipt;
  approval?: AssetShardImportApprovalReceipt;
  importReceipt?: AssetShardImportReceipt;
  witness?: PlayableShardWitnessReceipt;
}): string[] {
  const errors = [
    ...(bundle.workflow ? validateAssetShardWorkflowReceipt(bundle.workflow) : ['AssetShardReceiptBundle.workflow is required.']),
    ...(bundle.approval ? validateAssetShardImportApprovalReceipt(bundle.approval) : []),
    ...(bundle.importReceipt ? validateAssetShardImportReceipt(bundle.importReceipt) : []),
    ...(bundle.importReceipt?.summary?.status === 'completed' && !bundle.witness
      ? ['AssetShardReceiptBundle.witness is required when importReceipt is completed.']
      : []),
    ...(bundle.witness ? validatePlayableShardWitnessReceipt(bundle.witness) : []),
  ];
  return errors;
}

export function cloneAssetShardWorkflowReceipt(
  receipt: AssetShardWorkflowReceipt
): AssetShardWorkflowReceipt {
  return JSON.parse(JSON.stringify(receipt)) as AssetShardWorkflowReceipt;
}
