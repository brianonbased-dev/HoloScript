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
  resolveIncrementalEmbeddingTimeoutMs,
  resetCodebaseToolStateForTests,
  setCachePublicationFaultForTests,
  setIsolatedAbsorbWorkerFactoryForTests,
  simulateAbsorbProcessRestartForTests,
} from './codebase-tools';
import {
  resolveCodebaseCachePaths,
  resolveCodebaseCachePathsForRoots,
} from './codebase-cache-storage';
import {
  getGraphRAGStateStatus,
  handleGraphRagTool,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';
import { EmbeddingIndex } from '../engine/EmbeddingIndex';
import { CodebaseScanner } from '../engine/CodebaseScanner';
import { CodebaseGraph } from '../engine/CodebaseGraph';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;
const originalWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
const originalAutoBackground = process.env.ABSORB_AUTO_BACKGROUND;
const originalAutoBackgroundScanFileThreshold =
  process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD;
const originalRequireIsolation = process.env.ABSORB_REQUIRE_ISOLATION;
const originalMinSystemFreeMb = process.env.ABSORB_MIN_SYSTEM_FREE_MB;

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
  if (originalMinSystemFreeMb === undefined) {
    delete process.env.ABSORB_MIN_SYSTEM_FREE_MB;
  } else {
    process.env.ABSORB_MIN_SYSTEM_FREE_MB = originalMinSystemFreeMb;
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

describe('incremental embedding timeout policy', () => {
  it('inherits the full-build window unless an explicit positive override is supplied', () => {
    expect(resolveIncrementalEmbeddingTimeoutMs(undefined, 600_000)).toBe(600_000);
    expect(resolveIncrementalEmbeddingTimeoutMs('0', 600_000)).toBe(600_000);
    expect(resolveIncrementalEmbeddingTimeoutMs('not-a-number', 600_000)).toBe(600_000);
    expect(resolveIncrementalEmbeddingTimeoutMs('90000', 600_000)).toBe(90_000);
  });
});

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

function removeFilesFromGraphCache(cacheFile: string, filePaths: string[]): void {
  const envelope = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as {
    stats: Record<string, unknown>;
    graphJson: string;
    fileHashes?: Record<string, string>;
  };
  const graph = CodebaseGraph.deserialize(envelope.graphJson);
  graph.patchFromChanges([], [], filePaths);
  for (const filePath of filePaths) {
    delete envelope.fileHashes?.[filePath];
  }
  envelope.graphJson = graph.serialize();
  envelope.stats = graph.getStats() as unknown as Record<string, unknown>;
  fs.writeFileSync(cacheFile, JSON.stringify(envelope), 'utf-8');
}

function markMutatedGenerationFixtureAsLegacy(rootDir: string): void {
  const paths = resolveCodebaseCachePaths(rootDir);
  if (!fs.existsSync(paths.generationManifestFile)) return;
  const manifest = JSON.parse(fs.readFileSync(paths.generationManifestFile, 'utf-8')) as {
    schemaVersion: string;
    graphCacheSha256?: string;
    graphCacheBytes?: number;
  };
  manifest.schemaVersion = 'holoscript.absorb-cache-generation.v1';
  delete manifest.graphCacheSha256;
  delete manifest.graphCacheBytes;
  fs.writeFileSync(paths.generationManifestFile, JSON.stringify(manifest), 'utf-8');
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
    if (
      status.status === 'complete' ||
      status.status === 'error' ||
      status.status === 'cancelled'
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return (await handleCodebaseTool('holo_get_absorb_status', { jobId })) as Record<string, unknown>;
}

async function waitForCacheWarmTerminalStatus(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const graphStatus = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      cacheWarm?: Record<string, unknown>;
    };
    const cacheWarm = graphStatus.cacheWarm ?? {};
    if (
      cacheWarm.status === 'complete' ||
      cacheWarm.status === 'error' ||
      cacheWarm.status === 'cancelled'
    ) {
      return cacheWarm;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const graphStatus = (await handleCodebaseTool('holo_graph_status', {
    forceRefresh: true,
  })) as {
    cacheWarm?: Record<string, unknown>;
  };
  return graphStatus.cacheWarm ?? {};
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
      maxRssMb: 1,
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
      memory: null,
      memoryAvailable: false,
      memoryBudget: {
        maxRssMb: 1,
        peakRssMb: 0,
        exceeded: false,
      },
    });

    worker.emit('message', {
      type: 'telemetry',
      memory: { rssMb: 321, heapUsedMb: 123 },
      workerStatus: {
        status: 'scanning',
        progress: 37,
        phase: 'Building semantic index',
        filesProcessed: 3,
        totalFiles: 7,
        memoryBudget: {
          maxRssMb: 1,
          peakRssMb: 321,
          peakHeapUsedMb: 123,
          exceeded: false,
          headroomExhausted: false,
        },
        scanPlan: {
          kind: 'AbsorbScanPlan',
          mode: 'module-batched',
          selectionMode: 'git-visible',
          totalCandidateFiles: 7,
          batchCount: 2,
          batchDetailsOmitted: 2,
        },
      },
    });
    const withWorkerTelemetry = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as Record<string, unknown>;
    expect(withWorkerTelemetry).toMatchObject({
      status: 'scanning',
      progress: 37,
      phase: 'Building semantic index',
      filesProcessed: 3,
      totalFiles: 7,
      memoryScope: 'isolated-worker',
      memoryAvailable: true,
      memory: { rssMb: 321, heapUsedMb: 123 },
      memoryBudget: {
        maxRssMb: 1,
        peakRssMb: 321,
        peakHeapUsedMb: 123,
        exceeded: false,
      },
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

  it('preserves a worker-owned memory cancellation as the terminal receipt', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-worker-memory-cancel-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-worker-memory-cancel-cache-')
    );

    class FakeWorker extends EventEmitter {
      terminated = false;

      unref(): this {
        return this;
      }

      terminate(): Promise<number> {
        this.terminated = true;
        return Promise.resolve(0);
      }
    }

    const worker = new FakeWorker();
    setIsolatedAbsorbWorkerFactoryForTests(() => worker as unknown as Worker);
    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
      maxRssMb: 128,
    })) as { jobId?: string };

    worker.emit('message', {
      type: 'telemetry',
      memory: { rssMb: 196, heapUsedMb: 96 },
      workerStatus: {
        status: 'cancelling',
        progress: 64,
        phase: 'Building semantic index',
        memoryBudget: {
          maxRssMb: 128,
          peakRssMb: 196,
          peakHeapUsedMb: 96,
          exceeded: true,
          exceededResource: 'rss',
          exceededAtPhase: 'Building semantic index',
          headroomExhausted: false,
        },
      },
    });
    const live = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
    })) as Record<string, unknown>;
    expect(live).toMatchObject({
      status: 'scanning',
      progress: 64,
      phase: 'Building semantic index',
      memoryScope: 'isolated-worker',
      memoryBudget: {
        maxRssMb: 128,
        peakRssMb: 196,
        exceeded: true,
        exceededResource: 'rss',
      },
    });
    expect(worker.terminated).toBe(false);

    worker.emit('message', {
      type: 'complete',
      result: {
        kind: 'AbsorbCancellationReceipt',
        error: 'absorb_cancelled',
        cancelled: true,
        reason: 'memory_budget_exceeded',
        message: 'Absorb rss memory budget exceeded during Building semantic index',
        phaseAtRequest: 'Building semantic index',
        requestedAt: new Date().toISOString(),
        cachePreserved: true,
        cacheCommitted: false,
      },
      workerStatus: {
        status: 'cancelled',
        memory: { rssMb: 196, heapUsedMb: 96 },
        memoryBudget: {
          maxRssMb: 128,
          peakRssMb: 196,
          peakHeapUsedMb: 96,
          exceeded: true,
          exceededResource: 'rss',
          exceededAtPhase: 'Building semantic index',
          headroomExhausted: false,
        },
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const terminal = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    expect(terminal).toMatchObject({
      status: 'cancelled',
      cancellation: {
        reason: 'memory_budget_exceeded',
        phaseAtRequest: 'Building semantic index',
      },
      memoryScope: 'isolated-worker',
      memoryBudget: {
        maxRssMb: 128,
        peakRssMb: 196,
        exceeded: true,
        exceededResource: 'rss',
      },
      result: {
        kind: 'AbsorbCancellationReceipt',
        error: 'absorb_cancelled',
        cancelled: true,
        reason: 'memory_budget_exceeded',
        cachePreserved: true,
        cacheCommitted: false,
      },
    });
  });

  it('settles complete when a resource cancellation arrives after atomic cache commit', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-worker-post-commit-cancel-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-worker-post-commit-cancel-cache-')
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
      outputFormat: 'graph',
      async: true,
      force: true,
    })) as { jobId?: string };

    worker.emit('message', {
      type: 'complete',
      result: {
        kind: 'AbsorbCancellationReceipt',
        error: 'absorb_cancelled',
        cancelled: true,
        reason: 'system_memory_reserve_exhausted',
        message: 'Host reserve crossed after generation selection',
        phaseAtRequest: 'cache-commit',
        requestedAt: new Date().toISOString(),
        cachePreserved: false,
        cacheCommitted: true,
        refreshProgressReceipt: {
          schemaVersion: 'holoscript.absorb-refresh-progress-receipt.v1',
          kind: 'AbsorbRefreshProgressReceipt',
          resumeToken: 'post-commit-receipt',
          rootDir: repoDir,
          targetGitCommitHash: null,
          targetWorktreeFingerprint: null,
          planHash: 'plan',
          selectedFilesHash: 'files',
          scanPolicyHash: 'policy',
          status: 'interrupted',
          authoritative: false,
          cachePublished: false,
          publishedGraphAuthoritative: false,
          priorAuthoritativeCachePreserved: true,
          resumable: true,
          totalCandidateFiles: 7,
          totalBatches: 1,
          completedBatchCount: 1,
          completedCandidateFiles: 7,
          remainingCandidateFiles: 0,
          progressPercent: 100,
          resumeMode: 'exact',
          reusedBatchCount: 0,
          invalidatedBatchCount: 0,
          selection: {
            maxFiles: 20_000,
            workspaceCandidateFiles: 7,
            selectedCandidateFiles: 7,
            truncated: false,
            truncationReason: null,
          },
          receiptFile: path.join(repoDir, 'progress-receipt.json'),
          checkpointDirectory: path.join(repoDir, 'checkpoint'),
          ownerProcessId: process.pid,
          ownerHost: 'test',
          ownerWriterLeaseSha256: 'lease',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: 'reserve exhausted',
          completedBatchesOmitted: 1,
        },
      },
      workerStatus: {
        status: 'cancelled',
        cacheCommitted: true,
        filesProcessed: 7,
        totalFiles: 7,
        memoryBudget: {
          minSystemFreeMb: 2_048,
          peakRssMb: 7_717,
          peakHeapUsedMb: 2_999,
          minObservedSystemFreeMb: 1_751,
          systemReserveExhausted: true,
          systemReserveExhaustedAtPhase: 'cache-commit',
          exceeded: false,
          headroomExhausted: false,
        },
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const terminal = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    expect(terminal).toMatchObject({
      status: 'complete',
      progress: 100,
      phase: 'Complete (cache committed; resource caveat recorded)',
      result: {
        schemaVersion: 'holoscript.absorb-post-commit-resource-caveat.v1',
        kind: 'AbsorbPostCommitResourceCaveatReceipt',
        status: 'complete',
        completed: true,
        cacheCommitted: true,
        cachePreserved: false,
        filesProcessed: 7,
        totalFiles: 7,
        resourceCaveat: {
          reason: 'system_memory_reserve_exhausted',
          phaseAtRequest: 'cache-commit',
        },
        refreshProgressReceipt: {
          status: 'complete',
          authoritative: false,
          cachePublished: true,
          publishedGraphAuthoritative: true,
          priorAuthoritativeCachePreserved: false,
        },
      },
    });
    expect(JSON.stringify(terminal)).not.toContain('"error":"reserve exhausted"');
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
      outputFormat: 'stats',
      async: true,
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
    const conflicting = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      async: true,
      force: true,
    })) as {
      accepted?: boolean;
      error?: string;
      busy?: boolean;
      activeJobId?: string;
    };
    expect(conflicting).toMatchObject({
      accepted: false,
      busy: true,
      error: 'absorb_workspace_busy',
      activeJobId: first.jobId,
    });
    expect(workerStarts).toBe(1);
  });

  it('reuses an equivalent writer lease owned by another MCP process', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-cross-process-flight-repo-');
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cross-process-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }
      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }

    let workerStarts = 0;
    setIsolatedAbsorbWorkerFactoryForTests(() => {
      workerStarts += 1;
      return new FakeWorker() as unknown as Worker;
    });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { accepted?: boolean; jobId?: string };
    expect(first.accepted).toBe(true);
    expect(first.jobId).toBeTruthy();

    const paths = resolveCodebaseCachePaths(repoDir);
    expect(fs.existsSync(paths.writerLeaseFile)).toBe(true);
    simulateAbsorbProcessRestartForTests();

    const joined = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [repoDir],
      outputFormat: 'stats',
      async: true,
    })) as {
      accepted?: boolean;
      coalesced?: boolean;
      externalWriter?: boolean;
      jobId?: string;
    };
    expect(joined).toMatchObject({
      accepted: true,
      coalesced: true,
      externalWriter: true,
      jobId: first.jobId,
    });
    expect(workerStarts).toBe(1);

    const externalStatus = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: first.jobId,
    })) as { status?: string; externalWriter?: boolean };
    expect(externalStatus).toMatchObject({
      status: 'scanning',
      externalWriter: true,
    });

    const conflict = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      async: true,
    })) as { accepted?: boolean; error?: string; activeJobId?: string };
    expect(conflict).toMatchObject({
      accepted: false,
      error: 'absorb_workspace_busy',
      activeJobId: first.jobId,
    });
  });

  it('recovers a writer lease whose owning process is gone', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-stale-writer-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-stale-writer-cache-')
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

    let workerStarts = 0;
    setIsolatedAbsorbWorkerFactoryForTests(() => {
      workerStarts += 1;
      return new FakeWorker() as unknown as Worker;
    });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { jobId?: string };
    expect(first.jobId).toBeTruthy();
    const paths = resolveCodebaseCachePaths(repoDir);
    const staleLease = JSON.parse(fs.readFileSync(paths.writerLeaseFile, 'utf-8')) as Record<
      string,
      unknown
    >;
    simulateAbsorbProcessRestartForTests();
    fs.writeFileSync(
      paths.writerLeaseFile,
      JSON.stringify({
        ...staleLease,
        ownerPid: 2_147_483_647,
        ownerHost: os.hostname(),
      }),
      'utf-8'
    );

    const recovered = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as {
      accepted?: boolean;
      jobId?: string;
      recoveredStaleWriterLease?: boolean;
    };
    expect(recovered).toMatchObject({
      accepted: true,
      recoveredStaleWriterLease: true,
    });
    expect(recovered.jobId).not.toBe(first.jobId);
    expect(workerStarts).toBe(2);
  });

  it('keeps the prior graph and embedding generation selected when publication is interrupted', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-generation-rollback-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-generation-rollback-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';
    process.env.ABSORB_REQUIRE_ISOLATION = '0';
    process.env.ABSORB_MIN_SYSTEM_FREE_MB = '64';

    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
    })) as Record<string, unknown>;
    expect(initial, JSON.stringify(initial, null, 2)).not.toHaveProperty('error');

    const paths = resolveCodebaseCachePaths(repoDir);
    const manifestBeforeRaw = fs.readFileSync(paths.generationManifestFile, 'utf-8');
    const manifestBefore = JSON.parse(manifestBeforeRaw) as {
      generationId: string;
      graphFile: string;
      embeddingsFile: string;
    };
    const selectedGraphBefore = path.resolve(paths.generationsDirectory, manifestBefore.graphFile);
    const selectedEmbeddingsBefore = path.resolve(
      paths.generationsDirectory,
      manifestBefore.embeddingsFile
    );
    const graphHashBefore = createHash('sha256')
      .update(fs.readFileSync(selectedGraphBefore))
      .digest('hex');
    const embeddingsHashBefore = createHash('sha256')
      .update(fs.readFileSync(selectedEmbeddingsBefore))
      .digest('hex');

    fs.appendFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      '\nexport const interruptedGeneration = true;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'change generation'], {
      cwd: repoDir,
      windowsHide: true,
    });

    setCachePublicationFaultForTests('after-embeddings');
    const interrupted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
    })) as {
      error?: string;
      message?: string;
      cachePreserved?: boolean;
    };
    setCachePublicationFaultForTests();
    expect(interrupted).toMatchObject({
      error: 'absorb_refresh_failed',
      message: 'Unable to publish the completed absorb graph cache atomically',
      cachePreserved: true,
    });

    expect(fs.readFileSync(paths.generationManifestFile, 'utf-8')).toBe(manifestBeforeRaw);
    const manifestAfter = JSON.parse(fs.readFileSync(paths.generationManifestFile, 'utf-8')) as {
      generationId: string;
      graphFile: string;
      embeddingsFile: string;
    };
    expect(manifestAfter.generationId).toBe(manifestBefore.generationId);
    expect(
      createHash('sha256')
        .update(fs.readFileSync(path.resolve(paths.generationsDirectory, manifestAfter.graphFile)))
        .digest('hex')
    ).toBe(graphHashBefore);
    expect(
      createHash('sha256')
        .update(
          fs.readFileSync(path.resolve(paths.generationsDirectory, manifestAfter.embeddingsFile))
        )
        .digest('hex')
    ).toBe(embeddingsHashBefore);

    resetCodebaseToolStateForTests(false);
    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      semanticIndex?: {
        diskEmbeddingGenerationMatchesGraph?: boolean;
      };
      cacheStorage?: { generationId?: string | null };
    };
    expect(status.cacheStorage?.generationId).toBe(manifestBefore.generationId);
    expect(status.semanticIndex?.diskEmbeddingGenerationMatchesGraph).toBe(true);
  }, 30_000);

  it('refuses a cold selected graph generation whose bytes no longer match its manifest', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-generation-integrity-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-generation-integrity-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';
    process.env.ABSORB_REQUIRE_ISOLATION = '0';
    process.env.ABSORB_MIN_SYSTEM_FREE_MB = '64';

    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
    })) as Record<string, unknown>;
    expect(initial, JSON.stringify(initial, null, 2)).not.toHaveProperty('error');

    const paths = resolveCodebaseCachePaths(repoDir);
    const manifest = JSON.parse(fs.readFileSync(paths.generationManifestFile, 'utf-8')) as {
      schemaVersion?: string;
      generationId: string;
      graphFile: string;
      graphCacheSha256?: string;
      graphCacheBytes?: number;
    };
    const selectedGraph = path.resolve(paths.generationsDirectory, manifest.graphFile);
    const selectedGraphBytes = fs.readFileSync(selectedGraph);
    expect(manifest).toMatchObject({
      schemaVersion: 'holoscript.absorb-cache-generation.v2',
      graphCacheSha256: createHash('sha256').update(selectedGraphBytes).digest('hex'),
      graphCacheBytes: selectedGraphBytes.byteLength,
    });

    const corruptedEnvelope = JSON.parse(selectedGraphBytes.toString('utf-8')) as {
      timestamp: number;
    };
    corruptedEnvelope.timestamp += 1;
    const corruptedGraphBytes = Buffer.from(JSON.stringify(corruptedEnvelope), 'utf-8');
    expect(corruptedGraphBytes.byteLength).toBe(selectedGraphBytes.byteLength);
    fs.writeFileSync(selectedGraph, corruptedGraphBytes);

    resetCodebaseToolStateForTests(false);
    const originalCwd = process.cwd();
    try {
      process.chdir(repoDir);
      const status = (await handleCodebaseTool('holo_graph_status', {
        forceRefresh: true,
      })) as {
        graphAuthoritative?: boolean;
        semanticIndexReady?: boolean;
        graphUnavailableReceipt?: { reason?: string };
      };
      expect(status.graphAuthoritative).toBe(false);
      expect(status.semanticIndexReady).toBe(false);
      expect(status.graphUnavailableReceipt?.reason).toBe('cache_missing');
    } finally {
      process.chdir(originalCwd);
    }
  }, 30_000);

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

  it('creates a large fallback checkpoint before the isolated worker starts', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-worker-checkpoint-relay-repo-');
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-worker-checkpoint-relay-cache-')
    );
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '2';
    process.env.ABSORB_REQUIRE_ISOLATION = '1';
    writeGraphCache(cacheDir, repoDir, Date.now(), getHeadCommit(repoDir), 1);

    class FakeWorker extends EventEmitter {
      unref(): this {
        return this;
      }
      terminate(): Promise<number> {
        return Promise.resolve(0);
      }
    }
    let workerArgs: Record<string, unknown> | undefined;
    setIsolatedAbsorbWorkerFactoryForTests((workerData) => {
      workerArgs = workerData.args;
      return new FakeWorker() as unknown as Worker;
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as {
      accepted?: boolean;
      autoBackground?: boolean;
      backgroundIsolation?: string;
      resumeToken?: string;
      refreshProgressReceipt?: {
        receiptFile?: string;
        status?: string;
        totalCandidateFiles?: number;
      };
    };

    expect(accepted).toMatchObject({
      accepted: true,
      autoBackground: true,
      backgroundIsolation: 'worker-thread',
      refreshProgressReceipt: {
        status: 'prepared',
        totalCandidateFiles: 2,
      },
    });
    expect(accepted.resumeToken).toMatch(/^[a-f0-9]{32}$/);
    expect(workerArgs?.resumeToken).toBe(accepted.resumeToken);
    expect(fs.existsSync(accepted.refreshProgressReceipt!.receiptFile!)).toBe(true);
  });

  it('never expires an active job and recovers terminal status after memory retention', async () => {
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
      ).toMatchObject({
        status: 'complete',
        recoveredFromReceipt: true,
        durableTerminalStatus: true,
        durableReceiptFile: expect.any(String),
        resultAvailable: true,
      });

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(
        await handleCodebaseTool('holo_get_absorb_status', { jobId: accepted.jobId })
      ).toMatchObject({
        status: 'complete',
        progress: 100,
        recoveredFromReceipt: true,
        durableTerminalStatus: true,
        resultAvailable: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers terminal cache-warm status from its writer receipt after restart', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-durable-warm-status-repo-');
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-durable-warm-status-cache-')
    );
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    const paths = resolveCodebaseCachePaths(repoDir);
    const jobId = 'absorb-warm-1785213676007-test';
    const receiptFile = path.join(paths.writerReceiptsDirectory, `${jobId}.json`);
    fs.mkdirSync(paths.writerReceiptsDirectory, { recursive: true });
    fs.writeFileSync(
      receiptFile,
      JSON.stringify({
        schemaVersion: 'holoscript.absorb-writer-receipt.v1',
        kind: 'AbsorbWriterReceipt',
        jobId,
        writerKey: 'writer-key',
        policyHash: 'policy-hash',
        status: 'cancelled',
        phase: 'Cancelled',
        progress: 100,
        filesProcessed: 0,
        totalFiles: 0,
        cacheCommitted: false,
        rootDir: repoDir,
        startedAt: '2026-07-28T04:41:16.107Z',
        completedAt: '2026-07-28T04:41:16.139Z',
        cancellation: {
          reason: 'system_memory_reserve_exhausted',
          message: 'System memory reserve is below the configured floor.',
          phaseAtRequest: 'Checking semantic cache warm memory budget',
          requestedAt: '2026-07-28T04:41:16.120Z',
          completedAt: '2026-07-28T04:41:16.139Z',
        },
      }),
      'utf-8'
    );
    simulateAbsorbProcessRestartForTests();

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId,
      includeResult: true,
    })) as Record<string, unknown>;
    expect(status).toMatchObject({
      jobId,
      status: 'cancelled',
      recoveredFromReceipt: true,
      durableTerminalStatus: true,
      durableReceiptFile: receiptFile,
      resultAvailable: false,
      cancellation: {
        reason: 'system_memory_reserve_exhausted',
      },
    });
    expect(status.resultUnavailableReason).toContain('result body was not persisted');

    const cancel = (await handleCodebaseTool('holo_cancel_absorb', {
      jobId,
    })) as Record<string, unknown>;
    expect(cancel).toMatchObject({
      accepted: false,
      jobId,
      status: 'cancelled',
      recoveredFromReceipt: true,
    });
    expect(cancel.message).toContain('already terminal');

    const graphStatus = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      cacheWarm?: Record<string, unknown>;
    };
    expect(graphStatus.cacheWarm).toMatchObject({
      jobId,
      status: 'cancelled',
      inProgress: false,
      recoveredFromReceipt: true,
      durableTerminalStatus: true,
      cancellation: {
        reason: 'system_memory_reserve_exhausted',
      },
    });
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
      error: 'absorb_worker_unavailable',
      legacyError: 'absorb_background_isolation_unavailable',
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
        error: 'absorb_worker_unavailable',
        legacyError: 'absorb_background_isolation_unavailable',
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

  it('isolates, reuses, and invalidates exact multi-root authority sets', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-multi-root-cache-'));
    const primaryRoot = makeTinyGitRepo('holoscript-multi-root-primary-');
    const secondaryRoot = makeTinyGitRepo('holoscript-multi-root-secondary-');
    const alternateRoot = makeTinyGitRepo('holoscript-multi-root-alternate-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = primaryRoot;
    const primarySecondaryPaths = resolveCodebaseCachePathsForRoots([primaryRoot, secondaryRoot]);
    const primaryAlternatePaths = resolveCodebaseCachePathsForRoots([primaryRoot, alternateRoot]);
    expect(primarySecondaryPaths.directory).not.toBe(primaryAlternatePaths.directory);

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [primaryRoot, secondaryRoot],
      outputFormat: 'stats',
      force: true,
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      rootSetId?: string;
      stats?: { totalFiles?: number };
    };
    expect(first.error).toBeUndefined();
    expect(first.graphAuthoritative).toBe(true);
    expect(first.stats?.totalFiles).toBe(4);
    expect(first.rootSetId).toHaveLength(64);

    const firstEnvelope = JSON.parse(fs.readFileSync(primarySecondaryPaths.graphFile, 'utf-8')) as {
      rootDirs?: string[];
      rootSetId?: string;
      rootAuthorityPins?: Array<{
        rootDir?: string;
        gitCommitHash?: string | null;
        worktreeFingerprint?: string | null;
        coverageAtScan?: { complete?: boolean; graphFileCount?: number };
      }>;
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
    expect(firstEnvelope.rootSetId).toBe(first.rootSetId);
    expect(firstEnvelope.rootAuthorityPins).toHaveLength(2);
    for (const pin of firstEnvelope.rootAuthorityPins ?? []) {
      expect(pin.gitCommitHash).toMatch(/^[a-f0-9]{40}$/);
      expect(pin.worktreeFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(pin.coverageAtScan).toMatchObject({
        complete: true,
        graphFileCount: 2,
      });
    }
    const firstSecondaryDigest =
      firstEnvelope.fileHashes?.['../' + path.basename(secondaryRoot) + '/src/alpha.ts'];

    resetCodebaseToolStateForTests();
    const reused = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [secondaryRoot, primaryRoot],
      outputFormat: 'stats',
    })) as {
      cached?: boolean;
      multiRootReuse?: boolean;
      rootSetId?: string;
      stats?: { totalFiles?: number };
    };
    expect(reused).toMatchObject({
      cached: true,
      multiRootReuse: true,
      rootSetId: first.rootSetId,
      stats: { totalFiles: 4 },
    });

    resetCodebaseToolStateForTests();
    const alternate = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [primaryRoot, alternateRoot],
      outputFormat: 'stats',
      force: true,
    })) as { rootSetId?: string; stats?: { totalFiles?: number } };
    expect(alternate.stats?.totalFiles).toBe(4);
    expect(alternate.rootSetId).not.toBe(first.rootSetId);
    expect(fs.existsSync(primarySecondaryPaths.graphFile)).toBe(true);
    expect(fs.existsSync(primaryAlternatePaths.graphFile)).toBe(true);

    resetCodebaseToolStateForTests();
    const reusedAfterAlternate = (await handleCodebaseTool('holo_absorb_repo', {
      rootDirs: [primaryRoot, secondaryRoot],
      outputFormat: 'stats',
    })) as { cached?: boolean; multiRootReuse?: boolean; rootSetId?: string };
    expect(reusedAfterAlternate).toMatchObject({
      cached: true,
      multiRootReuse: true,
      rootSetId: first.rootSetId,
    });
    const reusedStatus = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      rootDirs?: string[];
      rootSetId?: string;
      rootSetAuthority?: { authoritative?: boolean };
      cacheStorage?: { directory?: string };
    };
    expect(reusedStatus).toMatchObject({
      graphAuthoritative: true,
      rootSetId: first.rootSetId,
      rootSetAuthority: { authoritative: true },
      cacheStorage: { directory: primarySecondaryPaths.directory },
    });
    expect(reusedStatus.rootDirs?.map((entry) => path.resolve(entry))).toEqual([
      path.resolve(primaryRoot),
      path.resolve(secondaryRoot),
    ]);

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
    const driftedStatus = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      rootSetAuthority?: { authoritative?: boolean; changedRoots?: string[] };
    };
    expect(driftedStatus.graphAuthoritative).toBe(false);
    expect(driftedStatus.rootSetAuthority?.authoritative).toBe(false);
    expect(
      driftedStatus.rootSetAuthority?.changedRoots?.some(
        (rootDir) => path.resolve(rootDir) === path.resolve(secondaryRoot)
      )
    ).toBe(true);

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
      fs.readFileSync(primarySecondaryPaths.graphFile, 'utf-8')
    ) as {
      fileHashes?: Record<string, string>;
      rootAuthorityPins?: Array<{ rootDir?: string; gitCommitHash?: string | null }>;
    };
    const refreshedSecondaryDigest =
      refreshedEnvelope.fileHashes?.['../' + path.basename(secondaryRoot) + '/src/alpha.ts'];
    expect(refreshedSecondaryDigest).toBeTruthy();
    expect(refreshedSecondaryDigest).not.toBe(firstSecondaryDigest);
    expect(
      refreshedEnvelope.rootAuthorityPins?.find((pin) =>
        pin.rootDir ? path.resolve(pin.rootDir) === path.resolve(secondaryRoot) : false
      )?.gitCommitHash
    ).toBe(getHeadCommit(secondaryRoot));
    expect(JSON.parse(fs.readFileSync(primaryAlternatePaths.graphFile, 'utf-8')).rootSetId).toBe(
      alternate.rootSetId
    );
  }, 60_000);

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

  it('marks a fresh-age disk cache stale when HEAD and cached content both differ', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-stale-cache-'));
    const requestedRoot = makeTinyGitRepo('holoscript-git-stale-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = requestedRoot;
    const staleFileHashes = hashRepoFiles(requestedRoot, ['src/alpha.ts', 'src/beta.ts']);
    staleFileHashes['src/alpha.ts'] = sha256('stale alpha');
    writeGraphCacheWithFileHashes(
      cacheDir,
      requestedRoot,
      Date.now() - 5 * 60 * 1000,
      '1111111111111111111111111111111111111111',
      staleFileHashes
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

  it('reuses unchanged embeddings across a forced small-delta full refresh', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-delta-embed-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-delta-embed-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    fs.writeFileSync(
      path.join(repoDir, 'src', 'gamma.ts'),
      'export function gamma(): string { return "stable"; }\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/gamma.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'add stable fixture'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const buildSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');
    const refreshSpy = vi.spyOn(EmbeddingIndex.prototype, 'refreshIndex');
    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
    })) as {
      error?: string;
      graphPayload?: { inline?: boolean; stored?: boolean };
      stats?: { totalFiles?: number; totalSymbols?: number };
    };

    fs.appendFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      '\nexport function alphaDelta(input: string): string { return input.trim(); }\n'
    );
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'change one source file'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const refreshed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
    })) as {
      error?: string;
      graphPayload?: { inline?: boolean; stored?: boolean };
      embeddingRefresh?: {
        kind?: string;
        previousSymbols?: number;
        totalSymbols?: number;
        reusedSymbols?: number;
        embeddedSymbols?: number;
        reuseRatio?: number;
      };
    };

    expect(initial.error).toBeUndefined();
    expect(initial.stats?.totalFiles).toBe(3);
    expect(initial.graphPayload).toMatchObject({ inline: false, stored: true });
    expect(refreshed.error).toBeUndefined();
    expect(refreshed.graphPayload).toMatchObject({ inline: false, stored: true });
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshed.embeddingRefresh).toMatchObject({
      kind: 'EmbeddingRefreshReceipt',
      previousSymbols: initial.stats?.totalSymbols,
      totalSymbols: expect.any(Number),
      reusedSymbols: expect.any(Number),
      embeddedSymbols: expect.any(Number),
    });
    expect(refreshed.embeddingRefresh!.reusedSymbols).toBeGreaterThan(0);
    expect(refreshed.embeddingRefresh!.embeddedSymbols).toBeGreaterThan(0);
    expect(refreshed.embeddingRefresh!.embeddedSymbols).toBeLessThan(
      refreshed.embeddingRefresh!.totalSymbols!
    );
    expect(refreshed.embeddingRefresh!.reuseRatio).toBeGreaterThan(0);

    simulateAbsorbProcessRestartForTests();
    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      diskCache?: {
        freshForCurrentRepo?: boolean;
        gitCommitMatchesHead?: boolean;
      };
    };
    const query = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      result?: { totalFiles?: number; totalSymbols?: number };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.diskCache).toMatchObject({
      freshForCurrentRepo: true,
      gitCommitMatchesHead: true,
    });
    expect(query.error).toBeUndefined();
    expect(query.result?.totalFiles).toBe(3);
    expect(query.result?.totalSymbols).toBe(refreshed.embeddingRefresh?.totalSymbols);
  }, 30_000);

  it('recovers a failed incremental embedding refresh with one bounded full rebuild', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-embed-fallback-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-embed-fallback-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const buildSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');
    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: true,
    })) as {
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(baseline).toMatchObject({
      graphRagReady: true,
      semanticIndexReady: true,
    });
    buildSpy.mockClear();

    fs.appendFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      '\nexport function recoveredEmbeddingDelta(): string { return "fallback"; }\n'
    );
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'add embedding fallback delta'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const refreshSpy = vi
      .spyOn(EmbeddingIndex.prototype, 'refreshIndex')
      .mockRejectedValueOnce(new Error('synthetic incremental refresh failure'));
    const refreshed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'graph',
      force: false,
    })) as {
      embeddingRefresh?: unknown;
      embeddingRefreshFallback?: {
        kind?: string;
        reason?: string;
        fullRebuildAttempted?: boolean;
        recovered?: boolean;
      };
      embeddingSkipped?: boolean;
      graphRagReady?: boolean;
      semanticIndexReady?: boolean;
    };

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(refreshed.embeddingRefresh).toBeUndefined();
    expect(refreshed.embeddingRefreshFallback).toMatchObject({
      kind: 'EmbeddingRefreshFallbackReceipt',
      reason: 'synthetic incremental refresh failure',
      fullRebuildAttempted: true,
      recovered: true,
    });
    expect(refreshed).toMatchObject({
      embeddingSkipped: false,
      graphRagReady: true,
      semanticIndexReady: true,
    });

    simulateAbsorbProcessRestartForTests();
    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphRAGReady?: boolean;
      semanticIndexReady?: boolean;
      semanticIndex?: { diskHydratable?: boolean };
    };
    expect(status).toMatchObject({
      graphRAGReady: true,
      semanticIndexReady: true,
      semanticIndex: { diskHydratable: true },
    });
  }, 30_000);

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

  it('persists language scope and accounts for language-filtered coverage exclusions', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-language-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-language-repo-'));
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
      path.join(repoDir, 'src', 'selected.ts'),
      'export const selected = true;\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(repoDir, 'src', 'excluded.py'), 'excluded = True\n', 'utf-8');
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Fixture\n', 'utf-8');
    execFileSync('git', ['add', 'src/selected.ts', 'src/excluded.py', 'README.md'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
      includeUntracked: false,
      languages: ['typescript'],
    })) as {
      stats?: { totalFiles?: number };
      scanPolicy?: { languages?: string[] };
      refreshProgressReceipt?: {
        selection?: {
          workspaceCandidateFiles?: number;
          selectedCandidateFiles?: number;
        };
      };
    };

    expect(result.stats?.totalFiles).toBe(1);
    expect(result.scanPolicy?.languages).toEqual(['typescript']);
    expect(result.refreshProgressReceipt?.selection).toMatchObject({
      workspaceCandidateFiles: 1,
      selectedCandidateFiles: 1,
    });

    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      coverage?: {
        candidateDefinition?: string;
        languages?: string[];
        complete?: boolean;
        exactFileSetMatch?: boolean;
        trackedGitVisibleFileCount?: number;
        trackedCandidateCount?: number;
        trackedExclusions?: {
          languageFilter?: number;
          total?: number;
        };
      };
      diskCache?: {
        authoritative?: boolean;
        scanPolicy?: { languages?: string[] };
      };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.coverage).toMatchObject({
      candidateDefinition: 'scanner-eligible-files-v1',
      languages: ['typescript'],
      complete: true,
      exactFileSetMatch: true,
      trackedGitVisibleFileCount: 3,
      trackedCandidateCount: 1,
      trackedExclusions: {
        languageFilter: 2,
        total: 2,
      },
    });
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.scanPolicy?.languages).toEqual(['typescript']);
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

  it('keeps untracked peer files out of incremental tracked-only refreshes', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-incremental-tracked-only-cache-')
    );
    const repoDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-incremental-tracked-only-repo-')
    );
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
    fs.writeFileSync(path.join(repoDir, 'fixture.bin'), Buffer.from([0, 1, 2, 3]));
    execFileSync('git', ['add', 'src/tracked.ts', 'fixture.bin'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoDir, windowsHide: true });

    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
      includeUntracked: false,
    })) as { stats?: { totalFiles?: number } };
    expect(initial.stats?.totalFiles).toBe(1);

    fs.writeFileSync(
      path.join(repoDir, 'src', 'peer-untracked.ts'),
      'export const peerUntracked = true;\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, 'src', 'newly-tracked.ts'),
      'export const newlyTracked = true;\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(repoDir, 'src', 'tracked.ts'),
      'export const tracked = false;\n',
      'utf-8'
    );
    execFileSync('git', ['rm', 'fixture.bin'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['add', 'src/newly-tracked.ts', 'src/tracked.ts'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'advance tracked head'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const refreshed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      includeUntracked: false,
    })) as {
      stats?: { totalFiles?: number };
      message?: string;
      filesChanged?: number;
      filesAdded?: number;
      filesModified?: number;
      filesDeleted?: number;
      filesEvicted?: number;
      fileDelta?: {
        filesBefore?: number;
        filesAfter?: number;
        filesChanged?: number;
        filesAdded?: number;
        filesModified?: number;
        filesDeleted?: number;
        filesEvicted?: number;
        changedEqualsAddedPlusModified?: boolean;
        afterEqualsBeforePlusAddedMinusRemoved?: boolean;
      };
    };
    expect(refreshed.stats?.totalFiles).toBe(2);
    expect(refreshed.message).toContain('patched 2 files');
    expect(refreshed).toMatchObject({
      filesChanged: 2,
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 0,
      filesEvicted: 0,
      fileDelta: {
        filesBefore: 1,
        filesAfter: 2,
        filesChanged: 2,
        filesAdded: 1,
        filesModified: 1,
        filesDeleted: 0,
        filesEvicted: 0,
        changedEqualsAddedPlusModified: true,
        afterEqualsBeforePlusAddedMinusRemoved: true,
      },
    });

    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      coverage?: {
        graphFileCount?: number;
        selectedCandidateCount?: number;
        exactFileSetMatch?: boolean;
        missingGraphFiles?: number;
        unexpectedGraphFiles?: number;
      };
    };
    expect(status.graphAuthoritative).toBe(true);
    expect(status.coverage).toMatchObject({
      graphFileCount: 2,
      selectedCandidateCount: 2,
      exactFileSetMatch: true,
      missingGraphFiles: 0,
      unexpectedGraphFiles: 0,
    });

    execFileSync('git', ['rm', 'src/tracked.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'delete tracked source'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const deletion = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      includeUntracked: false,
    })) as {
      stats?: { totalFiles?: number };
      filesChanged?: number;
      filesAdded?: number;
      filesModified?: number;
      filesDeleted?: number;
      filesEvicted?: number;
      fileDelta?: {
        filesBefore?: number;
        filesAfter?: number;
        afterEqualsBeforePlusAddedMinusRemoved?: boolean;
      };
    };
    expect(deletion).toMatchObject({
      stats: { totalFiles: 1 },
      filesChanged: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 1,
      filesEvicted: 0,
      fileDelta: {
        filesBefore: 2,
        filesAfter: 1,
        afterEqualsBeforePlusAddedMinusRemoved: true,
      },
    });
  });

  it('excludes Git-only additions and deletions from graph file delta receipts', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-incremental-file-delta-cache-')
    );
    const repoDir = makeTinyGitRepo('holoscript-incremental-file-delta-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const initial = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
      includeUntracked: false,
    })) as { stats?: { totalFiles?: number } };
    expect(initial.stats?.totalFiles).toBe(2);

    fs.writeFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      'export const alpha = 42;\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(repoDir, 'asset.bin'), Buffer.from([4, 5, 6, 7]));
    fs.writeFileSync(
      path.join(repoDir, 'src', 'peer-untracked.ts'),
      'export const peerUntracked = true;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/alpha.ts', 'asset.bin'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'mixed graph and non-graph delta'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const mixed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      includeUntracked: false,
    })) as Record<string, unknown>;
    expect(mixed).toMatchObject({
      filesChanged: 1,
      filesAdded: 0,
      filesModified: 1,
      filesDeleted: 0,
      filesEvicted: 0,
      fileDelta: {
        filesBefore: 2,
        filesAfter: 2,
        changedEqualsAddedPlusModified: true,
        afterEqualsBeforePlusAddedMinusRemoved: true,
      },
    });

    execFileSync('git', ['rm', 'asset.bin'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'delete non-graph asset'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const nonGraphDeletion = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      includeUntracked: false,
    })) as Record<string, unknown>;
    expect(nonGraphDeletion).toMatchObject({
      filesChanged: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesEvicted: 0,
      fileDelta: {
        filesBefore: 2,
        filesAfter: 2,
        changedEqualsAddedPlusModified: true,
        afterEqualsBeforePlusAddedMinusRemoved: true,
      },
    });
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

  it('repairs only the missing file from a valid incomplete cache without auto-backgrounding', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-delta-repair-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-delta-repair-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      graphAuthoritative?: boolean;
      stats?: { totalFiles?: number };
    };
    expect(baseline).toMatchObject({
      graphAuthoritative: true,
      stats: { totalFiles: 2 },
    });

    const cacheFile = path.join(cacheDir, 'graph-cache.json');
    removeFilesFromGraphCache(cacheFile, ['src/beta.ts']);
    fs.appendFileSync(path.join(repoDir, '.git', 'info', 'exclude'), 'node_modules/\n', 'utf-8');
    const ignoredFile = path.join(repoDir, 'node_modules', 'ignored.ts');
    fs.mkdirSync(path.dirname(ignoredFile), { recursive: true });
    fs.writeFileSync(ignoredFile, 'export const ignored = true;\n', 'utf-8');
    const incompleteEnvelope = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as {
      stats: Record<string, unknown>;
      graphJson: string;
      fileHashes?: Record<string, string>;
    };
    const incompleteGraph = CodebaseGraph.deserialize(incompleteEnvelope.graphJson);
    const scanner = new CodebaseScanner();
    try {
      const ignoredScan = await scanner.scanFiles(repoDir, [ignoredFile]);
      incompleteGraph.patchFromChanges(ignoredScan.files, [], []);
    } finally {
      await scanner.dispose();
    }
    incompleteEnvelope.graphJson = incompleteGraph.serialize();
    incompleteEnvelope.stats = incompleteGraph.getStats() as unknown as Record<string, unknown>;
    incompleteEnvelope.fileHashes ??= {};
    incompleteEnvelope.fileHashes['node_modules/ignored.ts'] = sha256(
      fs.readFileSync(ignoredFile, 'utf-8')
    );
    fs.writeFileSync(cacheFile, JSON.stringify(incompleteEnvelope), 'utf-8');
    markMutatedGenerationFixtureAsLegacy(repoDir);
    resetCodebaseToolStateForTests(false);
    process.env.ABSORB_AUTO_BACKGROUND = '1';
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '2';

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    const scanSpy = vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(function (
      ...args
    ) {
      return originalScanFiles.apply(this, args);
    });
    const fullScanSpy = vi.spyOn(CodebaseScanner.prototype, 'scanInBatches');
    const embeddingSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');

    const repaired = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as {
      accepted?: boolean;
      incremental?: boolean;
      repairedIncompleteCache?: boolean;
      repairMode?: string;
      filesChanged?: number;
      graphAuthoritative?: boolean;
      incompleteCacheRepair?: {
        selectedCandidateFiles?: number;
        cachedGraphFiles?: number;
        missingFiles?: number;
        changedFiles?: number;
        removedFiles?: number;
        parsedFiles?: number;
      };
    };

    expect(repaired.accepted).toBeUndefined();
    expect(repaired).toMatchObject({
      incremental: true,
      repairedIncompleteCache: true,
      repairMode: 'authority-safe-delta',
      filesChanged: 1,
      graphAuthoritative: true,
      incompleteCacheRepair: {
        selectedCandidateFiles: 2,
        cachedGraphFiles: 2,
        missingFiles: 1,
        changedFiles: 0,
        removedFiles: 1,
        parsedFiles: 1,
      },
    });
    const rescannedFiles = scanSpy.mock.calls
      .flatMap((call) => call[1] as string[])
      .map((filePath) => path.relative(repoDir, filePath).replace(/\\/g, '/'));
    expect(rescannedFiles).toEqual(['src/beta.ts']);
    expect(fullScanSpy).not.toHaveBeenCalled();
    expect(embeddingSpy).not.toHaveBeenCalled();

    simulateAbsorbProcessRestartForTests();
    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      coverage?: { complete?: boolean; graphFileCount?: number };
      fileHashFreshness?: { fresh?: boolean };
    };
    expect(status).toMatchObject({
      graphAuthoritative: true,
      coverage: {
        complete: true,
        graphFileCount: 2,
      },
      fileHashFreshness: {
        fresh: true,
      },
    });
  }, 30_000);

  it('preserves the incomplete generation when source changes during delta repair', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-delta-pin-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-delta-pin-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      graphAuthoritative?: boolean;
    };
    expect(baseline.graphAuthoritative).toBe(true);

    const cacheFile = path.join(cacheDir, 'graph-cache.json');
    removeFilesFromGraphCache(cacheFile, ['src/beta.ts']);
    markMutatedGenerationFixtureAsLegacy(repoDir);
    const priorIncompleteCache = fs.readFileSync(cacheFile, 'utf-8');
    resetCodebaseToolStateForTests(false);
    process.env.ABSORB_AUTO_BACKGROUND = '1';
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '1';

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return originalScanFiles.apply(this, args);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as {
      accepted?: boolean;
      autoBackground?: boolean;
      autoBackgroundReason?: string;
      jobId?: string;
      scanPlan?: { totalCandidateFiles?: number };
    };
    expect(accepted).toMatchObject({
      accepted: true,
      autoBackground: true,
      autoBackgroundReason: 'incomplete_cache_delta_exceeds_foreground_threshold',
      scanPlan: {
        totalCandidateFiles: 1,
      },
    });

    for (let index = 0; index < 100; index++) {
      const status = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as { phase?: string };
      if (String(status.phase).match(/Rescanning|Parsed/)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    fs.appendFileSync(path.join(repoDir, 'src', 'alpha.ts'), '\nexport const drift = true;\n');

    const terminal = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    expect(terminal).toMatchObject({
      status: 'error',
      result: {
        error: 'absorb_refresh_source_changed',
        cachePreserved: true,
        graphAuthoritative: false,
      },
    });
    expect(String(terminal.error)).toContain('Repository worktree changed during absorb refresh');
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe(priorIncompleteCache);
  }, 30_000);

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

  // Complement of the two tests above. They prove the publication gate still
  // refuses when a file the graph DESCRIBES changes underneath it. This proves
  // it no longer destroys the run over a file the graph never described.
  //
  // The divergence exercised here is the file cap. The worktree fingerprint has
  // no cap, so on a repo with more candidates than `maxFiles` every capped-out
  // file could veto a publication it has no stake in. Both directions are
  // required: a gate that only ever refuses and a gate that only ever passes are
  // equally useless.
  it('publishes when a capped-out file the graph never described changes mid-absorb', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-capped-churn-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-capped-churn-repo-');
    const extraFiles: string[] = [];
    for (let index = 0; index < 12; index++) {
      const relative = `src/zz-${String(index).padStart(2, '0')}.ts`;
      fs.writeFileSync(
        path.join(repoDir, relative.replace('/', path.sep)),
        `export const pad${index} = ${index};\n`,
        'utf-8'
      );
      extraFiles.push(relative);
    }
    execFileSync('git', ['add', ...extraFiles], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'padding'], { cwd: repoDir, windowsHide: true });

    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '2';
    const head = getHeadCommit(repoDir);
    writeGraphCache(cacheDir, repoDir, Date.now() - 5 * 60 * 1000, head, 1);

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return originalScanFiles.apply(this, args);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      scanBatchSize: 1,
      maxFiles: 2,
    })) as { accepted?: boolean; jobId?: string };
    expect(accepted).toMatchObject({ accepted: true });

    let refreshProgress: { completedBatchCount?: number } | undefined;
    for (let index = 0; index < 100; index++) {
      const progress = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as { refreshProgressReceipt?: { completedBatchCount?: number } };
      refreshProgress = progress.refreshProgressReceipt;
      if ((refreshProgress?.completedBatchCount ?? 0) >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(refreshProgress?.completedBatchCount).toBeGreaterThanOrEqual(1);
    // Sorts last, so with a cap of 2 it is outside the graph. If that ever stops
    // being true this test fails loudly rather than passing vacuously: the run
    // would refuse and the assertions below would not hold.
    fs.appendFileSync(
      path.join(repoDir, 'src', 'zz-11.ts'),
      '\nexport const churnedByAnotherAgent = true;\n'
    );

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    expect(String(status.error ?? '')).not.toContain(
      'Repository worktree changed during absorb refresh'
    );
    expect(status).toMatchObject({ status: 'complete' });

    // The cap really applied, so zz-11.ts was genuinely outside the graph and
    // this is not passing vacuously on a quiet tree. The verdict receipt itself
    // rides on the full-scan and incremental result shapes, not this repair path.
    expect(Number((status.result as { stats?: { totalFiles?: number } })?.stats?.totalFiles ?? 99)).
      toBeLessThanOrEqual(2);
  }, 30_000);

  // The measured cause of the ai-ecosystem full-tree absorb never finishing.
  //
  // That tree is quiet -- zero scan candidates were touched in the hour before
  // this was written. What kills the run is a single background heartbeat:
  // receipts/holoclaw-sidecar.ndjson is appended on a 900-second timer (median
  // gap 900.008s over 774 records since 2026-07-20), and it is untracked, which
  // the coverage policy includes by default. An 11-minute absorb therefore has
  // roughly a 73% chance of containing a tick, and the tick invalidates the pin.
  //
  // The gate is right to refuse -- something the graph describes did change.
  // The mistake is that an operational log was ever a scan candidate. This
  // proves the fix is configuration, available today, and needs no code change:
  // name the log's directory in scanPolicy.exclude.
  it('finishes when a heartbeat file in an excluded directory ticks mid-absorb', async () => {
    const runWithHeartbeat = async (scanPolicy?: Record<string, unknown>) => {
      resetCodebaseToolStateForTests();
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-heartbeat-cache-'));
      const repoDir = makeTinyGitRepo('holoscript-heartbeat-repo-');
      // Untracked, exactly like the real one, and inside a directory that holds
      // operational output rather than source.
      fs.mkdirSync(path.join(repoDir, 'receipts'), { recursive: true });
      fs.writeFileSync(
        path.join(repoDir, 'receipts', 'sidecar.ndjson'),
        '{"tick":0}\n',
        'utf-8'
      );

      process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
      process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
      process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = '2';
      writeGraphCache(cacheDir, repoDir, Date.now() - 5 * 60 * 1000, getHeadCommit(repoDir), 1);

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
        // exclude/languages/includeUntracked are TOP-LEVEL tool arguments --
        // buildScanPolicyFromArgs reads args.exclude directly. Nesting them under
        // a scanPolicy object is silently ignored.
        ...(scanPolicy ?? {}),
      })) as { accepted?: boolean; jobId?: string };
      expect(accepted).toMatchObject({ accepted: true });

      for (let index = 0; index < 100; index++) {
        const progress = (await handleCodebaseTool('holo_get_absorb_status', {
          jobId: accepted.jobId,
        })) as { refreshProgressReceipt?: { completedBatchCount?: number } };
        if ((progress.refreshProgressReceipt?.completedBatchCount ?? 0) >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      // The heartbeat ticks, as it does every fifteen minutes regardless of us.
      fs.appendFileSync(path.join(repoDir, 'receipts', 'sidecar.ndjson'), '{"tick":1}\n');

      const status = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
      vi.restoreAllMocks();
      return status;
    };

    // Without the exclusion the tick destroys the run -- this is today's behaviour
    // and the reason the test is not vacuous.
    const unprotected = await runWithHeartbeat();
    expect(String(unprotected.error ?? '')).toContain(
      'Repository worktree changed during absorb refresh'
    );

    // Naming the directory is the whole fix.
    const protectedRun = await runWithHeartbeat({ exclude: ['receipts'] });
    expect(String(protectedRun.error ?? '')).not.toContain(
      'Repository worktree changed during absorb refresh'
    );
    expect(protectedRun).toMatchObject({ status: 'complete' });
  }, 60_000);

  it('automatically replans a forced refresh when HEAD advances between scan batches', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-head-retry-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-head-retry-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    let markFirstBatchStarted!: () => void;
    let releaseFirstBatch!: () => void;
    const firstBatchStarted = new Promise<void>((resolve) => {
      markFirstBatchStarted = resolve;
    });
    const firstBatchGate = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    let scanCallCount = 0;
    const scanSpy = vi
      .spyOn(CodebaseScanner.prototype, 'scanFiles')
      .mockImplementation(async function (...args) {
        scanCallCount += 1;
        if (scanCallCount === 1) {
          markFirstBatchStarted();
          await firstBatchGate;
        }
        return originalScanFiles.apply(this, args);
      });

    const refreshPromise = handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
      maxFiles: 20_000,
      autoRetrySourceDrift: true,
      maxSourceDriftRetries: 2,
      sourceDriftDebounceMs: 0,
      sourceDriftCheckIntervalMs: 0,
    });
    await firstBatchStarted;

    fs.writeFileSync(
      path.join(repoDir, 'src', 'gamma.ts'),
      'export function gamma(): string { return "gamma"; }\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/gamma.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'advance during absorb'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const advancedHead = getHeadCommit(repoDir);
    releaseFirstBatch();

    const result = (await refreshPromise) as {
      error?: string;
      gitCommitHash?: string;
      stats?: { totalFiles?: number };
      sourceDriftRetry?: {
        detectionCount?: number;
        retryCount?: number;
        headCheckCount?: number;
        headCheckDurationMs?: number;
        maxHeadCheckDurationMs?: number;
        effectiveCheckIntervalMs?: number;
        exhausted?: boolean;
      };
      refreshProgressReceipt?: {
        status?: string;
        resumeMode?: string;
        targetGitCommitHash?: string;
        reusedBatchCount?: number;
        targetLag?: { selectedCandidateFileDelta?: number };
      };
    };

    expect(result.error).toBeUndefined();
    expect(result.gitCommitHash).toBe(advancedHead);
    expect(result.stats?.totalFiles).toBe(3);
    expect(result.sourceDriftRetry).toMatchObject({
      detectionCount: 1,
      retryCount: 1,
      exhausted: false,
    });
    expect(result.sourceDriftRetry?.headCheckCount).toBeGreaterThan(0);
    expect(result.sourceDriftRetry?.headCheckDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.sourceDriftRetry?.maxHeadCheckDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.sourceDriftRetry?.effectiveCheckIntervalMs).toBe(0);
    expect(result.refreshProgressReceipt).toMatchObject({
      status: 'complete',
      resumeMode: 'content-addressed-overlay',
      targetGitCommitHash: advancedHead,
      reusedBatchCount: 1,
      targetLag: {
        selectedCandidateFileDelta: 1,
      },
    });
    expect(scanSpy).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('refuses before scan planning when the host free-memory reserve is already exhausted', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-system-reserve-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-system-reserve-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';
    const scanSpy = vi.spyOn(CodebaseScanner.prototype, 'planScan');
    const unavailableReserveMb = Math.round(os.freemem() / 1024 / 1024) + 1024;

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      minSystemFreeMb: unavailableReserveMb,
    })) as {
      error?: string;
      cancelled?: boolean;
      reason?: string;
      phaseAtRequest?: string;
      cachePreserved?: boolean;
      memoryBudget?: {
        minSystemFreeMb?: number;
        systemReserveExhausted?: boolean;
        systemReserveExhaustedAtPhase?: string;
      };
    };

    expect(result).toMatchObject({
      error: 'absorb_cancelled',
      cancelled: true,
      reason: 'system_memory_reserve_exhausted',
      phaseAtRequest: 'Initializing',
      cachePreserved: true,
      memoryBudget: {
        minSystemFreeMb: unavailableReserveMb,
        systemReserveExhausted: true,
        systemReserveExhaustedAtPhase: 'preflight resource guard',
      },
    });
    expect(scanSpy).not.toHaveBeenCalled();
  });

  it('reuses completed graph and embedding work across plan drift without publishing stale files', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-resume-publish-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-resume-publish-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    fs.writeFileSync(
      path.join(repoDir, 'src', 'gamma.ts'),
      'export function gammaIndependent(): string { return "gamma"; }\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/gamma.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'independent embedding fixture'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'graph',
      embeddingProvider: 'holoembed',
      scanBatchSize: 1,
      maxFiles: 20_000,
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      graphRagReady?: boolean;
    };
    expect(baseline).toMatchObject({
      graphAuthoritative: true,
      graphRagReady: true,
    });

    const cachePaths = resolveCodebaseCachePaths(repoDir);
    const baselineGraphCache = fs.readFileSync(cachePaths.graphFile);
    fs.appendFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      '\nexport const committedBeforeRefresh = true;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/alpha.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'committed refresh target'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const rejectedTargetHead = getHeadCommit(repoDir);

    let markEmbeddingRefreshStarted!: () => void;
    let releaseEmbeddingRefresh!: () => void;
    const embeddingRefreshStarted = new Promise<void>((resolve) => {
      markEmbeddingRefreshStarted = resolve;
    });
    const embeddingRefreshGate = new Promise<void>((resolve) => {
      releaseEmbeddingRefresh = resolve;
    });
    const originalRefreshIndex = EmbeddingIndex.prototype.refreshIndex;
    const embeddingRefreshSpy = vi
      .spyOn(EmbeddingIndex.prototype, 'refreshIndex')
      .mockImplementationOnce(async function (...args) {
        markEmbeddingRefreshStarted();
        await embeddingRefreshGate;
        return originalRefreshIndex.apply(this, args);
      });
    const scanSpy = vi.spyOn(CodebaseScanner.prototype, 'scanFiles');

    const rejectedAttempt = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      async: true,
      outputFormat: 'graph',
      embeddingProvider: 'holoembed',
      scanBatchSize: 1,
      maxFiles: 20_000,
      autoRetrySourceDrift: false,
    })) as { accepted?: boolean; jobId?: string };
    expect(rejectedAttempt).toMatchObject({ accepted: true, jobId: expect.any(String) });
    await embeddingRefreshStarted;

    const scannedProgress = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: rejectedAttempt.jobId,
    })) as {
      refreshProgressReceipt?: {
        completedBatchCount?: number;
        totalBatches?: number;
      };
    };
    expect(scannedProgress.refreshProgressReceipt).toMatchObject({
      completedBatchCount: 3,
      totalBatches: 3,
    });

    fs.writeFileSync(
      path.join(repoDir, 'src', 'delta.ts'),
      'export const addedAfterCheckpoint = true;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/delta.ts'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'advance checkout after scan'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const publishedTargetHead = getHeadCommit(repoDir);
    releaseEmbeddingRefresh();

    const rejected = await waitForAbsorbTerminalStatus(rejectedAttempt.jobId!, true);
    expect(rejected).toMatchObject({
      status: 'error',
      refreshProgressReceipt: {
        status: 'invalidated',
        completedBatchCount: 3,
        cachePublished: false,
        resumable: true,
      },
      result: {
        error: 'absorb_refresh_source_changed',
        cachePreserved: true,
        graphAuthoritative: false,
      },
    });
    expect(fs.readFileSync(cachePaths.graphFile)).toEqual(baselineGraphCache);

    const scanCallsBeforeResume = scanSpy.mock.calls.length;
    const resumedAttempt = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      async: true,
      outputFormat: 'graph',
      embeddingProvider: 'holoembed',
      scanBatchSize: 1,
      maxFiles: 20_000,
    })) as { accepted?: boolean; jobId?: string; resumeToken?: string };
    const rejectedResumeToken = (
      rejected.refreshProgressReceipt as {
        resumeToken?: string;
      }
    ).resumeToken;
    expect(resumedAttempt).toMatchObject({ accepted: true });
    expect(resumedAttempt.resumeToken).not.toBe(rejectedResumeToken);

    const completed = await waitForAbsorbTerminalStatus(resumedAttempt.jobId!, true);
    expect(completed).toMatchObject({
      status: 'complete',
      refreshProgressReceipt: {
        status: 'complete',
        resumeMode: 'content-addressed-overlay',
        completedBatchCount: 4,
        reusedBatchCount: 3,
        invalidatedBatchCount: 0,
        cachePublished: true,
        publishedGraphAuthoritative: true,
        targetLag: {
          sourceResumeToken: rejectedResumeToken,
          sourceTargetGitCommitHash: rejectedTargetHead,
          targetGitCommitHash: publishedTargetHead,
          sourceSelectedCandidateFiles: 3,
          targetSelectedCandidateFiles: 4,
          selectedCandidateFileDelta: 1,
        },
      },
      result: {
        graphAuthoritative: true,
        graphRagReady: true,
        semanticIndexReady: true,
        embeddingRefresh: {
          kind: 'EmbeddingRefreshReceipt',
          reusedSymbols: expect.any(Number),
          embeddedSymbols: expect.any(Number),
        },
      },
    });
    const completedResult = completed.result as {
      embeddingRefresh?: { reusedSymbols?: number; embeddedSymbols?: number };
    };
    expect(completedResult.embeddingRefresh?.reusedSymbols).toBeGreaterThan(0);
    expect(completedResult.embeddingRefresh?.embeddedSymbols).toBeGreaterThan(0);
    expect(embeddingRefreshSpy).toHaveBeenCalledTimes(2);

    const resumedScanFiles = scanSpy.mock.calls
      .slice(scanCallsBeforeResume)
      .flatMap((call) => call[1] as string[])
      .map((filePath) => path.relative(repoDir, filePath).replace(/\\/g, '/'));
    expect(resumedScanFiles).toEqual(['src/delta.ts']);

    const publishedEnvelope = JSON.parse(fs.readFileSync(cachePaths.graphFile, 'utf-8')) as {
      graphJson: string;
      fileHashes?: Record<string, string>;
    };
    const publishedGraph = CodebaseGraph.deserialize(publishedEnvelope.graphJson);
    expect(publishedGraph.findSymbolsByName('committedBeforeRefresh')).toHaveLength(1);
    expect(publishedGraph.findSymbolsByName('addedAfterCheckpoint')).toHaveLength(1);
    expect(publishedEnvelope.fileHashes?.['src/delta.ts']).toBe(
      sha256(fs.readFileSync(path.join(repoDir, 'src', 'delta.ts'), 'utf-8'))
    );

    simulateAbsorbProcessRestartForTests();
    const statusAfterRestart = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      graphAuthoritative?: boolean;
      diskCache?: {
        freshForCurrentRepo?: boolean;
        gitCommitMatchesHead?: boolean;
        fileHashFreshness?: { fresh?: boolean };
      };
    };
    expect(statusAfterRestart).toMatchObject({
      graphAuthoritative: true,
      diskCache: {
        freshForCurrentRepo: true,
        gitCommitMatchesHead: true,
        fileHashFreshness: {
          fresh: true,
        },
      },
    });
  }, 30_000);

  it('keeps a large small-delta refresh incremental, observable, and source-pinned', async () => {
    resetCodebaseToolStateForTests();
    const fixtureCount = 2_000;
    const changedFixtureCount = 5;
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-delta-scale-cache-'));
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-delta-scale-repo-'));
    const sourceDir = path.join(repoDir, 'src');
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
    execFileSync('git', ['config', 'core.autocrlf', 'false'], {
      cwd: repoDir,
      windowsHide: true,
    });
    fs.mkdirSync(sourceDir, { recursive: true });
    for (let index = 0; index < fixtureCount; index++) {
      fs.writeFileSync(
        path.join(sourceDir, `fixture-${String(index).padStart(4, '0')}.ts`),
        `export const fixture${index} = ${index};\n`,
        'utf-8'
      );
    }
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'large fixture baseline'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const fullStartedAt = Date.now();
    const baseline = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
      maxFiles: fixtureCount,
      scanBatchSize: 250,
    })) as {
      error?: string;
      durationMs?: number;
      graphAuthoritative?: boolean;
      stats?: { totalFiles?: number };
    };
    const fullElapsedMs = baseline.durationMs ?? Date.now() - fullStartedAt;
    expect(baseline).toMatchObject({
      graphAuthoritative: true,
      stats: { totalFiles: fixtureCount },
    });

    const cacheFile = path.join(cacheDir, 'graph-cache.json');
    const missingFixturePaths = Array.from(
      { length: changedFixtureCount },
      (_, index) => `src/fixture-${String(fixtureCount - index - 1).padStart(4, '0')}.ts`
    );
    removeFilesFromGraphCache(cacheFile, missingFixturePaths);
    markMutatedGenerationFixtureAsLegacy(repoDir);
    resetCodebaseToolStateForTests(false);

    const originalRepairScanFiles = CodebaseScanner.prototype.scanFiles;
    const repairScanSpy = vi
      .spyOn(CodebaseScanner.prototype, 'scanFiles')
      .mockImplementation(function (...args) {
        return originalRepairScanFiles.apply(this, args);
      });
    const repairFullScanSpy = vi.spyOn(CodebaseScanner.prototype, 'scanInBatches');
    const repairEmbeddingSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');
    const repairStartedAt = Date.now();
    const repaired = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as {
      incremental?: boolean;
      repairedIncompleteCache?: boolean;
      repairMode?: string;
      patchDurationMs?: number;
      graphAuthoritative?: boolean;
      incompleteCacheRepair?: {
        selectedCandidateFiles?: number;
        cachedGraphFiles?: number;
        missingFiles?: number;
        changedFiles?: number;
        removedFiles?: number;
        parsedFiles?: number;
      };
    };
    const repairElapsedMs = repaired.patchDurationMs ?? Date.now() - repairStartedAt;
    expect(repaired).toMatchObject({
      incremental: true,
      repairedIncompleteCache: true,
      repairMode: 'authority-safe-delta',
      graphAuthoritative: true,
      incompleteCacheRepair: {
        selectedCandidateFiles: fixtureCount,
        cachedGraphFiles: fixtureCount - changedFixtureCount,
        missingFiles: changedFixtureCount,
        changedFiles: 0,
        removedFiles: 0,
        parsedFiles: changedFixtureCount,
      },
    });
    const repairScannedFiles = repairScanSpy.mock.calls.flatMap((call) => call[1] as string[]);
    expect(repairScannedFiles).toHaveLength(changedFixtureCount);
    expect(repairFullScanSpy).not.toHaveBeenCalled();
    expect(repairEmbeddingSpy).not.toHaveBeenCalled();
    expect(repairElapsedMs).toBeLessThan(fullElapsedMs);
    repairScanSpy.mockRestore();
    repairFullScanSpy.mockRestore();
    repairEmbeddingSpy.mockRestore();

    for (let index = 0; index < changedFixtureCount; index++) {
      fs.writeFileSync(
        path.join(sourceDir, `fixture-${String(index).padStart(4, '0')}.ts`),
        `export const fixture${index} = ${index + 10_000};\n`,
        'utf-8'
      );
    }
    execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'small delta'], {
      cwd: repoDir,
      windowsHide: true,
    });

    const priorCache = fs.readFileSync(cacheFile, 'utf-8');
    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    let scanDelayMs = 25;
    let rescannedFileCount = 0;
    const changedScanSpy = vi
      .spyOn(CodebaseScanner.prototype, 'scanFiles')
      .mockImplementation(async function (...args) {
        rescannedFileCount = (args[1] as string[]).length;
        await new Promise((resolve) => setTimeout(resolve, scanDelayMs));
        return originalScanFiles.apply(this, args);
      });
    const fullScanSpy = vi.spyOn(CodebaseScanner.prototype, 'scanInBatches');

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { accepted?: boolean; jobId?: string };
    expect(accepted.accepted).toBe(true);
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe(priorCache);

    let observableStatus: Record<string, unknown> = {};
    for (let index = 0; index < 100; index++) {
      observableStatus = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as Record<string, unknown>;
      if (
        String(observableStatus.phase).includes('Rescanning') ||
        String(observableStatus.phase).includes('Parsed')
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(Number(observableStatus.progress)).toBeGreaterThanOrEqual(30);
    expect(String(observableStatus.phase)).toMatch(/Rescanning|Parsed/);

    const completed = await waitForAbsorbTerminalStatus(accepted.jobId!, true);
    const result = completed.result as {
      incremental?: boolean;
      filesChanged?: number;
      patchDurationMs?: number;
      sourcePinValidated?: boolean;
      sourceAuthorityPins?: Array<{
        gitCommitHash?: string | null;
        worktreeFingerprint?: string | null;
      }>;
    };
    expect(completed.status).toBe('complete');
    expect(result).toMatchObject({
      incremental: true,
      filesChanged: changedFixtureCount,
      sourcePinValidated: true,
    });
    expect(result.sourceAuthorityPins?.[0]?.gitCommitHash).toBe(getHeadCommit(repoDir));
    expect(result.sourceAuthorityPins?.[0]?.worktreeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(rescannedFileCount).toBe(changedFixtureCount);
    expect(fullScanSpy).not.toHaveBeenCalled();
    expect(result.patchDurationMs).toBeLessThan(fullElapsedMs);

    fs.writeFileSync(
      path.join(sourceDir, 'fixture-0010.ts'),
      'export const fixture10 = 20010;\n',
      'utf-8'
    );
    execFileSync('git', ['add', 'src/fixture-0010.ts'], {
      cwd: repoDir,
      windowsHide: true,
    });
    execFileSync('git', ['commit', '-m', 'second small delta'], {
      cwd: repoDir,
      windowsHide: true,
    });
    const authoritativeCache = fs.readFileSync(cacheFile, 'utf-8');
    scanDelayMs = 150;
    const invalidated = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      async: true,
    })) as { accepted?: boolean; jobId?: string };
    expect(invalidated.accepted).toBe(true);

    for (let index = 0; index < 100; index++) {
      const status = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: invalidated.jobId,
      })) as Record<string, unknown>;
      if (String(status.phase).includes('Rescanning')) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    fs.appendFileSync(
      path.join(sourceDir, 'fixture-1999.ts'),
      'export const concurrentDrift = true;\n',
      'utf-8'
    );

    const rejected = await waitForAbsorbTerminalStatus(invalidated.jobId!, true);
    expect(rejected).toMatchObject({
      status: 'error',
      result: {
        error: 'absorb_refresh_source_changed',
        cachePreserved: true,
        graphAuthoritative: false,
      },
    });
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe(authoritativeCache);
    changedScanSpy.mockRestore();
  }, 120_000);

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

  it('hydrates visual context from an authoritative stats-only graph without HoloEmbed', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-visual-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-visual-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(absorbed).toMatchObject({
      graphAuthoritative: true,
      semanticIndexReady: false,
    });
    expect(absorbed.error).toBeUndefined();

    resetCodebaseToolStateForTests(false);
    const visual = (await handleGraphRagTool('holo_visual_graph_context', {
      selectedNodeIds: ['alpha'],
      maxNeighbors: 10,
    })) as {
      error?: string;
      symbolCount?: number;
      quality?: {
        resolutionRate?: number;
        resolvedNodeCount?: number;
      };
      graphState?: {
        rootDir?: string;
        semanticIndexReady?: boolean;
      };
    };

    expect(visual.error).toBeUndefined();
    expect(visual.symbolCount).toBe(1);
    expect(visual.quality).toMatchObject({
      resolutionRate: 1,
      resolvedNodeCount: 1,
    });
    expect(visual.graphState).toMatchObject({
      rootDir: repoDir,
      semanticIndexReady: false,
    });
    expect(getGraphRAGStateStatus().ready).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, 'embeddings-cache.bin'))).toBe(false);
  }, 30_000);

  it('keeps structural queries independent from missing HoloEmbed work', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-structural-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-structural-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(absorbed).toMatchObject({
      graphAuthoritative: true,
      semanticIndexReady: false,
    });

    const buildIndexSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');
    resetCodebaseToolStateForTests(false);
    const query = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      result?: { totalFiles?: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(query.error).toBeUndefined();
    expect(query.result?.totalFiles).toBe(2);
    expect(buildIndexSpy).not.toHaveBeenCalled();
    expect(getGraphRAGStateStatus().ready).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, 'embeddings-cache.bin'))).toBe(false);

    const graphStatus = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      cacheWarm?: { inProgress?: boolean; status?: string; jobId?: string | null };
    };
    expect(graphStatus.cacheWarm).toMatchObject({
      inProgress: false,
      status: 'idle',
      jobId: null,
    });
  }, 30_000);

  it('cancels semantic cache warm before allocation when the host reserve is exhausted', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-warm-guard-cache-'));
    const repoDir = makeTinyGitRepo('holoscript-warm-guard-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      force: true,
      outputFormat: 'stats',
    })) as {
      error?: string;
      graphAuthoritative?: boolean;
      semanticIndexReady?: boolean;
    };
    expect(absorbed).toMatchObject({
      graphAuthoritative: true,
      semanticIndexReady: false,
    });

    const reserveFloorMb = Math.ceil(os.freemem() / 1024 / 1024) + 1024;
    process.env.ABSORB_MIN_SYSTEM_FREE_MB = String(reserveFloorMb);
    const buildIndexSpy = vi.spyOn(EmbeddingIndex.prototype, 'buildIndex');
    resetCodebaseToolStateForTests(false);

    await handleGraphRagTool('holo_semantic_search', {
      query: 'alpha',
      useCachedAbsorbIndex: true,
    });
    const cacheWarm = (await waitForCacheWarmTerminalStatus()) as {
      inProgress?: boolean;
      jobId?: string;
      status?: string;
      cacheCommitted?: boolean;
      cancellation?: { reason?: string; phaseAtRequest?: string };
      memoryBudget?: {
        minSystemFreeMb?: number;
        systemReserveExhausted?: boolean;
        systemReserveExhaustedAtPhase?: string;
      };
    };

    expect(cacheWarm.jobId).toMatch(/^absorb-warm-/);
    expect(cacheWarm).toMatchObject({
      inProgress: false,
      status: 'cancelled',
      cacheCommitted: false,
      cancellation: {
        reason: 'system_memory_reserve_exhausted',
      },
      memoryBudget: {
        minSystemFreeMb: reserveFloorMb,
        systemReserveExhausted: true,
        systemReserveExhaustedAtPhase: 'preflight resource guard',
      },
    });
    expect(buildIndexSpy).not.toHaveBeenCalled();
    expect(getGraphRAGStateStatus().ready).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, 'embeddings-cache.bin'))).toBe(false);

    const structuralQuery = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as {
      error?: string;
      result?: { totalFiles?: number };
    };
    expect(structuralQuery.error).toBeUndefined();
    expect(structuralQuery.result?.totalFiles).toBe(2);
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
    markMutatedGenerationFixtureAsLegacy(repoDir);
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

    // A fleet transfer through tar commonly rounds mtimes to whole seconds.
    // The immutable generation manifest still binds the selected embedding
    // digest and byte length to the graph, so transport precision loss must
    // not make an otherwise intact semantic index unavailable.
    const transportRoundedMtime = Math.floor(originalEmbeddingStat.mtimeMs / 1000) * 1000;
    fs.utimesSync(
      embeddingsCachePath,
      originalEmbeddingStat.atime,
      new Date(transportRoundedMtime)
    );
    resetCodebaseToolStateForTests(false);
    const originalCwdAfterTransport = process.cwd();
    try {
      process.chdir(repoDir);
      const status = (await handleCodebaseTool('holo_graph_status', {})) as {
        semanticIndexReady?: boolean;
        semanticIndex?: {
          diskEmbeddingGenerationMatchesGraph?: boolean;
          diskEmbeddingGenerationStat?: { verification?: string };
          diskHydratable?: boolean;
        };
      };
      expect(status.semanticIndexReady).toBe(true);
      expect(status.semanticIndex).toMatchObject({
        diskEmbeddingGenerationMatchesGraph: true,
        diskEmbeddingGenerationStat: {
          verification: 'immutable-generation-manifest',
        },
        diskHydratable: true,
      });
    } finally {
      process.chdir(originalCwdAfterTransport);
    }

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
  }, 90_000);

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

  it('keeps graph status available when a hot-loaded graph host returns no file path array', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-hot-host-'));
    const requestedRoot = makeTinyGitRepo('holoscript-status-hot-host-repo-');
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = requestedRoot;

    await handleCodebaseTool('holo_absorb_repo', {
      rootDir: requestedRoot,
      force: true,
      outputFormat: 'stats',
    });
    vi.spyOn(CodebaseGraph.prototype, 'getFilePaths').mockReturnValue(undefined as never);

    const status = (await handleCodebaseTool('holo_graph_status', {
      forceRefresh: true,
    })) as {
      inMemory?: boolean;
      coverage?: { graphFileCount?: number };
      graphUnavailableReceipt?: GraphUnavailableReceipt;
    };

    expect(status.inMemory).toBe(true);
    expect(status.coverage?.graphFileCount).toBe(2);
    expect(status.graphUnavailableReceipt?.reason).not.toBe('cache_missing');
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
  });

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
  });

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
  });

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
  });

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
  });

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

  it('absorbs a browser_session observe extract through the existing sourceFiles path', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-page-extract-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    const result = (await handleCodebaseTool('holo_absorb_repo', {
      observe: {
        operation: 'observe',
        session: { url: 'https://docs.holoscript.example/observe' },
        markdown: '# Observe Fixture\n\nfixture body text for absorb fold\n\n# Heading One',
        dom: {
          url: 'https://docs.holoscript.example/observe',
          title: 'Observe Fixture',
          bodyText: 'fixture body text for absorb fold',
          elementCount: 4,
        },
      },
      outputFormat: 'stats',
    })) as {
      error?: string;
      fromSourceFiles?: boolean;
      stats?: { totalFiles?: number; totalSymbols?: number };
      pageExtract?: {
        kind?: string;
        url?: string;
        title?: string;
        source?: string;
        formatId?: string;
        sourceFiles?: string[];
        sha256?: string;
      };
      scanPlan?: { mode?: string; totalCandidateFiles?: number };
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.stats?.totalFiles).toBeGreaterThanOrEqual(1);
    expect(result.scanPlan?.mode).toBe('inline-source-files');
    expect(result.pageExtract).toMatchObject({
      kind: 'HoloAbsorbPageExtract',
      url: 'https://docs.holoscript.example/observe',
      title: 'Observe Fixture',
      source: 'observe',
      formatId: 'markdown',
      sourceFiles: ['observed-page.holo', 'observed-page.md'],
    });
    expect(result.pageExtract?.sha256).toHaveLength(64);
  }, 15_000);
});
