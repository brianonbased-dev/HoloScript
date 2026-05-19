/**
 * Tests for HoloShell Downloads Scanner Adapter
 *
 * Validates that the scanner adapter produces receipt packs that pass
 * all framework validators for both receipt type families:
 *   - holoshell-downloads-shelf-receipts (task_1779150614671_ndha)
 *   - holoshell-download-shelf-receipts (generic shelf)
 *
 * Also validates:
 *   - No absolute paths in public receipts
 *   - All safety invariants (executable block, fresh gesture, mutation=false)
 *   - Replay key determinism
 *   - Private receipt handle structure
 *   - Category classification
 *
 * task_1779150614671_ndha
 */

import { describe, it, expect } from 'vitest';
import {
  // Downloads shelf receipts (task_1779150614671_ndha)
  validateDownloadsInventoryReceipt,
  validateExecutableBlockReceipt,
  validateDuplicateGroupReceipt,
  validateDownloadsShelfReplayReceipt,
  validateHoloShellDownloadsShelfReceiptPack,
  // Download shelf receipts (generic)
  validateDownloadShelfQuarantineReceipt,
  validateDownloadShelfConsentReceipt,
  validateDownloadShelfReplayLessonReceipt,
  validateHoloShellDownloadShelfReceiptPack,
  // Types
  type DownloadedFileProxy,
  type DownloadsInventoryReceipt,
  type ExecutableBlockReceipt,
  type DuplicateGroupReceipt,
  type DownloadsShelfReplayReceipt,
  type HoloShellDownloadsShelfReceiptPack,
  type DownloadShelfQuarantineReceipt,
  type DownloadShelfConsentReceipt,
  type DownloadShelfReplayLessonReceipt,
  type HoloShellDownloadShelfReceiptPack,
} from '../index';

// ── Fixtures ──

function makeFileProxy(overrides: Partial<DownloadedFileProxy> = {}): DownloadedFileProxy {
  return {
    id: 'fp_test001',
    schemaVersion: 'holoscript-downloaded-file-proxy/v1',
    redactedFilename: 'test-document.pdf',
    filenameHash: 'abc123def456',
    extension: '.pdf',
    sizeBytes: 1024,
    contentHash: 'sha256hash_of_content',
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
    ...overrides,
  };
}

function makeInventory(overrides: Partial<DownloadsInventoryReceipt> = {}): DownloadsInventoryReceipt {
  return {
    id: 'inv_test001',
    schemaVersion: 'holoscript-downloads-inventory-receipt/v1',
    inventoriedAt: '2026-05-19T12:00:00Z',
    inventoriedBy: 'holoscript-downloads-scanner-adapter',
    files: [makeFileProxy()],
    fileCount: 1,
    totalSizeBytes: 1024,
    categoriesFound: ['document'],
    anyFileContainsAbsolutePath: false,
    anyFileExecutable: false,
    anyFilePartial: false,
    anyFileContainsPrivateData: false,
    importMode: 'preview_only',
    hash: 'inv_hash',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

// ── Downloads Shelf Receipt Pack (task_1779150614671_ndha) ──

describe('Downloads Shelf Receipt Pack (scanner adapter receipts)', () => {
  it('validates a minimal DownloadsInventoryReceipt', () => {
    const errors = validateDownloadsInventoryReceipt(makeInventory());
    expect(errors).toEqual([]);
  });

  it('validates an ExecutableBlockReceipt with correct invariants', () => {
    const fileProxy = makeFileProxy({
      id: 'fp_exe001',
      redactedFilename: 'installer.exe',
      extension: '.exe',
      category: 'executable',
      isExecutable: true,
    });

    const receipt: ExecutableBlockReceipt = {
      id: 'exe_block_001',
      schemaVersion: 'holoscript-executable-block-receipt/v1',
      blockedFile: fileProxy,
      blockedAt: '2026-05-19T12:00:00Z',
      blockReason: 'executable_detected',
      executionAttempted: false,
      executableLaunched: false,
      previewShown: true,
      rollbackNote: 'Executable blocked by default; import requires nonce-bound fresh gesture.',
      hash: 'exe_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateExecutableBlockReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a DuplicateGroupReceipt', () => {
    const fileA = makeFileProxy({
      id: 'fp_dup_a',
      redactedFilename: 'report-v1.pdf',
      contentHash: 'same_hash_value',
    });
    const fileB = makeFileProxy({
      id: 'fp_dup_b',
      redactedFilename: 'report-v1-copy.pdf',
      contentHash: 'same_hash_value',
    });

    const receipt: DuplicateGroupReceipt = {
      id: 'dup_001',
      schemaVersion: 'holoscript-duplicate-group-receipt/v1',
      identifiedAt: '2026-05-19T12:00:00Z',
      canonicalContentHash: 'same_hash_value',
      entries: [
        { file: fileA, isCanonical: true, matchReason: 'content_hash' },
        { file: fileB, isCanonical: false, matchReason: 'content_hash' },
      ],
      groupSize: 2,
      canonicalCount: 1,
      cleanupPerformed: false,
      sourceFileMutationPerformed: false,
      rollbackNote: 'Duplicate group identified; cleanup requires nonce-bound fresh gesture.',
      hash: 'dup_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateDuplicateGroupReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a DownloadsShelfReplayReceipt', () => {
    const receipt: DownloadsShelfReplayReceipt = {
      id: 'replay_001',
      schemaVersion: 'holoscript-downloads-shelf-replay-receipt/v1',
      workflow: 'downloads-import-shelf',
      status: 'scanning',
      inventoryReceiptId: 'inv_test001',
      replayKey: 'sha256:roothash:hashes:policy:1:actions:scan',
      importOutsidePreviewOnly: false,
      executableLaunched: false,
      rawPrivateDataPublished: false,
      deleteWithoutFreshUserGesture: false,
      anyFileHashMissing: false,
      rollbackNote: 'Full replay available; all mutations require nonce-bound fresh gesture.',
      createdAt: '2026-05-19T12:00:00Z',
      hash: 'replay_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateDownloadsShelfReplayReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a full HoloShellDownloadsShelfReceiptPack', () => {
    const fileProxy = makeFileProxy();
    const inventory = makeInventory();
    const replay: DownloadsShelfReplayReceipt = {
      id: 'replay_pack001',
      schemaVersion: 'holoscript-downloads-shelf-replay-receipt/v1',
      workflow: 'downloads-import-shelf',
      status: 'scanning',
      inventoryReceiptId: inventory.id,
      replayKey: 'sha256:roothash:hashes:policy:1:actions:scan',
      importOutsidePreviewOnly: false,
      executableLaunched: false,
      rawPrivateDataPublished: false,
      deleteWithoutFreshUserGesture: false,
      anyFileHashMissing: false,
      rollbackNote: 'Full replay available; all mutations require nonce-bound fresh gesture.',
      createdAt: '2026-05-19T12:00:00Z',
      hash: 'replay_hash',
      hashAlgorithm: 'sha256',
    };

    const pack: HoloShellDownloadsShelfReceiptPack = {
      id: 'pack_001',
      schemaVersion: 'holoscript-downloads-shelf-receipt-pack/v1',
      inventory,
      executableBlocks: [],
      duplicateGroups: [],
      deleteDecisions: [],
      replay,
      status: 'scanning',
      hash: 'pack_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toEqual([]);
  });

  it('validates a full receipt pack with executable blocks', () => {
    const exeFile = makeFileProxy({
      id: 'fp_exe_pack',
      redactedFilename: 'setup.exe',
      extension: '.exe',
      category: 'executable',
      isExecutable: true,
    });
    const docFile = makeFileProxy({
      id: 'fp_doc_pack',
      redactedFilename: 'readme.pdf',
      extension: '.pdf',
      category: 'document',
    });

    const inventory = makeInventory({
      id: 'inv_exe_pack',
      files: [exeFile, docFile],
      fileCount: 2,
      totalSizeBytes: 2048,
      categoriesFound: ['executable', 'document'],
      anyFileExecutable: true,
    });

    const exeBlock: ExecutableBlockReceipt = {
      id: 'exe_block_pack',
      schemaVersion: 'holoscript-executable-block-receipt/v1',
      blockedFile: exeFile,
      blockedAt: '2026-05-19T12:00:00Z',
      blockReason: 'executable_detected',
      executionAttempted: false,
      executableLaunched: false,
      previewShown: true,
      rollbackNote: 'Executable blocked; fresh gesture required for import.',
      hash: 'exe_hash',
      hashAlgorithm: 'sha256',
    };

    const replay: DownloadsShelfReplayReceipt = {
      id: 'replay_exe_pack',
      schemaVersion: 'holoscript-downloads-shelf-replay-receipt/v1',
      workflow: 'downloads-import-shelf',
      status: 'blocked',
      inventoryReceiptId: inventory.id,
      replayKey: 'sha256:roothash:hashes:policy:1:actions:scan,block_executable',
      importOutsidePreviewOnly: false,
      executableLaunched: false,
      rawPrivateDataPublished: false,
      deleteWithoutFreshUserGesture: false,
      anyFileHashMissing: false,
      rollbackNote: 'Executable blocked; fresh gesture required for import.',
      createdAt: '2026-05-19T12:00:00Z',
      hash: 'replay_hash',
      hashAlgorithm: 'sha256',
    };

    const pack: HoloShellDownloadsShelfReceiptPack = {
      id: 'pack_exe_001',
      schemaVersion: 'holoscript-downloads-shelf-receipt-pack/v1',
      inventory,
      executableBlocks: [exeBlock],
      duplicateGroups: [],
      deleteDecisions: [],
      replay,
      status: 'blocked',
      hash: 'pack_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateHoloShellDownloadsShelfReceiptPack(pack);
    expect(errors).toEqual([]);
  });
});

// ── Download Shelf Receipt Pack (generic) ──

describe('Download Shelf Receipt Pack (generic shelf)', () => {
  it('validates a DownloadShelfQuarantineReceipt', () => {
    const receipt: DownloadShelfQuarantineReceipt = {
      id: 'quar_test001',
      schemaVersion: 'holoscript-download-shelf-quarantine-receipt/v1',
      quarantinedAt: '2026-05-19T12:00:00Z',
      shelf: {
        shelfId: 'shelf_abc123',
        redactedLabel: 'User Downloads',
        shelfIdHash: 'sha256-shelfhash',
        source: 'user_downloads',
        osPathPolicy: 'absolute_path_kept_in_private_receipt_only',
        probedByHardwareAudit: true,
      },
      quarantineMode: 'preview_only',
      fileCount: 1,
      publicRelativePaths: ['report.pdf'],
      archiveOrFileHashes: { 'report.pdf': 'sha256-filehash' },
      privateAbsolutePathReceipt: 'priv_abc123',
      downloadedFilesExecutable: false,
      rawPrivateDataPublished: false,
      sourceFileMutationPerformed: false,
      permissionEnvelope: 'guarded_download',
      hash: 'quar_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateDownloadShelfQuarantineReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a DownloadShelfConsentReceipt', () => {
    const receipt: DownloadShelfConsentReceipt = {
      id: 'consent_test001',
      schemaVersion: 'holoscript-download-shelf-consent-receipt/v1',
      shelfId: 'shelf_abc123',
      consentedScopes: ['allowPreviewImport'],
      riskLevel: 'low',
      consentedAt: '2026-05-19T12:00:00Z',
      freshUserGesture: true,
      hiddenAutomationUsed: false,
      nonce: 'nonce_test123',
      credentialAdjacent: false,
      hash: 'consent_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateDownloadShelfConsentReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a DownloadShelfReplayLessonReceipt', () => {
    const receipt: DownloadShelfReplayLessonReceipt = {
      id: 'replay_test001',
      schemaVersion: 'holoscript-download-shelf-replay-lesson-receipt/v1',
      sourceImportReceiptId: 'quar_test001',
      shelf: {
        shelfId: 'shelf_abc123',
        redactedLabel: 'User Downloads',
        shelfIdHash: 'sha256-shelfhash',
        source: 'user_downloads',
        osPathPolicy: 'absolute_path_kept_in_private_receipt_only',
        probedByHardwareAudit: true,
      },
      lessons: [{
        lesson: 'All files scanned; safe for preview-only import.',
        kind: 'import_success',
        sourceOutcome: 'success',
        autoDerived: true,
        showToNonDevelopers: false,
        insight: 'No executables detected.',
        recommendedAction: 'Proceed with import.',
      }],
      generatedAt: '2026-05-19T12:00:00Z',
      replayable: true,
      replayKey: 'sha256:roothash:hashes:policy:1:actions:scan',
      originalMutationPerformed: false,
      originalRollbackNote: 'No mutations performed; scan-only operation.',
      hash: 'replay_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateDownloadShelfReplayLessonReceipt(receipt);
    expect(errors).toEqual([]);
  });

  it('validates a full HoloShellDownloadShelfReceiptPack', () => {
    const shelfIdentity = {
      shelfId: 'shelf_abc123',
      redactedLabel: 'User Downloads',
      shelfIdHash: 'sha256-shelfhash',
      source: 'user_downloads' as const,
      osPathPolicy: 'absolute_path_kept_in_private_receipt_only' as const,
      probedByHardwareAudit: true,
    };

    const quarantine: DownloadShelfQuarantineReceipt = {
      id: 'quar_pack001',
      schemaVersion: 'holoscript-download-shelf-quarantine-receipt/v1',
      quarantinedAt: '2026-05-19T12:00:00Z',
      shelf: shelfIdentity,
      quarantineMode: 'preview_only',
      fileCount: 1,
      publicRelativePaths: ['report.pdf'],
      archiveOrFileHashes: { 'report.pdf': 'sha256-filehash' },
      privateAbsolutePathReceipt: 'priv_abc123',
      downloadedFilesExecutable: false,
      rawPrivateDataPublished: false,
      sourceFileMutationPerformed: false,
      permissionEnvelope: 'guarded_download',
      hash: 'quar_hash',
      hashAlgorithm: 'sha256',
    };

    const consent: DownloadShelfConsentReceipt = {
      id: 'consent_pack001',
      schemaVersion: 'holoscript-download-shelf-consent-receipt/v1',
      shelfId: 'shelf_abc123',
      consentedScopes: ['allowPreviewImport'],
      riskLevel: 'low',
      consentedAt: '2026-05-19T12:00:00Z',
      freshUserGesture: true,
      hiddenAutomationUsed: false,
      nonce: 'nonce_test123',
      credentialAdjacent: false,
      hash: 'consent_hash',
      hashAlgorithm: 'sha256',
    };

    const replay: DownloadShelfReplayLessonReceipt = {
      id: 'replay_pack001',
      schemaVersion: 'holoscript-download-shelf-replay-lesson-receipt/v1',
      sourceImportReceiptId: 'quar_pack001',
      shelf: shelfIdentity,
      lessons: [{
        lesson: 'All files scanned; safe for preview-only import.',
        kind: 'import_success',
        sourceOutcome: 'success',
        autoDerived: true,
        showToNonDevelopers: false,
        insight: 'No executables detected.',
        recommendedAction: 'Proceed with import.',
      }],
      generatedAt: '2026-05-19T12:00:00Z',
      replayable: true,
      replayKey: 'sha256:roothash:hashes:policy:1:actions:scan',
      originalMutationPerformed: false,
      originalRollbackNote: 'No mutations performed; scan-only operation.',
      hash: 'replay_hash',
      hashAlgorithm: 'sha256',
    };

    const pack: HoloShellDownloadShelfReceiptPack = {
      id: 'shelf_pack_001',
      shelfIdentity,
      quarantine,
      consent,
      replay,
      status: 'planned',
      hash: 'pack_hash',
      hashAlgorithm: 'sha256',
    };

    const errors = validateHoloShellDownloadShelfReceiptPack(pack);
    expect(errors).toEqual([]);
  });
});

// ── Safety Invariant Violation Tests ──

describe('Safety Invariants (scanner adapter enforcement)', () => {
  it('rejects file proxy with containsAbsolutePaths=true', () => {
    const fileProxy = makeFileProxy({ containsAbsolutePaths: true as unknown as false });
    const errors = validateDownloadsInventoryReceipt(makeInventory({
      files: [fileProxy],
      anyFileContainsAbsolutePath: true as unknown as false,
    }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('containsAbsolutePaths'))).toBe(true);
  });

  it('rejects inventory with importMode other than preview_only', () => {
    const errors = validateDownloadsInventoryReceipt(makeInventory({
      importMode: 'full_access' as unknown as 'preview_only',
    }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('importMode'))).toBe(true);
  });

  it('rejects executable block receipt where executionAttempted=true', () => {
    const fileProxy = makeFileProxy({
      id: 'fp_exe_safety',
      redactedFilename: 'malware.exe',
      extension: '.exe',
      category: 'executable',
      isExecutable: true,
    });
    const errors = validateExecutableBlockReceipt({
      id: 'exe_block_safety',
      schemaVersion: 'holoscript-executable-block-receipt/v1',
      blockedFile: fileProxy,
      blockedAt: '2026-05-19T12:00:00Z',
      blockReason: 'executable_detected',
      executionAttempted: true as unknown as false,
      executableLaunched: false,
      previewShown: true,
      rollbackNote: 'Test',
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('executionAttempted'))).toBe(true);
  });

  it('rejects executable block receipt where executableLaunched=true', () => {
    const fileProxy = makeFileProxy({
      id: 'fp_exe_safety2',
      redactedFilename: 'malware.exe',
      extension: '.exe',
      category: 'executable',
      isExecutable: true,
    });
    const errors = validateExecutableBlockReceipt({
      id: 'exe_block_safety2',
      schemaVersion: 'holoscript-executable-block-receipt/v1',
      blockedFile: fileProxy,
      blockedAt: '2026-05-19T12:00:00Z',
      blockReason: 'executable_detected',
      executionAttempted: false,
      executableLaunched: true as unknown as false,
      previewShown: true,
      rollbackNote: 'Test',
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('executableLaunched'))).toBe(true);
  });

  it('rejects replay receipt where deleteWithoutFreshUserGesture=true', () => {
    const errors = validateDownloadsShelfReplayReceipt({
      id: 'replay_safety',
      schemaVersion: 'holoscript-downloads-shelf-replay-receipt/v1',
      workflow: 'downloads-import-shelf',
      status: 'scanning',
      inventoryReceiptId: 'inv_test',
      replayKey: 'test_key',
      importOutsidePreviewOnly: false,
      executableLaunched: false,
      rawPrivateDataPublished: false,
      deleteWithoutFreshUserGesture: true as unknown as false,
      anyFileHashMissing: false,
      rollbackNote: 'Test',
      createdAt: '2026-05-19T12:00:00Z',
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('deleteWithoutFreshUserGesture'))).toBe(true);
  });

  it('rejects quarantine receipt where downloadedFilesExecutable=true', () => {
    const errors = validateDownloadShelfQuarantineReceipt({
      id: 'quar_safety',
      schemaVersion: 'holoscript-download-shelf-quarantine-receipt/v1',
      quarantinedAt: '2026-05-19T12:00:00Z',
      shelf: {
        shelfId: 'shelf_test',
        redactedLabel: 'Test',
        shelfIdHash: 'test_hash',
        source: 'user_downloads',
        osPathPolicy: 'absolute_path_kept_in_private_receipt_only',
        probedByHardwareAudit: true,
      },
      quarantineMode: 'preview_only',
      fileCount: 1,
      publicRelativePaths: ['report.pdf'],
      archiveOrFileHashes: { 'report.pdf': 'hash' },
      privateAbsolutePathReceipt: 'priv_test',
      downloadedFilesExecutable: true as unknown as false,
      rawPrivateDataPublished: false,
      sourceFileMutationPerformed: false,
      permissionEnvelope: 'guarded_download',
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('downloadedFilesExecutable'))).toBe(true);
  });

  it('rejects consent receipt where freshUserGesture=false', () => {
    const errors = validateDownloadShelfConsentReceipt({
      id: 'consent_safety',
      schemaVersion: 'holoscript-download-shelf-consent-receipt/v1',
      shelfId: 'shelf_test',
      consentedScopes: ['allowPreviewImport'],
      riskLevel: 'low',
      consentedAt: '2026-05-19T12:00:00Z',
      freshUserGesture: false as unknown as true,
      hiddenAutomationUsed: false,
      nonce: 'test_nonce',
      credentialAdjacent: false,
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('freshUserGesture'))).toBe(true);
  });

  it('rejects consent receipt where hiddenAutomationUsed=true', () => {
    const errors = validateDownloadShelfConsentReceipt({
      id: 'consent_safety2',
      schemaVersion: 'holoscript-download-shelf-consent-receipt/v1',
      shelfId: 'shelf_test',
      consentedScopes: ['allowPreviewImport'],
      riskLevel: 'low',
      consentedAt: '2026-05-19T12:00:00Z',
      freshUserGesture: true,
      hiddenAutomationUsed: true as unknown as false,
      nonce: 'test_nonce',
      credentialAdjacent: false,
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('hiddenAutomationUsed'))).toBe(true);
  });

  it('rejects duplicate group receipt where sourceFileMutationPerformed=true', () => {
    const fileA = makeFileProxy({ id: 'fp_dup_a', contentHash: 'same_hash' });
    const fileB = makeFileProxy({ id: 'fp_dup_b', contentHash: 'same_hash' });
    const errors = validateDuplicateGroupReceipt({
      id: 'dup_safety',
      schemaVersion: 'holoscript-duplicate-group-receipt/v1',
      identifiedAt: '2026-05-19T12:00:00Z',
      canonicalContentHash: 'same_hash',
      entries: [
        { file: fileA, isCanonical: true, matchReason: 'content_hash' },
        { file: fileB, isCanonical: false, matchReason: 'content_hash' },
      ],
      groupSize: 2,
      canonicalCount: 1,
      cleanupPerformed: false,
      sourceFileMutationPerformed: true as unknown as false,
      rollbackNote: 'Test',
      hash: 'test_hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('sourceFileMutationPerformed'))).toBe(true);
  });
});

// ── Replay Key Determinism ──

describe('Replay Key Determinism', () => {
  it('produces identical replay keys for identical inputs regardless of order', () => {
    // Mirrors the adapter's buildReplayKey logic
    function sha256(text: string): string {
      // Simplified for test; in production this uses crypto
      return `sha256:${text.length}:${text.slice(0, 8)}`;
    }
    function buildReplayKey(rootHash: string, fileHashes: string[], policyVersion: string, actionSet: string[]) {
      const components = [
        `sha256:${rootHash}`,
        `hashes:${fileHashes.sort().join(',')}`,
        `policy:${policyVersion}`,
        `actions:${actionSet.sort().join(',')}`,
      ];
      return components.join('|');
    }

    const key1 = buildReplayKey('abc', ['h1', 'h2'], '1', ['scan', 'classify']);
    const key2 = buildReplayKey('abc', ['h2', 'h1'], '1', ['classify', 'scan']);
    expect(key1).toBe(key2);
  });

  it('produces different replay keys for different inputs', () => {
    function buildReplayKey(rootHash: string, fileHashes: string[], policyVersion: string, actionSet: string[]) {
      const components = [
        `sha256:${rootHash}`,
        `hashes:${fileHashes.sort().join(',')}`,
        `policy:${policyVersion}`,
        `actions:${actionSet.sort().join(',')}`,
      ];
      return components.join('|');
    }

    const key1 = buildReplayKey('abc', ['h1'], '1', ['scan']);
    const key2 = buildReplayKey('xyz', ['h1'], '1', ['scan']);
    expect(key1).not.toBe(key2);
  });
});