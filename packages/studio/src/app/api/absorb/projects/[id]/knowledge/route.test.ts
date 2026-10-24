import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { auth, projects } = vi.hoisted(() => ({
  auth: { userId: 'user-a' as string | null, userToken: 'gh-user-a' as string | null },
  projects: new Map<string, { id: string; ownerId: string | null }>(),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

// Signed-in user, resolved server-side from the session.
vi.mock('@/lib/api-auth', () => ({
  getSession: vi.fn(async () => (auth.userId ? { user: { id: auth.userId } } : null)),
}));
vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: vi.fn(async () => auth.userToken),
}));
vi.mock('@/lib/absorb/projectState', () => ({
  findDurableAbsorbProject: vi.fn(({ projectId }: { projectId?: string }) =>
    projectId ? (projects.get(projectId) ?? null) : null
  ),
}));

import { POST } from './route';

function post(id: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost/api/absorb/projects/${id}/knowledge`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function mcpOk(payload: unknown): Response {
  return new Response(
    JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function authHeaders(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(
    (call) =>
      ((call[1] as RequestInit | undefined)?.headers as Record<string, string>)?.Authorization
  );
}

describe('/api/absorb/projects/[id]/knowledge route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    auth.userId = 'user-a';
    auth.userToken = 'gh-user-a';
    projects.clear();
    projects.set('proj-a', { id: 'proj-a', ownerId: 'user-a' });
    projects.set('proj-b', { id: 'proj-b', ownerId: 'user-b' });
  });

  describe('owner only (cross-tenant fix)', () => {
    it('401 with no signed-in user, and never calls upstream', async () => {
      auth.userId = null;
      auth.userToken = null;
      const fetchMock = vi.fn().mockResolvedValue(mcpOk({ success: true }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await POST(post('proj-a'), { params: Promise.resolve({ id: 'proj-a' }) });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('401 when signed in but no user credential resolves, and never calls upstream', async () => {
      auth.userToken = null;
      const fetchMock = vi.fn().mockResolvedValue(mcpOk({ success: true }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await POST(post('proj-a'), { params: Promise.resolve({ id: 'proj-a' }) });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("404 for another user's project, and never calls upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mcpOk({ success: true, entries: [{}] }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await POST(post('proj-b'), { params: Promise.resolve({ id: 'proj-b' }) });
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('404 for an unknown project, and never calls upstream', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mcpOk({ success: true }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await POST(post('proj-zz'), { params: Promise.resolve({ id: 'proj-zz' }) });
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends only the user credential on MCP and REST fallback, never the service key', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('mcp unavailable', { status: 502 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, summary: { total: 1 } }), { status: 200 })
        );
      vi.stubGlobal('fetch', fetchMock);

      const res = await POST(post('proj-a'), { params: Promise.resolve({ id: 'proj-a' }) });
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(authHeaders(fetchMock)).toEqual(['Bearer gh-user-a', 'Bearer gh-user-a']);
      for (const call of fetchMock.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('absorb-key-test');
      }
    });
  });

  it('returns MCP extraction result for the owner', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mcpOk({ success: true, summary: { total: 3 }, entries: [{}] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(post('proj-a', { minConfidence: 0.8, maxPerType: 5 }), {
      params: Promise.resolve({ id: 'proj-a' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.total).toBe(3);
    const rpc = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(rpc.params.arguments.workspaceId).toBe('proj-a');
  });

  it('falls back to absorb REST API when MCP tool call fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('mcp unavailable', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, summary: { total: 1 } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(post('proj-a'), { params: Promise.resolve({ id: 'proj-a' }) });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/absorb/projects/proj-a/knowledge');
  });

  it('returns 503 fallback payload when both MCP and REST fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const res = await POST(post('proj-a'), { params: Promise.resolve({ id: 'proj-a' }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.tried).toEqual(['mcp-tool', 'absorb-rest']);
  });
});
