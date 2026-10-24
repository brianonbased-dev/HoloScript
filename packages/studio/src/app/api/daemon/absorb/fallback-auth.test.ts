import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock, auth } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  auth: { userToken: 'gh-session-token' as string | null },
}));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: async () => auth.userToken }));
vi.mock('@/lib/services/absorb-client', async (importOriginal) => ({
  mcpClearlyDidNotRun: (await importOriginal<typeof import('@/lib/services/absorb-client')>())
    .mcpClearlyDidNotRun,
  callMcpTool: callMcpToolMock,
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));
vi.mock('@/lib/absorb/projectState', () => ({ recordAbsorbJob: vi.fn() }));

import { POST } from './route';

function post(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify({ projectPath: '/ws/x' }),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('/api/daemon/absorb HTTP fallback auth', () => {
  let seenAuth: string | null;
  beforeEach(() => {
    seenAuth = null;
    callMcpToolMock.mockReset();
    auth.userToken = 'gh-session-token';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'MCP 406',
      failure: 'http_4xx',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        seenAuth = new Headers(init.headers).get('authorization');
        // Mirrors absorb-service: 401 without a bearer.
        return seenAuth
          ? new Response('{"status":"complete"}', { status: 200 })
          : new Response('{"error":"Authentication required"}', { status: 401 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cookie-session browser call: the session user\'s own token is sent, never the service key', async () => {
    const res = await POST(post());
    expect(callMcpToolMock.mock.calls[0][2]).toBe('Bearer gh-session-token');
    expect(seenAuth).toBe('Bearer gh-session-token');
    expect(res.status).toBe(200);
  });

  it('no signed-in user: 401, nothing sent to MCP or absorb, even with a client bearer', async () => {
    auth.userToken = null;
    const res = await POST(post({ Authorization: 'Bearer service-key' }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(callMcpToolMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a client-sent Authorization is ignored; only the session token is used', async () => {
    await POST(post({ Authorization: 'Bearer service-key' }));
    expect(seenAuth).toBe('Bearer gh-session-token');
    expect(JSON.stringify(callMcpToolMock.mock.calls)).not.toContain('service-key');
  });
});
