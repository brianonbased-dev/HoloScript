import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodebaseScanner } from '../engine/CodebaseScanner';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const RUN_20K_VERIFIER = process.env.ABSORB_RUN_20K_VERIFIER === '1';
const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;
const originalWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
const originalAutoBackground = process.env.ABSORB_AUTO_BACKGROUND;

function git(rootDir: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: rootDir,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

async function waitForStatus(
  jobId: string,
  predicate: (status: Record<string, unknown>) => boolean,
  timeoutMs = 120_000,
  progressSamples?: number[]
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let status: Record<string, unknown> = {};
  while (Date.now() - startedAt < timeoutMs) {
    status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    if (progressSamples) progressSamples.push(Number(status.progress ?? 0));
    if (predicate(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return status;
}

function expectMonotonicProgress(samples: number[]): void {
  expect(samples.length).toBeGreaterThan(1);
  for (let index = 1; index < samples.length; index++) {
    expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  resetCodebaseToolStateForTests(false);
  if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
  else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
  if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
  else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
  if (originalWorkspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  else process.env.HOLOSCRIPT_WORKSPACE_ROOT = originalWorkspaceRoot;
  if (originalAutoBackground === undefined) delete process.env.ABSORB_AUTO_BACKGROUND;
  else process.env.ABSORB_AUTO_BACKGROUND = originalAutoBackground;
});

describe('20k authoritative absorb refresh verifier', () => {
  it.runIf(RUN_20K_VERIFIER)(
    'interrupts once, advances checkout, overlays unchanged batches, and publishes the new pin',
    async () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-absorb-20k-repo-'));
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-absorb-20k-cache-'));
      const sourceDir = path.join(rootDir, 'src');
      fs.mkdirSync(sourceDir, { recursive: true });
      process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
      process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
      process.env.HOLOSCRIPT_WORKSPACE_ROOT = rootDir;
      process.env.ABSORB_AUTO_BACKGROUND = '0';

      git(rootDir, ['init']);
      git(rootDir, ['config', 'user.email', 'codex@example.test']);
      git(rootDir, ['config', 'user.name', 'Codex Test']);
      git(rootDir, ['config', 'core.autocrlf', 'false']);

      for (let index = 0; index < 20_005; index++) {
        fs.writeFileSync(
          path.join(sourceDir, `fixture-${String(index).padStart(5, '0')}.txt`),
          `fixture ${index}\n`,
          'utf-8'
        );
      }
      git(rootDir, ['add', 'src']);
      git(rootDir, ['commit', '-m', '20k plus stale extras']);
      const cacheFile = path.join(cacheDir, 'graph-cache.json');
      const staleHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: rootDir,
        encoding: 'utf-8',
        windowsHide: true,
      }).trim();
      const staleFileHashes = Object.fromEntries(
        Array.from({ length: 20_005 }, (_, index) => [
          `src/fixture-${String(index).padStart(5, '0')}.txt`,
          `stale-${index}`,
        ])
      );
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          version: 2,
          rootDir,
          timestamp: Date.now(),
          stats: { totalFiles: 20_005, totalSymbols: 0 },
          graphJson: '{}',
          gitCommitHash: staleHead,
          fileHashes: staleFileHashes,
          scanPolicy: {
            maxFiles: 20_005,
            maxFileSize: 1024 * 1024,
            respectGitIgnore: true,
            includeUntracked: true,
          },
        }),
        'utf-8'
      );
      const baselineCache = fs.readFileSync(cacheFile, 'utf-8');

      for (let index = 20_000; index < 20_005; index++) {
        fs.unlinkSync(path.join(sourceDir, `fixture-${String(index).padStart(5, '0')}.txt`));
      }
      git(rootDir, ['add', '-u', 'src']);
      git(rootDir, ['commit', '-m', 'remove stale extras']);
      const targetHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: rootDir,
        encoding: 'utf-8',
        windowsHide: true,
      }).trim();

      const originalScanFiles = CodebaseScanner.prototype.scanFiles;
      const scanSpy = vi
        .spyOn(CodebaseScanner.prototype, 'scanFiles')
        .mockImplementation(async function (...args) {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return originalScanFiles.apply(this, args);
        });

      const acceptedAt = Date.now();
      const interruptedProgressSamples: number[] = [];
      const accepted = (await handleCodebaseTool('holo_absorb_repo', {
        rootDir,
        force: true,
        outputFormat: 'stats',
        maxFiles: 20_000,
        scanBatchSize: 250,
        background: true,
      })) as {
        accepted?: boolean;
        jobId?: string;
        resumeToken?: string;
        refreshProgressReceipt?: {
          targetGitCommitHash?: string;
          totalCandidateFiles?: number;
          authoritative?: boolean;
        };
      };
      const acceptanceElapsedMs = Date.now() - acceptedAt;

      expect(acceptanceElapsedMs).toBeLessThan(30_000);
      expect(accepted).toMatchObject({
        accepted: true,
        refreshProgressReceipt: {
          targetGitCommitHash: targetHead,
          totalCandidateFiles: 20_000,
          authoritative: false,
        },
      });

      const progressed = await waitForStatus(
        accepted.jobId!,
        (status) => {
          const receipt = status.refreshProgressReceipt as
            | { completedBatchCount?: number }
            | undefined;
          return (receipt?.completedBatchCount ?? 0) >= 1;
        },
        120_000,
        interruptedProgressSamples
      );
      expect(
        (progressed.refreshProgressReceipt as { completedBatchCount?: number }).completedBatchCount
      ).toBeGreaterThanOrEqual(1);

      await handleCodebaseTool('holo_cancel_absorb', {
        jobId: accepted.jobId,
        reason: '20k verifier interruption',
      });
      const cancelled = await waitForStatus(
        accepted.jobId!,
        (status) => status.status === 'cancelled',
        120_000,
        interruptedProgressSamples
      );
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.refreshProgressReceipt).toMatchObject({
        status: 'interrupted',
        authoritative: false,
        cachePublished: false,
        priorAuthoritativeCachePreserved: true,
        resumable: true,
      });
      expect(fs.readFileSync(cacheFile, 'utf-8')).toBe(baselineCache);
      expectMonotonicProgress(interruptedProgressSamples);

      git(rootDir, ['mv', 'src/fixture-19999.txt', 'src/fixture-renamed-after-checkpoint.txt']);
      git(rootDir, ['commit', '-m', 'advance checkout during interrupted refresh']);
      const publishedTargetHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: rootDir,
        encoding: 'utf-8',
        windowsHide: true,
      }).trim();

      scanSpy.mockRestore();
      const resumedAt = Date.now();
      const resumedProgressSamples: number[] = [];
      const resumed = (await handleCodebaseTool('holo_absorb_repo', {
        rootDir,
        force: true,
        outputFormat: 'stats',
        maxFiles: 20_000,
        scanBatchSize: 250,
        background: true,
      })) as { accepted?: boolean; jobId?: string; resumeToken?: string };
      expect(resumed).toMatchObject({ accepted: true });
      expect(resumed.resumeToken).not.toBe(accepted.resumeToken);

      const completed = await waitForStatus(
        resumed.jobId!,
        (status) => status.status === 'complete',
        180_000,
        resumedProgressSamples
      );
      const resumeElapsedMs = Date.now() - resumedAt;
      expect(completed.refreshProgressReceipt).toMatchObject({
        status: 'complete',
        targetGitCommitHash: publishedTargetHead,
        totalCandidateFiles: 20_000,
        completedCandidateFiles: 20_000,
        remainingCandidateFiles: 0,
        cachePublished: true,
        resumable: false,
        resumeMode: 'content-addressed-overlay',
        targetLag: {
          sourceResumeToken: accepted.resumeToken,
          sourceTargetGitCommitHash: targetHead,
          targetGitCommitHash: publishedTargetHead,
          sourceSelectedCandidateFiles: 20_000,
          targetSelectedCandidateFiles: 20_000,
          selectedCandidateFileDelta: 0,
        },
      });

      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as {
        gitCommitHash?: string;
        fileHashes?: Record<string, string>;
      };
      expect(cache.gitCommitHash).toBe(publishedTargetHead);
      expect(Object.keys(cache.fileHashes ?? {})).toHaveLength(20_000);
      expect(cache.fileHashes?.['src/fixture-19999.txt']).toBeUndefined();
      expect(cache.fileHashes?.['src/fixture-renamed-after-checkpoint.txt']).toMatch(
        /^[a-f0-9]{64}$/
      );

      const status = (await handleCodebaseTool('holo_graph_status', {})) as {
        graphAuthoritative?: boolean;
        freshForCurrentRepo?: boolean;
        coverage?: {
          graphFileCount?: number;
          selectedCandidateCount?: number;
          extraGraphFiles?: number;
          complete?: boolean;
        };
      };
      expect(status.graphAuthoritative).toBe(true);
      expect(status.freshForCurrentRepo).toBe(true);
      expect(status.coverage).toMatchObject({
        graphFileCount: 20_000,
        selectedCandidateCount: 20_000,
        extraGraphFiles: 0,
        complete: true,
      });
      expectMonotonicProgress(resumedProgressSamples);
      expect(resumeElapsedMs).toBeLessThan(180_000);
    },
    300_000
  );
});
