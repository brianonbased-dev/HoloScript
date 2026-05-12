import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalMeshSyncTimeoutMs = process.env.ABSORB_MESH_SYNC_TIMEOUT_MS;
const tempDirs: string[] = [];

describe('codebase MCP abort behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
    if (originalMeshSyncTimeoutMs === undefined) {
      delete process.env.ABSORB_MESH_SYNC_TIMEOUT_MS;
    } else {
      process.env.ABSORB_MESH_SYNC_TIMEOUT_MS = originalMeshSyncTimeoutMs;
    }
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('aborts stalled mesh sync fetches instead of leaving the process open', async () => {
    process.env.ABSORB_MESH_SYNC_TIMEOUT_MS = '25';
    vi.resetModules();

    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { syncWithMesh } = await import('./codebase-tools');

    const graph = {
      getAllSymbols: () => [
        {
          visibility: 'public',
          name: 'AbortableSymbol',
          type: 'function',
          filePath: 'src/abortable.ts',
          language: 'typescript',
        },
      ],
    };

    const done = syncWithMesh(graph, 'C:/repo');
    await done;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observedSignal?.aborted).toBe(true);
  }, 15_000);

  it('does not replace graph state when a forced scan root is inaccessible', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-test-cache-'));
    tempDirs.push(cacheDir);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    vi.resetModules();

    const { handleCodebaseTool } = await import('./codebase-tools');
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
      diagnostics?: { requestedRootDir?: string; resolvedDirExists?: boolean };
    };

    expect(result.error).toBe('rootDir_unavailable');
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
});
