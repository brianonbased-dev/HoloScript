import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, setGraphRAGState } from './graph-rag-tools';

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
    })) as { error?: string; embeddingSkipped?: boolean; gitCommitHash?: string };

    expect(first.error).toBeUndefined();
    expect(first.embeddingSkipped).toBe(true);
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
      gitCommitHash?: string;
    };

    expect(patched.error).toBeUndefined();
    expect(patched.incremental).toBe(true);
    expect(patched.filesChanged).toBe(1);
    expect(patched.embeddingSkipped).toBe(true);
    expect(patched.embeddingSkipReason).toBe('outputFormat:stats');
    expect(patched.gitCommitHash).toBe(secondCommit);

    const cache = JSON.parse(
      fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')
    ) as { gitCommitHash?: string };
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
      graphAuthoritative?: boolean;
      graphUnavailableReceipt?: GraphUnavailableReceipt;
      localGraph?: { ready?: boolean; authoritative?: boolean };
      diskCache?: { exists?: boolean };
    };

    expect(status.diskCache?.exists).toBe(false);
    expect(status.graphRAGReady).toBe(false);
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
      jobId?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.fromSourceFiles).toBe(true);
    expect(result.embeddingSkipped).toBe(true);
    expect(result.embeddingSkipReason).toBe('outputFormat:stats');
    expect(result.stats?.totalFiles).toBeGreaterThanOrEqual(2);
    expect(result.stats?.totalSymbols).toBeGreaterThanOrEqual(2);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: result.jobId,
    })) as { status?: string };
    expect(status.status).toBe('complete');
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
