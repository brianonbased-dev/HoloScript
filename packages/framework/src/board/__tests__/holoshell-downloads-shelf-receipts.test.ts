/**
 * Tests for HoloShell Downloads Shelf Receipts
 *
 * task_1779150614671_37ao
 */

import { describe, it, expect } from 'vitest';
import {
  DOWNLOAD_SOURCES,
  DOWNLOAD_CATEGORIES,
  QUARANTINE_STATUSES,
  DELETE_DECISION_REASONS,
  DOWNLOADS_SHELF_WARNING_KINDS,
  DOWNLOADS_SHELF_WARNING_SEVERITIES,
  DOWNLOADS_SHELF_STATUSES,
  DOWNLOADED_FILE_PROXY_VERSION,
  DOWNLOADS_INVENTORY_RECEIPT_VERSION,
  ARCHIVE_QUARANTINE_RECEIPT_VERSION,
  EXECUTABLE_BLOCK_RECEIPT_VERSION,
  DUPLICATE_GROUP_RECEIPT_VERSION,
  SAFE_PREVIEW_RECEIPT_VERSION,
  DELETE_DECISION_RECEIPT_VERSION,
  DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION,
  DOWNLOADS_SHELF_RECEIPT_PACK_VERSION,
  isSupportedDownloadSource,
  isSupportedDownloadCategory,
  isSupportedQuarantineStatus,
  isSupportedDeleteDecisionReason,
  isSupportedDownloadsShelfWarningKind,
  isSupportedDownloadsShelfWarningSeverity,
  isSupportedDownloadsShelfStatus,
  validateDownloadedFileProxy,
  validateDownloadsInventoryReceipt,
  validateArchiveQuarantineReceipt,
  validateExecutableBlockReceipt,
  validateDuplicateGroupReceipt,
  validateSafePreviewReceipt,
  validateDeleteDecisionReceipt,
  validateDownloadsShelfReplayReceipt,
  validateHoloShellDownloadsShelfReceiptPack,
  cloneDownloadedFileProxy,
  cloneDownloadsInventoryReceipt,
  cloneArchiveQuarantineReceipt,
  cloneExecutableBlockReceipt,
  cloneDuplicateGroupEntry,
  cloneDuplicateGroupReceipt,
  cloneSafePreviewReceipt,
  cloneDeleteDecisionReceipt,
  cloneDownloadsShelfReplayReceipt,
  cloneHoloShellDownloadsShelfReceiptPack,
  type DownloadedFileProxy,
  type DownloadsInventoryReceipt,
  type ArchiveQuarantineReceipt,
  type ExecutableBlockReceipt,
  type DuplicateGroupReceipt,
  type SafePreviewReceipt,
  type DeleteDecisionReceipt,
  type DownloadsShelfReplayReceipt,
  type HoloShellDownloadsShelfReceiptPack,
} from '../holoshell-downloads-shelf-receipts';

// ── Fixtures ──

const validFileProxy: DownloadedFileProxy = {
  id: 'fp_001',
  schemaVersion: DOWNLOADED_FILE_PROXY_VERSION,
  redactedFilename: 'report-2026.pdf',
  filenameHash: 'abc123def456',
  extension: '.pdf',
  sizeBytes: 1024000,
  contentHash: 'sha256contenthash',
  contentHashAlgorithm: 'sha256',
  source: 'browser',
  category: 'document',
  downloadedAt: '2026-05-19T12:00:00Z',
  containsAbsolutePaths: false,
  scannedForSecurity: true,
  isExecutable: false,
  isPartial: false,
  containsPrivateData: false,
  rawPublishAllowed: false,
  permissionEnvelope: 'preview_only',
};

const validInventoryReceipt: DownloadsInventoryReceipt = {
  id: 'inv_001',
  schemaVersion: DOWNLOADS_INVENTORY_RECEIPT_VERSION,
  inventoriedAt: '2026-05-19T12:00:00Z',
  inventoriedBy: 'holoscript-downloads-shelf',
  files: [validFileProxy],
  fileCount: 1,
  totalSizeBytes: 1024000,
  categoriesFound: ['document'],
  anyFileContainsAbsolutePath: false,
  anyFileExecutable: false,
  anyFilePartial: false,
  anyFileContainsPrivateData: false,
  importMode: 'preview_only',
  hash: 'inv_hash',
  hashAlgorithm: 'sha256',
};

const validQuarantineReceipt: ArchiveQuarantineReceipt = {
  id: 'q_001',
  schemaVersion: ARCHIVE_QUARANTINE_RECEIPT_VERSION,
  inventoryReceiptId: 'inv_001',
  quarantinedAt: '2026-05-19T12:01:00Z',
  totalFileCount: 1,
  scannedFileCount: 1,
  status: 'clean',
  executableCount: 0,
  anyExecutableLaunched: false,
  sensitiveFileCount: 0,
  rawPrivateDataPublished: false,
  warnings: [],
  hash: 'q_hash',
  hashAlgorithm: 'sha256',
};

const validExecutableBlockReceipt: ExecutableBlockReceipt = {
  id: 'eb_001',
  schemaVersion: EXECUTABLE_BLOCK_RECEIPT_VERSION,
  blockedFile: { ...validFileProxy, id: 'fp_exe', isExecutable: true, category: 'executable' },
  blockedAt: '2026-05-19T12:01:00Z',
  blockReason: 'executable_detected',
  executionAttempted: false,
  executableLaunched: false,
  previewShown: true,
  rollbackNote: 'Executable blocked; preview-only view provided.',
  hash: 'eb_hash',
  hashAlgorithm: 'sha256',
};

const validDuplicateGroupReceipt: DuplicateGroupReceipt = {
  id: 'dg_001',
  schemaVersion: DUPLICATE_GROUP_RECEIPT_VERSION,
  identifiedAt: '2026-05-19T12:02:00Z',
  canonicalContentHash: 'sha256contenthash',
  entries: [
    { file: validFileProxy, isCanonical: true, matchReason: 'content_hash' },
    { file: { ...validFileProxy, id: 'fp_002', redactedFilename: 'report-2026-copy.pdf' }, isCanonical: false, matchReason: 'content_hash' },
  ],
  groupSize: 2,
  canonicalCount: 1,
  cleanupPerformed: false,
  sourceFileMutationPerformed: false,
  rollbackNote: 'Duplicate files preserved; no cleanup performed.',
  hash: 'dg_hash',
  hashAlgorithm: 'sha256',
};

const validSafePreviewReceipt: SafePreviewReceipt = {
  id: 'sp_001',
  schemaVersion: SAFE_PREVIEW_RECEIPT_VERSION,
  file: validFileProxy,
  previewedAt: '2026-05-19T12:02:00Z',
  previewContainsAbsolutePaths: false,
  previewContainsRawPrivateData: false,
  importMode: 'preview_only',
  partialDownloadMarkedSafe: false,
  allFileHashesPresent: true,
  sourceFileModificationAllowed: false,
  redactedPreviewPath: 'downloads/report-2026.pdf',
  previewContentHash: 'preview_hash',
  hash: 'sp_hash',
  hashAlgorithm: 'sha256',
};

const validDeleteDecisionReceipt: DeleteDecisionReceipt = {
  id: 'dd_001',
  schemaVersion: DELETE_DECISION_RECEIPT_VERSION,
  file: validFileProxy,
  decidedAt: '2026-05-19T12:03:00Z',
  reason: 'user_explicit',
  requiresFreshUserGesture: true,
  freshUserGestureReceived: true,
  deleteWithoutFreshUserGesture: false,
  sourceFileMutationPerformed: false,
  recoverable: true,
  rollbackNote: 'File moved to trash; recoverable within 30 days.',
  hash: 'dd_hash',
  hashAlgorithm: 'sha256',
};

const validReplayReceipt: DownloadsShelfReplayReceipt = {
  id: 'rpl_001',
  schemaVersion: DOWNLOADS_SHELF_REPLAY_RECEIPT_VERSION,
  workflow: 'downloads-import-shelf',
  status: 'completed',
  inventoryReceiptId: 'inv_001',
  quarantineReceiptId: 'q_001',
  previewReceiptId: 'sp_001',
  replayKey: 'replay_key_001',
  importOutsidePreviewOnly: false,
  executableLaunched: false,
  rawPrivateDataPublished: false,
  deleteWithoutFreshUserGesture: false,
  anyFileHashMissing: false,
  rollbackNote: 'Import can be reversed by removing the preview directory.',
  createdAt: '2026-05-19T12:04:00Z',
  hash: 'rpl_hash',
  hashAlgorithm: 'sha256',
};

const validReceiptPack: HoloShellDownloadsShelfReceiptPack = {
  id: 'pack_001',
  schemaVersion: DOWNLOADS_SHELF_RECEIPT_PACK_VERSION,
  inventory: validInventoryReceipt,
  quarantine: validQuarantineReceipt,
  executableBlocks: [],
  duplicateGroups: [],
  preview: validSafePreviewReceipt,
  deleteDecisions: [],
  replay: validReplayReceipt,
  status: 'completed',
  hash: 'pack_hash',
  hashAlgorithm: 'sha256',
};

// ── Constant exhaustive tests ──

describe('Downloads Shelf constants', () => {
  it('DOWNLOAD_SOURCES covers all expected values', () => {
    expect(DOWNLOAD_SOURCES).toContain('browser');
    expect(DOWNLOAD_SOURCES).toContain('email_attachment');
    expect(DOWNLOAD_SOURCES).toContain('cloud_sync');
    expect(DOWNLOAD_SOURCES).toContain('p2p_transfer');
    expect(DOWNLOAD_SOURCES).toContain('local_copy');
    expect(DOWNLOAD_SOURCES).toContain('other');
  });

  it('DOWNLOAD_CATEGORIES covers all expected values', () => {
    expect(DOWNLOAD_CATEGORIES).toContain('document');
    expect(DOWNLOAD_CATEGORIES).toContain('archive');
    expect(DOWNLOAD_CATEGORIES).toContain('executable');
    expect(DOWNLOAD_CATEGORIES).toContain('code');
  });

  it('QUARANTINE_STATUSES covers all expected values', () => {
    expect(QUARANTINE_STATUSES).toContain('clean');
    expect(QUARANTINE_STATUSES).toContain('blocked');
    expect(QUARANTINE_STATUSES).toContain('malicious');
  });

  it('DELETE_DECISION_REASONS covers all expected values', () => {
    expect(DELETE_DECISION_REASONS).toContain('user_explicit');
    expect(DELETE_DECISION_REASONS).toContain('user_fresh_gesture');
    expect(DELETE_DECISION_REASONS).toContain('security_risk');
  });

  it('DOWNLOADS_SHELF_WARNING_KINDS covers security-critical values', () => {
    expect(DOWNLOADS_SHELF_WARNING_KINDS).toContain('executable_detected');
    expect(DOWNLOADS_SHELF_WARNING_KINDS).toContain('path_leakage');
    expect(DOWNLOADS_SHELF_WARNING_KINDS).toContain('partial_download');
    expect(DOWNLOADS_SHELF_WARNING_KINDS).toContain('hash_mismatch');
    expect(DOWNLOADS_SHELF_WARNING_KINDS).toContain('import_not_preview_only');
  });
});

// ── Type guard tests ──

describe('Downloads Shelf type guards', () => {
  it('isSupportedDownloadSource validates correctly', () => {
    expect(isSupportedDownloadSource('browser')).toBe(true);
    expect(isSupportedDownloadSource('ftp')).toBe(false);
  });

  it('isSupportedDownloadCategory validates correctly', () => {
    expect(isSupportedDownloadCategory('document')).toBe(true);
    expect(isSupportedDownloadCategory('malware')).toBe(false);
  });

  it('isSupportedQuarantineStatus validates correctly', () => {
    expect(isSupportedQuarantineStatus('clean')).toBe(true);
    expect(isSupportedQuarantineStatus('unknown_status')).toBe(false);
  });

  it('isSupportedDeleteDecisionReason validates correctly', () => {
    expect(isSupportedDeleteDecisionReason('user_explicit')).toBe(true);
    expect(isSupportedDeleteDecisionReason('arbitrary')).toBe(false);
  });

  it('isSupportedDownloadsShelfStatus validates correctly', () => {
    expect(isSupportedDownloadsShelfStatus('completed')).toBe(true);
    expect(isSupportedDownloadsShelfStatus('unknown')).toBe(false);
  });
});

// ── DownloadedFileProxy validation ──

describe('validateDownloadedFileProxy', () => {
  it('accepts a valid file proxy', () => {
    expect(validateDownloadedFileProxy(validFileProxy)).toEqual([]);
  });

  it('rejects missing id', () => {
    const proxy = { ...validFileProxy, id: '' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors).toContain('DownloadedFileProxy.id is required.');
  });

  it('rejects wrong schemaVersion', () => {
    const proxy = { ...validFileProxy, schemaVersion: 'wrong-version' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors.some((e) => e.includes('schemaVersion must be'))).toBe(true);
  });

  it('rejects missing filenameHash', () => {
    const proxy = { ...validFileProxy, filenameHash: '' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors).toContain('DownloadedFileProxy.filenameHash is required.');
  });

  it('rejects containsAbsolutePaths=true (path leakage)', () => {
    const proxy = { ...validFileProxy, containsAbsolutePaths: true as unknown as false };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors).toContain('DownloadedFileProxy.containsAbsolutePaths must be false.');
  });

  it('rejects rawPublishAllowed=true (raw private data publication)', () => {
    const proxy = { ...validFileProxy, rawPublishAllowed: true as unknown as false };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors).toContain('DownloadedFileProxy.rawPublishAllowed must be false.');
  });

  it('rejects permissionEnvelope other than preview_only (import mode)', () => {
    const proxy = { ...validFileProxy, permissionEnvelope: 'full_access' as unknown as 'preview_only' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors).toContain('DownloadedFileProxy.permissionEnvelope must be preview_only.');
  });

  it('rejects unsupported source', () => {
    const proxy = { ...validFileProxy, source: 'ftp' as unknown as 'browser' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors.some((e) => e.includes('source is unsupported'))).toBe(true);
  });

  it('rejects unsupported category', () => {
    const proxy = { ...validFileProxy, category: 'malware' as unknown as 'document' };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors.some((e) => e.includes('category is unsupported'))).toBe(true);
  });

  it('rejects negative sizeBytes', () => {
    const proxy = { ...validFileProxy, sizeBytes: -1 };
    const errors = validateDownloadedFileProxy(proxy);
    expect(errors.some((e) => e.includes('sizeBytes must be a non-negative integer'))).toBe(true);
  });
});

// ── DownloadsInventoryReceipt validation ──

describe('validateDownloadsInventoryReceipt', () => {
  it('accepts a valid inventory receipt', () => {
    expect(validateDownloadsInventoryReceipt(validInventoryReceipt)).toEqual([]);
  });

  it('rejects missing id', () => {
    const receipt = { ...validInventoryReceipt, id: '' };
    expect(validateDownloadsInventoryReceipt(receipt)).toContain('DownloadsInventoryReceipt.id is required.');
  });

  it('rejects anyFileContainsAbsolutePath=true (path leakage)', () => {
    const receipt = { ...validInventoryReceipt, anyFileContainsAbsolutePath: true as unknown as false };
    const errors = validateDownloadsInventoryReceipt(receipt);
    expect(errors).toContain('DownloadsInventoryReceipt.anyFileContainsAbsolutePath must be false.');
  });

  it('rejects importMode other than preview_only', () => {
    const receipt = { ...validInventoryReceipt, importMode: 'full_access' as unknown as 'preview_only' };
    const errors = validateDownloadsInventoryReceipt(receipt);
    expect(errors).toContain('DownloadsInventoryReceipt.importMode must be preview_only.');
  });

  it('rejects fileCount mismatch', () => {
    const receipt = { ...validInventoryReceipt, fileCount: 5 };
    const errors = validateDownloadsInventoryReceipt(receipt);
    expect(errors).toContain('DownloadsInventoryReceipt.fileCount must match files array length.');
  });

  it('rejects empty files array', () => {
    const receipt = { ...validInventoryReceipt, files: [], fileCount: 0, totalSizeBytes: 0, categoriesFound: [] };
    const errors = validateDownloadsInventoryReceipt(receipt);
    expect(errors.some((e) => e.includes('must include at least one file'))).toBe(true);
  });
});

// ── ArchiveQuarantineReceipt validation ──

describe('validateArchiveQuarantineReceipt', () => {
  it('accepts a valid quarantine receipt', () => {
    expect(validateArchiveQuarantineReceipt(validQuarantineReceipt)).toEqual([]);
  });

  it('rejects anyExecutableLaunched=true (executable launch)', () => {
    const receipt = { ...validQuarantineReceipt, anyExecutableLaunched: true as unknown as false };
    const errors = validateArchiveQuarantineReceipt(receipt);
    expect(errors).toContain('ArchiveQuarantineReceipt.anyExecutableLaunched must be false.');
  });

  it('rejects rawPrivateDataPublished=true (raw private data publication)', () => {
    const receipt = { ...validQuarantineReceipt, rawPrivateDataPublished: true as unknown as false };
    const errors = validateArchiveQuarantineReceipt(receipt);
    expect(errors).toContain('ArchiveQuarantineReceipt.rawPrivateDataPublished must be false.');
  });

  it('rejects scannedFileCount > totalFileCount', () => {
    const receipt = { ...validQuarantineReceipt, scannedFileCount: 5, totalFileCount: 3 };
    const errors = validateArchiveQuarantineReceipt(receipt);
    expect(errors).toContain('ArchiveQuarantineReceipt.scannedFileCount must be <= totalFileCount.');
  });
});

// ── ExecutableBlockReceipt validation ──

describe('validateExecutableBlockReceipt', () => {
  it('accepts a valid executable block receipt', () => {
    expect(validateExecutableBlockReceipt(validExecutableBlockReceipt)).toEqual([]);
  });

  it('rejects executionAttempted=true', () => {
    const receipt = { ...validExecutableBlockReceipt, executionAttempted: true as unknown as false };
    const errors = validateExecutableBlockReceipt(receipt);
    expect(errors).toContain('ExecutableBlockReceipt.executionAttempted must be false.');
  });

  it('rejects executableLaunched=true (executable launch)', () => {
    const receipt = { ...validExecutableBlockReceipt, executableLaunched: true as unknown as false };
    const errors = validateExecutableBlockReceipt(receipt);
    expect(errors).toContain('ExecutableBlockReceipt.executableLaunched must be false.');
  });

  it('rejects unsupported blockReason', () => {
    const receipt = { ...validExecutableBlockReceipt, blockReason: 'whim' as unknown as 'executable_detected' };
    const errors = validateExecutableBlockReceipt(receipt);
    expect(errors.some((e) => e.includes('blockReason is unsupported'))).toBe(true);
  });
});

// ── DuplicateGroupReceipt validation ──

describe('validateDuplicateGroupReceipt', () => {
  it('accepts a valid duplicate group receipt', () => {
    expect(validateDuplicateGroupReceipt(validDuplicateGroupReceipt)).toEqual([]);
  });

  it('rejects group with < 2 entries', () => {
    const receipt = { ...validDuplicateGroupReceipt, entries: [validDuplicateGroupReceipt.entries[0]], groupSize: 1 };
    const errors = validateDuplicateGroupReceipt(receipt);
    expect(errors.some((e) => e.includes('must include at least 2 entries'))).toBe(true);
  });

  it('rejects canonicalCount !== 1', () => {
    const receipt = { ...validDuplicateGroupReceipt, canonicalCount: 2 as unknown as 1 };
    const errors = validateDuplicateGroupReceipt(receipt);
    expect(errors).toContain('DuplicateGroupReceipt.canonicalCount must be 1.');
  });

  it('rejects sourceFileMutationPerformed=true', () => {
    const receipt = { ...validDuplicateGroupReceipt, sourceFileMutationPerformed: true as unknown as false };
    const errors = validateDuplicateGroupReceipt(receipt);
    expect(errors).toContain('DuplicateGroupReceipt.sourceFileMutationPerformed must be false.');
  });

  it('rejects groupSize mismatch', () => {
    const receipt = { ...validDuplicateGroupReceipt, groupSize: 5 };
    const errors = validateDuplicateGroupReceipt(receipt);
    expect(errors).toContain('DuplicateGroupReceipt.groupSize must match entries array length.');
  });
});

// ── SafePreviewReceipt validation ──

describe('validateSafePreviewReceipt', () => {
  it('accepts a valid safe preview receipt', () => {
    expect(validateSafePreviewReceipt(validSafePreviewReceipt)).toEqual([]);
  });

  it('rejects previewContainsAbsolutePaths=true (path leakage)', () => {
    const receipt = { ...validSafePreviewReceipt, previewContainsAbsolutePaths: true as unknown as false };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors).toContain('SafePreviewReceipt.previewContainsAbsolutePaths must be false.');
  });

  it('rejects previewContainsRawPrivateData=true (raw private data publication)', () => {
    const receipt = { ...validSafePreviewReceipt, previewContainsRawPrivateData: true as unknown as false };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors).toContain('SafePreviewReceipt.previewContainsRawPrivateData must be false.');
  });

  it('rejects importMode other than preview_only', () => {
    const receipt = { ...validSafePreviewReceipt, importMode: 'full_access' as unknown as 'preview_only' };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors).toContain('SafePreviewReceipt.importMode must be preview_only.');
  });

  it('rejects partialDownloadMarkedSafe=true (partial downloads marked safe)', () => {
    const receipt = { ...validSafePreviewReceipt, partialDownloadMarkedSafe: true as unknown as false };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors).toContain('SafePreviewReceipt.partialDownloadMarkedSafe must be false.');
  });

  it('rejects sourceFileModificationAllowed=true', () => {
    const receipt = { ...validSafePreviewReceipt, sourceFileModificationAllowed: true as unknown as false };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors).toContain('SafePreviewReceipt.sourceFileModificationAllowed must be false.');
  });

  it('rejects absolute path in redactedPreviewPath', () => {
    const receipt = { ...validSafePreviewReceipt, redactedPreviewPath: 'C:\\Users\\secret\\file.pdf' };
    const errors = validateSafePreviewReceipt(receipt);
    expect(errors.some((e) => e.includes('must be redacted or repo-relative'))).toBe(true);
  });
});

// ── DeleteDecisionReceipt validation ──

describe('validateDeleteDecisionReceipt', () => {
  it('accepts a valid delete decision receipt', () => {
    expect(validateDeleteDecisionReceipt(validDeleteDecisionReceipt)).toEqual([]);
  });

  it('rejects requiresFreshUserGesture=false (delete without fresh user gesture)', () => {
    const receipt = { ...validDeleteDecisionReceipt, requiresFreshUserGesture: false as unknown as true };
    const errors = validateDeleteDecisionReceipt(receipt);
    expect(errors).toContain('DeleteDecisionReceipt.requiresFreshUserGesture must be true.');
  });

  it('rejects freshUserGestureReceived=false (delete without fresh user gesture)', () => {
    const receipt = { ...validDeleteDecisionReceipt, freshUserGestureReceived: false as unknown as true };
    const errors = validateDeleteDecisionReceipt(receipt);
    expect(errors).toContain('DeleteDecisionReceipt.freshUserGestureReceived must be true.');
  });

  it('rejects deleteWithoutFreshUserGesture=true (delete without fresh user gesture)', () => {
    const receipt = { ...validDeleteDecisionReceipt, deleteWithoutFreshUserGesture: true as unknown as false };
    const errors = validateDeleteDecisionReceipt(receipt);
    expect(errors).toContain('DeleteDecisionReceipt.deleteWithoutFreshUserGesture must be false.');
  });

  it('rejects sourceFileMutationPerformed=true', () => {
    const receipt = { ...validDeleteDecisionReceipt, sourceFileMutationPerformed: true as unknown as false };
    const errors = validateDeleteDecisionReceipt(receipt);
    expect(errors).toContain('DeleteDecisionReceipt.sourceFileMutationPerformed must be false.');
  });

  it('rejects unsupported reason', () => {
    const receipt = { ...validDeleteDecisionReceipt, reason: 'arbitrary' as unknown as 'user_explicit' };
    const errors = validateDeleteDecisionReceipt(receipt);
    expect(errors.some((e) => e.includes('reason is unsupported'))).toBe(true);
  });
});

// ── DownloadsShelfReplayReceipt validation ──

describe('validateDownloadsShelfReplayReceipt', () => {
  it('accepts a valid replay receipt', () => {
    expect(validateDownloadsShelfReplayReceipt(validReplayReceipt)).toEqual([]);
  });

  it('rejects importOutsidePreviewOnly=true (imports outside preview-only mode)', () => {
    const receipt = { ...validReplayReceipt, importOutsidePreviewOnly: true as unknown as false };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.importOutsidePreviewOnly must be false.');
  });

  it('rejects executableLaunched=true', () => {
    const receipt = { ...validReplayReceipt, executableLaunched: true as unknown as false };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.executableLaunched must be false.');
  });

  it('rejects rawPrivateDataPublished=true', () => {
    const receipt = { ...validReplayReceipt, rawPrivateDataPublished: true as unknown as false };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.rawPrivateDataPublished must be false.');
  });

  it('rejects deleteWithoutFreshUserGesture=true', () => {
    const receipt = { ...validReplayReceipt, deleteWithoutFreshUserGesture: true as unknown as false };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.deleteWithoutFreshUserGesture must be false.');
  });

  it('rejects anyFileHashMissing=true (missing file hashes)', () => {
    const receipt = { ...validReplayReceipt, anyFileHashMissing: true as unknown as false };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.anyFileHashMissing must be false.');
  });

  it('rejects wrong workflow', () => {
    const receipt = { ...validReplayReceipt, workflow: 'wrong-workflow' as unknown as 'downloads-import-shelf' };
    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toContain('DownloadsShelfReplayReceipt.workflow must be downloads-import-shelf.');
  });
});

// ── HoloShellDownloadsShelfReceiptPack validation ──

describe('validateHoloShellDownloadsShelfReceiptPack', () => {
  it('accepts a valid receipt pack', () => {
    expect(validateHoloShellDownloadsShelfReceiptPack(validReceiptPack)).toEqual([]);
  });

  it('rejects missing id', () => {
    const pack = { ...validReceiptPack, id: '' };
    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toContain('HoloShellDownloadsShelfReceiptPack.id is required.');
  });

  it('rejects missing inventory', () => {
    const pack = { ...validReceiptPack, inventory: undefined as unknown as DownloadsInventoryReceipt };
    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toContain('HoloShellDownloadsShelfReceiptPack.inventory is required.');
  });

  it('rejects missing replay', () => {
    const pack = { ...validReceiptPack, replay: undefined as unknown as DownloadsShelfReplayReceipt };
    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toContain('HoloShellDownloadsShelfReceiptPack.replay is required.');
  });

  it('requires preview when status=completed', () => {
    const pack = { ...validReceiptPack, preview: undefined, status: 'completed' as const };
    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toContain('HoloShellDownloadsShelfReceiptPack.preview is required when status=completed.');
  });

  it('validates executable blocks within pack', () => {
    const pack = { ...validReceiptPack, executableBlocks: [validExecutableBlockReceipt] };
    expect(validateHoloShellDownloadsShelfReceiptPack(pack)).toEqual([]);
  });

  it('validates duplicate groups within pack', () => {
    const pack = { ...validReceiptPack, duplicateGroups: [validDuplicateGroupReceipt] };
    expect(validateHoloShellDownloadsShelfReceiptPack(pack)).toEqual([]);
  });

  it('validates delete decisions within pack', () => {
    const pack = { ...validReceiptPack, deleteDecisions: [validDeleteDecisionReceipt] };
    expect(validateHoloShellDownloadsShelfReceiptPack(pack)).toEqual([]);
  });
});

// ── Clone helper tests ──

describe('Clone helpers', () => {
  it('cloneDownloadedFileProxy returns a shallow copy', () => {
    const clone = cloneDownloadedFileProxy(validFileProxy);
    expect(clone).toEqual(validFileProxy);
    expect(clone).not.toBe(validFileProxy);
  });

  it('cloneDownloadsInventoryReceipt deep-copies arrays', () => {
    const clone = cloneDownloadsInventoryReceipt(validInventoryReceipt);
    expect(clone).toEqual(validInventoryReceipt);
    expect(clone.files).not.toBe(validInventoryReceipt.files);
    expect(clone.categoriesFound).not.toBe(validInventoryReceipt.categoriesFound);
  });

  it('cloneArchiveQuarantineReceipt deep-copies warnings', () => {
    const clone = cloneArchiveQuarantineReceipt(validQuarantineReceipt);
    expect(clone).toEqual(validQuarantineReceipt);
    expect(clone.warnings).not.toBe(validQuarantineReceipt.warnings);
  });

  it('cloneExecutableBlockReceipt deep-copies blockedFile', () => {
    const clone = cloneExecutableBlockReceipt(validExecutableBlockReceipt);
    expect(clone).toEqual(validExecutableBlockReceipt);
    expect(clone.blockedFile).not.toBe(validExecutableBlockReceipt.blockedFile);
  });

  it('cloneDuplicateGroupReceipt deep-copies entries', () => {
    const clone = cloneDuplicateGroupReceipt(validDuplicateGroupReceipt);
    expect(clone).toEqual(validDuplicateGroupReceipt);
    expect(clone.entries).not.toBe(validDuplicateGroupReceipt.entries);
    expect(clone.entries[0].file).not.toBe(validDuplicateGroupReceipt.entries[0].file);
  });

  it('cloneSafePreviewReceipt deep-copies file', () => {
    const clone = cloneSafePreviewReceipt(validSafePreviewReceipt);
    expect(clone).toEqual(validSafePreviewReceipt);
    expect(clone.file).not.toBe(validSafePreviewReceipt.file);
  });

  it('cloneDeleteDecisionReceipt deep-copies file', () => {
    const clone = cloneDeleteDecisionReceipt(validDeleteDecisionReceipt);
    expect(clone).toEqual(validDeleteDecisionReceipt);
    expect(clone.file).not.toBe(validDeleteDecisionReceipt.file);
  });

  it('cloneDownloadsShelfReplayReceipt returns a shallow copy', () => {
    const clone = cloneDownloadsShelfReplayReceipt(validReplayReceipt);
    expect(clone).toEqual(validReplayReceipt);
    expect(clone).not.toBe(validReplayReceipt);
  });

  it('cloneHoloShellDownloadsShelfReceiptPack deep-copies all sub-receipts', () => {
    const clone = cloneHoloShellDownloadsShelfReceiptPack(validReceiptPack);
    expect(clone).toEqual(validReceiptPack);
    expect(clone.inventory).not.toBe(validReceiptPack.inventory);
    expect(clone.executableBlocks).not.toBe(validReceiptPack.executableBlocks);
    expect(clone.duplicateGroups).not.toBe(validReceiptPack.duplicateGroups);
    expect(clone.deleteDecisions).not.toBe(validReceiptPack.deleteDecisions);
    expect(clone.replay).not.toBe(validReceiptPack.replay);
  });
});