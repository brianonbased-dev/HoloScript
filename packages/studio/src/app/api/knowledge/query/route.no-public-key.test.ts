/**
 * knowledge/query must use only the server-only HOLOSCRIPT_API_KEY: never the
 * browser-visible NEXT_PUBLIC_MCP_API_KEY, and fail closed with no upstream call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAuthStub } = vi.hoisted(() => ({ requireAuthStub: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthStub }));

import { POST } from './route';

const post = () =>
  new Request('https://studio.test/api/knowledge/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search: 'x' }),
  });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response('{"results":[]}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  requireAuthStub.mockResolvedValue({ user: { id: 'u1' } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requireAuthStub.mockReset();
});

describe('knowledge/query: no public key fallback', () => {
  it('anonymous caller gets 401 and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    requireAuthStub.mockResolvedValue(NextResponse.json({ error: 'auth' }, { status: 401 }));
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never uses NEXT_PUBLIC_MCP_API_KEY and fails closed when the server key is missing', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    const res = await POST(post());
    expect(res.status).toBeGreaterThanOrEqual(500);
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
