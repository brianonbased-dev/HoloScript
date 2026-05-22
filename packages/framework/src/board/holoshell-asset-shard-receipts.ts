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

export const ASSET_SHARD_IMPORT_COMMAND_PREVIEW_ARTIFACT_FLAGS = {
  '--approval-bundle': 'approval-bundle',
  '--import-dir': 'import-dir',
  '--import-output': 'import-receipt',
  '--import-js-output': 'import-bootstrap',
} as const;
export type AssetShardImportCommandPreviewArtifactFlag =
  keyof typeof ASSET_SHARD_IMPORT_COMMAND_PREVIEW_ARTIFACT_FLAGS;

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
    /(^|[\s"'`=])(?:file:\/\/\/(?:[A-Za-z]:[\\/]|(?!\/)[^\s"'`]+)|[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/i.test(value)
  );
}

function commandPreviewArtifactAlias(flag: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(ASSET_SHARD_IMPORT_COMMAND_PREVIEW_ARTIFACT_FLAGS, flag)) {
    return ASSET_SHARD_IMPORT_COMMAND_PREVIEW_ARTIFACT_FLAGS[
      flag as AssetShardImportCommandPreviewArtifactFlag
    ];
  }
  return undefined;
}

function shellPreviewToken(value: string): string {
  if (/^[A-Za-z0-9_./:=@\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function redactAssetShardImportCommandPreviewToken(
  command: readonly string[],
  index: number
): string {
  const previous = command[index - 1];
  const alias = previous ? commandPreviewArtifactAlias(previous) : undefined;
  if (alias) return `<artifact:${alias}>`;
  if (hasAbsolutePath(command[index])) return '<absolute-path-redacted>';
  return command[index];
}

export function redactAssetShardImportCommandPreview(command: readonly string[]): string {
  return command
    .map((token, index) => shellPreviewToken(redactAssetShardImportCommandPreviewToken(command, index)))
    .join(' ');
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

export function isSupportedAssetIntakeKind(kind: string): kind is AssetIntakeKind {
  return isOneOf(ASSET_INTAKE_KINDS, kind);
}

export function isSupportedAssetIntakeStatus(status: string): status is AssetIntakeStatus {
  return isOneOf(ASSET_INTAKE_STATUSES, status);
}

export function isSupportedAssetConversionKind(kind: string): kind is AssetConversionKind {
  return isOneOf(ASSET_CONVERSION_KINDS, kind);
}

export function isSupportedAssetConversionStatus(status: string): status is AssetConversionStatus {
  return isOneOf(ASSET_CONVERSION_STATUSES, status);
}

export function isSupportedPreviewSourceStatus(status: string): status is PreviewSourceStatus {
  return isOneOf(PREVIEW_SOURCE_STATUSES, status);
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
  // Blocked-file gate: secretLikeAssetGate must be 'pass' or 'blocked' (never absent/invalid)
  if (receipt.validation?.secretLikeAssetGate !== 'pass' && receipt.validation?.secretLikeAssetGate !== 'blocked') {
    errors.push('AssetShardWorkflowReceipt.validation.secretLikeAssetGate must be pass or blocked.');
  }
  // Preview source validation gate: must be 'pass', 'blocked', or 'fail'
  if (!isOneOf(['pass', 'blocked', 'fail'] as const, String(receipt.validation?.previewSourceValidation))) {
    errors.push(`AssetShardWorkflowReceipt.validation.previewSourceValidation is unsupported: ${String(receipt.validation?.previewSourceValidation)}.`);
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

// ---------------------------------------------------------------------------
// AssetIntakeReceipt — records initial scan/intake of an asset folder
// ---------------------------------------------------------------------------

export const ASSET_INTAKE_STATUSES = ['scanned', 'blocked', 'empty', 'failed'] as const;
export type AssetIntakeStatus = (typeof ASSET_INTAKE_STATUSES)[number];

export const ASSET_INTAKE_KINDS = [
  'folder_scan',
  'single_file',
  'archive_extract',
  'drag_drop',
  'cli_import',
] as const;
export type AssetIntakeKind = (typeof ASSET_INTAKE_KINDS)[number];

export interface AssetIntakeReceipt {
  schemaVersion: string;
  intakeId: string;
  generatedAt: string;
  intakeKind: AssetIntakeKind;
  source: {
    assetFolderName: string;
    assetFolderFingerprint: string;
    pathPolicy: 'absolute_path_kept_in_private_receipt_only';
    privacyClass: 'local_private';
  };
  summary: {
    status: AssetIntakeStatus;
    fileCount: number;
    totalSizeBytes: number;
    blockedFileCount: number;
    blockedFileGate: 'pass' | 'blocked';
    requiresApproval: boolean;
  };
  files: Array<{
    id: string;
    name: string;
    relativePath: string;
    kind: AssetShardKind;
    sizeBytes: number;
    hashSha256: string;
    blocked: boolean;
    blockReason?: string;
  }>;
  intakeNonce: string;
  rollback: {
    sourceAssetsMutated: false;
  };
}

// ---------------------------------------------------------------------------
// AssetConversionReceipt — records asset conversion/transform step
// ---------------------------------------------------------------------------

export const ASSET_CONVERSION_KINDS = [
  'model_to_holo',
  'image_optimization',
  'audio_transcode',
  'manifest_generation',
  'material_compression',
  'scene_composition',
] as const;
export type AssetConversionKind = (typeof ASSET_CONVERSION_KINDS)[number];

export const ASSET_CONVERSION_STATUSES = ['completed', 'failed', 'skipped'] as const;
export type AssetConversionStatus = (typeof ASSET_CONVERSION_STATUSES)[number];

export interface AssetConversionReceipt {
  schemaVersion: string;
  conversionId: string;
  generatedAt: string;
  conversionKind: AssetConversionKind;
  source: {
    sourceFileId: string;
    sourceFileName: string;
    sourceFileHash: string;
    pathPolicy: 'absolute_path_kept_in_private_receipt_only';
  };
  output: {
    outputFileName: string;
    outputFileHash: string;
    outputPath: string;
  };
  summary: {
    status: AssetConversionStatus;
    sourceMutated: false;
    conversionDurationMs: number;
  };
  rollback: {
    sourceAssetsMutated: false;
    generatedTmpPaths: string[];
  };
}

// ---------------------------------------------------------------------------
// PreviewShardSourceReceipt — records preview source generation
// ---------------------------------------------------------------------------

export const PREVIEW_SOURCE_STATUSES = ['generated', 'failed', 'skipped'] as const;
export type PreviewSourceStatus = (typeof PREVIEW_SOURCE_STATUSES)[number];

export interface PreviewShardSourceReceipt {
  schemaVersion: string;
  previewId: string;
  generatedAt: string;
  source: {
    workflowId: string;
    sourceFingerprint: string;
    pathPolicy: 'absolute_path_kept_in_private_receipt_only';
  };
  summary: {
    status: PreviewSourceStatus;
    assetCount: number;
    previewSourceHash: string;
    sourceAssetsMutated: false;
  };
  output: {
    previewSourcePath: string;
    privateReceiptPath: string;
  };
  rollback: {
    sourceAssetsMutated: false;
    generatedTmpPaths: string[];
  };
}

// ---------------------------------------------------------------------------
// Rollback/Replay contract validation
// ---------------------------------------------------------------------------

export interface AssetShardRollbackContract {
  workflowId: string;
  rollbackPoints: Array<{
    step: string;
    sourceAssetsMutated: false;
    tmpPaths: string[];
    replayKey: string;
  }>;
  replayDeterministic: boolean;
  sourceIntegrityPreserved: true;
}

// ---------------------------------------------------------------------------
// Validators for new receipt types
// ---------------------------------------------------------------------------

export function validateAssetIntakeReceipt(receipt: AssetIntakeReceipt): string[] {
  const errors: string[] = [];

  if (!receipt.intakeId) errors.push('AssetIntakeReceipt.intakeId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('AssetIntakeReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isOneOf(ASSET_INTAKE_KINDS, String(receipt.intakeKind))) {
    errors.push(`AssetIntakeReceipt.intakeKind is unsupported: ${String(receipt.intakeKind)}.`);
  }
  if (!receipt.source?.assetFolderName) {
    errors.push('AssetIntakeReceipt.source.assetFolderName is required.');
  }
  if (!receipt.source?.assetFolderFingerprint) {
    errors.push('AssetIntakeReceipt.source.assetFolderFingerprint is required.');
  }
  if (receipt.source?.pathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push('AssetIntakeReceipt.source.pathPolicy must keep absolute paths private.');
  }
  if (receipt.source?.privacyClass !== 'local_private') {
    errors.push('AssetIntakeReceipt.source.privacyClass must be local_private.');
  }

  if (!isOneOf(ASSET_INTAKE_STATUSES, String(receipt.summary?.status))) {
    errors.push(`AssetIntakeReceipt.summary.status is unsupported: ${String(receipt.summary?.status)}.`);
  }
  for (const [field, value] of [
    ['fileCount', receipt.summary?.fileCount],
    ['totalSizeBytes', receipt.summary?.totalSizeBytes],
    ['blockedFileCount', receipt.summary?.blockedFileCount],
  ] as const) {
    if (!isNonNegativeInteger(Number(value))) {
      errors.push(`AssetIntakeReceipt.summary.${field} must be a non-negative integer.`);
    }
  }
  if (receipt.summary?.blockedFileGate !== 'pass' && receipt.summary?.blockedFileGate !== 'blocked') {
    errors.push('AssetIntakeReceipt.summary.blockedFileGate must be pass or blocked.');
  }
  if (receipt.summary?.requiresApproval !== true) {
    errors.push('AssetIntakeReceipt.summary.requiresApproval must be true.');
  }

  // Validate file entries — reject absolute paths, enforce blocked-file gate
  if (!receipt.files || receipt.files.length === 0) {
    errors.push('AssetIntakeReceipt.files must contain at least one file entry.');
  }
  for (const file of receipt.files ?? []) {
    if (!file.id) errors.push('AssetIntakeReceipt file entry id is required.');
    if (!file.name) errors.push('AssetIntakeReceipt file entry name is required.');
    if (hasAbsolutePath(file.relativePath)) {
      errors.push(`AssetIntakeReceipt file(${file.id || 'unknown'}).relativePath must be repo-relative/redacted, not an absolute path.`);
    }
    if (!isOneOf(ASSET_SHARD_KINDS, String(file.kind))) {
      errors.push(`AssetIntakeReceipt file(${file.id || 'unknown'}).kind is unsupported: ${String(file.kind)}.`);
    }
    if (!isNonNegativeInteger(file.sizeBytes)) {
      errors.push(`AssetIntakeReceipt file(${file.id || 'unknown'}).sizeBytes must be a non-negative integer.`);
    }
    if (!file.hashSha256) {
      errors.push(`AssetIntakeReceipt file(${file.id || 'unknown'}).hashSha256 is required.`);
    }
    if (file.blocked && !file.blockReason) {
      errors.push(`AssetIntakeReceipt file(${file.id || 'unknown'}).blockReason is required when blocked.`);
    }
  }

  // Nonce/approval gate
  if (!receipt.intakeNonce) {
    errors.push('AssetIntakeReceipt.intakeNonce is required.');
  }

  if (receipt.rollback?.sourceAssetsMutated !== false) {
    errors.push('AssetIntakeReceipt.rollback.sourceAssetsMutated must be false.');
  }

  return errors;
}

export function validateAssetConversionReceipt(receipt: AssetConversionReceipt): string[] {
  const errors: string[] = [];

  if (!receipt.conversionId) errors.push('AssetConversionReceipt.conversionId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('AssetConversionReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isOneOf(ASSET_CONVERSION_KINDS, String(receipt.conversionKind))) {
    errors.push(`AssetConversionReceipt.conversionKind is unsupported: ${String(receipt.conversionKind)}.`);
  }
  if (!receipt.source?.sourceFileId) {
    errors.push('AssetConversionReceipt.source.sourceFileId is required.');
  }
  if (!receipt.source?.sourceFileName) {
    errors.push('AssetConversionReceipt.source.sourceFileName is required.');
  }
  if (!receipt.source?.sourceFileHash) {
    errors.push('AssetConversionReceipt.source.sourceFileHash is required.');
  }
  if (receipt.source?.pathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push('AssetConversionReceipt.source.pathPolicy must keep absolute paths private.');
  }

  if (receipt.summary?.sourceMutated !== false) {
    errors.push('AssetConversionReceipt.summary.sourceMutated must be false.');
  }
  if (!isOneOf(ASSET_CONVERSION_STATUSES, String(receipt.summary?.status))) {
    errors.push(`AssetConversionReceipt.summary.status is unsupported: ${String(receipt.summary?.status)}.`);
  }

  // Output validation — reject absolute paths, require hash for completed
  if (receipt.summary?.status === 'completed') {
    if (!receipt.output?.outputFileName) {
      errors.push('AssetConversionReceipt.output.outputFileName is required for completed conversions.');
    }
    if (!receipt.output?.outputFileHash) {
      errors.push('AssetConversionReceipt.output.outputFileHash is required for completed conversions.');
    }
    pushPathErrors('AssetConversionReceipt.output.outputPath', receipt.output?.outputPath, errors);
  }

  if (receipt.rollback?.sourceAssetsMutated !== false) {
    errors.push('AssetConversionReceipt.rollback.sourceAssetsMutated must be false.');
  }

  return errors;
}

export function validatePreviewShardSourceReceipt(receipt: PreviewShardSourceReceipt): string[] {
  const errors: string[] = [];

  if (!receipt.previewId) errors.push('PreviewShardSourceReceipt.previewId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('PreviewShardSourceReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.source?.workflowId) {
    errors.push('PreviewShardSourceReceipt.source.workflowId is required.');
  }
  if (!receipt.source?.sourceFingerprint) {
    errors.push('PreviewShardSourceReceipt.source.sourceFingerprint is required.');
  }
  if (receipt.source?.pathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push('PreviewShardSourceReceipt.source.pathPolicy must keep absolute paths private.');
  }

  if (!isOneOf(PREVIEW_SOURCE_STATUSES, String(receipt.summary?.status))) {
    errors.push(`PreviewShardSourceReceipt.summary.status is unsupported: ${String(receipt.summary?.status)}.`);
  }
  if (!isNonNegativeInteger(Number(receipt.summary?.assetCount))) {
    errors.push('PreviewShardSourceReceipt.summary.assetCount must be a non-negative integer.');
  }
  if (!receipt.summary?.previewSourceHash) {
    errors.push('PreviewShardSourceReceipt.summary.previewSourceHash is required.');
  }
  if (receipt.summary?.sourceAssetsMutated !== false) {
    errors.push('PreviewShardSourceReceipt.summary.sourceAssetsMutated must be false.');
  }

  // Path validation — reject absolute paths in output
  pushPathErrors('PreviewShardSourceReceipt.output.previewSourcePath', receipt.output?.previewSourcePath, errors);
  pushPathErrors('PreviewShardSourceReceipt.output.privateReceiptPath', receipt.output?.privateReceiptPath, errors);

  if (receipt.rollback?.sourceAssetsMutated !== false) {
    errors.push('PreviewShardSourceReceipt.rollback.sourceAssetsMutated must be false.');
  }

  return errors;
}

export function validateAssetShardRollbackContract(contract: AssetShardRollbackContract): string[] {
  const errors: string[] = [];

  if (!contract.workflowId) errors.push('AssetShardRollbackContract.workflowId is required.');

  if (!contract.rollbackPoints || contract.rollbackPoints.length === 0) {
    errors.push('AssetShardRollbackContract.rollbackPoints must contain at least one rollback point.');
  }

  for (const point of contract.rollbackPoints ?? []) {
    if (!point.step) errors.push('AssetShardRollbackContract rollback point step is required.');
    if (point.sourceAssetsMutated !== false) {
      errors.push(`AssetShardRollbackContract rollback point(${point.step || 'unknown'}).sourceAssetsMutated must be false.`);
    }
    if (!point.replayKey) {
      errors.push(`AssetShardRollbackContract rollback point(${point.step || 'unknown'}).replayKey is required.`);
    }
  }

  if (contract.replayDeterministic !== true) {
    errors.push('AssetShardRollbackContract.replayDeterministic must be true.');
  }
  if (contract.sourceIntegrityPreserved !== true) {
    errors.push('AssetShardRollbackContract.sourceIntegrityPreserved must be true.');
  }

  return errors;
}

export function validateAssetShardFullReceiptChain(chain: {
  intake?: AssetIntakeReceipt;
  conversion?: AssetConversionReceipt;
  preview?: PreviewShardSourceReceipt;
  workflow?: AssetShardWorkflowReceipt;
  approval?: AssetShardImportApprovalReceipt;
  importReceipt?: AssetShardImportReceipt;
  witness?: PlayableShardWitnessReceipt;
  rollback?: AssetShardRollbackContract;
}): string[] {
  const errors: string[] = [];

  if (!chain.intake) {
    errors.push('AssetShardFullReceiptChain.intake is required.');
  } else {
    errors.push(...validateAssetIntakeReceipt(chain.intake));
  }

  if (chain.conversion) {
    errors.push(...validateAssetConversionReceipt(chain.conversion));
  }

  if (!chain.preview) {
    errors.push('AssetShardFullReceiptChain.preview is required.');
  } else {
    errors.push(...validatePreviewShardSourceReceipt(chain.preview));
  }

  if (!chain.workflow) {
    errors.push('AssetShardFullReceiptChain.workflow is required.');
  } else {
    errors.push(...validateAssetShardWorkflowReceipt(chain.workflow));
  }

  if (chain.approval) {
    errors.push(...validateAssetShardImportApprovalReceipt(chain.approval));
  }

  if (chain.importReceipt) {
    errors.push(...validateAssetShardImportReceipt(chain.importReceipt));
  }

  // Witness required when import is completed
  if (chain.importReceipt?.summary?.status === 'completed' && !chain.witness) {
    errors.push('AssetShardFullReceiptChain.witness is required when importReceipt is completed.');
  }
  if (chain.witness) {
    errors.push(...validatePlayableShardWitnessReceipt(chain.witness));
  }

  if (chain.rollback) {
    errors.push(...validateAssetShardRollbackContract(chain.rollback));
  }

  // Cross-receipt consistency checks
  if (chain.intake && chain.workflow) {
    if (chain.intake.source.assetFolderFingerprint !== chain.workflow.source.assetFolderFingerprint) {
      errors.push('AssetShardFullReceiptChain: intake and workflow source fingerprints must match.');
    }
  }
  if (chain.preview && chain.workflow) {
    if (chain.preview.summary.previewSourceHash !== chain.workflow.validation.previewSourceHash) {
      errors.push('AssetShardFullReceiptChain: preview and workflow preview hashes must match.');
    }
  }

  return errors;
}

export function cloneAssetIntakeReceipt(receipt: AssetIntakeReceipt): AssetIntakeReceipt {
  return JSON.parse(JSON.stringify(receipt)) as AssetIntakeReceipt;
}

export function cloneAssetConversionReceipt(receipt: AssetConversionReceipt): AssetConversionReceipt {
  return JSON.parse(JSON.stringify(receipt)) as AssetConversionReceipt;
}

export function clonePreviewShardSourceReceipt(receipt: PreviewShardSourceReceipt): PreviewShardSourceReceipt {
  return JSON.parse(JSON.stringify(receipt)) as PreviewShardSourceReceipt;
}

export function cloneAssetShardRollbackContract(contract: AssetShardRollbackContract): AssetShardRollbackContract {
  return JSON.parse(JSON.stringify(contract)) as AssetShardRollbackContract;
}

export function cloneAssetShardWorkflowReceipt(
  receipt: AssetShardWorkflowReceipt
): AssetShardWorkflowReceipt {
  return JSON.parse(JSON.stringify(receipt)) as AssetShardWorkflowReceipt;
}
