import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * POST /api/quest-proof/next-actions — the N3 exact-four decision proxy.
 *
 * The route reads HOLOMESH_* env at module load, so each test sets env then
 * dynamic-imports a fresh module (vi.resetModules). global fetch is mocked to
 * stand in for the team-API `founder-approval` route.
 */
describe('next-actions POST — exact-four Joseph decision proxy', () => {
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
    return new Request('http://localhost/api/quest-proof/next-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never;
  }

  it('400s a missing taskId', async () => {
    const POST = await loadPOST();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('forwards taskId to the founder-approval route and returns ok on upstream 201', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, approval: { id: 'approval_1', status: 'approved' } }),
          { status: 201 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const POST = await loadPOST();
    const res = await POST(req({ taskId: 'task_1', intent: 'Add a test' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.approval.id).toBe('approval_1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/founder-approval');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).taskId).toBe('task_1');
  });

  it('preserves a non-Joseph authority route from an upstream 403', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'not an exact-four Joseph decision',
          authorityRoute: 'autonomous',
          agentMayProceed: true,
        }),
        { status: 403 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const POST = await loadPOST();
    const res = await POST(req({ taskId: 'task_deploy' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.authorityRoute).toBe('autonomous');
    expect(json.agentMayProceed).toBe(true);
    expect(json.requiresSpecialistReview).toBe(false);
  });

  it('502s when the team-API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const POST = await loadPOST();
    const res = await POST(req({ taskId: 'task_1' }));
    expect(res.status).toBe(502);
  });
});
