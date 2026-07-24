import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodebaseScanner, EmbeddingIndex } from '../engine';
import {
  codebaseTools,
  handleCodebaseTool,
  resetCodebaseToolStateForTests,
} from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;
const originalWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
const tempDirs: string[] = [];

type AbsorbStatus = {
  status?: string;
  progress?: number;
  phase?: string;
  cancellation?: { reason?: string; phaseAtRequest?: string };
  memoryBudget?: {
    maxRssMb?: number;
    peakRssMb?: number;
    exceeded?: boolean;
    exceededResource?: string;
    cacheCommitHeadroomMb?: number;
    headroomExhausted?: boolean;
    headroomResource?: string;
    headroomExhaustedAtPhase?: string;
    effectiveMaxRssBeforeCacheCommitMb?: number;
  };
  refreshProgressReceipt?: {
    status?: string;
    cachePublished?: boolean;
    priorAuthoritativeCachePreserved?: boolean;
  };
  result?: {
    kind?: string;
    cancelled?: boolean;
    reason?: string;
    cachePreserved?: boolean;
    cacheCommitted?: boolean;
    refreshProgressReceipt?: {
      status?: string;
      cachePublished?: boolean;
      priorAuthoritativeCachePreserved?: boolean;
    };
  };
};

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function waitForTerminal(jobId: string): Promise<AbsorbStatus> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId,
      includeResult: true,
    })) as AbsorbStatus;
    if (
      status.status === 'complete' ||
      status.status === 'error' ||
      status.status === 'cancelled'
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Absorb job ${jobId} did not reach a terminal status`);
}

async function seedPriorCache(rootDir: string): Promise<{ cacheFile: string; bytes: Buffer }> {
  const result = (await handleCodebaseTool('holo_absorb_repo', {
    rootDir,
    sourceFiles: [
      {
        path: 'src/prior.ts',
        content: 'export const priorAuthoritativeValue = 1;\n',
      },
    ],
    outputFormat: 'stats',
  })) as { error?: string };
  expect(result.error).toBeUndefined();
  const cacheFile = path.join(process.env.HOLOSCRIPT_CACHE_DIR!, 'graph-cache.json');
  return { cacheFile, bytes: fs.readFileSync(cacheFile) };
}

async function seedPriorFilesystemCache(
  rootDir: string
): Promise<{ cacheFile: string; bytes: Buffer }> {
  const sourceDir = path.join(rootDir, 'src');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, 'prior.ts'),
    'export const priorAuthoritativeValue = 1;\n',
    'utf-8'
  );
  execFileSync('git', ['init'], { cwd: rootDir, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'codex@example.test'], {
    cwd: rootDir,
    windowsHide: true,
  });
  execFileSync('git', ['config', 'user.name', 'Codex Test'], {
    cwd: rootDir,
    windowsHide: true,
  });
  execFileSync('git', ['add', 'src/prior.ts'], { cwd: rootDir, windowsHide: true });
  execFileSync('git', ['commit', '-m', 'prior authoritative cache fixture'], {
    cwd: rootDir,
    windowsHide: true,
  });
  process.env.HOLOSCRIPT_WORKSPACE_ROOT = rootDir;
  const result = (await handleCodebaseTool('holo_absorb_repo', {
    rootDir,
    force: true,
    outputFormat: 'stats',
    scanBatchSize: 1,
  })) as { error?: string };
  expect(result.error).toBeUndefined();
  const cacheFile = path.join(process.env.HOLOSCRIPT_CACHE_DIR!, 'graph-cache.json');
  return { cacheFile, bytes: fs.readFileSync(cacheFile) };
}

describe('Absorb cooperative cancellation and memory budgets', () => {
  beforeEach(() => {
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
    if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
    if (originalWorkspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    else process.env.HOLOSCRIPT_WORKSPACE_ROOT = originalWorkspaceRoot;
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cancels an embedding build, disposes workers, and preserves the prior cache', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = makeTempDir('holoscript-cancel-cache-');
    const rootDir = makeTempDir('holoscript-cancel-root-');
    const priorCache = await seedPriorCache(rootDir);

    let markEmbeddingStarted!: () => void;
    const embeddingStarted = new Promise<void>((resolve) => {
      markEmbeddingStarted = resolve;
    });
    const scannerDispose = vi.spyOn(CodebaseScanner.prototype, 'dispose');
    const embeddingDispose = vi.spyOn(EmbeddingIndex.prototype, 'dispose');
    vi.spyOn(EmbeddingIndex.prototype, 'buildIndex').mockImplementation(async () => {
      markEmbeddingStarted();
      await new Promise<void>(() => undefined);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      sourceFiles: [
        {
          path: 'src/current.ts',
          content: 'export function currentValue(): number { return 2; }\n',
        },
      ],
      outputFormat: 'graph',
      async: true,
    })) as { accepted?: boolean; jobId?: string };

    expect(accepted).toMatchObject({ accepted: true, jobId: expect.any(String) });
    await embeddingStarted;

    const cancellation = await handleCodebaseTool('holo_cancel_absorb', {
      jobId: accepted.jobId,
      reason: 'regression proof',
    });
    expect(cancellation).toMatchObject({ accepted: true, status: 'cancelling' });

    const status = await waitForTerminal(accepted.jobId!);
    expect(status).toMatchObject({
      status: 'cancelled',
      cancellation: { reason: 'cancel_requested' },
      result: {
        kind: 'AbsorbCancellationReceipt',
        cancelled: true,
        reason: 'cancel_requested',
        cachePreserved: true,
        cacheCommitted: false,
      },
    });
    expect(scannerDispose).toHaveBeenCalled();
    expect(embeddingDispose).toHaveBeenCalled();
    expect(fs.readFileSync(priorCache.cacheFile)).toEqual(priorCache.bytes);
  });

  it('turns an RSS budget breach into the same terminal cancellation receipt', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = makeTempDir('holoscript-budget-cache-');
    const rootDir = makeTempDir('holoscript-budget-root-');
    const priorCache = await seedPriorCache(rootDir);

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      sourceFiles: [
        {
          path: 'src/current.ts',
          content: 'export const currentValue = 2;\n',
        },
      ],
      outputFormat: 'graph',
      async: true,
      maxRssMb: 1,
    })) as {
      accepted?: boolean;
      jobId?: string;
      memoryBudget?: { maxRssMb?: number; cacheCommitHeadroomMb?: number };
    };

    expect(accepted).toMatchObject({
      accepted: true,
      jobId: expect.any(String),
      memoryBudget: { maxRssMb: 1, cacheCommitHeadroomMb: 0.125 },
    });
    const status = await waitForTerminal(accepted.jobId!);
    expect(status).toMatchObject({
      status: 'cancelled',
      cancellation: { reason: 'memory_budget_exceeded' },
      memoryBudget: {
        maxRssMb: 1,
        cacheCommitHeadroomMb: 0.125,
        exceeded: true,
        exceededResource: 'rss',
      },
      result: {
        kind: 'AbsorbCancellationReceipt',
        cancelled: true,
        reason: 'memory_budget_exceeded',
        cachePreserved: true,
        cacheCommitted: false,
      },
    });
    expect(status.memoryBudget?.peakRssMb).toBeGreaterThan(1);
    expect(fs.readFileSync(priorCache.cacheFile)).toEqual(priorCache.bytes);
  });

  it('reserves serializer headroom, settles the checkpoint, and reloads the prior cache', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = makeTempDir('holoscript-headroom-cache-');
    const rootDir = makeTempDir('holoscript-headroom-root-');
    const priorCache = await seedPriorFilesystemCache(rootDir);
    const currentRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const maxRssMb = currentRssMb + 512;

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      force: true,
      outputFormat: 'stats',
      background: true,
      scanBatchSize: 1,
      maxRssMb,
      cacheCommitHeadroomMb: maxRssMb,
    })) as {
      accepted?: boolean;
      jobId?: string;
      memoryBudget?: {
        cacheCommitHeadroomMb?: number;
        effectiveMaxRssBeforeCacheCommitMb?: number;
      };
    };

    expect(accepted).toMatchObject({
      accepted: true,
      jobId: expect.any(String),
      memoryBudget: {
        cacheCommitHeadroomMb: maxRssMb,
        effectiveMaxRssBeforeCacheCommitMb: 0,
      },
    });
    const status = await waitForTerminal(accepted.jobId!);
    expect(status).toMatchObject({
      status: 'cancelled',
      cancellation: { reason: 'cache_commit_headroom_exhausted' },
      memoryBudget: {
        exceeded: false,
        cacheCommitHeadroomMb: maxRssMb,
        headroomExhausted: true,
        headroomResource: 'rss',
      },
      refreshProgressReceipt: {
        status: 'interrupted',
        cachePublished: false,
        priorAuthoritativeCachePreserved: true,
      },
      result: {
        kind: 'AbsorbCancellationReceipt',
        cancelled: true,
        reason: 'cache_commit_headroom_exhausted',
        cachePreserved: true,
        cacheCommitted: false,
        refreshProgressReceipt: {
          status: 'interrupted',
          cachePublished: false,
          priorAuthoritativeCachePreserved: true,
        },
      },
    });
    expect(fs.readFileSync(priorCache.cacheFile)).toEqual(priorCache.bytes);

    // Simulate a service restart: clear all session state but retain disk.
    resetCodebaseToolStateForTests(false);
    const query = (await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    })) as { error?: string; result?: unknown };
    expect(query.error).toBeUndefined();
    expect(query.result).toBeDefined();
  });

  it('keeps job progress monotonic across Windows-style filesystem batches', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = makeTempDir('holoscript-progress-cache-');
    const rootDir = makeTempDir('holoscript-progress-root-');
    const sourceDir = path.join(rootDir, 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = rootDir;
    for (let index = 0; index < 6; index++) {
      fs.writeFileSync(
        path.join(sourceDir, `fixture-${index}.ts`),
        `export const fixture${index} = ${index};\n`,
        'utf-8'
      );
    }

    const originalScanFiles = CodebaseScanner.prototype.scanFiles;
    vi.spyOn(CodebaseScanner.prototype, 'scanFiles').mockImplementation(async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return originalScanFiles.apply(this, args);
    });

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      force: true,
      outputFormat: 'stats',
      background: true,
      scanBatchSize: 1,
    })) as { accepted?: boolean; jobId?: string };
    expect(accepted).toMatchObject({ accepted: true, jobId: expect.any(String) });

    const samples: number[] = [];
    let terminal: AbsorbStatus = {};
    for (let attempt = 0; attempt < 500; attempt++) {
      terminal = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as AbsorbStatus;
      samples.push(terminal.progress ?? 0);
      if (
        terminal.status === 'complete' ||
        terminal.status === 'error' ||
        terminal.status === 'cancelled'
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    expect(terminal.status).toBe('complete');
    expect(samples.length).toBeGreaterThan(2);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
    }
  });

  it('publishes the typed cancellation tool and validates memory limits', async () => {
    expect(codebaseTools.some((tool) => tool.name === 'holo_cancel_absorb')).toBe(true);
    const invalid = await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [{ path: 'src/a.ts', content: 'export const a = 1;\n' }],
      maxHeapUsedMb: 0,
    });
    expect(invalid).toMatchObject({ error: 'memory_budget_validation_failed' });
  });
});
