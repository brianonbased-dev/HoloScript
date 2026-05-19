/**
 * AccountExportArchiveReceipt — trust receipt for local archive verification.
 *
 * Produced when HoloShell verifies a provider export archive before any
 * import, delete, or share operation is permitted. Covers multi-part
 * archives, completeness checks, unpack manifests, executable flagging,
 * and sensitivity classification.
 *
 * The archive verifier (AccountExportArchiveVerifier) hashes every part
 * and every file, checks that all declared parts are present, flags files
 * that match known executable extensions, classifies file sensitivity
 * from path patterns, and produces this receipt as proof that the archive
 * was inspected before any mutation was allowed.
 *
 * Until this receipt records `verificationResult: 'verified'`, import,
 * delete, and share operations on the archive's contents are blocked.
 *
 * @see AccountExportArchiveVerifier
 * @see AccountExportReplayReceipt
 * @see ProviderExportCustodyReceipt
 */

import {
  TrustReceiptInput,
  TrustReceipt,
  TrustPermissionEnvelope,
  generateReceiptId,
} from './TrustReceipt';

// ─── Archive Format Types ──────────────────────────────────────────────────

export type ArchiveFormat =
  | 'zip'
  | 'tar_gz'
  | 'tar_bz2'
  | 'tar_xz'
  | '7z'
  | 'rar'
  | 'json'
  | 'mbox'
  | 'unknown';

export type ArchivePartStatus =
  | 'present_intact'
  | 'present_corrupt'
  | 'missing'
  | 'present_size_mismatch';

export type SensitivityLevel =
  | 'public'
  | 'internal'
  | 'personal'
  | 'sensitive'
  | 'restricted';

export type SensitivityCategory =
  | 'financial'
  | 'health'
  | 'credentials'
  | 'browsing_history'
  | 'communications'
  | 'location'
  | 'identity'
  | 'media_personal'
  | 'device_metadata'
  | 'general'
  | string; // extensible

export type FileSensitivityFlag =
  | 'contains_pii'
  | 'contains_credentials'
  | 'contains_financial'
  | 'contains_health'
  | 'contains_communications'
  | 'contains_location'
  | 'auto_detected';

export type VerificationResult =
  | 'verified'
  | 'verified_with_warnings'
  | 'failed_corrupt'
  | 'failed_incomplete'
  | 'failed_executable_detected'
  | 'failed_sensitivity_blocked';

// ─── File Manifest Entry ────────────────────────────────────────────────────

export interface ArchiveFileManifestEntry {
  /** Relative path within the archive (redacted if private path leaked). */
  path: string;

  /** SHA-256 hash of the file content. */
  contentHash: string;

  /** File size in bytes. */
  sizeBytes: number;

  /** True if the file extension matches a known executable pattern. */
  isExecutable: boolean;

  /** Detected executable extension, if any. */
  executableExtension?: string;

  /** Highest sensitivity level detected for this file. */
  sensitivityLevel: SensitivityLevel;

  /** Sensitivity categories detected for this file. */
  sensitivityCategories: SensitivityCategory[];

  /** Specific sensitivity flags, if any. */
  sensitivityFlags: FileSensitivityFlag[];

  /** MIME type, if detectable. */
  mimeType?: string;
}

// ─── Archive Part ───────────────────────────────────────────────────────────

export interface ArchivePart {
  /** Part index (0-based). */
  partIndex: number;

  /** Total number of parts in the archive set. */
  totalParts: number;

  /** SHA-256 hash of the part file. */
  partHash: string;

  /** Size of this part in bytes. */
  partSizeBytes: number;

  /** Status of this part after verification. */
  status: ArchivePartStatus;

  /** Expected size (from manifest or naming convention), if known. */
  expectedSizeBytes?: number;

  /** If present, the filename of this part on disk (redacted per path policy). */
  fileName?: string;
}

// ─── Archive Verification Payload ────────────────────────────────────────────

export interface AccountExportArchivePayload {
  /** Which export workflow this receipt belongs to. */
  workflow: 'browser_account_export' | string;

  /** Provider being exported from. */
  provider: string;

  /** Human-readable label for the provider. */
  providerLabel: string;

  // ─── Archive metadata ────────────────────────────────────────────────────

  /** Format of the export archive. */
  archiveFormat: ArchiveFormat;

  /** Total number of parts in the archive set (1 for single-part). */
  totalParts: number;

  /** Combined size of all parts in bytes. */
  totalSizeBytes: number;

  /** SHA-256 hash of the complete concatenated archive. */
  archiveHash: string;

  /** Number of files in the unpacked archive. */
  fileCount: number;

  // ─── Part verification results ────────────────────────────────────────────

  /** Verification results for each part of the archive. */
  parts: ArchivePart[];

  /** True if all parts are present and integrity-verified. */
  partsComplete: boolean;

  // ─── File manifest ────────────────────────────────────────────────────────

  /** Per-file manifest from unpacking the archive. */
  fileManifest: ArchiveFileManifestEntry[];

  /** True if the manifest was successfully extracted. */
  manifestExtracted: boolean;

  // ─── Executable flagging ──────────────────────────────────────────────────

  /** Files flagged as executables. */
  executableFiles: string[];

  /** True if any unexpected executables were detected. */
  executablesDetected: boolean;

  /** Whether executable detection should block the import. */
  executableBlockImport: boolean;

  // ─── Sensitivity classification ──────────────────────────────────────────

  /** Aggregate sensitivity level across all files. */
  aggregateSensitivity: SensitivityLevel;

  /** All sensitivity categories detected across the archive. */
  sensitivityCategories: SensitivityCategory[];

  /** Files classified at 'restricted' sensitivity. */
  restrictedFiles: string[];

  /** Files classified at 'sensitive' sensitivity or above. */
  sensitiveFiles: string[];

  /** Whether sensitivity classification should block sharing. */
  sensitivityBlockShare: boolean;

  // ─── Verification result ──────────────────────────────────────────────────

  /** Overall verification result. */
  verificationResult: VerificationResult;

  /** Human-readable summary of the verification outcome. */
  verificationSummary: string;

  /** Warnings encountered during verification (non-blocking). */
  warnings: string[];

  /** Errors encountered during verification (blocking). */
  errors: string[];

  // ─── Custody invariants ───────────────────────────────────────────────────

  /** Whether a credential-bearing session was used for verification. */
  credentialAdjacent: boolean;

  /** Whether any source file was mutated during verification. */
  sourceFileMutationPerformed: boolean;

  /** Whether raw private data was published. */
  rawPrivateDataPublished: boolean;

  /** Whether a private path leaked into the receipt. */
  privatePathLeakedToPublicReceipt: boolean;
}

// ─── Adapter Options ─────────────────────────────────────────────────────────

export interface AccountExportArchiveAdapterOptions {
  /** Canonical Passport DID for the actor. */
  passportDid: string;

  /** HoloMesh task ID linking this receipt to a board task, if any. */
  taskId?: string;

  /** Git commit this receipt is associated with, if any. */
  commit?: string;

  /** Parent receipt IDs in the chain (e.g., the custody receipt that preceded this). */
  parentReceiptIds?: string[];

  /** Layer-3 oracle reference for simulation receipts. */
  layer3OracleRef?: string;

  /** Explicit permission envelope override. */
  permissionEnvelope?: TrustPermissionEnvelope;

  /** Sync state override. Default: local_only. */
  syncState?: 'local_only' | 'synced' | 'redacted_sync' | 'sync_failed';

  /** Redacted fields for synced receipts. */
  redactedFields?: string[];
}

// ─── Verification Guard ──────────────────────────────────────────────────────

/**
 * Guard object returned by the verifier. Until `verificationResult` is
 * 'verified' or 'verified_with_warnings', import, delete, and share
 * operations are blocked.
 */
export interface ArchiveVerificationGuard {
  /** The verification result. */
  result: VerificationResult;

  /** True if import operations are permitted. */
  importAllowed: boolean;

  /** True if delete operations are permitted. */
  deleteAllowed: boolean;

  /** True if share operations are permitted. */
  shareAllowed: boolean;

  /** Reason if any operation is blocked, empty string if all allowed. */
  blockReason: string;

  /** The archive receipt payload that produced this guard. */
  payload: AccountExportArchivePayload;
}

// ─── Known executable extensions ────────────────────────────────────────────

export const EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.wsf', '.wsh',
  '.msi', '.msp', '.mst',
  '.sh', '.bash', '.zsh', '.fish', '.ksh',
  '.app', '.dmg', '.pkg', '.deb', '.rpm', '.apk',
  '.com', '.scr', '.pif', '.gadget',
  '.jar', '.war', // Java executables
  '.pyc', '.pyo', // Python compiled (can be executable in context)
  '.dll', '.so', '.dylib', // Shared libraries (loadable code)
  '.sys', '.drv', // Windows drivers
]);

// ─── Known sensitivity patterns ──────────────────────────────────────────────

export interface SensitivityPattern {
  /** Path pattern (substring match, case-insensitive). */
  pattern: string;

  /** Sensitivity level if this pattern matches. */
  level: SensitivityLevel;

  /** Sensitivity categories this pattern indicates. */
  categories: SensitivityCategory[];

  /** Specific flags to apply. */
  flags: FileSensitivityFlag[];
}

export const DEFAULT_SENSITIVITY_PATTERNS: SensitivityPattern[] = [
  // Credentials
  { pattern: 'password', level: 'restricted', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'secret', level: 'restricted', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'token', level: 'restricted', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'api_key', level: 'restricted', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'credential', level: 'restricted', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'oauth', level: 'sensitive', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'cookie', level: 'sensitive', categories: ['credentials', 'browsing_history'], flags: ['contains_credentials', 'auto_detected'] },
  { pattern: 'session', level: 'sensitive', categories: ['credentials'], flags: ['contains_credentials', 'auto_detected'] },

  // Financial
  { pattern: 'bank', level: 'restricted', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },
  { pattern: 'credit', level: 'restricted', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },
  { pattern: 'payment', level: 'restricted', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },
  { pattern: 'invoice', level: 'sensitive', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },
  { pattern: 'transaction', level: 'sensitive', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },
  { pattern: 'financial', level: 'sensitive', categories: ['financial'], flags: ['contains_financial', 'auto_detected'] },

  // Health
  { pattern: 'health', level: 'restricted', categories: ['health'], flags: ['contains_health', 'auto_detected'] },
  { pattern: 'medical', level: 'restricted', categories: ['health'], flags: ['contains_health', 'auto_detected'] },
  { pattern: 'prescription', level: 'restricted', categories: ['health'], flags: ['contains_health', 'auto_detected'] },
  { pattern: 'diagnosis', level: 'restricted', categories: ['health'], flags: ['contains_health', 'auto_detected'] },

  // Communications
  { pattern: 'mail', level: 'sensitive', categories: ['communications'], flags: ['contains_communications', 'auto_detected'] },
  { pattern: 'message', level: 'sensitive', categories: ['communications'], flags: ['contains_communications', 'auto_detected'] },
  { pattern: 'chat', level: 'sensitive', categories: ['communications'], flags: ['contains_communications', 'auto_detected'] },
  { pattern: 'inbox', level: 'sensitive', categories: ['communications'], flags: ['contains_communications', 'auto_detected'] },

  // Location
  { pattern: 'location', level: 'sensitive', categories: ['location'], flags: ['contains_location', 'auto_detected'] },
  { pattern: 'gps', level: 'sensitive', categories: ['location'], flags: ['contains_location', 'auto_detected'] },
  { pattern: 'geolocation', level: 'sensitive', categories: ['location'], flags: ['contains_location', 'auto_detected'] },

  // Identity
  { pattern: 'profile', level: 'personal', categories: ['identity'], flags: ['contains_pii', 'auto_detected'] },
  { pattern: 'contact', level: 'personal', categories: ['identity'], flags: ['contains_pii', 'auto_detected'] },
  { pattern: 'address', level: 'sensitive', categories: ['identity'], flags: ['contains_pii', 'auto_detected'] },
  { pattern: 'ssn', level: 'restricted', categories: ['identity'], flags: ['contains_pii', 'auto_detected'] },

  // Browsing
  { pattern: 'history', level: 'personal', categories: ['browsing_history'], flags: ['auto_detected'] },
  { pattern: 'bookmark', level: 'personal', categories: ['browsing_history'], flags: ['auto_detected'] },
  { pattern: 'cache', level: 'personal', categories: ['browsing_history'], flags: ['auto_detected'] },

  // Media
  { pattern: 'photo', level: 'personal', categories: ['media_personal'], flags: ['auto_detected'] },
  { pattern: 'video', level: 'personal', categories: ['media_personal'], flags: ['auto_detected'] },
  { pattern: 'camera', level: 'personal', categories: ['media_personal'], flags: ['auto_detected'] },

  // Device
  { pattern: 'device', level: 'internal', categories: ['device_metadata'], flags: ['auto_detected'] },
  { pattern: 'system', level: 'internal', categories: ['device_metadata'], flags: ['auto_detected'] },
];

// ─── MIME type detection (simplified) ────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.mbox': 'application/mbox',
  '.eml': 'message/rfc822',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Check whether a file path ends with a known executable extension.
 */
export function isExecutableFile(filePath: string): { executable: boolean; extension?: string } {
  const lowerPath = filePath.toLowerCase();
  for (const ext of EXECUTABLE_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) {
      return { executable: true, extension: ext };
    }
  }
  return { executable: false };
}

/**
 * Classify a file's sensitivity based on its path and default patterns.
 */
export function classifyFileSensitivity(
  filePath: string,
  patterns: SensitivityPattern[] = DEFAULT_SENSITIVITY_PATTERNS,
): {
  level: SensitivityLevel;
  categories: SensitivityCategory[];
  flags: FileSensitivityFlag[];
} {
  const lowerPath = filePath.toLowerCase();
  let highestLevel: SensitivityLevel = 'general';
  const categories = new Set<SensitivityCategory>();
  const flags = new Set<FileSensitivityFlag>();

  const levelOrder: SensitivityLevel[] = ['public', 'internal', 'personal', 'sensitive', 'restricted'];
  const levelIndex = (l: SensitivityLevel) => levelOrder.indexOf(l);

  for (const pattern of patterns) {
    if (lowerPath.includes(pattern.pattern)) {
      if (levelOrder.includes(pattern.level) && levelIndex(pattern.level) > levelIndex(highestLevel)) {
        highestLevel = pattern.level;
      }
      for (const cat of pattern.categories) {
        categories.add(cat);
      }
      for (const flag of pattern.flags) {
        flags.add(flag);
      }
    }
  }

  return {
    level: highestLevel,
    categories: [...categories],
    flags: [...flags],
  };
}

/**
 * Detect MIME type from file extension.
 */
export function detectMimeType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_MAP)) {
    if (lowerPath.endsWith(ext)) {
      return mime;
    }
  }
  return 'application/octet-stream';
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Convert an AccountExportArchivePayload into a TrustReceiptInput suitable
 * for appending to a TrustLedger.
 */
export function archiveVerificationToReceiptInput(
  payload: AccountExportArchivePayload,
  options: AccountExportArchiveAdapterOptions,
): TrustReceiptInput {
  const permissionEnvelope: TrustPermissionEnvelope =
    options.permissionEnvelope ?? phaseToEnvelope(payload.verificationResult);

  const actionName = `account_export_archive_verify`;
  const resource = `holoshell/${payload.workflow}/${payload.provider}/archive`;

  const outcome = payload.verificationResult.startsWith('verified')
    ? 'success'
    : 'denied';

  const payloadHash = stableArchiveHash(payload);

  return {
    schemaVersion: '1.0.0',
    recordedAt: new Date().toISOString(),
    actor: {
      passportDid: options.passportDid,
      bindings: [
        { value: payload.provider, type: 'provider_export' },
        { value: payload.workflow, type: 'workflow' },
        { value: 'archive_verify', type: 'verification_phase' },
      ],
    },
    permissionEnvelope,
    action: {
      name: actionName,
      resource,
      outcome,
    },
    evidence: {
      hashes: [payloadHash],
      nonce: `archive_verify_${payload.workflow}_${payload.provider}_${Date.now()}`,
      commandHash: payload.archiveHash || undefined,
      witnessRefs: [
        ...payload.errors,
        ...payload.warnings,
      ],
    },
    algebraicTrust: {
      layer1Strategy: 'strict_error',
      layer2HistoryRef: `provider_export/${payload.provider}/archive_verify`,
      layer3OracleRef: options.layer3OracleRef,
    },
    links: {
      parentReceiptIds: options.parentReceiptIds,
      taskId: options.taskId,
      commit: options.commit,
    },
    storage: {
      syncState: options.syncState ?? 'local_only',
      redactedFields: options.redactedFields,
    },
  };
}

function phaseToEnvelope(result: VerificationResult): TrustPermissionEnvelope {
  switch (result) {
    case 'verified':
      return 'read_only';
    case 'verified_with_warnings':
      return 'read_only';
    case 'failed_corrupt':
      return 'break_glass';
    case 'failed_incomplete':
      return 'break_glass';
    case 'failed_executable_detected':
      return 'break_glass';
    case 'failed_sensitivity_blocked':
      return 'guarded_execute';
    default:
      return 'read_only';
  }
}

/**
 * Deterministic hash of an AccountExportArchivePayload for evidence chaining.
 */
export function stableArchiveHash(payload: AccountExportArchivePayload): string {
  const { createHash } = require('crypto');
  const canonical = JSON.stringify(canonicalizeArchiveObject(payload));
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function canonicalizeArchiveObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeArchiveObject);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeArchiveObject(entry);
      }
    }
    return sorted;
  }
  return value;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ArchiveVerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an AccountExportArchivePayload against archive verification rules.
 *
 * Rules derived from the HoloShell archive verification contract:
 * - sourceFileMutationPerformed must be false
 * - rawPrivateDataPublished must be false
 * - privatePathLeakedToPublicReceipt must be false
 * - If verificationResult is not 'verified' or 'verified_with_warnings',
 *   import/delete/share must be blocked
 * - If executablesDetected, executableBlockImport must be true
 * - If restricted/sensitive files exist, sensitivityBlockShare must be true
 * - archiveHash is required
 * - fileManifest must match fileCount
 * - All parts must have valid status
 * - No part should have status 'missing' when partsComplete is true
 */
export function validateArchiveVerification(
  payload: AccountExportArchivePayload,
): ArchiveVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!payload.workflow) errors.push('Missing workflow');
  if (!payload.provider) errors.push('Missing provider');
  if (!payload.providerLabel) errors.push('Missing providerLabel');
  if (!payload.archiveFormat) errors.push('Missing archiveFormat');
  if (!payload.archiveHash) errors.push('Missing archiveHash');

  // Custody invariants — must always be false
  if (payload.sourceFileMutationPerformed) {
    errors.push('sourceFileMutationPerformed must be false — verification must not mutate source files');
  }
  if (payload.rawPrivateDataPublished) {
    errors.push('rawPrivateDataPublished must be false — raw private data must not be published');
  }
  if (payload.privatePathLeakedToPublicReceipt) {
    errors.push('privatePathLeakedToPublicReceipt must be false — private paths must not leak into public receipts');
  }

  // Consistency checks
  if (payload.totalParts < 1) {
    errors.push('totalParts must be at least 1');
  }
  if (payload.totalSizeBytes < 0) {
    errors.push('totalSizeBytes must be non-negative');
  }

  // Part integrity
  if (payload.parts.length !== payload.totalParts) {
    errors.push(`parts.length (${payload.parts.length}) does not match totalParts (${payload.totalParts})`);
  }

  const missingParts = payload.parts.filter((p) => p.status === 'missing');
  const corruptParts = payload.parts.filter((p) => p.status === 'present_corrupt');
  const sizeMismatchParts = payload.parts.filter((p) => p.status === 'present_size_mismatch');

  if (payload.partsComplete && missingParts.length > 0) {
    errors.push('partsComplete is true but some parts have status "missing"');
  }
  if (corruptParts.length > 0) {
    errors.push(`${corruptParts.length} part(s) have status "present_corrupt" — archive is corrupt`);
  }
  if (sizeMismatchParts.length > 0) {
    warnings.push(`${sizeMismatchParts.length} part(s) have status "present_size_mismatch" — sizes don't match expected`);
  }

  // Manifest consistency
  if (payload.manifestExtracted && payload.fileManifest.length !== payload.fileCount) {
    warnings.push(`fileManifest has ${payload.fileManifest.length} entries but fileCount is ${payload.fileCount}`);
  }

  // Executable flagging
  if (payload.executablesDetected && !payload.executableBlockImport) {
    errors.push('executablesDetected is true but executableBlockImport is false — executables must block imports');
  }

  // Sensitivity blocking
  const hasRestrictedFiles = payload.restrictedFiles.length > 0;
  const hasSensitiveFiles = payload.sensitiveFiles.length > 0;
  if ((hasRestrictedFiles || hasSensitiveFiles) && !payload.sensitivityBlockShare) {
    warnings.push('restricted or sensitive files detected but sensitivityBlockShare is false — sharing may leak sensitive data');
  }

  // Verification result consistency
  if (payload.verificationResult === 'verified' && errors.length > 0) {
    warnings.push('verificationResult is "verified" but payload has validation errors — consider verificationResult "verified_with_warnings" or "failed_*"');
  }

  // Every file in fileManifest should have a proper sensitivity classification
  for (const entry of payload.fileManifest) {
    if (!entry.contentHash) {
      errors.push(`File manifest entry "${entry.path}" has no contentHash`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create an ArchiveVerificationGuard from a payload.
 * This guard blocks import/delete/share until the archive is verified.
 */
export function createArchiveVerificationGuard(
  payload: AccountExportArchivePayload,
): ArchiveVerificationGuard {
  const isVerified = payload.verificationResult === 'verified'
    || payload.verificationResult === 'verified_with_warnings';

  const blockReasons: string[] = [];

  if (!isVerified) {
    blockReasons.push(`Archive verification result: ${payload.verificationResult}`);
  }
  if (payload.executablesDetected && payload.executableBlockImport) {
    blockReasons.push(`Executable files detected: ${payload.executableFiles.join(', ')}`);
  }
  if (payload.sensitivityBlockShare) {
    blockReasons.push('Sensitivity classification blocks sharing');
  }

  return {
    result: payload.verificationResult,
    importAllowed: isVerified && !payload.executableBlockImport,
    deleteAllowed: isVerified,
    shareAllowed: isVerified && !payload.sensitivityBlockShare,
    blockReason: blockReasons.join('; '),
    payload,
  };
}