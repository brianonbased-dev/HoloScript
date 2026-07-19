import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodebaseScanner, EmbeddingIndex } from '../engine';
import {
  codebaseTools,
  handleCodebaseTool,
  resetCodebaseToolStateForTests,
} from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const tempDirs: string[] = [];

type AbsorbStatus = {
  status?: string;
  phase?: string;
  cancellation?: { reason?: string; phaseAtRequest?: string };
  memoryBudget?: {
    maxRssMb?: number;
    peakRssMb?: number;
    exceeded?: boolean;
    exceededResource?: string;
  };
  result?: {
    kind?: string;
    cancelled?: boolean;
    reason?: string;
    cachePreserved?: boolean;
    cacheCommitted?: boolean;
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

describe('Absorb cooperative cancellation and memory budgets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
    if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
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
    })) as { accepted?: boolean; jobId?: string; memoryBudget?: { maxRssMb?: number } };

    expect(accepted).toMatchObject({
      accepted: true,
      jobId: expect.any(String),
      memoryBudget: { maxRssMb: 1 },
    });
    const status = await waitForTerminal(accepted.jobId!);
    expect(status).toMatchObject({
      status: 'cancelled',
      cancellation: { reason: 'memory_budget_exceeded' },
      memoryBudget: {
        maxRssMb: 1,
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

  it('publishes the typed cancellation tool and validates memory limits', async () => {
    expect(codebaseTools.some((tool) => tool.name === 'holo_cancel_absorb')).toBe(true);
    const invalid = await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: [{ path: 'src/a.ts', content: 'export const a = 1;\n' }],
      maxHeapUsedMb: 0,
    });
    expect(invalid).toMatchObject({ error: 'memory_budget_validation_failed' });
  });
});
