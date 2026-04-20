/**
 * gitBlameService — SEC-T06 client contract (workspacePath on /api/git/blame).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchBlame } from './gitBlameService';

describe('fetchBlame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns mock blame without calling fetch when workspacePath is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const r = await fetchBlame({ filePath: 'scenes/a.holo', startLine: 2, endLine: 2 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.isMock).toBe(true);
    expect(r.entries.length).toBeGreaterThan(0);
  });

  it('includes workspacePath in the blame API URL when set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          entries: [
            {
              line: 1,
              hash: 'a'.repeat(40),
              shortHash: 'aaaaaaa',
              author: 'x',
              email: 'x@y',
              date: '2026-01-01',
              summary: 's',
              filePath: 'scenes/a.holo',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const ws = 'C:\\Users\\test\\.holoscript\\workspaces\\proj-1';
    const r = await fetchBlame({
      workspacePath: ws,
      filePath: 'scenes/a.holo',
      startLine: 3,
      endLine: 3,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain(`workspacePath=${encodeURIComponent(ws)}`);
    expect(url).toContain('filePath=scenes%2Fa.holo');
    expect(url).toContain('startLine=3');
    expect(url).toContain('endLine=3');
    expect(r.ok).toBe(true);
    expect(r.isMock).toBeUndefined();
  });
});
