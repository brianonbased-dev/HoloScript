import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCodebaseCachePaths } from './codebase-cache-storage';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;

describe('workspace-scoped codebase cache storage', () => {
  let cacheDir: string;
  const temporaryPaths: string[] = [];

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-workspace-cache-'));
    temporaryPaths.push(cacheDir);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
  });

  afterEach(() => {
    if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    if (originalCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = originalCacheLayout;
    for (const temporaryPath of temporaryPaths.splice(0)) {
      fs.rmSync(temporaryPath, { recursive: true, force: true });
    }
  });

  it('derives deterministic, collision-resistant paths for each workspace root', () => {
    const firstRoot = path.join(cacheDir, 'owner-a', 'shared-name');
    const secondRoot = path.join(cacheDir, 'owner-b', 'shared-name');

    const first = resolveCodebaseCachePaths(firstRoot);
    const firstAgain = resolveCodebaseCachePaths(`${firstRoot}${path.sep}`);
    const second = resolveCodebaseCachePaths(secondRoot);

    expect(first.layout).toBe('workspace-v1');
    expect(first.graphFile).toBe(firstAgain.graphFile);
    expect(first.embeddingsFile).toBe(firstAgain.embeddingsFile);
    expect(first.graphFile).not.toBe(second.graphFile);
    expect(first.embeddingsFile).not.toBe(second.embeddingsFile);
    expect(first.graphFile).toContain(path.join(cacheDir, 'workspaces'));
  });

  it('preserves the first workspace cache when an unrelated inline absorb completes', async () => {
    const { handleCodebaseTool, resetCodebaseToolStateForTests } = await import('./codebase-tools');
    resetCodebaseToolStateForTests();
    const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cache-root-a-'));
    const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-cache-root-b-'));
    temporaryPaths.push(firstRoot, secondRoot);

    const firstResult = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: firstRoot,
      sourceFiles: [{ path: 'src/first.ts', content: 'export const firstWorkspace = true;' }],
      outputFormat: 'stats',
    })) as { error?: string };
    expect(firstResult.error).toBeUndefined();

    const firstPaths = resolveCodebaseCachePaths(firstRoot);
    expect(fs.existsSync(firstPaths.graphFile)).toBe(true);
    const firstCacheBefore = fs.readFileSync(firstPaths.graphFile, 'utf8');

    resetCodebaseToolStateForTests();
    const secondResult = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: secondRoot,
      sourceFiles: [{ path: 'src/second.ts', content: 'export const secondWorkspace = true;' }],
      outputFormat: 'stats',
    })) as { error?: string };
    expect(secondResult.error).toBeUndefined();

    const secondPaths = resolveCodebaseCachePaths(secondRoot);
    expect(fs.existsSync(secondPaths.graphFile)).toBe(true);
    expect(fs.readFileSync(firstPaths.graphFile, 'utf8')).toBe(firstCacheBefore);

    const firstEnvelope = JSON.parse(firstCacheBefore) as { rootDir?: string };
    const secondEnvelope = JSON.parse(fs.readFileSync(secondPaths.graphFile, 'utf8')) as {
      rootDir?: string;
    };
    expect(firstEnvelope.rootDir).toBe(path.resolve(firstRoot));
    expect(secondEnvelope.rootDir).toBe(path.resolve(secondRoot));
    resetCodebaseToolStateForTests();
  });

  it('keeps the legacy flat layout as an explicit compatibility mode', () => {
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
    const paths = resolveCodebaseCachePaths(path.join(cacheDir, 'repo'));

    expect(paths.layout).toBe('flat');
    expect(paths.graphFile).toBe(path.join(cacheDir, 'graph-cache.json'));
    expect(paths.embeddingsFile).toBe(path.join(cacheDir, 'embeddings-cache.bin'));
  });
});
