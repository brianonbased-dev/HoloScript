import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleCodebaseTool,
  resetCodebaseToolStateForTests,
  syncWithMesh,
} from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;

describe('codebase MCP abort behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetCodebaseToolStateForTests();
    if (originalCacheDir === undefined) {
      delete process.env.HOLOSCRIPT_CACHE_DIR;
    } else {
      process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
    }
  });

  it('aborts stalled mesh sync fetches instead of leaving the process open', async () => {
    vi.useFakeTimers();

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
    await vi.advanceTimersByTimeAsync(10_000);
    await done;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observedSignal?.aborted).toBe(true);
  });

  it('publishes symbol entries using the orchestrator knowledge schema', async () => {
    let observedBody: unknown;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const graph = {
      getAllSymbols: () => [
        {
          visibility: 'public',
          name: 'TinySymbol',
          type: 'function',
          filePath: 'src/tiny.ts',
          language: 'typescript',
          line: 7,
          signature: 'export function TinySymbol(): void',
        },
      ],
    };

    await syncWithMesh(graph, 'C:/repo/HoloScript');

    expect(fetchMock).toHaveBeenCalledOnce();
    const payload = observedBody as {
      workspace_id?: string;
      entries?: Array<{
        id?: string;
        workspace_id?: string;
        type?: string;
        content?: string;
        metadata?: Record<string, unknown>;
      }>;
    };
    expect(payload.workspace_id).toBe('HoloScript');
    const entry = payload.entries?.[0];
    expect(entry?.id).toMatch(/^symbol-HoloScript-[a-f0-9]{16}$/);
    expect(entry?.workspace_id).toBe('HoloScript');
    expect(entry?.type).toBe('pattern');
    expect(entry?.content?.length).toBeGreaterThanOrEqual(100);
    expect(entry?.metadata).toMatchObject({
      entryClass: 'symbol',
      symbolName: 'TinySymbol',
      symbolType: 'function',
      filePath: 'src/tiny.ts',
      line: 7,
      language: 'typescript',
      repo: 'HoloScript',
    });
  });

  it('queries federated symbols as pattern entries', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-resolve-symbol-cache-'));
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    resetCodebaseToolStateForTests();

    let observedBody: unknown;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await handleCodebaseTool('holo_resolve_symbol', {
      symbolName: 'TinySymbol',
      limit: 2,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(observedBody).toMatchObject({
      search: 'TinySymbol',
      type: 'pattern',
      limit: 2,
    });
  });
});
