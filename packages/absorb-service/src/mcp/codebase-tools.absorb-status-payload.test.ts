import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;

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
  refreshProgressReceipt?: {
    completedBatchCount?: number;
    completedBatchesOmitted?: number;
    completedBatches?: Array<{ index?: number }>;
    latestCompletedBatch?: { index?: number };
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
  beforeEach(() => {
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
  });

  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
    vi.restoreAllMocks();
    resetCodebaseToolStateForTests(false);
  });

  it('never inlines the serialized graph, even when includeResult is requested', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-payload-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;

    const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
      sourceFiles: SOURCE_FILES,
      outputFormat: 'graph',
    })) as {
      error?: string;
      jobId?: string;
      graph?: string;
      graphPayload?: {
        inline?: boolean;
        stored?: boolean;
        reason?: string;
        recoverVia?: string[];
      };
    };

    expect(absorbed.error).toBeUndefined();
    expect(absorbed.graph).toBeUndefined();
    expect(absorbed.graphPayload).toEqual({
      inline: false,
      stored: true,
      reason: 'mcp_payload_memory_bound',
      recoverVia: ['holo_query_codebase', 'holo_ask_codebase', 'holo_semantic_search'],
    });

    const cacheEnvelope = JSON.parse(
      fs.readFileSync(path.join(cacheDir, 'graph-cache.json'), 'utf-8')
    ) as { graphJson?: string };
    expect(typeof cacheEnvelope.graphJson).toBe('string');
    expect(cacheEnvelope.graphJson!.length).toBeGreaterThan(10_000);
    const absorbResponseBytes = Buffer.byteLength(JSON.stringify(absorbed), 'utf-8');
    expect(absorbResponseBytes).toBeLessThan(64 * 1024);
    expect(absorbResponseBytes).toBeLessThan(cacheEnvelope.graphJson!.length);

    const status = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: absorbed.jobId,
      includeResult: true,
    })) as AbsorbStatus;

    expect(status.status).toBe('complete');
    expect(status.result?.graph).toBeUndefined();
    expect(status.result?.graphPayload).toEqual(absorbed.graphPayload);
    expect(status.resultOmittedFields).toBeUndefined();
    expect(status.resultKeys).toContain('graphPayload');
    expect(status.resultKeys).not.toContain('graph');
    expect(status.resultBytes).toBeLessThan(64 * 1024);

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
    expect(envelopeBytes).toBeLessThan(cacheEnvelope.graphJson!.length);
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

  it('keeps checkpoint history compact by default and exposes it only on explicit opt-in', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-receipt-cache-'));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-status-receipt-repo-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    for (let index = 0; index < 96; index++) {
      fs.writeFileSync(
        path.join(rootDir, 'src', `fixture-${index}.ts`),
        `export const receiptFixture${index} = ${index};\n`,
        'utf-8'
      );
    }

    const accepted = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      force: true,
      outputFormat: 'stats',
      scanBatchSize: 1,
      background: true,
    })) as { jobId?: string };

    let compactStatus = {} as AbsorbStatus;
    for (let attempt = 0; attempt < 300; attempt++) {
      compactStatus = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: accepted.jobId,
      })) as AbsorbStatus;
      if (compactStatus.status === 'complete' || compactStatus.status === 'error') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(compactStatus.status).toBe('complete');
    expect(compactStatus.refreshProgressReceipt).toMatchObject({
      completedBatchCount: 96,
      completedBatchesOmitted: 96,
      latestCompletedBatch: { index: 96 },
    });
    expect(compactStatus.refreshProgressReceipt?.completedBatches).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(compactStatus), 'utf-8')).toBeLessThan(64 * 1024);

    const detailedStatus = (await handleCodebaseTool('holo_get_absorb_status', {
      jobId: accepted.jobId,
      includeReceiptDetails: true,
    })) as AbsorbStatus;
    expect(detailedStatus.refreshProgressReceipt?.completedBatches).toHaveLength(96);
    expect(detailedStatus.refreshProgressReceipt?.completedBatchesOmitted).toBeUndefined();
  }, 30_000);
});
