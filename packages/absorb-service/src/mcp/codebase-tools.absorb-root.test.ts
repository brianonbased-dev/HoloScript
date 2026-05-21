import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;

type GraphUnavailableReceipt = {
  kind?: string;
  reason?: string;
  requestedPath?: string | null;
  runtimePath?: string | null;
  cacheAgeMs?: number | null;
  staleByMs?: number | null;
  authoritative?: boolean;
  recommendation?: string;
};

function writeGraphCache(cacheDir: string, rootDir: string, timestamp: number): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'graph-cache.json'),
    JSON.stringify({
      version: 2,
      rootDir,
      timestamp,
      stats: { totalFiles: 12, totalSymbols: 34 },
      graphJson: '{}',
    }),
    'utf-8'
  );
}

describe('holo_absorb_repo root validation', () => {
  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    resetCodebaseToolStateForTests(false);
  });

  it('does not replace graph state when a forced scan root is inaccessible', async () => {
    resetCodebaseToolStateForTests();
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
    expect(result.diagnostics?.requestedRootDir).toBe(missingRoot);
    expect(result.diagnostics?.resolvedDirExists).toBe(false);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: result.jobId,
    })) as { status?: string; phase?: string };
    expect(status.status).toBe('error');
    expect(status.phase).toBe('Root directory unavailable');

    const after = (await handleCodebaseTool('holo_graph_status', {})) as {
      rootDir: string | null;
      sessionProvenance?: string | null;
      diskCache?: { rootDir?: string };
    };
    expect(after.rootDir).toBe(before.rootDir);
    expect(after.sessionProvenance).toBe(before.sessionProvenance);
    expect(after.diskCache?.rootDir).toBe(before.diskCache?.rootDir);
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
    writeGraphCache(cacheDir, requestedRoot, Date.now() - 5 * 60 * 1000);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      graphAuthoritative?: boolean;
      freshForCurrentRepo?: boolean;
      currentCwd?: string;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      diskCache?: { fresh?: boolean; authoritative?: boolean; freshForCurrentRepo?: boolean; rootDir?: string };
    };

    expect(status.graphAuthoritative).toBe(true);
    expect(status.freshForCurrentRepo).toBe(true);
    expect(status.currentCwd).toBe(path.resolve(process.cwd()));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.authoritative).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(true);
    expect(status.graphUnavailableReceipt).toBeUndefined();
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
      diskCache?: { fresh?: boolean; authoritative?: boolean; freshForCurrentRepo?: boolean; rootDir?: string };
    };

    // Cache is fresh by age but NOT authoritative for the current repo
    expect(status.graphAuthoritative).toBe(false);
    expect(status.freshForCurrentRepo).toBe(false);
    expect(status.currentCwd).toBe(path.resolve(process.cwd()));
    expect(status.diskCache?.fresh).toBe(true);
    expect(status.diskCache?.freshForCurrentRepo).toBe(false);
    // Receipt should explain the mismatch
    expect(status.graphUnavailableReceipt).toMatchObject({
      kind: 'GraphUnavailableReceipt',
      reason: 'cache_root_mismatch',
      authoritative: false,
    });
  });
});

describe('holo_absorb_repo sourceFiles upload', () => {
  afterEach(() => {
    resetCodebaseToolStateForTests(false);
  });

  it('absorbs inline sourceFiles without filesystem access', async () => {
    resetCodebaseToolStateForTests();

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
      jobId?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.stats?.totalFiles).toBeGreaterThanOrEqual(2);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(2);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: result.jobId,
    })) as { status?: string };
    expect(status.status).toBe('complete');
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
