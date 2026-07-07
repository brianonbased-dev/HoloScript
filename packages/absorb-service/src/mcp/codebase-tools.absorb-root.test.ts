import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, setGraphRAGState } from './graph-rag-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalAutoBackground = process.env.ABSORB_AUTO_BACKGROUND;
const originalAutoBackgroundScanFileThreshold =
  process.env.ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD;

afterEach(() => {
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

function writeGraphCache(
  cacheDir: string,
  rootDir: string,
  timestamp: number,
  gitCommitHash?: string,
  fileHashCount?: number
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
    }),
    'utf-8'
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

async function waitForAbsorbTerminalStatus(jobId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const status = (await handleCodebaseTool('holo_get_absorb_status', { jobId })) as Record<
      string,
      unknown
    >;
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
    expect(status.result).toMatchObject({
      error: 'rootDir_unavailable',
      graphUnavailableReceipt: {
        kind: 'GraphUnavailableReceipt',
        reason: 'rootDir_unavailable',
        authoritative: false,
      },
    });
  }, 15_000);

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

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!);
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
    // Use process.cwd() as rootDir so the cache matches the current workspace
    const requestedRoot = process.cwd();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 5 * 60 * 1000, undefined, 10_000);

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
    expect(status.currentCwd).toBe(path.resolve(process.cwd()));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.freshByAge).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.graphUnavailableReceipt).toBeUndefined();
  });

  it('marks a fresh-age disk cache stale when its git hash differs from HEAD', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-stale-cache-'));
    const requestedRoot = process.cwd();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(
      cacheDir,
      requestedRoot,
      Date.now() - 5 * 60 * 1000,
      '1111111111111111111111111111111111111111',
      10_000
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
    expect(status.diskCache?.currentGitCommitHash).toBe(getHeadCommit());
    expect(status.diskCache?.gitCommitMatchesHead).toBe(false);
    expect(status.diskCache?.hint).toContain('111111111111');
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_stale',
      authoritative: false,
    });
  });

  it('keeps a fresh disk cache authoritative when its git hash matches HEAD', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-git-fresh-cache-'));
    const requestedRoot = process.cwd();
    const head = getHeadCommit();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 5 * 60 * 1000, head, 10_000);

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

    const status = await waitForAbsorbTerminalStatus(accepted.jobId!);
    expect(status.status).toBe('complete');
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
  }, 20_000);

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

  it('reports freshForCurrentRepo=false when cache rootDir differs from cwd', async () => {
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
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.rootDir).toBe(path.resolve(requestedRoot));
    expect(result.stats?.totalFiles).toBe(1);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(1);

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
