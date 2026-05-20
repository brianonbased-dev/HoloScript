/**
 * HoloShell Local Codebase Snapshot Receipt
 *
 * Proves that a HoloShell codebase-intelligence claim was built from local
 * filesystem state or from an explicitly replayable sourceFiles bundle.
 */

export const LOCAL_CODEBASE_SNAPSHOT_STATUSES = ['ready', 'warn', 'blocked'] as const;
export type LocalCodebaseSnapshotStatus = (typeof LOCAL_CODEBASE_SNAPSHOT_STATUSES)[number];

export const LOCAL_CODEBASE_REDACTION_STATUSES = ['pass', 'warn', 'fail'] as const;
export type LocalCodebaseRedactionStatus = (typeof LOCAL_CODEBASE_REDACTION_STATUSES)[number];

export const LOCAL_CODEBASE_PRIVACY_CLASSES = [
  'source',
  'generated',
  'secret-adjacent',
  'unknown',
] as const;
export type LocalCodebasePrivacyClass = (typeof LOCAL_CODEBASE_PRIVACY_CLASSES)[number];

export const LOCAL_CODEBASE_SKIP_REASONS = [
  'excluded-directory',
  'excluded-file',
  'unsupported-extension',
  'too-large',
  'secret-adjacent',
  'binary',
  'file-cap',
  'byte-cap',
  'read-error',
] as const;
export type LocalCodebaseSkipReason = (typeof LOCAL_CODEBASE_SKIP_REASONS)[number];

export type LocalCodebaseHashAlgorithm = 'sha256';

export interface LocalCodebaseSnapshotRoot {
  id: string;
  redactedRoot: string;
  rootHash: string;
  runtimeNamespace: 'local-windows' | 'local-posix' | 'mcp-runtime' | 'unknown';
  exists: boolean;
  selectedFileCount: number;
  skippedFileCount: number;
}

export interface LocalCodebaseSnapshotFile {
  path: string;
  sizeBytes: number;
  contentHash: string;
  hashAlgorithm: LocalCodebaseHashAlgorithm;
  privacyClass: LocalCodebasePrivacyClass;
  includedInSourceFiles: boolean;
  language?: string;
  modifiedAt?: string;
}

export interface LocalCodebaseSkippedFile {
  path?: string;
  pathHash?: string;
  reason: LocalCodebaseSkipReason;
  sizeBytes?: number;
  message?: string;
}

export interface LocalCodebaseSourceFilePayload {
  path: string;
  contentHash: string;
  sizeBytes: number;
}

export interface LocalCodebaseGraphReceipt {
  authoritative: boolean;
  reason?: string;
  requestedPath?: string;
  runtimePath?: string;
  cacheAgeMs?: number;
  recommendation?: string;
}

export interface HoloShellLocalCodebaseSnapshotReceipt {
  id: string;
  workflow: string;
  startedAt: string;
  endedAt: string;
  roots: LocalCodebaseSnapshotRoot[];
  files: LocalCodebaseSnapshotFile[];
  skippedFiles: LocalCodebaseSkippedFile[];
  sourceFiles: LocalCodebaseSourceFilePayload[];
  totalFiles: number;
  totalBytes: number;
  maxFiles: number;
  maxBytes: number;
  redactionStatus: LocalCodebaseRedactionStatus;
  status: LocalCodebaseSnapshotStatus;
  excludes: string[];
  replayCommand: string;
  graphReceipt?: LocalCodebaseGraphReceipt;
  hash: string;
  hashAlgorithm: LocalCodebaseHashAlgorithm;
  verificationCommands?: string[];
  metadata?: Record<string, unknown>;
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

function isRelativeSafePath(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.split(/[\\/]+/).includes('..')
  );
}

export function isSupportedLocalCodebaseSnapshotStatus(
  status: string
): status is LocalCodebaseSnapshotStatus {
  return isOneOf(LOCAL_CODEBASE_SNAPSHOT_STATUSES, status);
}

export function isSupportedLocalCodebaseRedactionStatus(
  status: string
): status is LocalCodebaseRedactionStatus {
  return isOneOf(LOCAL_CODEBASE_REDACTION_STATUSES, status);
}

export function validateHoloShellLocalCodebaseSnapshotReceipt(
  receipt: HoloShellLocalCodebaseSnapshotReceipt
): string[] {
  const errors: string[] = [];

  if (!receipt.id) errors.push('HoloShellLocalCodebaseSnapshotReceipt.id is required.');
  if (!receipt.workflow)
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.workflow is required.');
  if (!isIsoTimestamp(receipt.startedAt)) {
    errors.push(
      'HoloShellLocalCodebaseSnapshotReceipt.startedAt is required and must be a valid ISO-8601 timestamp.'
    );
  }
  if (!isIsoTimestamp(receipt.endedAt)) {
    errors.push(
      'HoloShellLocalCodebaseSnapshotReceipt.endedAt is required and must be a valid ISO-8601 timestamp.'
    );
  }
  if (!isSupportedLocalCodebaseSnapshotStatus(String(receipt.status))) {
    errors.push(
      `HoloShellLocalCodebaseSnapshotReceipt.status is unsupported: ${String(receipt.status)}.`
    );
  }
  if (!isSupportedLocalCodebaseRedactionStatus(String(receipt.redactionStatus))) {
    errors.push(
      `HoloShellLocalCodebaseSnapshotReceipt.redactionStatus is unsupported: ${String(receipt.redactionStatus)}.`
    );
  }
  if (!isNonNegativeInteger(receipt.totalFiles)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalFiles must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(receipt.totalBytes)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalBytes must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(receipt.maxFiles) || receipt.maxFiles === 0) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.maxFiles must be a positive integer.');
  }
  if (!isNonNegativeInteger(receipt.maxBytes) || receipt.maxBytes === 0) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.maxBytes must be a positive integer.');
  }
  if (receipt.totalFiles > receipt.maxFiles) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalFiles must not exceed maxFiles.');
  }
  if (receipt.totalBytes > receipt.maxBytes) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalBytes must not exceed maxBytes.');
  }
  if (!receipt.replayCommand) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.replayCommand is required.');
  }
  if (!receipt.hash) errors.push('HoloShellLocalCodebaseSnapshotReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push(
      `HoloShellLocalCodebaseSnapshotReceipt.hashAlgorithm is unsupported: ${String(receipt.hashAlgorithm)}.`
    );
  }

  validateRoots(receipt.roots, errors);
  validateFiles(receipt.files, errors);
  validateSkippedFiles(receipt.skippedFiles, errors);
  validateSourceFiles(receipt.sourceFiles, receipt.files, errors);

  if (!Array.isArray(receipt.excludes)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.excludes must be an array.');
  }
  if (receipt.verificationCommands?.some((command) => command.trim().length === 0)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt has an empty verification command.');
  }

  return errors;
}

function validateRoots(
  roots: LocalCodebaseSnapshotRoot[] | undefined,
  errors: string[]
): void {
  if (!Array.isArray(roots) || roots.length === 0) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.roots must be a non-empty array.');
    return;
  }
  for (const root of roots) {
    if (!root.id) errors.push('LocalCodebaseSnapshotRoot.id is required.');
    if (!root.redactedRoot) errors.push('LocalCodebaseSnapshotRoot.redactedRoot is required.');
    if (!root.rootHash) errors.push('LocalCodebaseSnapshotRoot.rootHash is required.');
    if (typeof root.exists !== 'boolean') {
      errors.push('LocalCodebaseSnapshotRoot.exists must be a boolean.');
    }
    if (!isNonNegativeInteger(root.selectedFileCount)) {
      errors.push('LocalCodebaseSnapshotRoot.selectedFileCount must be a non-negative integer.');
    }
    if (!isNonNegativeInteger(root.skippedFileCount)) {
      errors.push('LocalCodebaseSnapshotRoot.skippedFileCount must be a non-negative integer.');
    }
  }
}

function validateFiles(
  files: LocalCodebaseSnapshotFile[] | undefined,
  errors: string[]
): void {
  if (!Array.isArray(files)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.files must be an array.');
    return;
  }
  for (const file of files) {
    if (!isRelativeSafePath(file.path)) {
      errors.push(`LocalCodebaseSnapshotFile.path must be relative and safe: ${String(file.path)}.`);
    }
    if (!isNonNegativeInteger(file.sizeBytes)) {
      errors.push(`LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.sizeBytes must be a non-negative integer.`);
    }
    if (!file.contentHash) {
      errors.push(`LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.contentHash is required.`);
    }
    if (file.hashAlgorithm !== 'sha256') {
      errors.push(
        `LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.hashAlgorithm is unsupported: ${String(file.hashAlgorithm)}.`
      );
    }
    if (!isOneOf(LOCAL_CODEBASE_PRIVACY_CLASSES, String(file.privacyClass))) {
      errors.push(
        `LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.privacyClass is unsupported: ${String(file.privacyClass)}.`
      );
    }
    if (file.includedInSourceFiles !== true) {
      errors.push(
        `LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.includedInSourceFiles must be true.`
      );
    }
    if (file.modifiedAt !== undefined && !isIsoTimestamp(file.modifiedAt)) {
      errors.push(
        `LocalCodebaseSnapshotFile ${file.path || '<unknown>'}.modifiedAt must be a valid ISO-8601 timestamp.`
      );
    }
  }
}

function validateSkippedFiles(
  skippedFiles: LocalCodebaseSkippedFile[] | undefined,
  errors: string[]
): void {
  if (!Array.isArray(skippedFiles)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.skippedFiles must be an array.');
    return;
  }
  for (const skipped of skippedFiles) {
    if (skipped.path && !isRelativeSafePath(skipped.path)) {
      errors.push(`LocalCodebaseSkippedFile.path must be relative and safe: ${String(skipped.path)}.`);
    }
    if (!isOneOf(LOCAL_CODEBASE_SKIP_REASONS, String(skipped.reason))) {
      errors.push(`LocalCodebaseSkippedFile.reason is unsupported: ${String(skipped.reason)}.`);
    }
    if (skipped.sizeBytes !== undefined && !isNonNegativeInteger(skipped.sizeBytes)) {
      errors.push('LocalCodebaseSkippedFile.sizeBytes must be a non-negative integer.');
    }
  }
}

function validateSourceFiles(
  sourceFiles: LocalCodebaseSourceFilePayload[] | undefined,
  files: LocalCodebaseSnapshotFile[] | undefined,
  errors: string[]
): void {
  if (!Array.isArray(sourceFiles)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.sourceFiles must be an array.');
    return;
  }
  const hashesByPath = new Map((files || []).map((file) => [file.path, file.contentHash]));
  for (const sourceFile of sourceFiles) {
    if (!isRelativeSafePath(sourceFile.path)) {
      errors.push(`LocalCodebaseSourceFilePayload.path must be relative and safe: ${String(sourceFile.path)}.`);
    }
    if (!sourceFile.contentHash) {
      errors.push(
        `LocalCodebaseSourceFilePayload ${sourceFile.path || '<unknown>'}.contentHash is required.`
      );
    }
    if (!isNonNegativeInteger(sourceFile.sizeBytes)) {
      errors.push(
        `LocalCodebaseSourceFilePayload ${sourceFile.path || '<unknown>'}.sizeBytes must be a non-negative integer.`
      );
    }
    const fileHash = hashesByPath.get(sourceFile.path);
    if (fileHash && fileHash !== sourceFile.contentHash) {
      errors.push(
        `LocalCodebaseSourceFilePayload ${sourceFile.path}.contentHash must match the file snapshot hash.`
      );
    }
  }
}

export function cloneHoloShellLocalCodebaseSnapshotReceipt(
  receipt: HoloShellLocalCodebaseSnapshotReceipt
): HoloShellLocalCodebaseSnapshotReceipt {
  return {
    ...receipt,
    roots: receipt.roots.map((root) => ({ ...root })),
    files: receipt.files.map((file) => ({ ...file })),
    skippedFiles: receipt.skippedFiles.map((file) => ({ ...file })),
    sourceFiles: receipt.sourceFiles.map((file) => ({ ...file })),
    excludes: [...receipt.excludes],
    graphReceipt: receipt.graphReceipt ? { ...receipt.graphReceipt } : undefined,
    verificationCommands: receipt.verificationCommands
      ? [...receipt.verificationCommands]
      : undefined,
    metadata: receipt.metadata ? JSON.parse(JSON.stringify(receipt.metadata)) : undefined,
  };
}
