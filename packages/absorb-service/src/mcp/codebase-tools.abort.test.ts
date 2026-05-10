import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncWithMesh } from './codebase-tools';

describe('codebase MCP abort behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
});
