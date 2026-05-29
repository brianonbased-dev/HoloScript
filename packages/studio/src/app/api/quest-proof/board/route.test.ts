import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * GET /api/quest-proof/board — Founder Console board aggregation.
 *
 * The route reads HOLOMESH_* env at module load, so each test sets env then
 * dynamic-imports a fresh module (vi.resetModules). global fetch is mocked to
 * stand in for the team-API board route.
 *
 * FAILING-IF-BROKEN: if the route returns hardcoded board data instead of
 * proxying the upstream team-API, the mocked fetch call-count assertion fails.
 */
describe('board GET — founder console board proxy', () => {
  const ORIG_TEAM = process.env.HOLOMESH_TEAM_ID;
  const ORIG_KEY = process.env.HOLOMESH_API_KEY;

  beforeEach(() => {
    process.env.HOLOMESH_TEAM_ID = 'team_test';
    process.env.HOLOMESH_API_KEY = 'test-key';
    vi.resetModules();
    vi.doMock('next-auth', () => ({
      getServerSession: vi.fn(async () => ({ user: { id: 'user_founder' } })),
    }));
    vi.doMock('@/lib/auth', () => ({ authOptions: {} }));
  });
  afterEach(() => {
    process.env.HOLOMESH_TEAM_ID = ORIG_TEAM;
    process.env.HOLOMESH_API_KEY = ORIG_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadGET() {
    const mod = await import('./route');
    return mod.GET;
  }

  function req() {
    return new Request('http://localhost/api/quest-proof/board', {
      method: 'GET',
    }) as never;
  }

  it('forwards the upstream board and returns ok', async () => {
    const upstreamBoard = {
      tasks: [
        { id: 'task_open_1', title: 'Build console tile', status: 'open', priority: 2 },
        { id: 'task_claimed_1', title: 'Fix auth', status: 'claimed', priority: 3 },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBoard), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const GET = await loadGET();
    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.board).toEqual(upstreamBoard);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/holomesh/team/team_test/board');
    expect(init.headers['Authorization']).toBe('Bearer test-key');
  });

  it('FAILING-IF-BROKEN: returns 502 and does NOT serve a hardcoded fallback when upstream errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const GET = await loadGET();
    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.board).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401s when caller is unauthenticated', async () => {
    vi.resetModules();
    vi.doMock('next-auth', () => ({
      getServerSession: vi.fn(async () => null),
    }));
    vi.doMock('@/lib/auth', () => ({ authOptions: {} }));
    const GET = await loadGET();
    const res = await GET(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.board).toBeNull();
    expect(json.error).toContain('Unauthorized');
  });

  it('returns 503 when HOLOMESH_TEAM_ID is missing', async () => {
    process.env.HOLOMESH_TEAM_ID = '';
    vi.resetModules();
    vi.doMock('next-auth', () => ({
      getServerSession: vi.fn(async () => ({ user: { id: 'user_founder' } })),
    }));
    vi.doMock('@/lib/auth', () => ({ authOptions: {} }));
    const GET = await loadGET();
    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('HOLOMESH_TEAM_ID');
  });
});
