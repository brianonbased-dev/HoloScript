import { describe, expect, it } from 'vitest';
import {
  type HoloShellLocalCodebaseSnapshotReceipt,
  LOCAL_CODEBASE_SNAPSHOT_STATUSES,
  cloneHoloShellLocalCodebaseSnapshotReceipt,
  isSupportedLocalCodebaseRedactionStatus,
  isSupportedLocalCodebaseSnapshotStatus,
  validateHoloShellLocalCodebaseSnapshotReceipt,
} from '../holoshell-local-codebase-snapshot-receipt';

function makeValidReceipt(): HoloShellLocalCodebaseSnapshotReceipt {
  return {
    id: 'local_codebase_snapshot_001',
    workflow: 'ready-to-build-hololand-world',
    startedAt: '2026-05-20T08:00:00Z',
    endedAt: '2026-05-20T08:00:02Z',
    roots: [
      {
        id: 'hololand',
        redactedRoot: '[hololand-root]',
        rootHash: 'root_hash_001',
        runtimeNamespace: 'local-windows',
        exists: true,
        selectedFileCount: 1,
        skippedFileCount: 1,
      },
    ],
    files: [
      {
        path: 'apps/holoshell/source/holoshell-world-build-cockpit.holo',
        sizeBytes: 1200,
        contentHash: 'content_hash_001',
        hashAlgorithm: 'sha256',
        privacyClass: 'source',
        includedInSourceFiles: true,
        language: 'holo',
        modifiedAt: '2026-05-20T08:00:01Z',
      },
    ],
    skippedFiles: [
      {
        path: '.env',
        reason: 'secret-adjacent',
        sizeBytes: 100,
        pathHash: 'path_hash_001',
      },
    ],
    sourceFiles: [
      {
        path: 'apps/holoshell/source/holoshell-world-build-cockpit.holo',
        contentHash: 'content_hash_001',
        sizeBytes: 1200,
      },
    ],
    totalFiles: 1,
    totalBytes: 1200,
    maxFiles: 500,
    maxBytes: 5_000_000,
    redactionStatus: 'pass',
    status: 'ready',
    excludes: ['.git', 'node_modules', '.env'],
    replayCommand:
      'node scripts/holoshell-local-codebase-absorb-bundle.mjs --root C:/repo --json',
    graphReceipt: {
      authoritative: false,
      reason: 'rootDir_unavailable',
      requestedPath: 'C:/Users/josep/Documents/GitHub/HoloScript',
      runtimePath: '/app/C:/Users/josep/Documents/GitHub/HoloScript',
      cacheAgeMs: 689012788,
    },
    hash: 'receipt_hash_001',
    hashAlgorithm: 'sha256',
    verificationCommands: ['node scripts/holoshell-local-codebase-absorb-bundle.mjs --self-test'],
  };
}

describe('LOCAL_CODEBASE_SNAPSHOT_STATUSES', () => {
  it('contains ready/warn/blocked', () => {
    expect(LOCAL_CODEBASE_SNAPSHOT_STATUSES).toEqual(['ready', 'warn', 'blocked']);
  });
});

describe('local codebase guards', () => {
  it('recognizes supported statuses', () => {
    expect(isSupportedLocalCodebaseSnapshotStatus('ready')).toBe(true);
    expect(isSupportedLocalCodebaseSnapshotStatus('blocked')).toBe(true);
    expect(isSupportedLocalCodebaseSnapshotStatus('done')).toBe(false);
  });

  it('recognizes supported redaction states', () => {
    expect(isSupportedLocalCodebaseRedactionStatus('pass')).toBe(true);
    expect(isSupportedLocalCodebaseRedactionStatus('fail')).toBe(true);
    expect(isSupportedLocalCodebaseRedactionStatus('trusted')).toBe(false);
  });
});

describe('validateHoloShellLocalCodebaseSnapshotReceipt', () => {
  it('returns empty for a valid receipt', () => {
    expect(validateHoloShellLocalCodebaseSnapshotReceipt(makeValidReceipt())).toEqual([]);
  });

  it('rejects absolute source file paths', () => {
    const receipt = makeValidReceipt();
    receipt.sourceFiles[0].path = 'C:/Users/josep/Documents/GitHub/Hololand/secret.ts';
    expect(validateHoloShellLocalCodebaseSnapshotReceipt(receipt)).toContain(
      'LocalCodebaseSourceFilePayload.path must be relative and safe: C:/Users/josep/Documents/GitHub/Hololand/secret.ts.'
    );
  });

  it('rejects path traversal in selected files', () => {
    const receipt = makeValidReceipt();
    receipt.files[0].path = '../outside.ts';
    expect(validateHoloShellLocalCodebaseSnapshotReceipt(receipt)).toContain(
      'LocalCodebaseSnapshotFile.path must be relative and safe: ../outside.ts.'
    );
  });

  it('requires totals to stay within caps', () => {
    const receipt = makeValidReceipt();
    receipt.totalBytes = 10;
    receipt.maxBytes = 1;
    expect(validateHoloShellLocalCodebaseSnapshotReceipt(receipt)).toContain(
      'HoloShellLocalCodebaseSnapshotReceipt.totalBytes must not exceed maxBytes.'
    );
  });

  it('requires source payload hashes to match file hashes', () => {
    const receipt = makeValidReceipt();
    receipt.sourceFiles[0].contentHash = 'different_hash';
    expect(validateHoloShellLocalCodebaseSnapshotReceipt(receipt)).toContain(
      'LocalCodebaseSourceFilePayload apps/holoshell/source/holoshell-world-build-cockpit.holo.contentHash must match the file snapshot hash.'
    );
  });

  it('clones nested arrays without sharing references', () => {
    const receipt = makeValidReceipt();
    const clone = cloneHoloShellLocalCodebaseSnapshotReceipt(receipt);

    clone.files[0].path = 'changed.ts';
    clone.roots[0].selectedFileCount = 2;
    clone.excludes.push('dist');

    expect(receipt.files[0].path).toBe(
      'apps/holoshell/source/holoshell-world-build-cockpit.holo'
    );
    expect(receipt.roots[0].selectedFileCount).toBe(1);
    expect(receipt.excludes).not.toContain('dist');
  });
});
