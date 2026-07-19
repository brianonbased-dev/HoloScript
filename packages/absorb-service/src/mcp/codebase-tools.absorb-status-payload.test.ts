import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;

type AbsorbStatus = {
  status?: string;
  result?: Record<string, unknown>;
  resultAvailable?: boolean;
  resultBytes?: number;
  resultKeys?: string[];
  resultOmittedFields?: Array<{ field?: string; bytes?: number; recoverVia?: string }>;
  resultTruncated?: boolean;
  resultHint?: string;
  scanPlan?: {
    selectionMode?: string;
    totalCandidateFiles?: number;
    batchCount?: number;
    batchDetailsOmitted?: number;
    batches?: Array<{ index?: number; label?: string; files?: number }>;
  };
};

// Enough distinct symbols that graph.serialize() is far larger than any status envelope.
const SOURCE_FILES = Array.from({ length: 12 }, (_, fileIndex) => ({
  path: `src/module-${fileIndex}.ts`,
  content: Array.from(
    { length: 40 },
    (_, symbolIndex) =>
      `export function moduleFn${fileIndex}_${symbolIndex}(input: string): string { return input + '${fileIndex}_${symbolIndex}'; }`
  ).join('\n'),
}));

describe('holo_get_absorb_status transcript budget', () => {
  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
  });

  it('never inlines the serialized graph, even when includeResult is requested', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-status-payload-')
    );

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: SOURCE_FILES,
      outputFormat: 'graph',
    })) as { error?: string; jobId?: string; graph?: string };

    expect(absorbed.error).toBeUndefined();
    // Guards the premise: the absorb result really does carry a large graph blob.
    expect(typeof absorbed.graph).toBe('string');
    expect(absorbed.graph!.length).toBeGreaterThan(10_000);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: absorbed.jobId,
      includeResult: true,
    })) as AbsorbStatus;

    expect(status.status).toBe('complete');
    expect(status.result?.graph).toBeUndefined();

    const omittedGraph = status.resultOmittedFields?.find((entry) => entry.field === 'graph');
    expect(omittedGraph).toBeDefined();
    expect(omittedGraph!.bytes).toBeGreaterThan(10_000);
    expect(omittedGraph!.recoverVia).toContain('graph-cache.json');

    // resultKeys still advertises the blob so callers know it existed.
    expect(status.resultKeys).toContain('graph');
    expect(status.resultBytes).toBeGreaterThan(omittedGraph!.bytes!);

    expect(status.scanPlan).toMatchObject({
      selectionMode: 'inline',
      totalCandidateFiles: SOURCE_FILES.length,
      batchCount: 1,
      batchDetailsOmitted: 1,
    });
    expect(status.scanPlan?.batches).toBeUndefined();

    const detailedStatus = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: absorbed.jobId,
      includePlan: true,
    })) as AbsorbStatus;
    expect(detailedStatus.scanPlan?.batches).toEqual([
      { index: 1, label: 'inline-source-files', files: SOURCE_FILES.length },
    ]);
    expect(detailedStatus.scanPlan?.batchDetailsOmitted).toBeUndefined();

    // The whole envelope must stay far below the graph it describes.
    const envelopeBytes = Buffer.byteLength(JSON.stringify(status), 'utf-8');
    expect(envelopeBytes).toBeLessThan(64 * 1024);
    expect(envelopeBytes).toBeLessThan(omittedGraph!.bytes!);
  }, 30_000);

  it('omits the result body by default and does not advertise an unusable retrieval hint', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-status-default-')
    );

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: SOURCE_FILES,
      outputFormat: 'graph',
    })) as { jobId?: string };

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: absorbed.jobId,
    })) as AbsorbStatus;

    expect(status.result).toBeUndefined();
    expect(status.resultAvailable).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(status), 'utf-8')).toBeLessThan(64 * 1024);
  });

  it('still inlines small result bodies when includeResult is requested', async () => {
    resetCodebaseToolStateForTests();
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-status-small-')
    );
    const missingRoot = path.join(os.tmpdir(), `holoscript-absent-${process.pid}-${Date.now()}`);

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: missingRoot,
      force: true,
      outputFormat: 'stats',
      async: true,
    })) as { jobId?: string };

    let status = {} as AbsorbStatus;
    for (let attempt = 0; attempt < 100; attempt++) {
      status = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
        includeResult: true,
      })) as AbsorbStatus;
      if (status.status === 'complete' || status.status === 'error') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(status.status).toBe('error');
    expect(status.result).toMatchObject({ error: 'rootDir_unavailable' });
    expect(status.resultTruncated).toBeUndefined();
    expect(status.resultOmittedFields).toBeUndefined();
  }, 15_000);
});
