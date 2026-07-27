import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseScanner } from '../engine/CodebaseScanner';
import {
  ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA,
  ABSORB_REFRESH_RETENTION_RECEIPT_SCHEMA,
  compactAbsorbRefreshProgressReceipt,
  prepareAbsorbRefreshCheckpoint,
  pruneAbsorbRefreshCheckpoints,
  replaceFileWithRetry,
} from './absorb-refresh-checkpoint';
import { resolveCodebaseCachePaths } from './codebase-cache-storage';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;

function writeFixture(rootDir: string, relativePath: string, content = 'fixture\n'): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

afterEach(() => {
  if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
  else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
});

describe('AbsorbRefreshCheckpoint', () => {
  it('retries transient Windows sharing violations during atomic receipt replacement', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-retry-'));
    const temporaryPath = path.join(directory, 'receipt.json.tmp');
    const targetPath = path.join(directory, 'receipt.json');
    fs.writeFileSync(temporaryPath, '{"status":"ready"}', 'utf-8');
    const originalRenameSync = fs.renameSync.bind(fs);
    let attempts = 0;
    const transientRename: typeof fs.renameSync = (oldPath, newPath) => {
      attempts += 1;
      if (attempts <= 2) {
        const error = new Error('synthetic sharing violation') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      originalRenameSync(oldPath, newPath);
    };

    replaceFileWithRetry(temporaryPath, targetPath, transientRename);
    expect(attempts).toBe(3);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('{"status":"ready"}');
  });

  it('distinguishes a non-authoritative progress receipt from its published graph', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-authority-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 1 }, 1);
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 1,
      workspaceCandidateFiles: 1,
    });

    checkpoint.markComplete();
    expect(checkpoint.progressReceipt()).toMatchObject({
      status: 'complete',
      authoritative: false,
      cachePublished: true,
      publishedGraphAuthoritative: true,
      priorAuthoritativeCachePreserved: false,
    });
  });

  it('bounds superseded checkpoint directories and reports reclaimed bytes', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-retention-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 1 }, 1);
    const receipts = Array.from({ length: 6 }, (_, index) => {
      const checkpoint = prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan,
        targetGitCommitHash: String(index).padStart(40, '0'),
        targetWorktreeFingerprint: null,
        scanPolicyHash: `policy-${index}`,
        maxFiles: 1,
      });
      checkpoint.markComplete();
      const receipt = checkpoint.progressReceipt();
      const updatedAt = new Date(Date.now() + index * 1_000).toISOString();
      const persisted = JSON.parse(fs.readFileSync(receipt.receiptFile, 'utf-8')) as Record<
        string,
        unknown
      >;
      persisted.updatedAt = updatedAt;
      fs.writeFileSync(receipt.receiptFile, JSON.stringify(persisted, null, 2), 'utf-8');
      fs.writeFileSync(
        path.join(receipt.checkpointDirectory, 'retention-payload.bin'),
        Buffer.alloc(128 + index)
      );
      return receipt;
    });

    const retention = pruneAbsorbRefreshCheckpoints({
      rootDir,
      maxDirectories: 3,
      terminalMaxAgeMs: Number.MAX_SAFE_INTEGER,
      nowMs: Date.now() + 10_000,
    });

    expect(retention).toMatchObject({
      schemaVersion: ABSORB_REFRESH_RETENTION_RECEIPT_SCHEMA,
      kind: 'AbsorbRefreshRetentionReceipt',
      discoveredDirectories: 4,
      retainedDirectories: 3,
      removedDirectories: 1,
      failedRemovals: [],
    });
    expect(retention.bytesReclaimed).toBeGreaterThan(0);
    expect(retention.bytesAfter).toBeLessThan(retention.bytesBefore);
    for (const receipt of receipts.slice(0, 3)) {
      expect(fs.existsSync(receipt.checkpointDirectory)).toBe(false);
    }
    for (const receipt of receipts.slice(3)) {
      expect(fs.existsSync(receipt.checkpointDirectory)).toBe(true);
    }
  });

  it('never collects live writers or caller-preserved resume tokens', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-protected-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 1 }, 1);
    const live = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'live-policy',
      maxFiles: 1,
    });
    const preserved = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'b'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'preserved-policy',
      maxFiles: 1,
    });
    preserved.markInterrupted(new Error('retain for explicit resume'));
    const disposable = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'c'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'disposable-policy',
      maxFiles: 1,
    });
    disposable.markComplete();

    const retention = pruneAbsorbRefreshCheckpoints({
      rootDir,
      preserveResumeTokens: [preserved.progressReceipt().resumeToken],
      maxDirectories: 1,
      terminalMaxAgeMs: 0,
      resumableMaxAgeMs: 0,
      nowMs: Date.now() + 1,
    });

    expect(retention).toMatchObject({
      discoveredDirectories: 3,
      retainedDirectories: 2,
      removedDirectories: 1,
      activeDirectories: 1,
      preservedDirectories: 1,
    });
    expect(fs.existsSync(live.progressReceipt().checkpointDirectory)).toBe(true);
    expect(fs.existsSync(preserved.progressReceipt().checkpointDirectory)).toBe(true);
    expect(fs.existsSync(disposable.progressReceipt().checkpointDirectory)).toBe(false);
  });

  it('requires the current writer lease to adopt an active checkpoint across PID namespaces', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-owner-repo-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-owner-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 1 }, 1);
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 1,
    });
    checkpoint.markScanning();
    const receipt = checkpoint.progressReceipt();
    fs.writeFileSync(
      receipt.receiptFile,
      JSON.stringify(
        {
          ...receipt,
          ownerProcessId: 1,
          ownerHost: 'retired-container-host',
        },
        null,
        2
      ),
      'utf-8'
    );

    expect(() =>
      prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan,
        targetGitCommitHash: 'a'.repeat(40),
        targetWorktreeFingerprint: null,
        scanPolicyHash: 'policy-v1',
        maxFiles: 1,
        resumeToken: receipt.resumeToken,
      })
    ).toThrow(/active owner process 1/);

    const leaseFile = resolveCodebaseCachePaths(rootDir).writerLeaseFile;
    const token = 'current-exclusive-writer-token';
    fs.writeFileSync(
      leaseFile,
      JSON.stringify({
        schemaVersion: 'holoscript.absorb-writer-lease.v1',
        kind: 'AbsorbWriterLease',
        token,
        rootDirs: [rootDir],
      }),
      'utf-8'
    );

    const adopted = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 1,
      resumeToken: receipt.resumeToken,
      writerLeaseProof: { leaseFile, token },
    });
    expect(adopted.progressReceipt()).toMatchObject({
      status: 'prepared',
      ownerProcessId: process.pid,
      ownerHost: os.hostname(),
      ownerWriterLeaseSha256: createHash('sha256').update(token).digest('hex'),
    });
  });

  it('adopts the compatible checkpoint with the most completed work', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-best-repo-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-best-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');
    writeFixture(rootDir, 'src/b.txt', 'b\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 2 }, 1);
    const checkpointOptions = {
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 2,
    };
    const completeScan = prepareAbsorbRefreshCheckpoint(checkpointOptions);
    for (const batch of scanPlan.batches) {
      const inputSha256 = completeScan.captureBatchInput(batch);
      const result = await scanner.scanFiles(rootDir, batch.files);
      expect(completeScan.persistBatch(batch, result, inputSha256)).toBe(true);
    }
    completeScan.markScanned();

    const newerPartial = prepareAbsorbRefreshCheckpoint(checkpointOptions);
    const partialBatch = scanPlan.batches[0];
    const partialInputSha256 = newerPartial.captureBatchInput(partialBatch);
    const partialResult = await scanner.scanFiles(rootDir, partialBatch.files);
    expect(newerPartial.persistBatch(partialBatch, partialResult, partialInputSha256)).toBe(true);
    newerPartial.markInterrupted(new Error('newer partial retry'));

    const leaseFile = resolveCodebaseCachePaths(rootDir).writerLeaseFile;
    const token = 'best-progress-writer-token';
    fs.writeFileSync(
      leaseFile,
      JSON.stringify({
        schemaVersion: 'holoscript.absorb-writer-lease.v1',
        kind: 'AbsorbWriterLease',
        token,
        rootDirs: [rootDir],
      }),
      'utf-8'
    );

    const adopted = prepareAbsorbRefreshCheckpoint({
      ...checkpointOptions,
      reuseLatest: true,
      writerLeaseProof: { leaseFile, token },
    });
    expect(adopted.progressReceipt()).toMatchObject({
      resumeToken: completeScan.progressReceipt().resumeToken,
      completedBatchCount: 2,
      completedCandidateFiles: 2,
    });
  });

  it('enforces the byte ceiling before directory count becomes pressure', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-byte-cap-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 1 }, 1);
    const receipts = Array.from({ length: 3 }, (_, index) => {
      const checkpoint = prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan,
        targetGitCommitHash: String(index).padStart(40, '0'),
        targetWorktreeFingerprint: null,
        scanPolicyHash: `byte-policy-${index}`,
        maxFiles: 1,
      });
      checkpoint.markComplete();
      const receipt = checkpoint.progressReceipt();
      fs.writeFileSync(path.join(receipt.checkpointDirectory, 'large.bin'), Buffer.alloc(2_048));
      return receipt;
    });
    const bytesPerCheckpoint = receipts.map((receipt) => {
      const files = fs.readdirSync(receipt.checkpointDirectory);
      return files.reduce(
        (total, file) => total + fs.statSync(path.join(receipt.checkpointDirectory, file)).size,
        0
      );
    });
    const keepNewestTwoBytes = bytesPerCheckpoint[1] + bytesPerCheckpoint[2];

    const retention = pruneAbsorbRefreshCheckpoints({
      rootDir,
      maxDirectories: 10,
      maxBytes: keepNewestTwoBytes,
      terminalMaxAgeMs: Number.MAX_SAFE_INTEGER,
    });

    expect(retention.removedDirectories).toBe(1);
    expect(retention.retainedDirectories).toBe(2);
    expect(retention.bytesAfter).toBeLessThanOrEqual(keepNewestTwoBytes);
    expect(fs.existsSync(receipts[0].checkpointDirectory)).toBe(false);
    expect(fs.existsSync(receipts[1].checkpointDirectory)).toBe(true);
    expect(fs.existsSync(receipts[2].checkpointDirectory)).toBe(true);
  });

  it('persists a bounded non-authoritative progress receipt and resumes completed batches', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-checkpoint-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');
    writeFixture(rootDir, 'src/b.txt', 'b\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 2 }, 1);
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 2,
      workspaceCandidateFiles: 3,
    });
    const prepared = checkpoint.progressReceipt();

    expect(prepared).toMatchObject({
      schemaVersion: ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA,
      kind: 'AbsorbRefreshProgressReceipt',
      status: 'prepared',
      authoritative: false,
      cachePublished: false,
      priorAuthoritativeCachePreserved: true,
      resumable: true,
      totalCandidateFiles: 2,
      totalBatches: 2,
      selection: {
        maxFiles: 2,
        workspaceCandidateFiles: 3,
        selectedCandidateFiles: 2,
        truncated: true,
        truncationReason: 'maxFiles',
      },
    });
    expect(fs.existsSync(prepared.receiptFile)).toBe(true);

    checkpoint.markScanning();
    const firstBatch = scanPlan.batches[0];
    const firstInputSha256 = checkpoint.captureBatchInput(firstBatch);
    const firstResult = await scanner.scanFiles(rootDir, firstBatch.files);
    expect(checkpoint.persistBatch(firstBatch, firstResult, firstInputSha256)).toBe(true);
    checkpoint.markInterrupted(new Error('synthetic interruption'));

    const interrupted = checkpoint.progressReceipt();
    expect(interrupted).toMatchObject({
      status: 'interrupted',
      completedBatchCount: 1,
      completedCandidateFiles: 1,
      remainingCandidateFiles: 1,
      progressPercent: 50,
      authoritative: false,
      cachePublished: false,
      priorAuthoritativeCachePreserved: true,
      resumable: true,
      error: 'synthetic interruption',
    });
    expect(interrupted.completedBatches[0].inputSha256).toMatch(/^[a-f0-9]{64}$/);

    const compact = compactAbsorbRefreshProgressReceipt(interrupted);
    expect(compact).toMatchObject({
      completedBatchesOmitted: 1,
      latestCompletedBatch: { index: firstBatch.index },
    });
    expect('completedBatches' in compact).toBe(false);

    const resumed = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 2,
      workspaceCandidateFiles: 3,
      resumeToken: interrupted.resumeToken,
    });
    expect(resumed.loadBatchResult(firstBatch)).toEqual(firstResult);
    expect(resumed.loadBatchResult(scanPlan.batches[1])).toBeNull();
    const completedBatch = resumed.progressReceipt().completedBatches[0];
    fs.appendFileSync(
      path.join(resumed.progressReceipt().checkpointDirectory, completedBatch.resultFile),
      '\n',
      'utf-8'
    );
    expect(() => resumed.loadBatchResult(firstBatch)).toThrow(/SHA-256 integrity check/);
  });

  it('reuses unchanged batches as a content-addressed overlay when the target pin changed', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-mismatch-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');
    writeFixture(rootDir, 'src/b.txt', 'b\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 10 }, 1);
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'a'.repeat(40),
      targetWorktreeFingerprint: null,
      scanPolicyHash: 'policy-v1',
      maxFiles: 10,
    });
    for (const batch of scanPlan.batches) {
      const inputSha256 = checkpoint.captureBatchInput(batch);
      const result = await scanner.scanFiles(rootDir, batch.files);
      expect(checkpoint.persistBatch(batch, result, inputSha256)).toBe(true);
    }
    checkpoint.markInterrupted(new Error('stop'));
    const resumeToken = checkpoint.progressReceipt().resumeToken;
    writeFixture(rootDir, 'src/a.txt', 'a changed\n');

    const overlaid = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'b'.repeat(40),
      targetWorktreeFingerprint: 'dirty-after-checkpoint',
      scanPolicyHash: 'policy-v1',
      maxFiles: 10,
      resumeToken,
    });
    expect(overlaid.progressReceipt()).toMatchObject({
      resumeMode: 'content-addressed-overlay',
      baseTargetGitCommitHash: 'a'.repeat(40),
      targetGitCommitHash: 'b'.repeat(40),
      completedBatchCount: 2,
    });

    const changedBatch = scanPlan.batches.find((batch) =>
      batch.files.some((filePath) => filePath.endsWith('a.txt'))
    )!;
    const unchangedBatch = scanPlan.batches.find((batch) =>
      batch.files.some((filePath) => filePath.endsWith('b.txt'))
    )!;
    expect(overlaid.loadBatchResult(changedBatch)).toBeNull();
    expect(overlaid.loadBatchResult(unchangedBatch)).not.toBeNull();
    expect(overlaid.progressReceipt()).toMatchObject({
      completedBatchCount: 1,
      reusedBatchCount: 1,
      invalidatedBatchCount: 1,
    });

    const changedInputSha256 = overlaid.captureBatchInput(changedBatch);
    const changedResult = await scanner.scanFiles(rootDir, changedBatch.files);
    expect(overlaid.persistBatch(changedBatch, changedResult, changedInputSha256)).toBe(true);
    overlaid.markInterrupted(new Error('stop again'));

    const autoResumed = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: 'c'.repeat(40),
      targetWorktreeFingerprint: 'new-overlay',
      scanPolicyHash: 'policy-v1',
      maxFiles: 10,
      reuseLatest: true,
    });
    expect(autoResumed.progressReceipt()).toMatchObject({
      resumeToken,
      resumeMode: 'content-addressed-overlay',
      targetGitCommitHash: 'c'.repeat(40),
    });

    writeFixture(rootDir, 'src/b.txt', 'b\n');
    writeFixture(rootDir, 'src/c.txt', 'c\n');
    const changedPlan = scanner.planScan({ rootDir, maxFiles: 10 }, 1);
    expect(() =>
      prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan: changedPlan,
        targetGitCommitHash: 'a'.repeat(40),
        targetWorktreeFingerprint: null,
        scanPolicyHash: 'policy-v1',
        maxFiles: 10,
        resumeToken,
      })
    ).toThrow(/scan plan|selected file set/);
  });

  it('does not checkpoint a batch whose source bytes changed during its scan window', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-race-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'before\n');

    const scanner = new CodebaseScanner(undefined, false);
    const scanPlan = scanner.planScan({ rootDir, maxFiles: 10 }, 1);
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir,
      scanPlan,
      targetGitCommitHash: null,
      targetWorktreeFingerprint: 'before',
      scanPolicyHash: 'policy-v1',
      maxFiles: 10,
    });
    const batch = scanPlan.batches[0];
    const inputSha256 = checkpoint.captureBatchInput(batch);
    writeFixture(rootDir, 'src/a.txt', 'after\n');
    const result = await scanner.scanFiles(rootDir, batch.files);

    expect(checkpoint.persistBatch(batch, result, inputSha256)).toBe(false);
    expect(checkpoint.progressReceipt()).toMatchObject({
      completedBatchCount: 0,
      completedCandidateFiles: 0,
      remainingCandidateFiles: 1,
    });
  });
});
