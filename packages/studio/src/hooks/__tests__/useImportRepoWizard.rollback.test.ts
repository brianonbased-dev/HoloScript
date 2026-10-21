// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useGitHubRepos', () => ({
  useGitHubRepos: () => ({ repos: [], isLoading: false, error: null, search: '', setSearch: vi.fn() }),
}));
vi.mock('@/hooks/useAbsorbPipelineBridge', () => ({
  useAbsorbPipelineBridge: () => ({}),
}));

import { useImportRepoWizard } from '../useImportRepoWizard';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';

const WS = 'ws-11111111-2222-4333-8444-555555555555';
const clone = {
  id: WS, name: 'brian-music-bot', repoUrl: 'https://github.com/joecoolproductions/brian-music-bot.git',
  branch: 'main', localPath: `/ws/${WS}/brian-music-bot`, status: 'ready', createdAt: '2026-10-14T00:00:00Z',
};

function mockFetch(absorbStatus: number) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url === '/api/workspace/import' && method === 'POST') return new Response(JSON.stringify(clone), { status: 200 });
    if (url === '/api/daemon/absorb') {
      return absorbStatus === 200
        ? new Response(JSON.stringify({ stats: { totalFiles: 1, totalSymbols: 1, totalLoc: 1 }, hubFiles: [], leafFirstOrder: [], durationMs: 1, absorbedAt: 'now' }), { status: 200 })
        : new Response(JSON.stringify({ error: 'Absorb could not run: the absorb service did not answer.' }), { status: absorbStatus });
    }
    return new Response('{"ok":true}', { status: 200 });
  }));
  return calls;
}

describe('useImportRepoWizard failed-import cleanup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useWorkspaceStore.setState({ workspaces: [] } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function run(absorbStatus: number) {
    const calls = mockFetch(absorbStatus);
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => {
      result.current.setUseManual(true);
      result.current.setManualUrl(clone.repoUrl);
    });
    act(() => result.current.retryImport());
    await waitFor(() => expect(['error', 'done']).toContain(result.current.importStatus));
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(absorbStatus === 200 ? 2 : 3));
    return { calls, result };
  }

  it('absorb 502: rolls back the server workspace and drops the local entry', async () => {
    const { calls, result } = await run(502);
    expect(result.current.importStatus).toBe('error');
    expect(calls).toContainEqual({ url: `/api/workspace/import?id=${WS}`, method: 'DELETE' });
    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === WS)).toBeUndefined();
  });

  it('twin: absorb OK but a later step throws keeps the workspace (no DELETE)', async () => {
    const calls = mockFetch(200);
    vi.mocked(globalThis.fetch).mockImplementation(async (url: unknown, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(url), method });
      if (url === '/api/workspace/import') return new Response(JSON.stringify(clone), { status: 200 });
      return new Response(JSON.stringify({ absorbedAt: 'now' }), { status: 200 }); // no stats -> throws
    });
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => { result.current.setUseManual(true); result.current.setManualUrl(clone.repoUrl); });
    act(() => result.current.retryImport());
    await waitFor(() => expect(result.current.importStatus).toBe('error'));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === WS)?.status).toBe('error');
  });

  it('twin: absorb OK keeps the workspace and sends no DELETE', async () => {
    const { calls } = await run(200);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === WS)).toBeDefined();
  });
});
