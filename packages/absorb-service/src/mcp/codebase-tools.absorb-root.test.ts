import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import type { Worker } from 'worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCodebaseTool,
  resetCodebaseToolStateForTests,
  setIsolatedAbsorbWorkerFactoryForTests,
} from './codebase-tools';
import {
  handleGraphRagTool,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';
import { EmbeddingIndex } from '../engine/EmbeddingIndex';
import { CodebaseScanner } from '../engine/CodebaseScanner';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;
const originalWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
const originalAutoBackground = process.env.ABSORB_AUTO_BACKGROUND;
const originalAutoBackgroundScanFileThreshold =
  process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD;
const originalRequireIsolation = process.env.ABSORB_REQUIRE_ISOLATION;

beforeEach(() => {
  process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
});

afterEach(() => {
  setIsolatedAbsorbWorkerFactoryForTests();
  if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
  else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
  if (originalAutoBackground === undefined) {
    delete process.env.ABSORB_AUTO_BACKGROUND;
  } else {
    process.env.ABSORB_AUTO_BACKGROUND = originalAutoBackground;
  }
  if (originalAutoBackgroundScanFileThreshold === undefined) {
    delete process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD;
  } else {
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD =
      originalAutoBackgroundScanFileThreshold;
  }
  if (originalRequireIsolation === undefined) {
    delete process.env.ABSORB_REQUIRE_ISOLATION;
  } else {
    process.env.ABSORB_REQUIRE_ISOLATION = originalRequireIsolation;
  }
});

type GraphUnavailableReceipt = {
  kind?: string;
  reason?: string;
  requestedPath?: string | null;
  runtimePath?: string | null;
  cacheAgeMs?: number | null;
  staleByMs?: number | null;
  authoritative?: boolean;
  recommendation?: string;
  localAdapter?: {
    kind?: string;
    command?: string;
    mcpTool?: string;
    mcpArguments?: string[];
  };
};

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function getHeadCommit(rootDir = process.cwd()): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf-8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function makeTinyGitRepo(prefix: string): string {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
    cwd: repoDir,
    windowsHide: true,
  });
  execFileSync('git', ['config', 'user.name', 'Codex Test'], {
    cwd: repoDir,
    windowsHide: true,
  });
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'src', 'alpha.ts'),
    'export function alpha(): string { return "alpha"; }\n',
    'utf-8'
  );
  fs.writeFileSync(
    path.join(repoDir, 'src', 'beta.ts'),
    'export function beta(): string { return alphaName; }\nconst alphaName = "beta";\n',
    'utf-8'
  );
  execFileSync('git', ['add', 'src/alpha.ts', 'src/beta.ts'], {
    cwd: repoDir,
    windowsHide: true,
  });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });
  return repoDir;
}

function writeGraphCache(
  cacheDir: string,
  rootDir: string,
  timestamp: number,
  gitCommitHash?: string,
  fileHashCount?: number,
  scanPolicy?: Record<string, unknown>
): void {
  const fileHashes =
    fileHashCount === undefined
      ? undefined
      : Object.fromEntries(
          Array.from({ length: fileHashCount }, (_, i) => [`src/generated-${i}.ts`, String(i)])
        );
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'graph-cache.json'),
    JSON.stringify({
      version: 2,
      rootDir,
      timestamp,
      stats: { totalFiles: fileHashCount ?? 12, totalSymbols: 34 },
      graphJson: '{}',
      gitCommitHash,
      fileHashes,
      scanPolicy,
    }),
    'utf-8'
  );
}

function writeGraphCacheWithFileHashes(
  cacheDir: string,
  rootDir: string,
  timestamp: number,
  gitCommitHash: string,
  fileHashes: Record<string, string>,
  scanPolicy?: Record<string, unknown>
): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'graph-cache.json'),
    JSON.stringify({
      version: 2,
      rootDir,
      timestamp,
      stats: { totalFiles: Object.keys(fileHashes).length, totalSymbols: 34 },
      graphJson: '{}',
      gitCommitHash,
      fileHashes,
      scanPolicy,
    }),
    'utf-8'
  );
}

function hashRepoFiles(rootDir: string, files: string[]): Record<string, string> {
  return Object.fromEntries(
    files.map((filePath) => [
      filePath,
      sha256(fs.readFileSync(path.join(rootDir, filePath), 'utf-8')),
    ])
  );
}

function makeLocalCodebaseSnapshotReceipt(
  files: Array<{ path: string; content: string }>,
  roots = [process.cwd()]
): Record<string, unknown> {
  const now = '2026-07-06T12:00:00.000Z';
  return {
    schema: 'LocalCodebaseSnapshotReceipt.v1',
    version: '0.1.0',
    emittedAt: now,
    agent: 'codex-test',
    surface: 'vitest',
    roots,
    rootHashes: roots.map((root) => ({ root, hash: sha256(`${root}|${now}`) })),
    sourceFiles: files.map((file) => ({
      ...file,
      size: Buffer.byteLength(file.content, 'utf-8'),
      hash: sha256(file.content),
      mtime: now,
    })),
    stats: {
      totalFiles: files.length,
      totalBytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf-8'), 0),
      skippedCount: 0,
    },
    skipped: [],
    redactionPolicy: 'test',
    replayCommand: 'holo_absorb_repo --sourceFiles <this-payload>',
    privacyClass: 'local-test',
    freshness: { generatedAt: now },
  };
}

function makeHoloShellSnapshotReceipt(
  file: { path: string; content: string },
  requestedPath = process.cwd()
): Record<string, unknown> {
  const now = '2026-07-06T12:00:00.000Z';
  const sizeBytes = Buffer.byteLength(file.content, 'utf-8');
  const contentHash = sha256(file.content);
  return {
    id: 'local_codebase_snapshot_test',
    workflow: 'absorb-service-replay',
    startedAt: now,
    endedAt: now,
    roots: [
      {
        id: 'holoscript',
        redactedRoot: '[holoscript-root]',
        rootHash: sha256(requestedPath),
        runtimeNamespace: 'local-windows',
        exists: true,
        selectedFileCount: 1,
        skippedFileCount: 0,
      },
    ],
    files: [
      {
        path: file.path,
        sizeBytes,
        contentHash,
        hashAlgorithm: 'sha256',
        privacyClass: 'source',
        includedInSourceFiles: true,
        language: 'typescript',
        modifiedAt: now,
      },
    ],
    skippedFiles: [],
    sourceFiles: [{ path: file.path, contentHash, sizeBytes }],
    totalFiles: 1,
    totalBytes: sizeBytes,
    maxFiles: 500,
    maxBytes: 5 * 1024 * 1024,
    redactionStatus: 'pass',
    status: 'ready',
    excludes: ['.git', 'node_modules', '.env'],
    replayCommand: 'node scripts/holoshell-local-codebase-absorb-bundle.mjs --roots <repo>',
    graphReceipt: {
      authoritative: false,
      reason: 'rootDir_unavailable',
      requestedPath,
      runtimePath: requestedPath,
    },
    hash: sha256(`${file.path}:${contentHash}`),
    hashAlgorithm: 'sha256',
  };
}

async function waitForAbsorbTerminalStatus(
  jobId: string,
  includeResult = false
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId,
      includeResult,
    })) as Record<string, unknown>;
    if (status.status === 'complete' || status.status === 'error') return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return (await handleCodebaseTool('holo_get_absorb_status', { jobId })) as Record<string, unknown>;
}

describe('holo_absorb_repo root validation', () => {
  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    if (originalWorkspaceRoot === undefined) {
      delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    } else {
      process.env.HOLOSCRIPT_WORKSPACE_ROOT = originalWorkspaceRoot;
    }
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
  });

  it('does not replace graph state when a forced scan root is inaccessible', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-missing-root-cache-')
    );
    const missingRoot = path.join(
      os.tmpdir(),
      `holoscript-missing-root-${process.pid}-${Date.now()}`
    );
    const before = (await handleCodebaseTool('holo_graph_status', {})) as {
      rootDir: string | null;
      sessionProvenance?: string | null;
      diskCache?: { rootDir?: string };
    };

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: missingRoot,
      force: true,
      outputFormat: 'stats',
    })) as {
      error?: string;
      jobId?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diagnostics?: { requestedRootDir?: string; resolvedDirExists?: boolean };
    };

    expect(result.error).toBe('rootDir_unavailable');
    expect(result.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'rootDir_unavailable',
      requestedPath: missingRoot,
      runtimePath: path.resolve(missingRoot),
      authoritative: false,
    });
    expect(result.graphUnavailableReceipt?.recommendation).toContain(
      'local HoloShell codebase adapter'
    );
    expect(result.graphUnavailableReceipt?.localAdapter).toMatchObject({
      kind: 'HoloShellLocalAdapterRecommendation',
      mcpTool: 'holo_absorb_repo',
    });
    expect(result.graphUnavailableReceipt?.localAdapter?.command).toContain(
      'scripts/holoshell-local-codebase-absorb-bundle.mjs'
    );
    expect(result.graphUnavailableReceipt?.localAdapter?.command).toContain('--agent <agent-id>');
    expect(result.graphUnavailableReceipt?.localAdapter?.command).toContain(
      '--surface <surface-id>'
    );
    expect(result.graphUnavailableReceipt?.localAdapter?.mcpArguments).toContain(
      'localCodebaseSnapshotReceipt'
    );
    expect(result.diagnostics?.requestedRootDir).toBe(missingRoot);
    expect(result.diagnostics?.resolvedDirExists).toBe(false);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: result.jobId,
      includeResult: true,
    })) as { status?: string; phase?: string; result?: { error?: string } };
    expect(status.status).toBe('error');
    expect(status.phase).toBe('Root directory unavailable');
    expect(status.result?.error).toBe('rootDir_unavailable');

    const after = (await handleCodebaseTool('holo_graph_status', {})) as {
      rootDir: string | null;
      sessionProvenance?: string | null;
      diskCache?: { rootDir?: string };
    };
    expect(after.rootDir).toBe(before.rootDir);
    expect(after.sessionProvenance).toBe(before.sessionProvenance);
    expect(after.diskCache?.rootDir).toBe(before.diskCache?.rootDir);
  }, 15_000);

  it('can start a forced scan in the background and expose failure receipts through status', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-background-root-cache-')
    );
    const missingRoot = path.join(
      os.tmpdir(),
      `holoscript-missing-background-root-${process.pid}-${Date.now()}`
    );

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: missingRoot,
      force: true,
      outputFormat: 'stats',
      async: true,
    })) as {
      accepted?: boolean;
      async?: boolean;
      status?: string;
      jobId?: string;
      pollTool?: string;
      error?: string;
    };

    expect(accepted).toMatchObject({
      accepted: true,
      async: true,
      status: 'queued',
      pollTool: 'holo_get_absorb_status',
    });
    expect(accepted.jobId).toMatch(/^absorb-/);
    expect(accepted.error).toBeUndefined();

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!);
    expect(status.status).toBe('error');
    expect(status.phase).toBe('Root directory unavailable');
    expect(status.result).toBeUndefined();
    expect(status.resultAvailable).toBe(true);
    expect(status.resultBytes).toBeGreaterThan(0);
    expect(status.resultKeys).toContain('graphUnavailableReceipt');

    const statusWithResult = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    expect(statusWithResult.result).toMatchObject({
      error: 'rootDir_unavailable',
      graphUnavailableReceipt: {
        kind: 'GraphUnavailableReceipt',
        reason: 'rootDir_unavailable',
        authoritative: false,
      },
    });
  }, 15_000);

  it('keeps status responsive while an isolated background worker is still running', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-isolated-background-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-isolated-background-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }

      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }

    const worker = new FakeWorker();
    setIsolatedAbsorbWorkerFactoryForTests(() => worker as unknown as Worker);

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as {
      accepted?: boolean;
      backgroundIsolation?: string;
      status?: string;
      jobId?: string;
    };

    expect(accepted).toMatchObject({
      accepted: true,
      backgroundIsolation: 'worker-thread',
      status: 'scanning',
    });

    const statusStartedAt = Date.now();
    const running = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as {
      status?: string;
      phase?: string;
      backgroundIsolation?: string;
      requestEventLoopIsolated?: boolean;
    };
    expect(Date.now() - statusStartedAt).toBeLessThan(100);
    expect(running).toMatchObject({
      status: 'scanning',
      phase: 'Running in isolated worker',
      backgroundIsolation: 'worker-thread',
      requestEventLoopIsolated: true,
    });

    worker.emit('message', {
      type: 'telemetry',
      memory: { rssMb: 321, heapUsedMb: 123 },
    });
    const withWorkerTelemetry = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as Record<string, unknown>;
    expect(withWorkerTelemetry).toMatchObject({
      memoryScope: 'isolated-worker',
      memory: { rssMb: 321, heapUsedMb: 123 },
      memoryBudget: { peakRssMb: 321, peakHeapUsedMb: 123 },
    });

    worker.emit('message', {
      type: 'complete',
      result: {
        incremental: true,
        filesChanged: 1,
        graphAuthoritative: true,
        graphRagReady: true,
        semanticIndexReady: true,
      },
      workerStatus: {
        status: 'complete',
        filesProcessed: 7,
        totalFiles: 7,
        memory: { rssMb: 333, heapUsedMb: 111 },
        memoryBudget: {
          peakRssMb: 350,
          peakHeapUsedMb: 140,
          exceeded: false,
          headroomExhausted: false,
        },
        phaseMetrics: [],
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const completed = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
      includeResult: true,
    })) as {
      status?: string;
      phase?: string;
      result?: {
        jobId?: string;
        isolatedBackground?: boolean;
        graphAuthoritative?: boolean;
      };
    };
    expect(completed).toMatchObject({
      status: 'complete',
      phase: 'Complete (isolated worker)',
      result: {
        jobId: accepted.jobId,
        graphAuthoritative: true,
      },
      memoryScope: 'isolated-worker',
      memory: { rssMb: 333, heapUsedMb: 111 },
      memoryBudget: { peakRssMb: 350, peakHeapUsedMb: 140 },
      filesProcessed: 7,
      totalFiles: 7,
    });
  });

  it('materializes the parent scan policy into isolated worker arguments', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-isolated-policy-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-isolated-policy-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }

      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }

    const worker = new FakeWorker();
    let workerArgs: Record<string, unknown> | undefined;
    setIsolatedAbsorbWorkerFactoryForTests((workerData) => {
      workerArgs = workerData.args;
      return worker as unknown as Worker;
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      background: true,
      force: true,
    })) as {
      accepted?: boolean;
      jobId?: string;
      scanPolicy?: { maxFiles?: number };
      resumeToken?: string;
    };

    expect(accepted.accepted).toBe(true);
    expect(accepted.resumeToken).toMatch(/^[a-f0-9]{32}$/);
    expect(accepted.scanPolicy?.maxFiles).toBe(20_000);
    expect(workerArgs).toMatchObject({
      maxFiles: 20_000,
      includeHidden: false,
      includeBuildArtifacts: false,
      respectGitIgnore: true,
      includeUntracked: true,
      resumeToken: accepted.resumeToken,
    });

    worker.emit('message', {
      type: 'complete',
      result: { graphAuthoritative: true, embeddingSkipped: true },
      workerStatus: { status: 'complete', filesProcessed: 2, totalFiles: 2 },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('coalesces concurrent writers for the same workspace into one job', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-single-flight-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-single-flight-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }
      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }

    const worker = new FakeWorker();
    let workerStarts = 0;
    setIsolatedAbsorbWorkerFactoryForTests(() => {
      workerStarts += 1;
      return worker as unknown as Worker;
    });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { jobId?: string; accepted?: boolean };
    const second = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [repoDir],
      outputFormat: 'graph',
      async: true,
      force: true,
    })) as {
      jobId?: string;
      accepted?: boolean;
      coalesced?: boolean;
      coalescedReason?: string;
    };

    expect(first.accepted).toBe(true);
    expect(second).toMatchObject({
      accepted: true,
      coalesced: true,
      coalescedReason: 'workspace_absorb_already_active',
      jobId: first.jobId,
    });
    expect(workerStarts).toBe(1);
  });

  it('surfaces isolated scan checkpoint progress from the durable receipt', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-worker-progress-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-worker-progress-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }
      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }
    setIsolatedAbsorbWorkerFactoryForTests(() => new FakeWorker() as unknown as Worker);

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
      force: true,
    })) as {
      jobId?: string;
      refreshProgressReceipt?: {
        receiptFile?: string;
      };
    };
    const receiptFile = accepted.refreshProgressReceipt?.receiptFile;
    expect(receiptFile).toBeTruthy();
    const receipt = JSON.parse(fs.readFileSync(receiptFile!, 'utf-8')) as Record<string, unknown>;
    fs.writeFileSync(
      receiptFile!,
      JSON.stringify({
        ...receipt,
        status: 'scanning',
        progressPercent: 50,
        completedBatchCount: 1,
        totalBatches: 2,
        completedCandidateFiles: 1,
        remainingCandidateFiles: 1,
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    );

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as Record<string, unknown>;
    expect(status).toMatchObject({
      status: 'scanning',
      progress: 30,
      phase: 'Scanning checkpoint batches 1/2',
      filesProcessed: 1,
      totalFiles: 2,
      rssScope: 'shared-worker-thread-process',
      heapScope: 'isolated-worker-isolate',
      refreshProgressReceipt: {
        status: 'scanning',
        progressPercent: 50,
        completedBatchCount: 1,
        totalBatches: 2,
      },
    });
  });

  it('never expires an active job and retains terminal status for a full hour', async () => {
    vi.useFakeTimers();
    try {
      resetCodebaseToolStateForTests();
      const repoDir = makeTinyGitRepo('holoscript-job-retention-repo-');
      process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
        path.join(os.tmpdir(), 'holoscript-job-retention-cache-')
      );

      class FakeWorker extends EventEmitter {
        unref(): this {
          return this;
        }
        terminate(): Promise<number> {
          return Promise.resolve(0);
        }
      }
      const worker = new FakeWorker();
      setIsolatedAbsorbWorkerFactoryForTests(() => worker as unknown as Worker);
      const accepted = (await handleCodebaseTool('holo_absorb_repo', {
        rootDir: repoDir,
        outputFormat: 'stats',
        async: true,
      })) as { jobId?: string };

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(
        await handleCodebaseTool('holo_get_absorb_status', { jobId: accepted.jobId })
      ).toMatchObject({ status: 'scanning' });

      worker.emit('message', {
        type: 'complete',
        result: { stats: { totalFiles: 2 }, graphAuthoritative: true },
      });
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(
        await handleCodebaseTool('holo_get_absorb_status', { jobId: accepted.jobId })
      ).toMatchObject({ status: 'complete' });

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(
        await handleCodebaseTool('holo_get_absorb_status', { jobId: accepted.jobId })
      ).toMatchObject({ error: 'Job not found' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('terminates an isolated background worker when cancellation is requested', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-isolated-cancel-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-isolated-cancel-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      terminated = false;

      unref(): this {
        return this;
      }

      terminate(): Promise<number> {
        this.terminated = true;
        queueMicrotask(() => this.emit('exit', 1));
        return Promise.resolve(1);
      }
    }

    const worker = new FakeWorker();
    setIsolatedAbsorbWorkerFactoryForTests(() => worker as unknown as Worker);
    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { jobId?: string };

    const cancellation = (await handleCodebaseTool('holo_cancel_absorb', {
      jobId: accepted.jobId,
      reason: 'transport cancellation canary',
    })) as { accepted?: boolean; status?: string };
    expect(cancellation).toMatchObject({ accepted: true, status: 'cancelling' });
    expect(worker.terminated).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as { status?: string; cancellation?: { reason?: string } };
    expect(status).toMatchObject({
      status: 'cancelled',
      cancellation: { reason: 'cancel_requested' },
    });
  });

  it('auto-backgrounds cold large filesystem scans before the foreground call can time out', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-auto-background-cache-')
    );
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '3';

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-auto-background-root-'));
    const srcDir = path.join(rootDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(srcDir, `file-${i}.ts`),
        `export function autoBackgroundFixture${i}(): number { return ${i}; }\n`,
        'utf-8'
      );
    }

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      outputFormat: 'stats',
    })) as {
      accepted?: boolean;
      async?: boolean;
      autoBackground?: boolean;
      autoBackgroundReason?: string;
      foregroundThresholdFiles?: number;
      jobId?: string;
      pollTool?: string;
      scanPlan?: {
        mode?: string;
        totalCandidateFiles?: number;
      };
    };

    expect(accepted).toMatchObject({
      accepted: true,
      async: true,
      autoBackground: true,
      autoBackgroundReason: 'scan_plan_exceeds_foreground_threshold',
      foregroundThresholdFiles: 3,
      pollTool: 'holo_get_absorb_status',
      scanPlan: {
        mode: 'module-batched',
        totalCandidateFiles: 3,
      },
    });
    expect(accepted.jobId).toMatch(/^absorb-/);

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    expect(status.status).toBe('complete');
    expect(status.result).toMatchObject({
      rootDir,
      stats: {
        totalFiles: 3,
      },
      embeddingSkipped: true,
      embeddingSkipReason: 'outputFormat:stats',
    });
  }, 15_000);

  it('fails closed when a large scan cannot start its isolated worker', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-isolation-required-cache-')
    );
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '1';
    process.env.ABSORB_REQUIRE_ISOLATION = '1';
    const rootDir = makeTinyGitRepo('holoscript-isolation-required-repo-');
    setIsolatedAbsorbWorkerFactoryForTests(() => {
      throw new Error('worker bootstrap unavailable');
    });

    const rejected = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      outputFormat: 'stats',
    })) as Record<string, unknown>;

    expect(rejected).toMatchObject({
      accepted: false,
      async: false,
      error: 'absorb_background_isolation_unavailable',
      status: 'error',
      cachePreserved: true,
    });
    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: rejected.jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    expect(status).toMatchObject({
      status: 'error',
      phase: 'Worker isolation unavailable',
      result: {
        error: 'absorb_background_isolation_unavailable',
        cachePreserved: true,
      },
    });
  });

  it('does not recursively auto-background once execution is inside the isolated worker', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-isolated-inner-cache-')
    );
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '1';
    const rootDir = makeTinyGitRepo('holoscript-isolated-inner-repo-');
    let nestedWorkerStarts = 0;
    setIsolatedAbsorbWorkerFactoryForTests(() => {
      nestedWorkerStarts += 1;
      throw new Error('nested worker must not start');
    });

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      outputFormat: 'stats',
      __isolatedBackgroundWorker: true,
    })) as {
      accepted?: boolean;
      async?: boolean;
      error?: string;
      stats?: { totalFiles?: number };
    };

    expect(result.error).toBeUndefined();
    expect(result.accepted).toBeUndefined();
    expect(result.async).toBeUndefined();
    expect(result.stats?.totalFiles).toBe(2);
    expect(nestedWorkerStarts).toBe(0);
  });

  it('keeps multi-root cache coverage authoritative and refreshes every root', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-multi-root-cache-'));
    const primaryRoot = makeTinyGitRepo('holoscript-multi-root-primary-');
    const secondaryRoot = makeTinyGitRepo('holoscript-multi-root-secondary-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = primaryRoot;

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [primaryRoot, secondaryRoot],
      outputFormat: 'stats',
      force: true,
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      stats?: { totalFiles?: number };
    };
    expect(first.error).toBeUndefined();
    expect(first.graphAuthoritative).toBe(true);
    expect(first.stats?.totalFiles).toBe(4);

    const firstEnvelope = JSON.parse(
      fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')
    ) as {
      rootDirs?: string[];
      coverageAtScan?: {
        complete?: boolean;
        rootCount?: number;
        expectedGraphFileCount?: number;
        graphFileCount?: number;
        overInclusive?: boolean;
      };
      fileHashes?: Record<string, string>;
    };
    expect(firstEnvelope.rootDirs?.map((entry) => path.resolve(entry))).toEqual([
      path.resolve(primaryRoot),
      path.resolve(secondaryRoot),
    ]);
    expect(firstEnvelope.coverageAtScan).toMatchObject({
      complete: true,
      rootCount: 2,
      expectedGraphFileCount: 4,
      graphFileCount: 4,
      overInclusive: false,
    });
    const firstSecondaryDigest =
      firstEnvelope.fileHashes?.['../' + path.basename(secondaryRoot) + '/src/alpha.ts'];

    fs.writeFileSync(
      path.join(secondaryRoot, 'src', 'alpha.ts'),
      'export function alpha(): number { return 99; }\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: secondaryRoot, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'update secondary'], {
      cwd: secondaryRoot,
      windowsHide: true,
    });

    const refreshed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [primaryRoot, secondaryRoot],
      outputFormat: 'stats',
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      multiRootRefresh?: string;
      stats?: { totalFiles?: number };
    };
    expect(refreshed).toMatchObject({
      graphAuthoritative: true,
      multiRootRefresh: 'full-scan',
      stats: { totalFiles: 4 },
    });

    const refreshedEnvelope = JSON.parse(
      fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')
    ) as { fileHashes?: Record<string, string> };
    const refreshedSecondaryDigest =
      refreshedEnvelope.fileHashes?.['../' + path.basename(secondaryRoot) + '/src/alpha.ts'];
    expect(refreshedSecondaryDigest).toBeTruthy();
    expect(refreshedSecondaryDigest).not.toBe(firstSecondaryDigest);
  }, 30_000);

  it('interrupts and resumes a forced refresh without replacing the prior authoritative graph', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-resume-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-resume-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
    })) as { stats?: { totalFiles?: number }; gitCommitHash?: string };
    expect(baseline.stats?.totalFiles).toBe(2);
    const baselineCache = fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8');

    for (let index = 0; index < 4; index++) {
      fs.writeFileSync(
        path.join(repoDir, 'src', `resume-${index}.ts`),
        `export const resumeFixture${index} = ${index};\n`,
        'utf-8'
      );
    }
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'expand fixture'], { cwd: repoDir, windowsHide: true });
    const targetHead = getHeadCommit(repoDir);

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return originalScanFiles.apply(this, args);
    });

    const acceptedAt = Date.now();
    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
      background: true,
    })) as {
      accepted?: boolean;
      jobId?: string;
      resumeToken?: string;
      refreshProgressReceipt?: {
        status?: string;
        authoritative?: boolean;
        targetGitCommitHash?: string;
        totalCandidateFiles?: number;
        completedBatchCount?: number;
      };
    };

    expect(Date.now() - acceptedAt).toBeLessThan(30_000);
    expect(accepted.accepted).toBe(true);
    expect(accepted.resumeToken).toMatch(/^[a-f0-9]{32}$/);
    expect(accepted.refreshProgressReceipt).toMatchObject({
      status: 'prepared',
      authoritative: false,
      targetGitCommitHash: targetHead,
      totalCandidateFiles: 6,
      completedBatchCount: 0,
    });

    let progress: {
      status?: string;
      refreshProgressReceipt?: {
        status?: string;
        authoritative?: boolean;
        cachePublished?: boolean;
        priorAuthoritativeCachePreserved?: boolean;
        resumable?: boolean;
        completedBatchCount?: number;
      };
    } = {};
    for (let index = 0; index < 100; index++) {
      progress = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as typeof progress;
      if ((progress.refreshProgressReceipt?.completedBatchCount ?? 0) >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(progress.refreshProgressReceipt?.completedBatchCount).toBeGreaterThanOrEqual(1);

    await handleCodebaseTool('holo_cancel_absorb', {
      jobId: accepted.jobId,
      reason: 'resume verifier interruption',
    });
    for (let index = 0; index < 100; index++) {
      progress = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as typeof progress;
      if (progress.status === 'cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(progress.status).toBe('cancelled');
    expect(progress.refreshProgressReceipt).toMatchObject({
      status: 'interrupted',
      authoritative: false,
      cachePublished: false,
      priorAuthoritativeCachePreserved: true,
      resumable: true,
    });
    expect(fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')).toBe(baselineCache);

    const resumed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
      background: true,
      resumeToken: accepted.resumeToken,
    })) as { accepted?: boolean; jobId?: string; resumeToken?: string };
    expect(resumed).toMatchObject({
      accepted: true,
      resumeToken: accepted.resumeToken,
    });

    const completed = await waitForAbsorbTerminalStatus(resumed.jobId!, true);
    expect(completed.status).toBe('complete');
    expect(completed.refreshProgressReceipt).toMatchObject({
      status: 'complete',
      targetGitCommitHash: targetHead,
      totalCandidateFiles: 6,
      completedBatchCount: 6,
      remainingCandidateFiles: 0,
      cachePublished: true,
      resumable: false,
    });

    const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')) as {
      gitCommitHash?: string;
      fileHashes?: Record<string, string>;
    };
    expect(cache.gitCommitHash).toBe(targetHead);
    expect(Object.keys(cache.fileHashes ?? {}).sort()).toEqual([
      'src/alpha.ts',
      'src/beta.ts',
      'src/resume-0.ts',
      'src/resume-1.ts',
      'src/resume-2.ts',
      'src/resume-3.ts',
    ]);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      coverage?: { complete?: boolean; extraGraphFiles?: number; graphFileCount?: number };
    };
    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.coverage).toMatchObject({
      complete: true,
      extraGraphFiles: 0,
      graphFileCount: 6,
    });
  }, 30_000);

  it('returns a graph unavailable receipt when the disk cache is stale', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-stale-graph-cache-'));
    // Use process.cwd() as rootDir so cacheMatchesCwd is true, testing actual staleness
    const requestedRoot = process.cwd();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 27 * 60 * 60 * 1000);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: { stale?: boolean; authoritative?: boolean };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.diskCache?.stale).toBe(true);
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      requestedPath: requestedRoot,
      runtimePath: path.resolve(requestedRoot),
      authoritative: false,
    });
    expect(status.graphUnavailableReceipt?.cacheAgeMs).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(status.graphUnavailableReceipt?.staleByMs).toBeGreaterThan(0);
  });

  it('does not emit a graph unavailable receipt for a fresh disk cache matching cwd', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-fresh-graph-cache-'));
    const requestedRoot = makeTinyGitRepo('holoscript-fresh-graph-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = requestedRoot;
    writeGraphCacheWithFileHashes(
      cacheDir,
      requestedRoot,
      Date.now() - 5 * 60 * 1000,
      getHeadCommit(requestedRoot),
      hashRepoFiles(requestedRoot, ['src/alpha.ts', 'src/beta.ts'])
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      currentCwd?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        freshByAge?: boolean;
        authoritative?: boolean;
        freshForCurrentRepo?: boolean;
        rootDir?: string;
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.currentCwd).toBe(path.resolve(requestedRoot));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.freshByAge).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('marks a fresh-age disk cache stale when its git hash differs from HEAD', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-stale-cache-'));
    const requestedRoot = makeTinyGitRepo('holoscript-git-stale-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = requestedRoot;
    writeGraphCache(
      cacheDir,
      requestedRoot,
      Date.now() - 5 * 60 * 1000,
      '1111111111111111111111111111111111111111',
      2
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        freshByAge?: boolean;
        authoritative?: boolean;
        gitCommitHash?: string | null;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
        hint?: string;
      };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.diskCache?.freshByAge).toBe(true);
    expect(status.diskCache?.fresh).toBe(false);
    expect(status.diskCache?.stale).toBe(true);
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.diskCache?.gitCommitHash).toBe('1111111111111111111111111111111111111111');
    expect(status.diskCache?.currentGitCommitHash).toBe(getHeadCommit(requestedRoot));
    expect(status.diskCache?.gitCommitMatchesHead).toBe(false);
    expect(status.diskCache?.hint).toContain('111111111111');
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      authoritative: false,
    });
  });

  it('keeps a HEAD-churned disk cache authoritative when cached file hashes still match', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-hash-fresh-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-git-hash-fresh-repo-');
    const oldHead = getHeadCommit(repoDir);
    const fileHashes = hashRepoFiles(repoDir, ['src/alpha.ts', 'src/beta.ts']);
    execFileSync('git', ['commit', '--allow-empty', '-m', 'head churn'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const currentHead = getHeadCommit(repoDir);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      oldHead,
      fileHashes
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      authorityCaveats?: string[];
      fileHashFreshForHeadMismatch?: boolean;
      fileHashFreshness?: { checked?: boolean; fresh?: boolean; reason?: string };
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        authoritative?: boolean;
        gitCommitHash?: string | null;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
        fileHashFreshForHeadMismatch?: boolean;
        fileHashFreshness?: {
          checked?: boolean;
          fresh?: boolean;
          reason?: string;
          storedFileCount?: number;
          checkedFileCount?: number;
        };
        authorityCaveats?: string[];
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.fileHashFreshForHeadMismatch).toBe(true);
    expect(status.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: true,
      reason: 'all_hashes_match',
    });
    expect(status.authorityCaveats).toContain('git_head_mismatch_but_file_hashes_match');
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.gitCommitHash).toBe(oldHead);
    expect(status.diskCache?.currentGitCommitHash).toBe(currentHead);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(false);
    expect(status.diskCache?.fileHashFreshForHeadMismatch).toBe(true);
    expect(status.diskCache?.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: true,
      reason: 'all_hashes_match',
      storedFileCount: 2,
      checkedFileCount: 2,
    });
    expect(status.diskCache?.authorityCaveats).toContain('git_head_mismatch_but_file_hashes_match');
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('promotes an implicitly reused capped policy and keeps readiness aligned with authority', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-inherit-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-policy-inherit-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
      maxFiles: 1,
    })) as {
      stats?: { totalFiles?: number };
      scanPolicy?: { maxFiles?: number };
      gitCommitHash?: string;
      graphAuthoritative?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      graphCoverage?: { cappedByMaxFiles?: boolean; selectedCandidateCount?: number };
      semanticIndexReadiness?: {
        graphAuthoritative?: boolean;
        graphRagReady?: boolean;
        semanticIndexReady?: boolean;
      };
    };
    const cappedSemanticSearch = (await handleGraphRagTool('holo_semantic_search', {
      query: 'alpha',
      useCachedAbsorbIndex: true,
    })) as { error?: string };
    const oldHead = initial.gitCommitHash;
    execFileSync('git', ['commit', '--allow-empty', '-m', 'head churn'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const currentHead = getHeadCommit(repoDir);

    const refresh = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: false,
    })) as {
      cached?: boolean;
      incremental?: boolean;
      filesChanged?: number;
      stats?: { totalFiles?: number };
      scanPolicy?: { maxFiles?: number };
      gitCommitHash?: string;
      repairedIncompleteCache?: boolean;
      policyChanged?: boolean;
      repairedCappedCache?: boolean;
      promotedMaxFiles?: number;
      graphAuthoritative?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      graphCoverage?: { cappedByMaxFiles?: boolean; selectedCandidateCount?: number };
    };

    expect(oldHead).not.toBe(currentHead);
    expect(initial.stats?.totalFiles).toBe(1);
    expect(initial.scanPolicy?.maxFiles).toBe(1);
    expect(initial.graphAuthoritative).toBe(false);
    expect(initial.graphRagReady).toBe(false);
    expect(initial.semanticIndexReady).toBe(false);
    expect(initial.graphCoverage).toMatchObject({
      cappedByMaxFiles: true,
      selectedCandidateCount: 2,
    });
    expect(initial.semanticIndexReadiness).toMatchObject({
      graphAuthoritative: false,
      graphRagReady: false,
      semanticIndexReady: false,
    });
    expect(cappedSemanticSearch.error).toContain('No embedding index');
    expect(refresh.cached).toBeUndefined();
    expect(refresh.incremental).toBeUndefined();
    expect(refresh.filesChanged).toBeUndefined();
    expect(refresh.stats?.totalFiles).toBe(2);
    expect(refresh.scanPolicy?.maxFiles).toBe(2);
    expect(refresh.gitCommitHash).toBe(currentHead);
    expect(refresh.repairedIncompleteCache).toBe(true);
    expect(refresh.policyChanged).toBe(true);
    expect(refresh.repairedCappedCache).toBe(true);
    expect(refresh.promotedMaxFiles).toBe(2);
    expect(refresh.graphAuthoritative).toBe(true);
    expect(refresh.graphRagReady).toBe(true);
    expect(refresh.semanticIndexReady).toBe(true);
    expect(refresh.graphCoverage).toMatchObject({
      cappedByMaxFiles: false,
      selectedCandidateCount: 2,
    });

    resetCodebaseToolStateForTests();
    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      diskCache?: {
        freshForCurrentRepo?: boolean;
        gitCommitHash?: string | null;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
        scanPolicy?: { maxFiles?: number };
        coverage?: { cappedByMaxFiles?: boolean };
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.diskCache?.gitCommitHash).toBe(currentHead);
    expect(status.diskCache?.currentGitCommitHash).toBe(currentHead);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(true);
    expect(status.diskCache?.scanPolicy?.maxFiles).toBe(2);
    expect(status.diskCache?.coverage?.cappedByMaxFiles).toBe(false);
  }, 30_000);

  it('defaults new scans to a 20k coverage ceiling for the current monorepo scale', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-default-policy-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-default-policy-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
    })) as {
      scanPolicy?: { maxFiles?: number };
      stats?: { totalFiles?: number };
    };

    expect(result.stats?.totalFiles).toBe(2);
    expect(result.scanPolicy?.maxFiles).toBe(20_000);
  });

  it('promotes a cached cap before a missing stored commit forces a rescan', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-rescan-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-policy-rescan-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';
    writeGraphCache(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      '1111111111111111111111111111111111111111',
      1,
      { maxFiles: 1 }
    );

    const refresh = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: false,
    })) as {
      stats?: { totalFiles?: number };
      scanPolicy?: { maxFiles?: number };
      gitCommitHash?: string;
      scanPlan?: { totalCandidateFiles?: number };
      repairedCappedCache?: boolean;
      promotedMaxFiles?: number;
    };

    expect(refresh.stats?.totalFiles).toBe(2);
    expect(refresh.scanPolicy?.maxFiles).toBe(2);
    expect(refresh.scanPlan?.totalCandidateFiles).toBe(2);
    expect(refresh.repairedCappedCache).toBe(true);
    expect(refresh.promotedMaxFiles).toBe(2);
    expect(refresh.gitCommitHash).toBe(getHeadCommit(repoDir));
  });

  it('rejects a HEAD-churned disk cache when a cached file hash changed', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-hash-stale-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-git-hash-stale-repo-');
    const oldHead = getHeadCommit(repoDir);
    const fileHashes = hashRepoFiles(repoDir, ['src/alpha.ts', 'src/beta.ts']);
    fs.appendFileSync(path.join(repoDir, 'src', 'alpha.ts'), '\nexport const changed = true;\n');
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'change alpha'], { cwd: repoDir, windowsHide: true });
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      oldHead,
      fileHashes
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        authoritative?: boolean;
        gitCommitMatchesHead?: boolean;
        fileHashFreshForHeadMismatch?: boolean;
        fileHashFreshness?: {
          checked?: boolean;
          fresh?: boolean;
          reason?: string;
          modifiedFileCount?: number;
          modifiedFileSample?: string[];
        };
      };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.diskCache?.fresh).toBe(false);
    expect(status.diskCache?.stale).toBe(true);
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(false);
    expect(status.diskCache?.fileHashFreshForHeadMismatch).toBe(false);
    expect(status.diskCache?.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: false,
      reason: 'hash_mismatch',
      modifiedFileCount: 1,
      modifiedFileSample: ['src/alpha.ts'],
    });
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      authoritative: false,
    });
  });

  it('keeps a fresh disk cache authoritative when its git hash matches HEAD', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-fresh-cache-'));
    const requestedRoot = makeTinyGitRepo('holoscript-git-fresh-repo-');
    const head = getHeadCommit(requestedRoot);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = requestedRoot;
    writeGraphCacheWithFileHashes(
      cacheDir,
      requestedRoot,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(requestedRoot, ['src/alpha.ts', 'src/beta.ts'])
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        authoritative?: boolean;
        gitCommitHash?: string | null;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.gitCommitHash).toBe(head);
    expect(status.diskCache?.currentGitCommitHash).toBe(head);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(true);
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('uses the persisted worktree fingerprint for repeated matching-HEAD status checks', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-fingerprint-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-status-fingerprint-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
    })) as { error?: string };
    expect(absorbed.error).toBeUndefined();

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      fileHashFreshness?: {
        checked?: boolean;
        fresh?: boolean;
        verificationMode?: string;
      };
    };
    expect(status.graphAuthoritative).toBe(true);
    expect(status.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: true,
      verificationMode: 'git-worktree-fingerprint',
    });

    fs.appendFileSync(path.join(repoDir, 'src', 'alpha.ts'), '\nexport const changed = true;\n');
    const changed = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      fileHashFreshness?: {
        fresh?: boolean;
        verificationMode?: string;
        modifiedFileSample?: string[];
      };
    };
    expect(changed.graphAuthoritative).toBe(false);
    expect(changed.fileHashFreshness).toMatchObject({
      fresh: false,
      verificationMode: 'full-file-hash',
      modifiedFileSample: ['src/alpha.ts'],
    });
  });

  it('invalidates a matching-HEAD cache when the dirty worktree changes after scanning', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-dirty-hash-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-dirty-hash-repo-');
    const alphaPath = path.join(repoDir, 'src', 'alpha.ts');
    const head = getHeadCommit(repoDir);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    fs.appendFileSync(alphaPath, '\nexport const dirtyAtScan = true;\n');
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(repoDir, ['src/alpha.ts', 'src/beta.ts'])
    );

    const freshStatus = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      fileHashFreshness?: { checked?: boolean; fresh?: boolean };
      diskCache?: { gitCommitMatchesHead?: boolean };
    };
    expect(freshStatus.graphAuthoritative).toBe(true);
    expect(freshStatus.diskCache?.gitCommitMatchesHead).toBe(true);
    expect(freshStatus.fileHashFreshness).toMatchObject({ checked: true, fresh: true });

    fs.appendFileSync(alphaPath, '\nexport const dirtyAfterScan = true;\n');
    resetCodebaseToolStateForTests();

    const staleStatus = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      fileHashFreshness?: {
        checked?: boolean;
        fresh?: boolean;
        modifiedFileSample?: string[];
      };
      diskCache?: {
        gitCommitMatchesHead?: boolean;
        hint?: string;
      };
      graphUnavailableReceipt?: GraphUnavailableReceipt;
    };
    expect(staleStatus.graphAuthoritative).toBe(false);
    expect(staleStatus.diskCache?.gitCommitMatchesHead).toBe(true);
    expect(staleStatus.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: false,
      modifiedFileSample: ['src/alpha.ts'],
    });
    expect(staleStatus.diskCache?.hint).toContain('file hashes no longer match');
    expect(staleStatus.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      authoritative: false,
    });

    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    resetCodebaseToolStateForTests(false);
    const stagedQuery = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as { error?: string; graphUnavailableReceipt?: GraphUnavailableReceipt };
    expect(stagedQuery.error).toContain('No codebase graph loaded');
    expect(stagedQuery.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      authoritative: false,
    });
  });

  it('refuses whole-repo authority when coverage is capped by maxFiles', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-capped-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-capped-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(repoDir, 'src', `tracked-${i}.ts`),
        `export const tracked${i} = ${i};\n`,
        'utf-8'
      );
    }
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });
    const head = getHeadCommit(repoDir);
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(repoDir, ['src/tracked-0.ts', 'src/tracked-1.ts']),
      { maxFiles: 2 }
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      authorityCaveats?: string[];
      coverage?: {
        complete?: boolean;
        graphFileCount?: number;
        expectedGraphFileCount?: number;
        trackedCandidateCount?: number;
        cappedByMaxFiles?: boolean;
      };
      diskCache?: {
        authoritative?: boolean;
        authorityCaveats?: string[];
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
          trackedCandidateCount?: number;
          cappedByMaxFiles?: boolean;
        };
      };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 3,
      cappedByMaxFiles: true,
    });
    expect(status.authorityCaveats).toContain(
      'graph_coverage_capped_at_2_of_3_git_visible_candidates'
    );
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.diskCache?.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 3,
      cappedByMaxFiles: true,
    });
    expect(status.diskCache?.authorityCaveats).toContain(
      'graph_coverage_capped_at_2_of_3_git_visible_candidates'
    );
  });

  it('treats scanner-size-skipped files as ineligible for coverage', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-size-skip-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-size-skip-repo-'));
    const originalCwd = process.cwd();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(repoDir, 'src', `eligible-${i}.ts`),
        `export const eligible${i} = ${i};\n`,
        'utf-8'
      );
    }
    fs.writeFileSync(
      path.join(repoDir, 'src', 'too-large.ts'),
      `export const tooLarge = "${'x'.repeat(1024 * 1024 + 1)}";\n`,
      'utf-8'
    );
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir, windowsHide: true });
    const head = getHeadCommit(repoDir);
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(repoDir, ['src/eligible-0.ts', 'src/eligible-1.ts', 'src/eligible-2.ts'])
    );

    try {
      process.chdir(repoDir);
      const status = (await handleCodebaseTool('holo_graph_status', {})) as {
        graphAuthoritative?: boolean;
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
          trackedCandidateCount?: number;
        };
        diskCache?: {
          authoritative?: boolean;
          coverage?: {
            complete?: boolean;
            graphFileCount?: number;
            expectedGraphFileCount?: number;
            trackedCandidateCount?: number;
          };
        };
        graphUnavailableReceipt?: GraphUnavailableReceipt;
      };

      expect(status.graphAuthoritative).toBe(true);
      expect(status.coverage).toMatchObject({
        complete: true,
        graphFileCount: 3,
        expectedGraphFileCount: 3,
        trackedCandidateCount: 3,
      });
      expect(status.diskCache?.authoritative).toBe(true);
      expect(status.diskCache?.coverage).toMatchObject({
        complete: true,
        graphFileCount: 3,
        expectedGraphFileCount: 3,
        trackedCandidateCount: 3,
      });
      expect(status.graphUnavailableReceipt).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('keeps policy-excluded tracked files out of coverage for side-cache scans', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, '.claude', 'skills', 'holoshell'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, 'runtime', 'shared', 'receipts'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, '.scratch'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'src', 'visible.ts'),
      'export const visible = true;\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, '.claude', 'skills', 'holoshell', 'SKILL.md'),
      '# HoloShell\n\nLocal custody workflow.\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, 'runtime', 'shared', 'receipts', 'private.ts'),
      'export const privateReceipt = true;\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, '.scratch', 'scratch.ts'),
      'export const scratch = true;\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, 'src', 'access_token.ts'),
      'export const token = "redacted";\n',
      'utf-8'
    );
    execFileSync(
      'git',
      [
        'add',
        'src/visible.ts',
        '.claude/skills/holoshell/SKILL.md',
        'runtime/shared/receipts/private.ts',
        '.scratch/scratch.ts',
        'src/access_token.ts',
      ],
      { cwd: repoDir, windowsHide: true }
    );
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });

    const scanPolicy = {
      includeHidden: true,
      excludePathFragments: ['/.scratch/', '/runtime/shared/receipts/'],
      excludeNameFragments: ['access_token'],
    };

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
      ...scanPolicy,
    })) as {
      stats?: { totalFiles?: number };
      scanPolicy?: {
        includeHidden?: boolean;
        excludePathFragments?: string[];
        excludeNameFragments?: string[];
      };
    };

    expect(result.stats?.totalFiles).toBe(2);
    expect(result.scanPolicy).toMatchObject(scanPolicy);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      coverage?: {
        complete?: boolean;
        graphFileCount?: number;
        expectedGraphFileCount?: number;
        trackedCandidateCount?: number;
      };
      diskCache?: {
        authoritative?: boolean;
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
          trackedCandidateCount?: number;
        };
        scanPolicy?: {
          includeHidden?: boolean;
          excludePathFragments?: string[];
          excludeNameFragments?: string[];
        };
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 2,
    });
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 2,
    });
    expect(status.diskCache?.scanPolicy).toMatchObject(scanPolicy);
  });

  it('applies maxFileSize consistently to scanning and coverage receipts', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-size-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-policy-size-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'src', 'small.ts'), 'export const small = 1;\n', 'utf-8');
    fs.writeFileSync(
      path.join(repoDir, 'src', 'large.ts'),
      `export const large = "${'x'.repeat(512)}";\n`,
      'utf-8'
    );
    execFileSync('git', ['add', 'src/small.ts', 'src/large.ts'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
      maxFileSize: 64,
    })) as {
      stats?: { totalFiles?: number };
      scanPolicy?: { maxFileSize?: number };
    };

    expect(result.stats?.totalFiles).toBe(1);
    expect(result.scanPolicy?.maxFileSize).toBe(64);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      coverage?: {
        complete?: boolean;
        graphFileCount?: number;
        expectedGraphFileCount?: number;
        trackedCandidateCount?: number;
      };
      diskCache?: {
        authoritative?: boolean;
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
          trackedCandidateCount?: number;
        };
        scanPolicy?: { maxFileSize?: number };
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.coverage).toMatchObject({
      complete: true,
      graphFileCount: 1,
      expectedGraphFileCount: 1,
      trackedCandidateCount: 1,
    });
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.coverage).toMatchObject({
      complete: true,
      graphFileCount: 1,
      expectedGraphFileCount: 1,
      trackedCandidateCount: 1,
    });
    expect(status.diskCache?.scanPolicy?.maxFileSize).toBe(64);
  });

  it('counts non-ignored untracked source in authoritative workspace coverage', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-overinclusive-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-overinclusive-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'src', 'tracked.ts'),
      'export const tracked = true;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/tracked.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });
    fs.writeFileSync(
      path.join(repoDir, 'src', 'local-only.ts'),
      'export const localOnly = true;\n',
      'utf-8'
    );

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
    })) as { stats?: { totalFiles?: number } };

    expect(result.stats?.totalFiles).toBe(2);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      authorityCaveats?: string[];
      coverage?: {
        complete?: boolean;
        graphFileCount?: number;
        expectedGraphFileCount?: number;
        trackedCandidateCount?: number;
        workspaceCandidateCount?: number;
        selectedCandidateCount?: number;
        overInclusive?: boolean;
        extraGraphFiles?: number;
      };
      diskCache?: {
        authoritative?: boolean;
        authorityCaveats?: string[];
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
          trackedCandidateCount?: number;
          workspaceCandidateCount?: number;
          selectedCandidateCount?: number;
          overInclusive?: boolean;
          extraGraphFiles?: number;
        };
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 1,
      workspaceCandidateCount: 2,
      selectedCandidateCount: 2,
      overInclusive: false,
      extraGraphFiles: 0,
    });
    expect(status.authorityCaveats).not.toContain(
      'graph_contains_1_files_beyond_selected_candidates'
    );
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.coverage).toMatchObject({
      complete: true,
      graphFileCount: 2,
      expectedGraphFileCount: 2,
      trackedCandidateCount: 1,
      workspaceCandidateCount: 2,
      selectedCandidateCount: 2,
      overInclusive: false,
      extraGraphFiles: 0,
    });
    expect(status.diskCache?.authorityCaveats).not.toContain(
      'graph_contains_1_files_beyond_selected_candidates'
    );
  });

  it('rejects a fresh cache that contains ignored files beyond the selected workspace', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-ignored-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-ignored-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    fs.appendFileSync(path.join(repoDir, '.git', 'info', 'exclude'), 'node_modules/\n', 'utf-8');
    fs.mkdirSync(path.join(repoDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'node_modules', 'ignored.ts'),
      'export const ignored = true;\n',
      'utf-8'
    );
    const head = getHeadCommit(repoDir);
    writeGraphCacheWithFileHashes(
      cacheDir,
      repoDir,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(repoDir, ['src/alpha.ts', 'src/beta.ts', 'node_modules/ignored.ts'])
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      authorityCaveats?: string[];
      coverage?: {
        graphFileCount?: number;
        expectedGraphFileCount?: number;
        selectedCandidateCount?: number;
        overInclusive?: boolean;
        extraGraphFiles?: number;
      };
      diskCache?: { authoritative?: boolean };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.coverage).toMatchObject({
      graphFileCount: 3,
      expectedGraphFileCount: 2,
      selectedCandidateCount: 2,
      overInclusive: true,
      extraGraphFiles: 1,
    });
    expect(status.authorityCaveats).toContain('graph_contains_1_files_beyond_selected_candidates');
    expect(status.diskCache?.authoritative).toBe(false);
  });

  it('marks a fresh git-current cache incomplete when coverage is below the scanner target', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incomplete-cache-'));
    const requestedRoot = process.cwd();
    const head = getHeadCommit();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 5 * 60 * 1000, head, 1);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      coverage?: { complete?: boolean; graphFileCount?: number; expectedGraphFileCount?: number };
      diskCache?: {
        fresh?: boolean;
        authoritative?: boolean;
        coverage?: {
          complete?: boolean;
          graphFileCount?: number;
          expectedGraphFileCount?: number;
        };
        hint?: string;
      };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.coverage?.complete).toBe(false);
    expect(status.coverage?.graphFileCount).toBe(1);
    expect(status.coverage?.expectedGraphFileCount).toBeGreaterThan(1);
    expect(status.diskCache?.fresh).toBe(false);
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.diskCache?.coverage?.complete).toBe(false);
    expect(status.diskCache?.hint).toContain('Cache covers 1/');
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_incomplete',
      authoritative: false,
    });
  });

  it('does not auto-load an incomplete disk cache for queries', async () => {
    resetCodebaseToolStateForTests(false);
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incomplete-query-cache-'));
    const requestedRoot = process.cwd();
    const head = getHeadCommit();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 5 * 60 * 1000, head, 1);

    const result = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      coverage?: { complete?: boolean; graphFileCount?: number };
    };

    expect(result.error).toContain('No codebase graph loaded');
    expect(result.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_incomplete',
      authoritative: false,
    });
    expect(result.coverage?.complete).toBe(false);
    expect(result.coverage?.graphFileCount).toBe(1);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      inMemory?: boolean;
    };
    expect(status.inMemory).toBe(false);
  });

  it('auto-backgrounds and repairs a root-matching incomplete cache', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incomplete-repair-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incomplete-repair-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '3';

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(repoDir, 'src', `fixture-${i}.ts`),
        `export const incompleteRepairFixture${i} = ${i};\n`,
        'utf-8'
      );
    }
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir, windowsHide: true });
    const head = getHeadCommit(repoDir);
    writeGraphCache(cacheDir, repoDir, Date.now() - 5 * 60 * 1000, head, 1);

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return originalScanFiles.apply(this, args);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as {
      accepted?: boolean;
      autoBackground?: boolean;
      jobId?: string;
      scanPlan?: { totalCandidateFiles?: number };
    };

    expect(accepted.accepted).toBe(true);
    expect(accepted.autoBackground).toBe(true);
    expect(accepted.scanPlan?.totalCandidateFiles).toBe(3);
    expect(accepted.jobId).toMatch(/^absorb-/);

    let activeStatus: {
      status?: string;
      refreshProgressReceipt?: {
        status?: string;
        targetGitCommitHash?: string;
        authoritative?: boolean;
      };
    } = {};
    for (let index = 0; index < 100; index++) {
      activeStatus = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as typeof activeStatus;
      if (activeStatus.refreshProgressReceipt) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(activeStatus.refreshProgressReceipt).toMatchObject({
      targetGitCommitHash: head,
      authoritative: false,
    });

    const graphStatus = (await handleCodebaseTool('holo_graph_status', {})) as {
      refreshInProgress?: boolean;
      refreshJobId?: string;
      refreshProgressReceipt?: { targetGitCommitHash?: string };
    };
    expect(graphStatus).toMatchObject({
      refreshInProgress: true,
      refreshJobId: accepted.jobId,
      refreshProgressReceipt: {
        targetGitCommitHash: head,
      },
    });

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    expect(status.status).toBe('complete');
    expect(status.refreshProgressReceipt).toMatchObject({
      status: 'complete',
      authoritative: false,
      cachePublished: true,
      targetGitCommitHash: head,
    });
    expect(status.result).toMatchObject({
      rootDir: repoDir,
      stats: {
        totalFiles: 3,
      },
      repairedIncompleteCache: true,
      priorCoverage: {
        complete: false,
        graphFileCount: 1,
        expectedGraphFileCount: 3,
      },
    });
  }, 15_000);

  it('invalidates a non-forced incomplete-cache rebuild when the worktree changes', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incomplete-pin-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-incomplete-pin-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '2';
    const head = getHeadCommit(repoDir);
    writeGraphCache(cacheDir, repoDir, Date.now() - 5 * 60 * 1000, head, 1);
    const priorCache = fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8');

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return originalScanFiles.apply(this, args);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      scanBatchSize: 1,
      maxFiles: 20_000,
    })) as { accepted?: boolean; jobId?: string };
    expect(accepted).toMatchObject({ accepted: true });

    let refreshProgress: { completedBatchCount?: number; resumeToken?: string } | undefined;
    for (let index = 0; index < 100; index++) {
      const progress = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as {
        refreshProgressReceipt?: { completedBatchCount?: number; resumeToken?: string };
      };
      refreshProgress = progress.refreshProgressReceipt;
      if ((refreshProgress?.completedBatchCount ?? 0) >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(refreshProgress?.completedBatchCount).toBeGreaterThanOrEqual(1);
    fs.appendFileSync(path.join(repoDir, 'src', 'beta.ts'), '\nexport const drifted = true;\n');

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    expect(status).toMatchObject({
      status: 'error',
      refreshProgressReceipt: {
        status: 'invalidated',
        cachePublished: false,
        priorAuthoritativeCachePreserved: true,
        resumable: true,
      },
      result: {
        error: 'absorb_refresh_source_changed',
        cachePreserved: true,
        graphAuthoritative: false,
      },
    });
    expect(String(status.error)).toContain('Repository worktree changed during absorb refresh');
    expect(fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')).toBe(priorCache);

    const invalidatedReceipt = status.refreshProgressReceipt as {
      resumeToken?: string;
    };
    const resumed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
      maxFiles: 20_000,
    })) as { accepted?: boolean; jobId?: string; resumeToken?: string };
    expect(resumed).toMatchObject({
      accepted: true,
      resumeToken: invalidatedReceipt.resumeToken,
    });

    const completed = await waitForAbsorbTerminalStatus(resumed.jobId!, true);
    expect(completed).toMatchObject({
      status: 'complete',
      refreshProgressReceipt: {
        status: 'complete',
        resumeMode: 'content-addressed-overlay',
        cachePublished: true,
      },
      result: {
        stats: { totalFiles: 2 },
      },
    });
    expect(
      (
        completed.refreshProgressReceipt as {
          reusedBatchCount?: number;
        }
      ).reusedBatchCount
    ).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('repairs a git-stale cache through incremental stats without embeddings', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incremental-stats-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-incremental-stats-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'src', 'fixture.ts'),
      'export const fixture = 1;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/fixture.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir, windowsHide: true });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      embeddingProvider: 'holoembed',
    })) as {
      error?: string;
      embeddingSkipped?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        embeddingSkipReason?: string;
        priorGraphRagReady?: boolean;
      };
      gitCommitHash?: string;
    };

    expect(first.error).toBeUndefined();
    expect(first.embeddingSkipped).toBe(true);
    expect(first.graphRagReady).toBe(false);
    expect(first.semanticIndexReady).toBe(false);
    expect(first.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      embeddingSkipReason: 'outputFormat:stats',
      priorGraphRagReady: false,
    });
    const firstCommit = getHeadCommit(repoDir);
    expect(first.gitCommitHash).toBe(firstCommit);

    fs.writeFileSync(
      path.join(repoDir, 'src', 'fixture.ts'),
      'export const fixture = 2;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/fixture.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'update fixture'], { cwd: repoDir, windowsHide: true });
    const secondCommit = getHeadCommit(repoDir);

    resetCodebaseToolStateForTests(false);
    setGraphRAGState({} as any, {} as any, { rootDir: repoDir, timestamp: Date.now() });
    const patched = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      embeddingProvider: 'holoembed',
    })) as {
      error?: string;
      incremental?: boolean;
      filesChanged?: number;
      embeddingSkipped?: boolean;
      embeddingSkipReason?: string;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        embeddingSkipReason?: string;
        priorGraphRagReady?: boolean;
      };
      gitCommitHash?: string;
    };

    expect(patched.error).toBeUndefined();
    expect(patched.incremental).toBe(true);
    expect(patched.filesChanged).toBe(1);
    expect(patched.embeddingSkipped).toBe(true);
    expect(patched.embeddingSkipReason).toBe('outputFormat:stats');
    expect(patched.graphRagReady).toBe(false);
    expect(patched.semanticIndexReady).toBe(false);
    expect(patched.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      embeddingSkipReason: 'outputFormat:stats',
      priorGraphRagReady: true,
    });
    expect(patched.gitCommitHash).toBe(secondCommit);

    const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')) as {
      gitCommitHash?: string;
    };
    expect(cache.gitCommitHash).toBe(secondCommit);
  }, 30_000);

  it('builds missing HoloEmbed index when a zero-change graph request follows stats-only cache', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-zero-change-embed-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-zero-change-embed-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['config', 'user.name', 'Codex Test'], {
      cwd: repoDir,
      windowsHide: true,
    });

    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'src', 'semantic-fixture.ts'),
      'export function semanticFixtureSearchTarget(): string { return "native graph rag"; }\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/semantic-fixture.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir, windowsHide: true });

    const statsOnly = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      error?: string;
      embeddingSkipped?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(statsOnly.error).toBeUndefined();
    expect(statsOnly.embeddingSkipped).toBe(true);
    expect(statsOnly.semanticIndexReady).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, 'embeddings-cache.bin'))).toBe(false);

    const graphResult = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
    })) as {
      error?: string;
      cached?: boolean;
      embeddingSkipped?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        embeddingSkipped?: boolean;
        semanticIndexReady?: boolean;
      };
    };

    expect(graphResult.error).toBeUndefined();
    expect(graphResult.cached).toBe(true);
    expect(graphResult.embeddingSkipped).toBe(false);
    expect(graphResult.graphRagReady).toBe(true);
    expect(graphResult.semanticIndexReady).toBe(true);
    expect(graphResult.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      embeddingSkipped: false,
      semanticIndexReady: true,
    });
    expect(fs.existsSync(path.join(cacheDir, 'embeddings-cache.bin'))).toBe(true);

    const legacyGraphCachePath = path.join(cacheDir, 'graph-cache.json');
    const legacyEnvelope = JSON.parse(fs.readFileSync(legacyGraphCachePath, 'utf-8')) as {
      embeddingCacheBytes?: number;
      embeddingCacheMtimeMs?: number;
    };
    delete legacyEnvelope.embeddingCacheBytes;
    delete legacyEnvelope.embeddingCacheMtimeMs;
    fs.writeFileSync(legacyGraphCachePath, JSON.stringify(legacyEnvelope), 'utf-8');
    resetGraphRAGStateForTests();

    const migratedGraphResult = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
    })) as {
      error?: string;
      cached?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(migratedGraphResult.error).toBeUndefined();
    expect(migratedGraphResult.cached).toBe(true);
    expect(migratedGraphResult.semanticIndexReady).toBe(true);

    const migratedEnvelope = JSON.parse(fs.readFileSync(legacyGraphCachePath, 'utf-8')) as {
      embeddingCacheBytes?: number | null;
      embeddingCacheMtimeMs?: number | null;
    };
    const migratedEmbeddingStat = fs.statSync(path.join(cacheDir, 'embeddings-cache.bin'));
    expect(migratedEnvelope.embeddingCacheBytes).toBe(migratedEmbeddingStat.size);
    expect(migratedEnvelope.embeddingCacheMtimeMs).toBe(migratedEmbeddingStat.mtimeMs);

    resetGraphRAGStateForTests();
    const originalCwd = process.cwd();
    try {
      process.chdir(repoDir);
      const status = (await handleCodebaseTool('holo_graph_status', {})) as {
        graphRAGReady?: boolean;
        semanticIndexReady?: boolean;
        semanticIndex?: {
          ready?: boolean;
          freshForCurrentRepo?: boolean;
          cachedEmbeddingIndexReady?: boolean;
          diskEmbeddingCacheExists?: boolean;
          diskEmbeddingCacheModel?: string | null;
          diskEmbeddingProviderMatchesPolicy?: boolean;
          diskHydratable?: boolean;
        };
        localGraph?: { ready?: boolean };
        diskCache?: { freshForCurrentRepo?: boolean };
      };
      expect(status.graphRAGReady).toBe(true);
      expect(status.semanticIndexReady).toBe(true);
      expect(status.localGraph?.ready).toBe(false);
      expect(status.diskCache?.freshForCurrentRepo).toBe(true);
      expect(status.semanticIndex).toMatchObject({
        ready: true,
        freshForCurrentRepo: true,
        cachedEmbeddingIndexReady: false,
        diskEmbeddingCacheExists: true,
        diskEmbeddingCacheModel: 'holoembed',
        diskEmbeddingProviderMatchesPolicy: true,
        diskHydratable: true,
      });
    } finally {
      process.chdir(originalCwd);
    }

    const semanticSearch = (await handleGraphRagTool('holo_semantic_search', {
      query: 'semantic search target',
      useCachedAbsorbIndex: true,
    })) as { error?: string; results?: unknown[] };
    expect(semanticSearch.error).toBeUndefined();
    expect(semanticSearch.results?.length).toBeGreaterThan(0);

    const graphCachePath = path.join(cacheDir, 'graph-cache.json');
    const embeddingsCachePath = path.join(cacheDir, 'embeddings-cache.bin');
    const graphEnvelope = JSON.parse(fs.readFileSync(graphCachePath, 'utf-8')) as {
      embeddingCacheSha256?: string | null;
      embeddingCacheBytes?: number | null;
      embeddingCacheMtimeMs?: number | null;
    };
    const originalEmbeddingBytes = fs.readFileSync(embeddingsCachePath);
    const originalEmbeddingStat = fs.statSync(embeddingsCachePath);
    expect(graphEnvelope.embeddingCacheSha256).toBe(
      createHash('sha256').update(originalEmbeddingBytes).digest('hex')
    );
    expect(graphEnvelope.embeddingCacheBytes).toBe(originalEmbeddingStat.size);
    expect(graphEnvelope.embeddingCacheMtimeMs).toBe(originalEmbeddingStat.mtimeMs);

    // Simulate a crash after a different embedding generation replaced the
    // binary but before the graph envelope committed. The graph remains usable,
    // while the unbound semantic generation must be rejected.
    fs.appendFileSync(embeddingsCachePath, Buffer.from([0xff]));
    resetCodebaseToolStateForTests(false);
    const originalCwdAfterCorruption = process.cwd();
    try {
      process.chdir(repoDir);
      const status = (await handleCodebaseTool('holo_graph_status', {})) as {
        semanticIndexReady?: boolean;
        graphAuthoritative?: boolean;
        semanticIndex?: {
          diskEmbeddingGenerationMatchesGraph?: boolean;
          diskHydratable?: boolean;
        };
      };
      expect(status.graphAuthoritative).toBe(true);
      expect(status.semanticIndexReady).toBe(false);
      expect(status.semanticIndex).toMatchObject({
        diskEmbeddingGenerationMatchesGraph: false,
        diskHydratable: false,
      });
    } finally {
      process.chdir(originalCwdAfterCorruption);
    }
  }, 30_000);

  it('does not emit a graph unavailable receipt when local GraphRAG is live without disk cache', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-empty-graph-cache-'));
    const requestedRoot = process.cwd();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    setGraphRAGState({} as any, {} as any, { rootDir: requestedRoot, timestamp: Date.now() });

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphRAGReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndex?: { ready?: boolean; freshForCurrentRepo?: boolean };
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      localGraph?: {
        ready?: boolean;
        rootDir?: string | null;
        authoritative?: boolean;
        freshForCurrentRepo?: boolean;
      };
      diskCache?: { exists?: boolean };
    };

    expect(status.diskCache?.exists).toBe(false);
    expect(status.graphRAGReady).toBe(true);
    expect(status.semanticIndexReady).toBe(true);
    expect(status.semanticIndex).toMatchObject({ ready: true, freshForCurrentRepo: true });
    expect(status.localGraph).toMatchObject({
      ready: true,
      rootDir: requestedRoot,
      authoritative: true,
      freshForCurrentRepo: true,
    });
    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('emits a graph unavailable receipt when neither disk cache nor local GraphRAG exists', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-missing-graph-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphRAGReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndex?: { ready?: boolean; freshForCurrentRepo?: boolean };
      graphAuthoritative?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      localGraph?: { ready?: boolean; authoritative?: boolean };
      diskCache?: { exists?: boolean };
    };

    expect(status.diskCache?.exists).toBe(false);
    expect(status.graphRAGReady).toBe(false);
    expect(status.semanticIndexReady).toBe(false);
    expect(status.semanticIndex).toMatchObject({ ready: false, freshForCurrentRepo: false });
    expect(status.localGraph).toMatchObject({ ready: false, authoritative: false });
    expect(status.graphAuthoritative).toBe(false);
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_missing',
      authoritative: false,
    });
  });

  it('memoizes bounded graph status polls and supports an explicit fresh check', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-snapshot-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    const first = (await handleCodebaseTool('holo_graph_status', {})) as {
      statusSnapshot?: { cacheHit?: boolean; coalesced?: boolean; forceRefreshAvailable?: boolean };
    };
    const repeated = (await handleCodebaseTool('holo_graph_status', {})) as {
      statusSnapshot?: { cacheHit?: boolean; coalesced?: boolean; forceRefreshAvailable?: boolean };
    };
    const forced = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      statusSnapshot?: { cacheHit?: boolean; coalesced?: boolean; forceRefreshAvailable?: boolean };
    };

    expect(first.statusSnapshot).toMatchObject({
      cacheHit: false,
      coalesced: false,
      forceRefreshAvailable: true,
    });
    expect(repeated.statusSnapshot).toMatchObject({
      cacheHit: true,
      coalesced: false,
      forceRefreshAvailable: true,
    });
    expect(forced.statusSnapshot).toMatchObject({
      cacheHit: false,
      coalesced: false,
      forceRefreshAvailable: true,
    });
  });

  it('rejects a root-mismatched cache when the root is not a current git repo', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-mismatch-graph-cache-'));
    // Cache was created for a temp dir (e.g. format-stress scratch), NOT for cwd
    const mismatchedRoot = path.join(os.tmpdir(), 'holoscript-absorb-QpPEqg');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, mismatchedRoot, Date.now() - 5 * 60 * 1000);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      currentCwd?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        freshByAge?: boolean;
        authoritative?: boolean;
        freshForCurrentRepo?: boolean;
        rootDir?: string;
      };
    };

    // Cache is fresh by age but NOT authoritative for the current repo
    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.currentCwd).toBe(path.resolve(process.cwd()));
    expect(status.diskCache?.fresh).toBe(false);
    expect(status.diskCache?.stale).toBe(true);
    expect(status.diskCache?.freshByAge).toBe(true);
    expect(status.diskCache?.authoritative).toBe(false);
    expect(status.diskCache?.freshForCurrentRepo).toBe(false);
    // Receipt should explain the mismatch
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_root_mismatch',
      authoritative: false,
    });
  });

  it('trusts a root-mismatched cache for its own git repo when HEAD and coverage match', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cross-root-graph-cache-'));
    const cachedRepo = makeTinyGitRepo('holoscript-cross-root-cached-repo-');
    const workspaceRepo = makeTinyGitRepo('holoscript-cross-root-workspace-repo-');
    const head = getHeadCommit(cachedRepo);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = workspaceRepo;
    writeGraphCacheWithFileHashes(
      cacheDir,
      cachedRepo,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(cachedRepo, ['src/alpha.ts', 'src/beta.ts'])
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      currentCwd?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        freshByAge?: boolean;
        authoritative?: boolean;
        freshForCurrentRepo?: boolean;
        rootDir?: string;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
        coverage?: { available?: boolean; complete?: boolean; graphFileCount?: number };
        hint?: string;
      };
    };

    expect(status.currentCwd).toBe(path.resolve(workspaceRepo));
    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.diskCache?.rootDir).toBe(path.resolve(cachedRepo));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.stale).toBe(false);
    expect(status.diskCache?.freshByAge).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.diskCache?.currentGitCommitHash).toBe(head);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(true);
    expect(status.diskCache?.coverage).toMatchObject({
      available: true,
      complete: true,
      graphFileCount: 2,
    });
    expect(status.diskCache?.hint).toContain('authoritative');
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('trusts a root-mismatched cache for its own git repo when file hashes bridge HEAD churn', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-cross-root-hash-graph-cache-')
    );
    const cachedRepo = makeTinyGitRepo('holoscript-cross-root-hash-cached-repo-');
    const workspaceRepo = makeTinyGitRepo('holoscript-cross-root-hash-workspace-repo-');
    const oldHead = getHeadCommit(cachedRepo);
    const fileHashes = hashRepoFiles(cachedRepo, ['src/alpha.ts', 'src/beta.ts']);
    execFileSync('git', ['commit', '--allow-empty', '-m', 'head churn'], {
      cwd: cachedRepo,
      windowsHide: true,
    });
    const currentHead = getHeadCommit(cachedRepo);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = workspaceRepo;
    writeGraphCacheWithFileHashes(
      cacheDir,
      cachedRepo,
      Date.now() - 5 * 60 * 1000,
      oldHead,
      fileHashes
    );

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      authorityCaveats?: string[];
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: {
        fresh?: boolean;
        stale?: boolean;
        authoritative?: boolean;
        freshForCurrentRepo?: boolean;
        rootDir?: string;
        gitCommitHash?: string | null;
        currentGitCommitHash?: string | null;
        gitCommitMatchesHead?: boolean;
        fileHashFreshForHeadMismatch?: boolean;
        fileHashFreshness?: {
          checked?: boolean;
          fresh?: boolean;
          reason?: string;
          storedFileCount?: number;
          checkedFileCount?: number;
        };
        authorityCaveats?: string[];
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.authorityCaveats).toContain('git_head_mismatch_but_file_hashes_match');
    expect(status.diskCache?.rootDir).toBe(path.resolve(cachedRepo));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.stale).toBe(false);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.diskCache?.gitCommitHash).toBe(oldHead);
    expect(status.diskCache?.currentGitCommitHash).toBe(currentHead);
    expect(status.diskCache?.gitCommitMatchesHead).toBe(false);
    expect(status.diskCache?.fileHashFreshForHeadMismatch).toBe(true);
    expect(status.diskCache?.fileHashFreshness).toMatchObject({
      checked: true,
      fresh: true,
      reason: 'all_hashes_match',
      storedFileCount: 2,
      checkedFileCount: 2,
    });
    expect(status.diskCache?.authorityCaveats).toContain('git_head_mismatch_but_file_hashes_match');
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('auto-loads a root-mismatched cache for queries when it describes a current git repo', async () => {
    resetCodebaseToolStateForTests(false);
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cross-root-query-cache-'));
    const cachedRepo = makeTinyGitRepo('holoscript-cross-root-query-repo-');
    const workspaceRepo = makeTinyGitRepo('holoscript-cross-root-query-workspace-');
    const head = getHeadCommit(cachedRepo);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = workspaceRepo;
    writeGraphCacheWithFileHashes(
      cacheDir,
      cachedRepo,
      Date.now() - 5 * 60 * 1000,
      head,
      hashRepoFiles(cachedRepo, ['src/alpha.ts', 'src/beta.ts'])
    );

    const result = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      cacheNote?: string;
      result?: unknown;
    };

    expect(result.error).toBeUndefined();
    expect(result.cacheNote).toContain(path.resolve(cachedRepo));
    expect(result.result).toBeDefined();
  });

  it('auto-loads a root-mismatched cache for queries when file hashes bridge HEAD churn', async () => {
    resetCodebaseToolStateForTests(false);
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-cross-root-hash-query-cache-')
    );
    const cachedRepo = makeTinyGitRepo('holoscript-cross-root-hash-query-repo-');
    const workspaceRepo = makeTinyGitRepo('holoscript-cross-root-hash-query-workspace-');
    const oldHead = getHeadCommit(cachedRepo);
    const fileHashes = hashRepoFiles(cachedRepo, ['src/alpha.ts', 'src/beta.ts']);
    execFileSync('git', ['commit', '--allow-empty', '-m', 'head churn'], {
      cwd: cachedRepo,
      windowsHide: true,
    });
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = workspaceRepo;
    writeGraphCacheWithFileHashes(
      cacheDir,
      cachedRepo,
      Date.now() - 5 * 60 * 1000,
      oldHead,
      fileHashes
    );

    const result = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      cacheNote?: string;
      result?: unknown;
    };

    expect(result.error).toBeUndefined();
    expect(result.cacheNote).toContain(path.resolve(cachedRepo));
    expect(result.result).toBeDefined();
  });

  it('does not auto-load a root-mismatched disk cache for impact analysis', async () => {
    resetCodebaseToolStateForTests(false);
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-mismatch-impact-cache-'));
    const mismatchedRoot = path.join(os.tmpdir(), 'holoscript-absorb-QpPEqg');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, mismatchedRoot, Date.now() - 5 * 60 * 1000, undefined, 10_000);

    const result = (await handleCodebaseTool('holo_impact_analysis', {
      changedFiles: ['packages/absorb-service/src/engine/workers/WorkerPool.ts'],
    })) as {
      error?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
    };

    expect(result.error).toContain('No codebase graph loaded');
    expect(result.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_root_mismatch',
      authoritative: false,
    });

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      inMemory?: boolean;
    };
    expect(status.inMemory).toBe(false);
  });
});

describe('holo_absorb_repo sourceFiles upload', () => {
  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
  });

  it('absorbs inline sourceFiles without filesystem access', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-sourcefiles-temp-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    setGraphRAGState({} as any, {} as any, { rootDir: process.cwd(), timestamp: Date.now() });

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [
        { path: 'src/index.ts', content: 'export function hello(): string { return "world"; }' },
        { path: 'src/utils.ts', content: 'export const PI = 3.14;' },
        { path: 'README.md', content: '# Test Project\n\nHello world.' },
      ],
      outputFormat: 'stats',
    })) as {
      error?: string;
      stats?: { totalFiles?: number; totalSymbols?: number };
      fromSourceFiles?: boolean;
      embeddingSkipped?: boolean;
      embeddingSkipReason?: string;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        semanticIndexReady?: boolean;
        priorGraphRagReady?: boolean;
        nextStep?: string;
      };
      scanPlan?: {
        kind?: string;
        mode?: string;
        totalCandidateFiles?: number;
        batchCount?: number;
      };
      phaseMetrics?: Array<{ phase?: string; rssMb?: number; heapUsedMb?: number }>;
      jobId?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.embeddingSkipped).toBe(true);
    expect(result.embeddingSkipReason).toBe('outputFormat:stats');
    expect(result.graphRagReady).toBe(false);
    expect(result.semanticIndexReady).toBe(false);
    expect(result.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      semanticIndexReady: false,
      priorGraphRagReady: true,
    });
    expect(result.semanticIndexReadiness?.nextStep).toContain('outputFormat "graph" or "holo"');
    expect(result.stats?.totalFiles).toBeGreaterThanOrEqual(2);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(2);
    expect(result.scanPlan).toMatchObject({
      kind: 'AbsorbScanPlan',
      mode: 'inline-source-files',
      totalCandidateFiles: 3,
      batchCount: 1,
    });
    expect(result.phaseMetrics?.map((metric) => metric.phase)).toEqual(
      expect.arrayContaining(['scan', 'graph-build', 'graph-cache-save', 'stats-response'])
    );
    expect(result.phaseMetrics?.[0]?.rssMb).toBeGreaterThan(0);
    expect(result.phaseMetrics?.[0]?.heapUsedMb).toBeGreaterThan(0);

    const semanticSearch = (await handleGraphRagTool('holo_semantic_search', {
      query: 'hello',
      useCachedAbsorbIndex: true,
    })) as { error?: string };
    expect(semanticSearch.error).toContain('No embedding index');

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: result.jobId,
    })) as {
      status?: string;
      scanPlan?: { mode?: string };
      memory?: { rssMb?: number; heapUsedMb?: number };
      phaseMetrics?: Array<{ phase?: string }>;
    };
    expect(status.status).toBe('complete');
    expect(status.scanPlan?.mode).toBe('inline-source-files');
    expect(status.memory?.rssMb).toBeGreaterThan(0);
    expect(status.memory?.heapUsedMb).toBeGreaterThan(0);
    expect(status.phaseMetrics?.map((metric) => metric.phase)).toContain('stats-response');
  }, 15_000);

  it('absorbs a HoloShell LocalCodebaseSnapshotReceipt without separate sourceFiles', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-local-receipt-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    const receipt = makeLocalCodebaseSnapshotReceipt([
      {
        path: 'src/holoshell-receipt-fixture.ts',
        content: 'export function replayedFromHoloShellReceipt(): string { return "ok"; }',
      },
    ]);

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      localCodebaseSnapshotReceipt: receipt,
      outputFormat: 'stats',
      embeddingProvider: 'holoembed',
    })) as {
      error?: string;
      fromSourceFiles?: boolean;
      fromLocalCodebaseSnapshotReceipt?: boolean;
      localCodebaseSnapshotReceipt?: { schema?: string; totalFiles?: number };
      stats?: { totalFiles?: number; totalSymbols?: number };
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.fromLocalCodebaseSnapshotReceipt).toBe(true);
    expect(result.localCodebaseSnapshotReceipt).toMatchObject({
      schema: 'LocalCodebaseSnapshotReceipt.v1',
      totalFiles: 1,
    });
    expect(result.stats?.totalFiles).toBe(1);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(1);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      sessionProvenance?: string | null;
      localCodebaseSnapshotReceipt?: { schema?: string } | null;
      localCodebaseSnapshot?: {
        authoritative?: boolean;
        scope?: string;
        reason?: string;
        receiptFileCount?: number;
        graphFileCount?: number;
        receipt?: { schema?: string };
      } | null;
      diskCache?: {
        localCodebaseSnapshotReceipt?: { schema?: string } | null;
        localCodebaseSnapshot?: {
          authoritative?: boolean;
          scope?: string;
          reason?: string;
          receiptFileCount?: number;
          graphFileCount?: number;
          receipt?: { schema?: string };
        } | null;
      };
    };
    expect(status.graphAuthoritative).toBe(false);
    expect(status.sessionProvenance).toBe('local-codebase-snapshot-receipt');
    expect(status.localCodebaseSnapshotReceipt?.schema).toBe('LocalCodebaseSnapshotReceipt.v1');
    expect(status.localCodebaseSnapshot).toMatchObject({
      authoritative: true,
      scope: 'local-codebase-snapshot',
      reason: 'receipt_sourcefiles_verified',
      receiptFileCount: 1,
      graphFileCount: 1,
      receipt: { schema: 'LocalCodebaseSnapshotReceipt.v1' },
    });
    expect(status.diskCache?.localCodebaseSnapshotReceipt?.schema).toBe(
      'LocalCodebaseSnapshotReceipt.v1'
    );
    expect(status.diskCache?.localCodebaseSnapshot).toMatchObject({
      authoritative: true,
      scope: 'local-codebase-snapshot',
      reason: 'receipt_sourcefiles_verified',
      receiptFileCount: 1,
      graphFileCount: 1,
      receipt: { schema: 'LocalCodebaseSnapshotReceipt.v1' },
    });
  }, 15_000);

  it('rejects a local receipt when declared hash does not match replay content', async () => {
    resetCodebaseToolStateForTests();
    const receipt = makeLocalCodebaseSnapshotReceipt([
      {
        path: 'src/hash-mismatch-fixture.ts',
        content: 'export const hashMismatch = true;',
      },
    ]);
    const sourceFiles = receipt.sourceFiles as Array<Record<string, unknown>>;
    sourceFiles[0].hash = '0'.repeat(64);

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      localCodebaseSnapshotReceipt: receipt,
      outputFormat: 'stats',
    })) as { error?: string; message?: string; errors?: string[] };

    expect(result.error).toBe('localCodebaseSnapshotReceipt_validation_failed');
    expect(result.message).toContain('hash mismatch');
  });

  it('accepts a hash-only HoloShell receipt when matching sourceFiles are supplied', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-holoshell-receipt-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    const file = {
      path: 'src/holoshell-hash-only-fixture.ts',
      content: 'export class HoloShellHashOnlyFixture { ok(): boolean { return true; } }',
    };
    const receipt = makeHoloShellSnapshotReceipt(file);

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      localCodebaseSnapshotReceipt: receipt,
      sourceFiles: [file],
      outputFormat: 'stats',
    })) as {
      error?: string;
      fromLocalCodebaseSnapshotReceipt?: boolean;
      localCodebaseSnapshotReceipt?: { schema?: string; id?: string };
      stats?: { totalFiles?: number; totalSymbols?: number };
    };

    expect(result.error).toBeUndefined();
    expect(result.fromLocalCodebaseSnapshotReceipt).toBe(true);
    expect(result.localCodebaseSnapshotReceipt).toMatchObject({
      schema: 'HoloShellLocalCodebaseSnapshotReceipt',
      id: 'local_codebase_snapshot_test',
    });
    expect(result.stats?.totalFiles).toBe(1);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('preserves rootDir as graph provenance when sourceFiles are uploaded inline', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-sourcefiles-root-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    const requestedRoot = process.cwd();

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: requestedRoot,
      sourceFiles: [
        {
          path: 'packages/core/src/parser/InlineFixture.ts',
          content: 'export function parseHoloScriptPlusFixture(): string { return "hsplus"; }',
        },
      ],
      outputFormat: 'graph',
    })) as {
      error?: string;
      rootDir?: string;
      stats?: { totalFiles?: number; totalSymbols?: number };
      fromSourceFiles?: boolean;
      embeddingSkipped?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        embeddingSkipped?: boolean;
        embeddingSkipReason?: string;
        semanticIndexReady?: boolean;
      };
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.rootDir).toBe(path.resolve(requestedRoot));
    expect(result.stats?.totalFiles).toBe(1);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(1);
    expect(result.embeddingSkipped).toBe(false);
    expect(result.graphRagReady).toBe(true);
    expect(result.semanticIndexReady).toBe(true);
    expect(result.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      embeddingSkipped: false,
      semanticIndexReady: true,
    });
    expect(result.semanticIndexReadiness?.embeddingSkipReason).toBeUndefined();

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      coverage?: { complete?: boolean; graphFileCount?: number };
      diskCache?: {
        rootDir?: string;
        freshForCurrentRepo?: boolean;
        coverage?: { complete?: boolean; graphFileCount?: number };
      };
      localGraph?: { rootDir?: string | null; freshForCurrentRepo?: boolean };
    };

    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.coverage?.complete).toBe(false);
    expect(status.coverage?.graphFileCount).toBe(1);
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_incomplete',
      authoritative: false,
    });
    expect(status.diskCache?.rootDir).toBe(path.resolve(requestedRoot));
    expect(status.diskCache?.freshForCurrentRepo).toBe(false);
    expect(status.diskCache?.coverage?.complete).toBe(false);
    expect(status.diskCache?.coverage?.graphFileCount).toBe(1);
    expect(status.localGraph?.rootDir).toBe(path.resolve(requestedRoot));
    expect(status.localGraph?.freshForCurrentRepo).toBe(false);
  }, 15_000);

  it('clears stale GraphRAG state when graph output cannot build embeddings', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-embed-failure-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    setGraphRAGState({} as any, {} as any, { rootDir: process.cwd(), timestamp: Date.now() });
    vi.spyOn(EmbeddingIndex.prototype, 'buildIndex').mockRejectedValueOnce(
      new Error('synthetic HoloEmbed failure')
    );

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: process.cwd(),
      sourceFiles: [
        {
          path: 'packages/core/src/parser/InlineEmbedFailureFixture.ts',
          content: 'export function embedFailureFixture(): string { return "no stale index"; }',
        },
      ],
      outputFormat: 'graph',
    })) as {
      error?: string;
      embeddingSkipped?: boolean;
      embeddingSkipReason?: string;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndexReadiness?: {
        kind?: string;
        embeddingSkipReason?: string;
        priorGraphRagReady?: boolean;
        semanticIndexReady?: boolean;
        embeddingFailure?: { message?: string };
      };
    };

    expect(result.error).toBeUndefined();
    expect(result.embeddingSkipped).toBe(true);
    expect(result.embeddingSkipReason).toBe('embeddingBuildFailed');
    expect(result.graphRagReady).toBe(false);
    expect(result.semanticIndexReady).toBe(false);
    expect(result.semanticIndexReadiness).toMatchObject({
      kind: 'SemanticIndexReadinessReceipt',
      embeddingSkipReason: 'embeddingBuildFailed',
      priorGraphRagReady: true,
      semanticIndexReady: false,
      embeddingFailure: { message: 'synthetic HoloEmbed failure' },
    });

    const semanticSearch = (await handleGraphRagTool('holo_semantic_search', {
      query: 'embed failure',
      useCachedAbsorbIndex: true,
    })) as { error?: string };
    expect(semanticSearch.error).toContain('No embedding index');
  }, 15_000);

  it('returns an extractive cited answer when holo_ask_codebase cannot reach an LLM', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-ask-fallback-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    const absorb = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: process.cwd(),
      sourceFiles: [
        {
          path: 'packages/core/src/parser/InlineAskFixture.ts',
          content:
            'export class HoloScriptPlusParserFixture { parseHoloScriptPlusGrammar(): string { return "trait object pipeline"; } }',
        },
      ],
      outputFormat: 'graph',
    })) as { error?: string };
    expect(absorb.error).toBeUndefined();

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('llm offline'));

    const answer = (await handleGraphRagTool('holo_ask_codebase', {
      question: 'How is .hsplus grammar parsed?',
      topK: 3,
      llmProvider: 'ollama',
    })) as {
      error?: string;
      fallback?: string;
      citations?: Array<{ file?: string; line?: number }>;
      provenanceGuard?: { passed?: boolean };
      answer?: string;
    };

    expect(answer.error).toBeUndefined();
    expect(answer.fallback).toBe('extractive-graphrag');
    expect(answer.answer).toContain('extractive GraphRAG answer');
    expect(answer.provenanceGuard?.passed).toBe(true);
    expect(answer.citations?.length).toBeGreaterThan(0);
    expect(answer.citations?.[0]?.file).toContain('InlineAskFixture.ts');
  }, 15_000);

  it('rejects sourceFiles with path traversal', async () => {
    resetCodebaseToolStateForTests();

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [{ path: '../etc/passwd', content: 'evil' }],
      outputFormat: 'stats',
    })) as {
      error?: string;
      message?: string;
    };

    expect(result.error).toBe('sourceFiles_validation_failed');
    expect(result.message).toContain('..');
  });

  it('rejects sourceFiles with absolute paths', async () => {
    resetCodebaseToolStateForTests();

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [{ path: '/etc/passwd', content: 'evil' }],
      outputFormat: 'stats',
    })) as {
      error?: string;
      message?: string;
    };

    expect(result.error).toBe('sourceFiles_validation_failed');
    expect(result.message).toContain('relative');
  });

  it('rejects empty sourceFiles array', async () => {
    resetCodebaseToolStateForTests();

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [],
      outputFormat: 'stats',
    })) as {
      error?: string;
      message?: string;
    };

    expect(result.error).toBe('sourceFiles_validation_failed');
    expect(result.message).toContain('empty');
  });

  it('returns error when neither rootDir nor sourceFiles is provided', async () => {
    resetCodebaseToolStateForTests();

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      outputFormat: 'stats',
    })) as {
      error?: string;
      message?: string;
    };

    expect(result.error).toBe('rootDir_or_sourceFiles_required');
    expect(result.message).toContain('rootDir');
    expect(result.message).toContain('sourceFiles');
  });
});
