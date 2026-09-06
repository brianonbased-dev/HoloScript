import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { graphCacheMetaPath } from './graph-cache-envelope';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;

function writeProductionGraphCache(cacheDir: string, rootDir: string, graphJson: string): string {
  const metadata = {
    version: 2,
    rootDir,
    timestamp: Date.now(),
    stats: { totalFiles: 12, totalSymbols: 34 },
    gitCommitHash: 'deadbeef',
    fileHashes: { 'src/alpha.ts': 'a', 'src/beta.ts': 'b' },
    coverageAtScan: {
      available: true,
      complete: false,
      cappedByMaxFiles: true,
      graphFileCount: 12,
    },
  };
  const cacheFile = path.join(cacheDir, 'graph-cache.json');
  const metadataJson = JSON.stringify(metadata);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    cacheFile,
    `${metadataJson.slice(0, -1)},"graphJson":${JSON.stringify(graphJson)}}`,
    'utf-8'
  );
  return cacheFile;
}

describe('holo_graph_status metadata-only cache reads', () => {
  beforeEach(() => {
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
  });

  afterEach(() => {
    if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
    resetCodebaseToolStateForTests(false);
  });

  it('reports disk coverage from a bulky graphJson envelope without keeping the payload in the sidecar', async () => {
    resetCodebaseToolStateForTests();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-graph-meta-status-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    const bulky = `{"files":"${'Q'.repeat(512 * 1024)}"}`;
    const cacheFile = writeProductionGraphCache(cacheDir, process.cwd(), bulky);

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      diskCache?: { exists?: boolean; stats?: { totalFiles?: number } };
      coverage?: { graphFileCount?: number };
    };

    expect(status.diskCache?.exists).toBe(true);
    expect(status.diskCache?.stats?.totalFiles).toBe(12);
    expect(status.coverage?.graphFileCount).toBe(2);

    const metaPath = graphCacheMetaPath(cacheFile);
    expect(fs.existsSync(metaPath)).toBe(true);
    const sidecar = fs.readFileSync(metaPath, 'utf-8');
    expect(sidecar.length).toBeLessThan(8 * 1024);
    expect(sidecar).not.toContain('Q'.repeat(32));
    expect(JSON.parse(sidecar)).toMatchObject({
      version: 2,
      stats: { totalFiles: 12 },
    });
  });
});
