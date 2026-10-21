// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useGitHubRepos', () => ({
  useGitHubRepos: () => ({ repos: [], isLoading: false, error: null, search: '', setSearch: vi.fn() }),
}));
vi.mock('@/hooks/useAbsorbPipelineBridge', () => ({
  useAbsorbPipelineBridge: () => ({}),
}));

const { dnaThrows } = vi.hoisted(() => ({ dnaThrows: { on: false } }));
vi.mock('@/lib/workspace/projectDNA', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/projectDNA')>();
  return {
    ...actual,
    detectProjectDNA: (...args: Parameters<typeof actual.detectProjectDNA>) => {
      if (dnaThrows.on) throw new Error('DNA step failed');
      return actual.detectProjectDNA(...args);
    },
  };
});

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
    dnaThrows.on = false;
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
    dnaThrows.on = true;
    const calls = mockFetch(200);
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => { result.current.setUseManual(true); result.current.setManualUrl(clone.repoUrl); });
    act(() => result.current.retryImport());
    await waitFor(() => expect(result.current.importStatus).toBe('error'));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === WS)?.status).toBe('error');
  });

  it('a 200 with no stats (tool error body) is a failed absorb: clean error, rolls back, no crash', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (url === '/api/workspace/import' && method === 'POST') return new Response(JSON.stringify(clone), { status: 200 });
      if (url === '/api/daemon/absorb') return new Response(JSON.stringify({ error: 'No API key provided.' }), { status: 200 });
      return new Response('{"ok":true}', { status: 200 });
    }));
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => { result.current.setUseManual(true); result.current.setManualUrl(clone.repoUrl); });
    act(() => result.current.retryImport());
    await waitFor(() => expect(result.current.importStatus).toBe('error'));
    expect(result.current.importError).toBe('Absorb failed: No API key provided.');
    expect(result.current.importError).not.toMatch(/totalFiles|undefined/);
    await waitFor(() => expect(calls).toContainEqual({ url: `/api/workspace/import?id=${WS}`, method: 'DELETE' }));
  });

  it('absorb is asked by workspaceId + importId, never by a local path', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/workspace/import' && method === 'POST') return new Response(JSON.stringify(clone), { status: 200 });
      if (url === '/api/daemon/absorb') {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ stats: { totalFiles: 1, totalSymbols: 1, totalLoc: 1 }, hubFiles: [], leafFirstOrder: [] }), { status: 200 });
      }
      return new Response('{"ok":true}', { status: 200 });
    }));
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => { result.current.setUseManual(true); result.current.setManualUrl(clone.repoUrl); });
    act(() => result.current.retryImport());
    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0] as Record<string, unknown>;
    expect(sent.workspaceId).toBe(WS);
    expect(typeof sent.importId).toBe('string');
    expect(sent.projectPath).toBeUndefined();
  });

  it('a 200 with an empty body: generic clean error, no crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/workspace/import' && method === 'POST') return new Response(JSON.stringify(clone), { status: 200 });
      if (url === '/api/daemon/absorb') return new Response('{}', { status: 200 });
      return new Response('{"ok":true}', { status: 200 });
    }));
    const { result } = renderHook(() => useImportRepoWizard(() => {}));
    act(() => { result.current.setUseManual(true); result.current.setManualUrl(clone.repoUrl); });
    act(() => result.current.retryImport());
    await waitFor(() => expect(result.current.importStatus).toBe('error'));
    expect(result.current.importError).toBe('Absorb failed: the absorb service returned no results');
  });

  it('twin: absorb OK keeps the workspace and sends no DELETE', async () => {
    const { calls } = await run(200);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(useWorkspaceStore.getState().workspaces.find((w) => w.id === WS)).toBeDefined();
  });
});
