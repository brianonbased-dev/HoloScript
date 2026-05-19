import { describe, it, expect } from 'vitest';
import {
  AccountExportArchivePayload,
  AccountExportArchiveAdapterOptions,
  archiveVerificationToReceiptInput,
  validateArchiveVerification,
  createArchiveVerificationGuard,
  stableArchiveHash,
  isExecutableFile,
  classifyFileSensitivity,
  detectMimeType,
  EXECUTABLE_EXTENSIONS,
  DEFAULT_SENSITIVITY_PATTERNS,
} from '../AccountExportArchiveReceipt';
import { validateTrustReceipt } from '../TrustReceipt';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeValidArchivePayload(
  overrides: Partial<AccountExportArchivePayload> = {},
): AccountExportArchivePayload {
  return {
    workflow: 'browser_account_export',
    provider: 'google_takeout',
    providerLabel: 'Google',
    archiveFormat: 'zip',
    totalParts: 1,
    totalSizeBytes: 1024,
    archiveHash: 'sha256:abcdef1234567890',
    fileCount: 2,
    parts: [
      {
        partIndex: 0,
        totalParts: 1,
        partHash: 'sha256:part0hash',
        partSizeBytes: 1024,
        status: 'present_intact',
      },
    ],
    partsComplete: true,
    fileManifest: [
      {
        path: 'takeout/mail/all.mbox',
        contentHash: 'sha256:mailhash',
        sizeBytes: 800,
        isExecutable: false,
        sensitivityLevel: 'sensitive',
        sensitivityCategories: ['communications'],
        sensitivityFlags: ['contains_communications', 'auto_detected'],
        mimeType: 'application/mbox',
      },
      {
        path: 'takeout/photos/album.zip',
        contentHash: 'sha256:photoshash',
        sizeBytes: 224,
        isExecutable: false,
        sensitivityLevel: 'personal',
        sensitivityCategories: ['media_personal'],
        sensitivityFlags: ['auto_detected'],
        mimeType: 'application/zip',
      },
    ],
    manifestExtracted: true,
    executableFiles: [],
    executablesDetected: false,
    executableBlockImport: false,
    aggregateSensitivity: 'sensitive',
    sensitivityCategories: ['communications', 'media_personal'],
    restrictedFiles: [],
    sensitiveFiles: ['takeout/mail/all.mbox'],
    sensitivityBlockShare: true,
    verificationResult: 'verified',
    verificationSummary: 'Archive verified successfully.',
    warnings: [],
    errors: [],
    credentialAdjacent: false,
    sourceFileMutationPerformed: false,
    rawPrivateDataPublished: false,
    privatePathLeakedToPublicReceipt: false,
    ...overrides,
  };
}

function makeValidArchiveOptions(
  overrides: Partial<AccountExportArchiveAdapterOptions> = {},
): AccountExportArchiveAdapterOptions {
  return {
    passportDid: 'did:holoscript:test_actor',
    ...overrides,
  };
}

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('isExecutableFile', () => {
  it('detects .exe files as executable', () => {
    const result = isExecutableFile('setup.exe');
    expect(result.executable).toBe(true);
    expect(result.extension).toBe('.exe');
  });

  it('detects .sh files as executable', () => {
    const result = isExecutableFile('scripts/install.sh');
    expect(result.executable).toBe(true);
    expect(result.extension).toBe('.sh');
  });

  it('detects .dll files as executable (shared library)', () => {
    const result = isExecutableFile('lib/dependency.dll');
    expect(result.executable).toBe(true);
    expect(result.extension).toBe('.dll');
  });

  it('does not flag .txt files as executable', () => {
    const result = isExecutableFile('readme.txt');
    expect(result.executable).toBe(false);
    expect(result.extension).toBeUndefined();
  });

  it('does not flag .json files as executable', () => {
    const result = isExecutableFile('data/export.json');
    expect(result.executable).toBe(false);
  });

  it('handles case-insensitive extensions', () => {
    const result = isExecutableFile('SETUP.EXE');
    expect(result.executable).toBe(true);
    expect(result.extension).toBe('.exe');
  });

  it('detects all known executable extensions', () => {
    const knownExtensions = [
      '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.vbe',
      '.msi', '.sh', '.app', '.dmg', '.jar', '.dll',
    ];
    for (const ext of knownExtensions) {
      const result = isExecutableFile(`file${ext}`);
      expect(result.executable).toBe(true);
    }
  });
});

describe('classifyFileSensitivity', () => {
  it('classifies files with password in path as restricted', () => {
    const result = classifyFileSensitivity('secrets/passwords.txt');
    expect(result.level).toBe('restricted');
    expect(result.categories).toContain('credentials');
    expect(result.flags).toContain('contains_credentials');
  });

  it('classifies files with health in path as restricted', () => {
    const result = classifyFileSensitivity('medical/health_records.json');
    expect(result.level).toBe('restricted');
    expect(result.categories).toContain('health');
  });

  it('classifies files with bank in path as restricted', () => {
    const result = classifyFileSensitivity('financial/bank_statements.csv');
    expect(result.level).toBe('restricted');
    expect(result.categories).toContain('financial');
  });

  it('classifies files with mail in path as sensitive', () => {
    const result = classifyFileSensitivity('takeout/mail/all.mbox');
    expect(result.level).toBe('sensitive');
    expect(result.categories).toContain('communications');
  });

  it('classifies files with photo in path as personal', () => {
    const result = classifyFileSensitivity('photos/vacation.jpg');
    expect(result.level).toBe('personal');
    expect(result.categories).toContain('media_personal');
  });

  it('returns general for innocuous file paths', () => {
    const result = classifyFileSensitivity('public/index.html');
    expect(result.level).toBe('general');
    expect(result.categories).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('takes the highest sensitivity when multiple patterns match', () => {
    const result = classifyFileSensitivity('health/password_bank.txt');
    // 'password' → restricted, 'bank' → restricted, 'health' → restricted
    expect(result.level).toBe('restricted');
    expect(result.categories).toContain('credentials');
    expect(result.categories).toContain('financial');
    expect(result.categories).toContain('health');
  });

  it('supports custom sensitivity patterns', () => {
    const customPatterns = [
      { pattern: 'supersecret', level: 'restricted' as const, categories: ['credentials' as const], flags: ['auto_detected' as const] },
    ];
    const result = classifyFileSensitivity('data/supersecret.csv', customPatterns);
    expect(result.level).toBe('restricted');
    expect(result.categories).toContain('credentials');
  });
});

describe('detectMimeType', () => {
  it('detects JSON mime type', () => {
    expect(detectMimeType('data.json')).toBe('application/json');
  });

  it('detects CSV mime type', () => {
    expect(detectMimeType('data.csv')).toBe('text/csv');
  });

  it('detects ZIP mime type', () => {
    expect(detectMimeType('archive.zip')).toBe('application/zip');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(detectMimeType('file.xyz')).toBe('application/octet-stream');
  });
});

// ─── Validation Tests ──────────────────────────────────────────────────────────

describe('validateArchiveVerification', () => {
  it('accepts a valid payload with all defaults', () => {
    const result = validateArchiveVerification(makeValidArchivePayload());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing workflow', () => {
    const result = validateArchiveVerification(makeValidArchivePayload({ workflow: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing workflow');
  });

  it('rejects missing provider', () => {
    const result = validateArchiveVerification(makeValidArchivePayload({ provider: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing provider');
  });

  it('rejects missing archiveHash', () => {
    const result = validateArchiveVerification(makeValidArchivePayload({ archiveHash: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing archiveHash');
  });

  it('rejects sourceFileMutationPerformed=true', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({ sourceFileMutationPerformed: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sourceFileMutationPerformed'))).toBe(true);
  });

  it('rejects rawPrivateDataPublished=true', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({ rawPrivateDataPublished: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rawPrivateDataPublished'))).toBe(true);
  });

  it('rejects privatePathLeakedToPublicReceipt=true', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({ privatePathLeakedToPublicReceipt: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('privatePathLeakedToPublicReceipt'))).toBe(true);
  });

  it('detects parts.length mismatch with totalParts', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({ totalParts: 3, parts: [{ partIndex: 0, totalParts: 3, partHash: 'sha256:x', partSizeBytes: 100, status: 'present_intact' }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('parts.length'))).toBe(true);
  });

  it('detects corrupt parts', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        parts: [{ partIndex: 0, totalParts: 1, partHash: 'sha256:x', partSizeBytes: 100, status: 'present_corrupt' }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('present_corrupt'))).toBe(true);
  });

  it('detects partsComplete=true with missing parts', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        totalParts: 1,
        partsComplete: true,
        parts: [{ partIndex: 0, totalParts: 1, partHash: 'sha256:x', partSizeBytes: 100, status: 'missing' }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing'))).toBe(true);
  });

  it('flags executablesDetected without executableBlockImport', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        executablesDetected: true,
        executableBlockImport: false,
        executableFiles: ['malware.exe'],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('executableBlockImport'))).toBe(true);
  });

  it('accepts executablesDetected with executableBlockImport=true', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        executablesDetected: true,
        executableBlockImport: true,
        executableFiles: ['tool.exe'],
        verificationResult: 'failed_executable_detected',
        fileManifest: [
          ...makeValidArchivePayload().fileManifest,
          {
            path: 'tool.exe',
            contentHash: 'sha256:exehash',
            sizeBytes: 100,
            isExecutable: true,
            executableExtension: '.exe',
            sensitivityLevel: 'general',
            sensitivityCategories: [],
            sensitivityFlags: [],
            mimeType: 'application/octet-stream',
          },
        ],
        fileCount: 3,
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('warns about size mismatch parts', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        totalParts: 1,
        parts: [{ partIndex: 0, totalParts: 1, partHash: 'sha256:x', partSizeBytes: 100, status: 'present_size_mismatch', expectedSizeBytes: 200 }],
      }),
    );
    expect(result.warnings.some((w) => w.includes('present_size_mismatch'))).toBe(true);
  });

  it('warns about manifest/fileCount mismatch', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({ fileCount: 5, manifestExtracted: true }),
    );
    expect(result.warnings.some((w) => w.includes('fileManifest'))).toBe(true);
  });

  it('requires contentHash on manifest entries', () => {
    const result = validateArchiveVerification(
      makeValidArchivePayload({
        fileManifest: [
          { path: 'missing_hash.txt', contentHash: '', sizeBytes: 10, isExecutable: false, sensitivityLevel: 'general', sensitivityCategories: [], sensitivityFlags: [] },
        ],
        fileCount: 1,
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('contentHash'))).toBe(true);
  });
});

// ─── Guard Tests ──────────────────────────────────────────────────────────────

describe('createArchiveVerificationGuard', () => {
  it('allows import/delete/share for verified archives', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'verified' });
    const guard = createArchiveVerificationGuard(payload);
    expect(guard.importAllowed).toBe(true);
    expect(guard.deleteAllowed).toBe(true);
    expect(guard.shareAllowed).toBe(false); // sensitive files block sharing
    expect(guard.blockReason).toContain('Sensitivity');
  });

  it('allows import when verified with warnings', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'verified_with_warnings' });
    const guard = createArchiveVerificationGuard(payload);
    expect(guard.importAllowed).toBe(true);
  });

  it('blocks import when failed_executable_detected', () => {
    const payload = makeValidArchivePayload({
      verificationResult: 'failed_executable_detected',
      executablesDetected: true,
      executableBlockImport: true,
      executableFiles: ['malware.exe'],
    });
    const guard = createArchiveVerificationGuard(payload);
    expect(guard.importAllowed).toBe(false);
    expect(guard.deleteAllowed).toBe(false);
    expect(guard.blockReason).toContain('failed_executable_detected');
  });

  it('blocks all operations when failed_corrupt', () => {
    const payload = makeValidArchivePayload({
      verificationResult: 'failed_corrupt',
      sensitivityBlockShare: false,
    });
    const guard = createArchiveVerificationGuard(payload);
    expect(guard.importAllowed).toBe(false);
    expect(guard.deleteAllowed).toBe(false);
    expect(guard.shareAllowed).toBe(false);
    expect(guard.blockReason).toContain('failed_corrupt');
  });

  it('blocks import with executable flag even for otherwise clean archive', () => {
    const payload = makeValidArchivePayload({
      verificationResult: 'verified',
      executablesDetected: true,
      executableBlockImport: true,
      executableFiles: ['setup.exe'],
    });
    const guard = createArchiveVerificationGuard(payload);
    expect(guard.importAllowed).toBe(false);
  });
});

// ─── Adapter Tests ─────────────────────────────────────────────────────────────

describe('archiveVerificationToReceiptInput', () => {
  it('converts a valid payload to a TrustReceiptInput', () => {
    const payload = makeValidArchivePayload();
    const options = makeValidArchiveOptions();
    const input = archiveVerificationToReceiptInput(payload, options);

    expect(input.schemaVersion).toBe('1.0.0');
    expect(input.actor.passportDid).toBe('did:holoscript:test_actor');
    expect(input.actor.bindings).toHaveLength(3);
    expect(input.actor.bindings![0].value).toBe('google_takeout');
    expect(input.actor.bindings![0].type).toBe('provider_export');
    expect(input.actor.bindings![1].value).toBe('browser_account_export');
    expect(input.actor.bindings![1].type).toBe('workflow');
    expect(input.actor.bindings![2].value).toBe('archive_verify');
    expect(input.actor.bindings![2].type).toBe('verification_phase');
    expect(input.action.name).toBe('account_export_archive_verify');
    expect(input.action.resource).toBe('holoshell/browser_account_export/google_takeout/archive');
    expect(input.action.outcome).toBe('success');
    expect(input.permissionEnvelope).toBe('read_only');
    expect(input.evidence.hashes).toHaveLength(1);
  });

  it('sets outcome=denied when verification failed', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'failed_executable_detected' });
    const input = archiveVerificationToReceiptInput(payload, makeValidArchiveOptions());
    expect(input.action.outcome).toBe('denied');
  });

  it('sets break_glass envelope for failed_corrupt', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'failed_corrupt' });
    const input = archiveVerificationToReceiptInput(payload, makeValidArchiveOptions());
    expect(input.permissionEnvelope).toBe('break_glass');
  });

  it('sets guarded_execute envelope for failed_sensitivity_blocked', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'failed_sensitivity_blocked' });
    const input = archiveVerificationToReceiptInput(payload, makeValidArchiveOptions());
    expect(input.permissionEnvelope).toBe('guarded_execute');
  });

  it('passes archiveHash as commandHash', () => {
    const input = archiveVerificationToReceiptInput(
      makeValidArchivePayload({ archiveHash: 'sha256:deadbeef' }),
      makeValidArchiveOptions(),
    );
    expect(input.evidence.commandHash).toBe('sha256:deadbeef');
  });

  it('includes errors and warnings as witnessRefs', () => {
    const payload = makeValidArchivePayload({
      errors: ['corrupt part'],
      warnings: ['size mismatch'],
    });
    const input = archiveVerificationToReceiptInput(payload, makeValidArchiveOptions());
    expect(input.evidence.witnessRefs).toContain('corrupt part');
    expect(input.evidence.witnessRefs).toContain('size mismatch');
  });

  it('produces a receipt that validates against TrustReceipt schema', () => {
    const payload = makeValidArchivePayload({ verificationResult: 'verified' });
    const input = archiveVerificationToReceiptInput(payload, makeValidArchiveOptions());
    const receipt = {
      ...input,
      receiptId: `test_arc_${Date.now()}`,
      storage: { syncState: 'local_only' as const, ...input.storage },
    };
    const result = validateTrustReceipt(receipt);
    expect(result.valid).toBe(true);
  });
});

// ─── Hash Stability Tests ─────────────────────────────────────────────────────

describe('stableArchiveHash', () => {
  it('produces a deterministic hash for the same payload', () => {
    const payload = makeValidArchivePayload();
    const hash1 = stableArchiveHash(payload);
    const hash2 = stableArchiveHash(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:/);
  });

  it('produces different hashes for different payloads', () => {
    const payload1 = makeValidArchivePayload({ provider: 'google_takeout' });
    const payload2 = makeValidArchivePayload({ provider: 'microsoft_privacy_dashboard' });
    const hash1 = stableArchiveHash(payload1);
    const hash2 = stableArchiveHash(payload2);
    expect(hash1).not.toBe(hash2);
  });

  it('is key-order independent', () => {
    const payload1 = makeValidArchivePayload({ provider: 'google_takeout', archiveFormat: 'zip' });
    const payload2 = makeValidArchivePayload({ archiveFormat: 'zip', provider: 'google_takeout' });
    expect(stableArchiveHash(payload1)).toBe(stableArchiveHash(payload2));
  });
});