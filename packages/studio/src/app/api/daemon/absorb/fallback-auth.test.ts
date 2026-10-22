import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// CoS, #620: the /scan fallback bills the session owner by their own
// credential, never a caller-supplied bearer and never the service key alone.
const { callMcpToolMock, auth } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  auth: { session: { user: { id: 'user-owner' } } as unknown, token: 'gho_owner' as string | null },
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => auth.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => auth.token) }));
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

describe('/api/daemon/absorb HTTP fallback: the payer is the session owner', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    auth.session = { user: { id: 'user-owner' } };
    auth.token = 'gho_owner';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callMcpToolMock.mockResolvedValue({ ok: false, data: null, error: 'MCP 400', failure: 'http_4xx' });
    fetchMock = vi.fn(async () => new Response('{"status":"complete"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const sent = () => new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);

  it('cookie session (no Authorization): service key + the owner credential in X-User-Authorization', async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(sent().get('authorization')).toBe('Bearer service-key');
    expect(sent().get('x-user-authorization')).toBe('Bearer gho_owner');
  });

  it("a caller bearer that IS the owner's own credential is allowed", async () => {
    const res = await POST(post({ Authorization: 'Bearer gho_owner' }));
    expect(res.status).toBe(200);
    expect(sent().get('x-user-authorization')).toBe('Bearer gho_owner');
  });

  it('a caller bearer that differs from the session owner: 403, no fallback', async () => {
    const res = await POST(post({ Authorization: 'Bearer user-token' }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('absorb_credential_not_session_owner');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no session: 401, no fallback (the service key never bills alone)', async () => {
    auth.session = null;
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a session with no user credential: 401, no fallback', async () => {
    auth.token = null;
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
