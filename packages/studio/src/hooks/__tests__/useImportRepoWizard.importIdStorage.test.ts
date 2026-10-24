// @vitest-environment jsdom
/**
 * #617 (CoS/Treasurer): the absorb importId is in localStorage BEFORE the POST
 * leaves, so a reload after a 502 sends the same id again; it is removed only
 * after a finished absorb.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useGitHubRepos', () => ({
  useGitHubRepos: () => ({
    repos: [],
    isLoading: false,
    error: null,
    search: '',
    setSearch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAbsorbPipelineBridge', () => ({
  useAbsorbPipelineBridge: () => ({}),
}));

import { useImportRepoWizard } from '../useImportRepoWizard';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';

const PREFIX = 'holoscript.absorb.importId:';
const WS = 'ws-11111111-2222-4333-8444-555555555555';
const clone = {
  id: WS,
  name: 'brian-music-bot',
  repoUrl: 'https://github.com/joecoolproductions/brian-music-bot.git',
  branch: 'main',
  localPath: `/ws/${WS}/brian-music-bot`,
  status: 'ready',
  createdAt: '2026-10-14T00:00:00Z',
};

function savedEntries(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(PREFIX)) out.push([k, localStorage.getItem(k)!]);
  }
  return out;
}

function stubFetch(absorbStatus: () => number) {
  const atPost: Array<{ body: Record<string, unknown>; saved: Array<[string, string]> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/workspace/import' && method === 'POST')
        return new Response(JSON.stringify(clone), { status: 200 });
      if (url === '/api/daemon/absorb' && method === 'POST') {
        // Snapshot storage at the moment the request is sent.
        atPost.push({ body: JSON.parse(String(init?.body)), saved: savedEntries() });
        const s = absorbStatus();
        return s === 200
          ? new Response(
              JSON.stringify({
                stats: {
                  totalFiles: 1,
                  totalSymbols: 1,
                  totalLoc: 1,
                  filesByLanguage: { ts: 1 },
                  errors: [],
                },
                hubFiles: [],
                leafFirstOrder: [],
                durationMs: 1,
                absorbedAt: 'now',
              }),
              { status: 200 }
            )
          : new Response(JSON.stringify({ error: 'bad gateway' }), { status: s });
      }
      return new Response('{"ok":true}', { status: 200 });
    })
  );
  return atPost;
}

async function start() {
  const { result } = renderHook(() => useImportRepoWizard(() => {}));
  act(() => {
    result.current.setUseManual(true);
    result.current.setManualUrl(clone.repoUrl);
  });
  act(() => result.current.retryImport());
  return result;
}

describe('useImportRepoWizard keeps the importId in localStorage (#617)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useWorkspaceStore.setState({ workspaces: [] } as never);
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves the importId before the absorb POST, keeps it after a 502, removes it after success', async () => {
    const atPost = stubFetch(() => 502);
    const result = await start();
    await waitFor(() => expect(result.current.importStatus).toBe('error'));
    expect(atPost).toHaveLength(1);
    expect(atPost[0].saved).toHaveLength(1);
    expect(atPost[0].saved[0][1]).toBe(atPost[0].body.importId);
    expect(savedEntries()).toEqual(atPost[0].saved); // still there after the 502

    localStorage.clear();
    const ok = stubFetch(() => 200);
    const r2 = await start();
    await waitFor(() =>
      expect(r2.current.importStatus, String(r2.current.importError)).toBe('done')
    );
    expect(ok[0].saved[0][1]).toBe(ok[0].body.importId);
    expect(savedEntries()).toEqual([]);
  });

  it('a reload (fresh hook) sends the id saved before the 502', async () => {
    const first = stubFetch(() => 502);
    const r1 = await start();
    await waitFor(() => expect(r1.current.importStatus).toBe('error'));
    const [key] = first[0].saved[0];
    localStorage.setItem(key, 'imp-saved-before-reload');

    useWorkspaceStore.setState({ workspaces: [] } as never);
    const second = stubFetch(() => 200);
    const r2 = await start();
    await waitFor(() =>
      expect(r2.current.importStatus, String(r2.current.importError)).toBe('done')
    );
    expect(second[0].body.importId).toBe('imp-saved-before-reload');
  });
});
