import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseScanner } from '../engine/CodebaseScanner';
import {
  ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA,
  prepareAbsorbRefreshCheckpoint,
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
    const firstResult = await scanner.scanFiles(rootDir, firstBatch.files);
    checkpoint.persistBatch(firstBatch, firstResult);
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

  it('rejects a resume when the commit pin or selected set changed', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-mismatch-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-refresh-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeFixture(rootDir, 'src/a.txt', 'a\n');

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
    checkpoint.markInterrupted(new Error('stop'));
    const resumeToken = checkpoint.progressReceipt().resumeToken;

    expect(() =>
      prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan,
        targetGitCommitHash: 'b'.repeat(40),
        targetWorktreeFingerprint: null,
        scanPolicyHash: 'policy-v1',
        maxFiles: 10,
        resumeToken,
      })
    ).toThrow(/git commit pin/);

    expect(() =>
      prepareAbsorbRefreshCheckpoint({
        rootDir,
        scanPlan,
        targetGitCommitHash: 'a'.repeat(40),
        targetWorktreeFingerprint: 'dirty-after-checkpoint',
        scanPolicyHash: 'policy-v1',
        maxFiles: 10,
        resumeToken,
      })
    ).toThrow(/worktree fingerprint/);

    writeFixture(rootDir, 'src/b.txt', 'b\n');
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
});
