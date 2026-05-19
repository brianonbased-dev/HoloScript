/**
 * Tests for HoloShell Download / Import Shelf Receipts
 *
 * Solid coverage for the generic DownloadShelfReceipt/ImportShelfReceipt family:
 * identity, quarantine, consent, result, replay, pack + validators, clones,
 * dry-run preview, substrate metadata hook, and all safety invariants.
 *
 * task_1779150614671_37ao
 */

import { describe, it, expect } from 'vitest';
import {
  DOWNLOAD_SHELF_SOURCES,
  DOWNLOAD_QUARANTINE_MODES,
  DOWNLOAD_SHELF_PERMISSION_ENVELOPES,
  DOWNLOAD_IMPORT_OUTCOMES,
  REPLAY_LESSON_KINDS,
  PRIVACY_REDACTION_LEVELS,
  DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION,
  DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION,
  DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION,
  DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION,
  validateDownloadShelfQuarantineReceipt,
  validateDownloadShelfConsentReceipt,
  validateDownloadShelfImportResultReceipt,
  validateDownloadShelfReplayLessonReceipt,
  validateHoloShellDownloadShelfReceiptPack,
  dryRunValidateDownloadShelfPreview,
  cloneDownloadShelfQuarantineReceipt,
  cloneDownloadShelfConsentReceipt,
  cloneDownloadShelfImportResultReceipt,
  cloneDownloadShelfReplayLessonReceipt,
  cloneHoloShellDownloadShelfReceiptPack,
  cloneDownloadShelfIdentityEntry,
  isSupportedDownloadShelfSource,
  isSupportedDownloadQuarantineMode,
  isSupportedDownloadImportOutcome,
  isSupportedReplayLessonKind,
  type DownloadShelfIdentityEntry,
  type DownloadShelfQuarantineReceipt,
  type DownloadShelfConsentReceipt,
  type DownloadShelfImportResultReceipt,
  type DownloadShelfReplayLessonReceipt,
  type HoloShellDownloadShelfReceiptPack,
  type ReplayLessonEntry,
  type PrivacyRedactionEntry,
} from '../holoshell-download-shelf-receipts';

// ── Fixtures (minimal valid) ──

const validShelfIdentity: DownloadShelfIdentityEntry = {
  shelfId: 'downloads-folder-uuid-1234',
  redactedLabel: 'User Downloads',
  shelfIdHash: 'sha256-shelfhash',
  source: 'user_downloads',
  osPathPolicy: 'absolute_path_kept_in_private_receipt_only',
  probedByHardwareAudit: true,
};

const validQuarantine: DownloadShelfQuarantineReceipt = {
  id: 'quar-001',
  schemaVersion: DOWNLOAD_SHELF_QUARANTINE_RECEIPT_VERSION,
  quarantinedAt: '2026-05-19T10:00:00Z',
  shelf: validShelfIdentity,
  quarantineMode: 'preview_only',
  fileCount: 2,
  publicRelativePaths: ['report.pdf', 'image.png'],
  archiveOrFileHashes: { 'report.pdf': 'sha256-aaa', 'image.png': 'sha256-bbb' },
  privateAbsolutePathReceipt: 'opaque-handle-xyz',
  downloadedFilesExecutable: false,
  rawPrivateDataPublished: false,
  sourceFileMutationPerformed: false,
  permissionEnvelope: 'guarded_download',
  hash: 'sha256-quarhash',
  hashAlgorithm: 'sha256',
  substrateMetadata: { heartbeatId: 'hb-789', custodyProof: 'present' },
};

const validConsent: DownloadShelfConsentReceipt = {
  id: 'cons-001',
  schemaVersion: DOWNLOAD_SHELF_CONSENT_RECEIPT_VERSION,
  shelfId: 'downloads-folder-uuid-1234',
  consentedScopes: ['allowPreviewImport'],
  riskLevel: 'low',
  consentedAt: '2026-05-19T10:01:00Z',
  freshUserGesture: true,
  hiddenAutomationUsed: false,
  nonce: 'nonce-abc123',
  credentialAdjacent: false,
  hash: 'sha256-consenthash',
  hashAlgorithm: 'sha256',
};

const validResult: DownloadShelfImportResultReceipt = {
  id: 'res-001',
  schemaVersion: DOWNLOAD_SHELF_IMPORT_RESULT_RECEIPT_VERSION,
  quarantineReceiptId: 'quar-001',
  consentReceiptId: 'cons-001',
  shelf: validShelfIdentity,
  outcome: 'success',
  startedAt: '2026-05-19T10:02:00Z',
  completedAt: '2026-05-19T10:02:05Z',
  durationMs: 5000,
  importedRelativePaths: ['report.pdf'],
  mutationPerformed: false,
  warnings: [],
  replayable: true,
  rollbackNote: 'delete imported files from shelf',
  hash: 'sha256-resulthash',
  hashAlgorithm: 'sha256',
  substrateMetadata: { heartbeatId: 'hb-789' },
};

const validLesson: ReplayLessonEntry = {
  lesson: 'Always require fresh gesture for import',
  kind: 'import_success',
  sourceOutcome: 'success',
  autoDerived: true,
  showToNonDevelopers: true,
  insight: 'User confirmed explicitly',
  recommendedAction: 'log consent receipt',
};

const validReplay: DownloadShelfReplayLessonReceipt = {
  id: 'replay-001',
  schemaVersion: DOWNLOAD_SHELF_REPLAY_LESSON_RECEIPT_VERSION,
  sourceImportReceiptId: 'res-001',
  shelf: validShelfIdentity,
  lessons: [validLesson],
  generatedAt: '2026-05-19T10:05:00Z',
  replayable: true,
  originalMutationPerformed: false,
  originalRollbackNote: 'delete imported files from shelf',
  hash: 'sha256-replayhash',
  hashAlgorithm: 'sha256',
};

const validPack: HoloShellDownloadShelfReceiptPack = {
  id: 'pack-001',
  shelfIdentity: validShelfIdentity,
  quarantine: validQuarantine,
  consent: validConsent,
  result: validResult,
  replay: validReplay,
  status: 'imported',
  hash: 'sha256-packhash',
  hashAlgorithm: 'sha256',
  substrateRef: 'hb-789',
};

// ── Tests ──

describe('DownloadShelfReceipts - constants and guards', () => {
  it('exports expected const arrays', () => {
    expect(DOWNLOAD_SHELF_SOURCES).toContain('user_downloads');
    expect(DOWNLOAD_QUARANTINE_MODES).toContain('preview_only');
    expect(DOWNLOAD_SHELF_PERMISSION_ENVELOPES).toContain('guarded_download');
    expect(DOWNLOAD_IMPORT_OUTCOMES).toContain('success');
    expect(REPLAY_LESSON_KINDS).toContain('import_success');
    expect(PRIVACY_REDACTION_LEVELS).toContain('hash_only');
  });

  it('type guards accept valid and reject invalid', () => {
    expect(isSupportedDownloadShelfSource('browser_downloads')).toBe(true);
    expect(isSupportedDownloadShelfSource('invalid')).toBe(false);
    expect(isSupportedDownloadQuarantineMode('quarantined')).toBe(true);
    expect(isSupportedDownloadImportOutcome('hash_mismatch')).toBe(true);
    expect(isSupportedReplayLessonKind('import_blocked')).toBe(true);
  });
});

describe('DownloadShelfReceipts - happy path validators', () => {
  it('validates minimal valid quarantine receipt', () => {
    const errs = validateDownloadShelfQuarantineReceipt(validQuarantine);
    expect(errs).toEqual([]);
  });

  it('validates minimal valid consent receipt', () => {
    const errs = validateDownloadShelfConsentReceipt(validConsent);
    expect(errs).toEqual([]);
  });

  it('validates minimal valid import result receipt', () => {
    const errs = validateDownloadShelfImportResultReceipt(validResult);
    expect(errs).toEqual([]);
  });

  it('validates minimal valid replay lesson receipt', () => {
    const errs = validateDownloadShelfReplayLessonReceipt(validReplay);
    expect(errs).toEqual([]);
  });

  it('validates composite pack', () => {
    const errs = validateHoloShellDownloadShelfReceiptPack(validPack);
    expect(errs).toEqual([]);
  });
});

describe('DownloadShelfReceipts - error cases (safety invariants)', () => {
  it('rejects absolute paths in publicRelativePaths via hasAbsolutePath guard', () => {
    const bad = {
      ...validQuarantine,
      publicRelativePaths: ['C:\\Users\\foo\\bad.exe'],
    };
    const errs = validateDownloadShelfQuarantineReceipt(bad as any);
    expect(errs.some((e) => e.includes('absolute path'))).toBe(true);
  });

  it('rejects downloadedFilesExecutable === true', () => {
    const bad = { ...validQuarantine, downloadedFilesExecutable: true as any };
    const errs = validateDownloadShelfQuarantineReceipt(bad as any);
    expect(errs.some((e) => e.includes('downloadedFilesExecutable must be false'))).toBe(true);
  });

  it('rejects sourceFileMutationPerformed === true', () => {
    const bad = { ...validQuarantine, sourceFileMutationPerformed: true as any };
    const errs = validateDownloadShelfQuarantineReceipt(bad as any);
    expect(errs.some((e) => e.includes('sourceFileMutationPerformed must be false'))).toBe(true);
  });

  it('rejects freshUserGesture !== true on consent', () => {
    const bad = { ...validConsent, freshUserGesture: false as any };
    const errs = validateDownloadShelfConsentReceipt(bad as any);
    expect(errs.some((e) => e.includes('freshUserGesture must be true'))).toBe(true);
  });

  it('rejects hiddenAutomationUsed === true', () => {
    const bad = { ...validConsent, hiddenAutomationUsed: true as any };
    const errs = validateDownloadShelfConsentReceipt(bad as any);
    expect(errs.some((e) => e.includes('hiddenAutomationUsed must be false'))).toBe(true);
  });

  it('rejects mutationPerformed !== false on result', () => {
    const bad = { ...validResult, mutationPerformed: true as any };
    const errs = validateDownloadShelfImportResultReceipt(bad as any);
    expect(errs.some((e) => e.includes('mutationPerformed must be false'))).toBe(true);
  });

  it('rejects bad schemaVersion', () => {
    const bad = { ...validQuarantine, schemaVersion: 'v0' as any };
    const errs = validateDownloadShelfQuarantineReceipt(bad as any);
    expect(errs.some((e) => e.includes('schemaVersion must be'))).toBe(true);
  });

  it('rejects missing hash fields', () => {
    const bad = { ...validQuarantine, hash: '' };
    const errs = validateDownloadShelfQuarantineReceipt(bad as any);
    expect(errs.some((e) => e.includes('.hash is required'))).toBe(true);
  });

  it('rejects unsupported outcome', () => {
    const bad = { ...validResult, outcome: 'weird' as any };
    const errs = validateDownloadShelfImportResultReceipt(bad as any);
    expect(errs.some((e) => e.includes('outcome is unsupported'))).toBe(true);
  });
});

describe('DownloadShelfReceipts - pack status machine', () => {
  it('requires result when status=imported', () => {
    const bad = { ...validPack, status: 'imported', result: undefined } as any;
    const errs = validateHoloShellDownloadShelfReceiptPack(bad);
    expect(errs.some((e) => e.includes('result is required when status'))).toBe(true);
  });

  it('requires consent when status=consented', () => {
    const bad = { ...validPack, status: 'consented', consent: undefined } as any;
    const errs = validateHoloShellDownloadShelfReceiptPack(bad);
    expect(errs.some((e) => e.includes('consent is required when status=consented'))).toBe(true);
  });
});

describe('DownloadShelfReceipts - dry-run preview validation', () => {
  it('accepts partial preview for preflight', () => {
    const preview = { fileCount: 3, permissionEnvelope: 'guarded_download' as const };
    const errs = dryRunValidateDownloadShelfPreview(preview as any);
    expect(errs).toEqual([]);
  });

  it('flags bad preview values', () => {
    const preview = { downloadedFilesExecutable: true as any };
    const errs = dryRunValidateDownloadShelfPreview(preview as any);
    expect(errs.some((e) => e.includes('downloadedFilesExecutable must be false'))).toBe(true);
  });
});

describe('DownloadShelfReceipts - clone roundtrips (no mutation leakage)', () => {
  it('clones identity entry safely', () => {
    const clone = cloneDownloadShelfIdentityEntry(validShelfIdentity);
    expect(clone).toEqual(validShelfIdentity);
    expect(clone).not.toBe(validShelfIdentity);
  });

  it('clones quarantine and preserves substrateMetadata', () => {
    const clone = cloneDownloadShelfQuarantineReceipt(validQuarantine);
    expect(clone).toEqual(validQuarantine);
    expect(clone.substrateMetadata).toEqual({ heartbeatId: 'hb-789', custodyProof: 'present' });
    // mutate original, clone unchanged
    (validQuarantine as any).fileCount = 99;
    expect(clone.fileCount).toBe(2);
    (validQuarantine as any).fileCount = 2; // restore
  });

  it('clones full pack roundtrip', () => {
    const clone = cloneHoloShellDownloadShelfReceiptPack(validPack);
    expect(clone).toEqual(validPack);
    expect(clone).not.toBe(validPack);
    expect(clone.quarantine?.substrateMetadata).toBeDefined();
  });
});

describe('DownloadShelfReceipts - substrate metadata integration', () => {
  it('allows optional substrateMetadata on quarantine, result, pack', () => {
    expect(validQuarantine.substrateMetadata).toBeDefined();
    expect(validResult.substrateMetadata).toBeDefined();
    expect(validPack.substrateRef).toBeDefined();
  });

  it('preserves substrate in pack clone', () => {
    const clone = cloneHoloShellDownloadShelfReceiptPack(validPack);
    expect(clone.substrateRef).toBe('hb-789');
  });
});

describe('DownloadShelfReceipts - G.GOLD.013 style exhaustive false/invalid cases', () => {
  it('rejects osPathPolicy violation', () => {
    const bad = { ...validShelfIdentity, osPathPolicy: 'wrong' as any };
    const errs: string[] = [];
    // direct call not public but via quarantine
    const q = { ...validQuarantine, shelf: bad } as any;
    const out = validateDownloadShelfQuarantineReceipt(q);
    expect(out.some((e) => e.includes('osPathPolicy'))).toBe(true);
  });

  it('rejects non-ISO timestamp', () => {
    const bad = { ...validConsent, consentedAt: 'not-a-date' };
    const errs = validateDownloadShelfConsentReceipt(bad as any);
    expect(errs.some((e) => e.includes('ISO-8601'))).toBe(true);
  });
});
