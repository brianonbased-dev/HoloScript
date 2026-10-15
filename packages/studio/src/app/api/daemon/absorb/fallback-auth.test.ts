import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock } = vi.hoisted(() => ({ callMcpToolMock: vi.fn() }));
vi.mock('@/lib/services/absorb-client', () => ({
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callMcpToolMock.mockResolvedValue({ ok: false, data: null, error: 'MCP 406' });
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

  it('cookie-session browser call (no Authorization) uses the service key and succeeds', async () => {
    const res = await POST(post());
    expect(seenAuth).toBe('Bearer service-key');
    expect(res.status).toBe(200);
  });

  it('twin: a caller bearer is forwarded as-is, not replaced by the service key', async () => {
    const res = await POST(post({ Authorization: 'Bearer user-token' }));
    expect(seenAuth).toBe('Bearer user-token');
    expect(res.status).toBe(200);
  });
});
