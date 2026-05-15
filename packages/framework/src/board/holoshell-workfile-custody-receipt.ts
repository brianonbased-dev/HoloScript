/**
 * HoloShell Work-File Custody Receipt
 *
 * Records deterministic handling for local documents, spreadsheets, CSVs, and
 * PDFs before any agent-authored export is allowed.
 */

export const WORKFILE_KINDS = ['docx', 'xlsx', 'xlsm', 'csv', 'pdf', 'unknown'] as const;
export type WorkFileKind = (typeof WORKFILE_KINDS)[number];

export const WORKFILE_PRIVACY_CLASSES = [
  'public',
  'local-private',
  'credential-adjacent',
  'secret',
  'unknown',
] as const;
export type WorkFilePrivacyClass = (typeof WORKFILE_PRIVACY_CLASSES)[number];

export const WORKFILE_ADAPTER_KINDS = [
  'native-parser',
  'office-automation',
  'browser',
  'ui-automation',
  'manual-witness',
] as const;
export type WorkFileAdapterKind = (typeof WORKFILE_ADAPTER_KINDS)[number];

export const WORKFILE_PARSE_STATUSES = ['pass', 'warn', 'fail', 'skipped'] as const;
export type WorkFileParseStatus = (typeof WORKFILE_PARSE_STATUSES)[number];

export const WORKFILE_WARNING_KINDS = [
  'macro-present',
  'external-link',
  'formula-present',
  'hidden-sheet',
  'unsupported-format',
  'parser-unavailable',
  'source-hash-drift',
  'cloud-sync-boundary',
  'credential-boundary',
  'unknown',
] as const;
export type WorkFileWarningKind = (typeof WORKFILE_WARNING_KINDS)[number];

export const WORKFILE_WARNING_SEVERITIES = ['info', 'warn', 'fail'] as const;
export type WorkFileWarningSeverity = (typeof WORKFILE_WARNING_SEVERITIES)[number];

export const WORKFILE_PREVIEW_KINDS = [
  'summary',
  'redline',
  'cell-diff',
  'export-plan',
  'none',
] as const;
export type WorkFilePreviewKind = (typeof WORKFILE_PREVIEW_KINDS)[number];

export const WORKFILE_OUTPUT_KINDS = [
  'docx',
  'xlsx',
  'csv',
  'pdf',
  'markdown',
  'json',
  'none',
] as const;
export type WorkFileOutputKind = (typeof WORKFILE_OUTPUT_KINDS)[number];

export const WORKFILE_CUSTODY_OUTCOMES = ['pass', 'warn', 'fail', 'blocked-by-policy'] as const;
export type WorkFileCustodyOutcome = (typeof WORKFILE_CUSTODY_OUTCOMES)[number];

export type WorkFileHashAlgorithm = 'sha256';

export interface WorkFileWarning {
  kind: WorkFileWarningKind;
  severity: WorkFileWarningSeverity;
  message: string;
  evidence?: string;
}

export interface WorkFileSnapshot {
  redactedPath: string;
  pathHash: string;
  basename?: string;
  extension?: string;
  kind: WorkFileKind;
  sizeBytes: number;
  sourceHash: string;
  sourceHashAlgorithm: WorkFileHashAlgorithm;
  capturedAt: string;
  privacyClass: WorkFilePrivacyClass;
  sourceMutated: false;
}

export interface WorkFileParserEvidence {
  adapter: WorkFileAdapterKind;
  parserName?: string;
  parserVersion?: string;
  parseStatus: WorkFileParseStatus;
  supported: boolean;
  detectedFeatures?: string[];
  warnings?: WorkFileWarning[];
}

export interface WorkFilePreviewReceipt {
  previewId: string;
  previewKind: WorkFilePreviewKind;
  sourceHash: string;
  previewHash?: string;
  diffHash?: string;
  outputKind?: WorkFileOutputKind;
  requiresApproval: boolean;
}

export interface WorkFileExportReceipt {
  outputRedactedPath: string;
  outputHash: string;
  outputHashAlgorithm: WorkFileHashAlgorithm;
  outputKind: WorkFileOutputKind;
  approvalId: string;
  sourceHash: string;
  exportedAt: string;
}

export type WorkFileReceiptMetadataValue =
  | string
  | number
  | boolean
  | null
  | WorkFileReceiptMetadataValue[]
  | { [key: string]: WorkFileReceiptMetadataValue };

export interface HoloShellWorkFileCustodyReceipt {
  id: string;
  workflow: string;
  startedAt: string;
  endedAt: string;
  snapshot: WorkFileSnapshot;
  parser: WorkFileParserEvidence;
  preview: WorkFilePreviewReceipt;
  exportReceipt?: WorkFileExportReceipt;
  sourceMutated: false;
  approvalRequired: boolean;
  approvalId?: string;
  replayKey: string;
  outcome: WorkFileCustodyOutcome;
  hash: string;
  hashAlgorithm: WorkFileHashAlgorithm;
  provenance?: string[];
  verificationCommands?: string[];
  metadata?: Record<string, WorkFileReceiptMetadataValue>;
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

export function isSupportedWorkFileKind(kind: string): kind is WorkFileKind {
  return isOneOf(WORKFILE_KINDS, kind);
}

export function isSupportedWorkFileAdapterKind(kind: string): kind is WorkFileAdapterKind {
  return isOneOf(WORKFILE_ADAPTER_KINDS, kind);
}

export function isSupportedWorkFileCustodyOutcome(
  outcome: string
): outcome is WorkFileCustodyOutcome {
  return isOneOf(WORKFILE_CUSTODY_OUTCOMES, outcome);
}

export function validateHoloShellWorkFileCustodyReceipt(
  receipt: HoloShellWorkFileCustodyReceipt
): string[] {
  const errors: string[] = [];

  if (!receipt.id) errors.push('HoloShellWorkFileCustodyReceipt.id is required.');
  if (!receipt.workflow) errors.push('HoloShellWorkFileCustodyReceipt.workflow is required.');
  if (!isIsoTimestamp(receipt.startedAt)) {
    errors.push(
      'HoloShellWorkFileCustodyReceipt.startedAt is required and must be a valid ISO-8601 timestamp.'
    );
  }
  if (!isIsoTimestamp(receipt.endedAt)) {
    errors.push(
      'HoloShellWorkFileCustodyReceipt.endedAt is required and must be a valid ISO-8601 timestamp.'
    );
  }
  if (receipt.sourceMutated !== false) {
    errors.push('HoloShellWorkFileCustodyReceipt.sourceMutated must be false.');
  }
  if (!isSupportedWorkFileCustodyOutcome(String(receipt.outcome))) {
    errors.push(
      `HoloShellWorkFileCustodyReceipt.outcome is unsupported: ${String(receipt.outcome)}.`
    );
  }
  if (!receipt.replayKey) errors.push('HoloShellWorkFileCustodyReceipt.replayKey is required.');
  if (!receipt.hash) errors.push('HoloShellWorkFileCustodyReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push(
      `HoloShellWorkFileCustodyReceipt.hashAlgorithm is unsupported: ${String(receipt.hashAlgorithm)}.`
    );
  }

  validateSnapshot(receipt.snapshot, errors);
  validateParser(receipt.parser, errors);
  validatePreview(receipt.preview, receipt.snapshot?.sourceHash, errors);

  if (receipt.exportReceipt) {
    validateExport(receipt.exportReceipt, receipt.snapshot?.sourceHash, errors);
    if (!receipt.approvalId) {
      errors.push(
        'HoloShellWorkFileCustodyReceipt.approvalId is required when exportReceipt is present.'
      );
    }
  }

  if (receipt.approvalRequired && !receipt.preview?.requiresApproval) {
    errors.push(
      'HoloShellWorkFileCustodyReceipt.preview.requiresApproval must be true when approvalRequired is true.'
    );
  }

  if (receipt.verificationCommands?.some((command) => command.trim().length === 0)) {
    errors.push(`HoloShellWorkFileCustodyReceipt ${receipt.id} has an empty verification command.`);
  }

  return errors;
}

function validateSnapshot(snapshot: WorkFileSnapshot | undefined, errors: string[]): void {
  if (!snapshot) {
    errors.push('HoloShellWorkFileCustodyReceipt.snapshot is required.');
    return;
  }
  if (!snapshot.redactedPath) errors.push('WorkFileSnapshot.redactedPath is required.');
  if (!snapshot.pathHash) errors.push('WorkFileSnapshot.pathHash is required.');
  if (!isSupportedWorkFileKind(String(snapshot.kind))) {
    errors.push(`WorkFileSnapshot.kind is unsupported: ${String(snapshot.kind)}.`);
  }
  if (!isNonNegativeInteger(snapshot.sizeBytes)) {
    errors.push('WorkFileSnapshot.sizeBytes must be a non-negative integer.');
  }
  if (!snapshot.sourceHash) errors.push('WorkFileSnapshot.sourceHash is required.');
  if (snapshot.sourceHashAlgorithm !== 'sha256') {
    errors.push(
      `WorkFileSnapshot.sourceHashAlgorithm is unsupported: ${String(snapshot.sourceHashAlgorithm)}.`
    );
  }
  if (!isIsoTimestamp(snapshot.capturedAt)) {
    errors.push('WorkFileSnapshot.capturedAt is required and must be a valid ISO-8601 timestamp.');
  }
  if (!isOneOf(WORKFILE_PRIVACY_CLASSES, String(snapshot.privacyClass))) {
    errors.push(`WorkFileSnapshot.privacyClass is unsupported: ${String(snapshot.privacyClass)}.`);
  }
  if (snapshot.sourceMutated !== false) {
    errors.push('WorkFileSnapshot.sourceMutated must be false.');
  }
}

function validateParser(parser: WorkFileParserEvidence | undefined, errors: string[]): void {
  if (!parser) {
    errors.push('HoloShellWorkFileCustodyReceipt.parser is required.');
    return;
  }
  if (!isSupportedWorkFileAdapterKind(String(parser.adapter))) {
    errors.push(`WorkFileParserEvidence.adapter is unsupported: ${String(parser.adapter)}.`);
  }
  if (!isOneOf(WORKFILE_PARSE_STATUSES, String(parser.parseStatus))) {
    errors.push(
      `WorkFileParserEvidence.parseStatus is unsupported: ${String(parser.parseStatus)}.`
    );
  }
  for (const warning of parser.warnings ?? []) {
    if (!isOneOf(WORKFILE_WARNING_KINDS, String(warning.kind))) {
      errors.push(`WorkFileWarning.kind is unsupported: ${String(warning.kind)}.`);
    }
    if (!isOneOf(WORKFILE_WARNING_SEVERITIES, String(warning.severity))) {
      errors.push(`WorkFileWarning.severity is unsupported: ${String(warning.severity)}.`);
    }
    if (!warning.message) errors.push('WorkFileWarning.message is required.');
  }
}

function validatePreview(
  preview: WorkFilePreviewReceipt | undefined,
  sourceHash: string | undefined,
  errors: string[]
): void {
  if (!preview) {
    errors.push('HoloShellWorkFileCustodyReceipt.preview is required.');
    return;
  }
  if (!preview.previewId) errors.push('WorkFilePreviewReceipt.previewId is required.');
  if (!isOneOf(WORKFILE_PREVIEW_KINDS, String(preview.previewKind))) {
    errors.push(
      `WorkFilePreviewReceipt.previewKind is unsupported: ${String(preview.previewKind)}.`
    );
  }
  if (!preview.sourceHash) errors.push('WorkFilePreviewReceipt.sourceHash is required.');
  if (sourceHash && preview.sourceHash !== sourceHash) {
    errors.push('WorkFilePreviewReceipt.sourceHash must match WorkFileSnapshot.sourceHash.');
  }
  if (preview.outputKind && !isOneOf(WORKFILE_OUTPUT_KINDS, String(preview.outputKind))) {
    errors.push(`WorkFilePreviewReceipt.outputKind is unsupported: ${String(preview.outputKind)}.`);
  }
}

function validateExport(
  exportReceipt: WorkFileExportReceipt,
  sourceHash: string | undefined,
  errors: string[]
): void {
  if (!exportReceipt.outputRedactedPath)
    errors.push('WorkFileExportReceipt.outputRedactedPath is required.');
  if (!exportReceipt.outputHash) errors.push('WorkFileExportReceipt.outputHash is required.');
  if (exportReceipt.outputHashAlgorithm !== 'sha256') {
    errors.push(
      `WorkFileExportReceipt.outputHashAlgorithm is unsupported: ${String(exportReceipt.outputHashAlgorithm)}.`
    );
  }
  if (!isOneOf(WORKFILE_OUTPUT_KINDS, String(exportReceipt.outputKind))) {
    errors.push(
      `WorkFileExportReceipt.outputKind is unsupported: ${String(exportReceipt.outputKind)}.`
    );
  }
  if (!exportReceipt.approvalId) errors.push('WorkFileExportReceipt.approvalId is required.');
  if (!exportReceipt.sourceHash) errors.push('WorkFileExportReceipt.sourceHash is required.');
  if (sourceHash && exportReceipt.sourceHash !== sourceHash) {
    errors.push('WorkFileExportReceipt.sourceHash must match WorkFileSnapshot.sourceHash.');
  }
  if (!isIsoTimestamp(exportReceipt.exportedAt)) {
    errors.push(
      'WorkFileExportReceipt.exportedAt is required and must be a valid ISO-8601 timestamp.'
    );
  }
}

export function cloneHoloShellWorkFileCustodyReceipt(
  receipt: HoloShellWorkFileCustodyReceipt
): HoloShellWorkFileCustodyReceipt {
  return {
    ...receipt,
    snapshot: { ...receipt.snapshot },
    parser: {
      ...receipt.parser,
      detectedFeatures: receipt.parser.detectedFeatures
        ? [...receipt.parser.detectedFeatures]
        : undefined,
      warnings: receipt.parser.warnings
        ? receipt.parser.warnings.map((warning) => ({ ...warning }))
        : undefined,
    },
    preview: { ...receipt.preview },
    exportReceipt: receipt.exportReceipt ? { ...receipt.exportReceipt } : undefined,
    provenance: receipt.provenance ? [...receipt.provenance] : undefined,
    verificationCommands: receipt.verificationCommands
      ? [...receipt.verificationCommands]
      : undefined,
    metadata: receipt.metadata ? JSON.parse(JSON.stringify(receipt.metadata)) : undefined,
  };
}
