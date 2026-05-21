/**
 * HoloShell Photo Backup Receipts
 *
 * Substrate contract for family photo backup custody. Public receipts keep
 * source paths and sensitive media metadata redacted while proving that
 * originals remain untouched until a separate restore proof passes.
 */

export const PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION = 'hololand.holoshell.photo-backup-custody.v0.1.0';
export const PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION = 'hololand.holoshell.photo-backup-verification.v0.1.0';

export const PHOTO_BACKUP_MEDIA_KINDS = ['photo', 'video', 'raw', 'sidecar', 'unknown'] as const;
export type PhotoBackupMediaKind = (typeof PHOTO_BACKUP_MEDIA_KINDS)[number];

export const PHOTO_BACKUP_STATUSES = ['planned', 'blocked', 'verified', 'failed'] as const;
export type PhotoBackupStatus = (typeof PHOTO_BACKUP_STATUSES)[number];

export const PHOTO_BACKUP_TARGET_KINDS = [
  'not_chosen',
  'external_drive',
  'encrypted_archive',
  'cloud_provider',
  'nas',
  'phone_import',
] as const;
export type PhotoBackupTargetKind = (typeof PHOTO_BACKUP_TARGET_KINDS)[number];

export const PHOTO_BACKUP_METADATA_POLICIES = [
  'not_chosen',
  'preserve_local_only',
  'strip_cloud_metadata',
  'client_side_encrypt',
  'provider_default',
] as const;
export type PhotoBackupMetadataPolicy = (typeof PHOTO_BACKUP_METADATA_POLICIES)[number];

export interface PhotoBackupFileProxy {
  id: string;
  name: string;
  relativePath: string;
  mediaKind: PhotoBackupMediaKind;
  sizeBytes: number;
  hashSha256?: string;
  hashStatus: string;
  duplicateGroupId?: string;
  unreadable: boolean;
  privacyMetadataClasses: string[];
}

export interface PhotoBackupCustodyReceipt {
  schemaVersion: typeof PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION;
  receiptId: string;
  generatedAt: string;
  source: {
    albumLabel: string;
    albumFingerprint: string;
    pathPolicy: 'absolute_path_kept_in_private_receipt_only';
    privacyClass: 'local_private';
  };
  summary: {
    status: PhotoBackupStatus;
    albumCount: number;
    photoCount: number;
    videoCount: number;
    duplicateGroupCount: number;
    unreadableCount: number;
    originalsDeleted: false;
    deleteBlocked: true;
    restoreVerified: boolean;
  };
  privacyEnvelope: {
    chosen: boolean;
    metadataPolicy: PhotoBackupMetadataPolicy;
    rawPixelsInPublicReceipt: false;
    gpsRedacted: boolean;
    faceLabelsRedacted: boolean;
  };
  targetPlan: {
    targetKind: PhotoBackupTargetKind;
    quotaChecked: boolean;
    deleteSemanticsVisible: boolean;
    providerAccountResolved: boolean;
  };
  files: PhotoBackupFileProxy[];
  replay: {
    replayInputs: string[];
    rollbackPlan: string;
  };
  output: {
    privateReceiptPath: string;
    latestPath?: string;
  };
}

export interface PhotoBackupVerificationReceipt {
  schemaVersion: typeof PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION;
  verificationId: string;
  generatedAt: string;
  sourceReceipt: string;
  copyManifestHash: string;
  sampleRestore: {
    performed: boolean;
    hashMatch: boolean;
    countMatch: boolean;
    privacyModeMatch: boolean;
  };
  summary: {
    status: 'verified' | 'blocked' | 'failed';
    copyExecuted: boolean;
    sampleRestorePassed: boolean;
    originalsDeleted: false;
  };
  rollback: {
    plan: string;
    originalsDeletionAllowed: false;
  };
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

function pushRelativePathError(label: string, value: string | undefined, errors: string[]): void {
  if (!value) {
    errors.push(`${label} is required.`);
  } else if (hasAbsolutePath(value)) {
    errors.push(`${label} must be repo-relative/redacted, not an absolute path.`);
  }
}

export function isSupportedPhotoBackupMediaKind(kind: string): kind is PhotoBackupMediaKind {
  return isOneOf(PHOTO_BACKUP_MEDIA_KINDS, kind);
}

export function isSupportedPhotoBackupStatus(status: string): status is PhotoBackupStatus {
  return isOneOf(PHOTO_BACKUP_STATUSES, status);
}

export function validatePhotoBackupCustodyReceipt(receipt: PhotoBackupCustodyReceipt): string[] {
  const errors: string[] = [];

  if (receipt.schemaVersion !== PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION) {
    errors.push('PhotoBackupCustodyReceipt.schemaVersion is unsupported.');
  }
  if (!receipt.receiptId) errors.push('PhotoBackupCustodyReceipt.receiptId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('PhotoBackupCustodyReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.source?.albumLabel) errors.push('PhotoBackupCustodyReceipt.source.albumLabel is required.');
  if (!receipt.source?.albumFingerprint) errors.push('PhotoBackupCustodyReceipt.source.albumFingerprint is required.');
  if (receipt.source?.pathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
    errors.push('PhotoBackupCustodyReceipt.source.pathPolicy must keep absolute paths private.');
  }
  if (receipt.source?.privacyClass !== 'local_private') {
    errors.push('PhotoBackupCustodyReceipt.source.privacyClass must be local_private.');
  }

  if (!isSupportedPhotoBackupStatus(String(receipt.summary?.status))) {
    errors.push(`PhotoBackupCustodyReceipt.summary.status is unsupported: ${String(receipt.summary?.status)}.`);
  }
  for (const [field, value] of [
    ['albumCount', receipt.summary?.albumCount],
    ['photoCount', receipt.summary?.photoCount],
    ['videoCount', receipt.summary?.videoCount],
    ['duplicateGroupCount', receipt.summary?.duplicateGroupCount],
    ['unreadableCount', receipt.summary?.unreadableCount],
  ] as const) {
    if (!isNonNegativeInteger(Number(value))) {
      errors.push(`PhotoBackupCustodyReceipt.summary.${field} must be a non-negative integer.`);
    }
  }
  if (receipt.summary?.originalsDeleted !== false) {
    errors.push('PhotoBackupCustodyReceipt.summary.originalsDeleted must be false.');
  }
  if (receipt.summary?.deleteBlocked !== true) {
    errors.push('PhotoBackupCustodyReceipt.summary.deleteBlocked must be true until restore proof passes.');
  }
  if (receipt.summary?.status === 'verified' && receipt.summary.restoreVerified !== true) {
    errors.push('PhotoBackupCustodyReceipt.summary.restoreVerified must be true when status is verified.');
  }

  if (receipt.privacyEnvelope?.rawPixelsInPublicReceipt !== false) {
    errors.push('PhotoBackupCustodyReceipt.privacyEnvelope.rawPixelsInPublicReceipt must be false.');
  }
  if (receipt.privacyEnvelope?.gpsRedacted !== true) {
    errors.push('PhotoBackupCustodyReceipt.privacyEnvelope.gpsRedacted must be true.');
  }
  if (receipt.privacyEnvelope?.faceLabelsRedacted !== true) {
    errors.push('PhotoBackupCustodyReceipt.privacyEnvelope.faceLabelsRedacted must be true.');
  }
  if (!isOneOf(PHOTO_BACKUP_METADATA_POLICIES, String(receipt.privacyEnvelope?.metadataPolicy))) {
    errors.push(`PhotoBackupCustodyReceipt.privacyEnvelope.metadataPolicy is unsupported: ${String(receipt.privacyEnvelope?.metadataPolicy)}.`);
  }

  if (!isOneOf(PHOTO_BACKUP_TARGET_KINDS, String(receipt.targetPlan?.targetKind))) {
    errors.push(`PhotoBackupCustodyReceipt.targetPlan.targetKind is unsupported: ${String(receipt.targetPlan?.targetKind)}.`);
  }
  if (receipt.targetPlan?.targetKind !== 'not_chosen') {
    if (receipt.targetPlan?.quotaChecked !== true) {
      errors.push('PhotoBackupCustodyReceipt.targetPlan.quotaChecked must be true when a target is chosen.');
    }
    if (receipt.targetPlan?.deleteSemanticsVisible !== true) {
      errors.push('PhotoBackupCustodyReceipt.targetPlan.deleteSemanticsVisible must be true when a target is chosen.');
    }
  }
  if (receipt.targetPlan?.targetKind === 'cloud_provider' && receipt.targetPlan.providerAccountResolved !== true) {
    errors.push('PhotoBackupCustodyReceipt.targetPlan.providerAccountResolved must be true for cloud providers.');
  }

  if (!receipt.files || receipt.files.length === 0) {
    errors.push('PhotoBackupCustodyReceipt.files must contain at least one media proxy.');
  }
  for (const file of receipt.files ?? []) {
    validatePhotoBackupFileProxy(file, errors);
  }
  const fileDuplicateGroups = new Set(
    (receipt.files ?? [])
      .map((file) => file.duplicateGroupId)
      .filter((duplicateGroupId): duplicateGroupId is string => Boolean(duplicateGroupId))
  );
  if (receipt.summary?.duplicateGroupCount !== fileDuplicateGroups.size) {
    errors.push('PhotoBackupCustodyReceipt.summary.duplicateGroupCount must match duplicate groups in files.');
  }
  if (receipt.summary?.unreadableCount !== (receipt.files ?? []).filter((file) => file.unreadable).length) {
    errors.push('PhotoBackupCustodyReceipt.summary.unreadableCount must match unreadable files.');
  }

  if (!receipt.replay?.replayInputs || receipt.replay.replayInputs.length === 0) {
    errors.push('PhotoBackupCustodyReceipt.replay.replayInputs must contain deterministic replay inputs.');
  }
  for (const input of receipt.replay?.replayInputs ?? []) {
    if (hasAbsolutePath(input)) {
      errors.push('PhotoBackupCustodyReceipt.replay.replayInputs must not expose absolute paths.');
      break;
    }
  }
  if (!receipt.replay?.rollbackPlan) {
    errors.push('PhotoBackupCustodyReceipt.replay.rollbackPlan is required.');
  }
  pushRelativePathError('PhotoBackupCustodyReceipt.output.privateReceiptPath', receipt.output?.privateReceiptPath, errors);
  if (receipt.output?.latestPath) {
    pushRelativePathError('PhotoBackupCustodyReceipt.output.latestPath', receipt.output.latestPath, errors);
  }

  return errors;
}

function validatePhotoBackupFileProxy(file: PhotoBackupFileProxy, errors: string[]): void {
  if (!file.id) errors.push('PhotoBackupFileProxy.id is required.');
  if (!file.name) errors.push('PhotoBackupFileProxy.name is required.');
  pushRelativePathError(`PhotoBackupFileProxy(${file.id || 'unknown'}).relativePath`, file.relativePath, errors);
  if (!isSupportedPhotoBackupMediaKind(String(file.mediaKind))) {
    errors.push(`PhotoBackupFileProxy.mediaKind is unsupported: ${String(file.mediaKind)}.`);
  }
  if (!isNonNegativeInteger(file.sizeBytes)) {
    errors.push(`PhotoBackupFileProxy(${file.id || 'unknown'}).sizeBytes must be a non-negative integer.`);
  }
  if (!file.unreadable && !file.hashSha256) {
    errors.push(`PhotoBackupFileProxy(${file.id || 'unknown'}).hashSha256 is required for readable media.`);
  }
  if (!file.hashStatus) errors.push(`PhotoBackupFileProxy(${file.id || 'unknown'}).hashStatus is required.`);
  if (!Array.isArray(file.privacyMetadataClasses)) {
    errors.push(`PhotoBackupFileProxy(${file.id || 'unknown'}).privacyMetadataClasses must be an array.`);
  }
}

export function validatePhotoBackupVerificationReceipt(receipt: PhotoBackupVerificationReceipt): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION) {
    errors.push('PhotoBackupVerificationReceipt.schemaVersion is unsupported.');
  }
  if (!receipt.verificationId) errors.push('PhotoBackupVerificationReceipt.verificationId is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('PhotoBackupVerificationReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  pushRelativePathError('PhotoBackupVerificationReceipt.sourceReceipt', receipt.sourceReceipt, errors);
  if (!receipt.copyManifestHash) errors.push('PhotoBackupVerificationReceipt.copyManifestHash is required.');
  if (receipt.summary?.originalsDeleted !== false) {
    errors.push('PhotoBackupVerificationReceipt.summary.originalsDeleted must be false.');
  }
  if (receipt.rollback?.originalsDeletionAllowed !== false) {
    errors.push('PhotoBackupVerificationReceipt.rollback.originalsDeletionAllowed must be false.');
  }
  if (!receipt.rollback?.plan) errors.push('PhotoBackupVerificationReceipt.rollback.plan is required.');

  if (receipt.summary?.status === 'verified') {
    if (receipt.summary.copyExecuted !== true) {
      errors.push('PhotoBackupVerificationReceipt.summary.copyExecuted must be true when verified.');
    }
    if (receipt.summary.sampleRestorePassed !== true) {
      errors.push('PhotoBackupVerificationReceipt.summary.sampleRestorePassed must be true when verified.');
    }
    if (
      receipt.sampleRestore?.performed !== true ||
      receipt.sampleRestore.hashMatch !== true ||
      receipt.sampleRestore.countMatch !== true ||
      receipt.sampleRestore.privacyModeMatch !== true
    ) {
      errors.push('PhotoBackupVerificationReceipt.sampleRestore must fully pass when status is verified.');
    }
  }

  return errors;
}

export function clonePhotoBackupCustodyReceipt(receipt: PhotoBackupCustodyReceipt): PhotoBackupCustodyReceipt {
  return JSON.parse(JSON.stringify(receipt)) as PhotoBackupCustodyReceipt;
}

export function clonePhotoBackupVerificationReceipt(
  receipt: PhotoBackupVerificationReceipt
): PhotoBackupVerificationReceipt {
  return JSON.parse(JSON.stringify(receipt)) as PhotoBackupVerificationReceipt;
}
