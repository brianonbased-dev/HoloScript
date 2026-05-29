import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/quest-proof/decide — Founder Console decide-all proxy.
 *
 * The route reads HOLOMESH_* env at module load, so each test sets env then
 * dynamic-imports a fresh module (vi.resetModules). global fetch is mocked to
 * stand in for the team-API board PATCH route.
 *
 * FAILING-IF-BROKEN: if the route returns hardcoded success instead of
 * round-tripping PATCHes to the team-API, the mocked fetch call-count assertion
 * fails.
 */
describe('decide POST — founder console decide-all proxy', () => {
  const ORIG_TEAM = process.env.HOLOMESH_TEAM_ID;
  const ORIG_KEY = process.env.HOLOMESH_API_KEY;

  beforeEach(() => {
    process.env.HOLOMESH_TEAM_ID = 'team_test';
    process.env.HOLOMESH_API_KEY = 'test-key';
    vi.resetModules();
  });
  afterEach(() => {
    process.env.HOLOMESH_TEAM_ID = ORIG_TEAM;
    process.env.HOLOMESH_API_KEY = ORIG_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadPOST() {
    const mod = await import('./route');
    return mod.POST;
  }

  function req(body: unknown) {
    return new Request('http://localhost/api/quest-proof/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never;
  }

  it('400s a missing taskIds array', async () => {
    const POST = await loadPOST();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('taskIds');
  });

  it('mutates task state by PATCHing each taskId upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, task: { id: 'task_1', status: 'done' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const POST = await loadPOST();
    const res = await POST(req({ taskIds: ['task_1', 'task_2'] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls;
    expect(String(calls[0][0])).toContain('/api/holomesh/team/team_test/board/task_1');
    expect(String(calls[1][0])).toContain('/api/holomesh/team/team_test/board/task_2');

    for (const [, init] of calls) {
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body);
      expect(body.action).toBe('done');
      expect(body.verification_evidence).toBe('founder-console decide-all');
    }
  });

  it('FAILING-IF-BROKEN: surfaces partial failure when one upstream PATCH errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'signing-rejected' }), { status: 401 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const POST = await loadPOST();
    const res = await POST(req({ taskIds: ['task_ok', 'task_fail'] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.results).toHaveLength(2);
    expect(json.results[0].ok).toBe(true);
    expect(json.results[1].ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when HOLOMESH_TEAM_ID is missing', async () => {
    process.env.HOLOMESH_TEAM_ID = '';
    vi.resetModules();
    const POST = await loadPOST();
    const res = await POST(req({ taskIds: ['task_1'] }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('HOLOMESH_TEAM_ID');
  });
});
