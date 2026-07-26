import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseScanner } from '../engine/CodebaseScanner';
import {
  ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA,
  compactAbsorbRefreshProgressReceipt,
  prepareAbsorbRefreshCheckpoint,
  replaceFileWithRetry,
} from './absorb-refresh-checkpoint';

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
