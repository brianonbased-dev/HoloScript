/**
 * oracle-boost/status: signed-in only, server-only key, fail closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuthStub } = vi.hoisted(() => ({ requireAuthStub: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthStub }));

import { POST } from './route';

const post = () =>
  new NextRequest('https://studio.test/api/studio/oracle-boost/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'free' }),
  });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response('{"knowledge_entries":1}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  requireAuthStub.mockResolvedValue({ user: { id: 'u1' } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requireAuthStub.mockReset();
});

describe('oracle-boost/status: auth and key handling', () => {
  it('anonymous caller gets 401 and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    requireAuthStub.mockResolvedValue(NextResponse.json({ error: 'auth' }, { status: 401 }));
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never uses NEXT_PUBLIC_MCP_API_KEY; with no server key the probe fails closed and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    const res = await POST(post());
    const body = await res.json();
    expect(body.checks.knowledge_endpoint).toBe('fail');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends only the server key when it is set', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    await POST(post());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-mcp-api-key']).toBe('srv-key-sentinel');
  });
});
