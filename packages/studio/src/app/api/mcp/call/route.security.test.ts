/**
 * /api/mcp/call — who may call, and whose key gets spent.
 *
 * Until 2026-09-15 this route had no sign-in check (src/proxy.ts skips /api)
 * and attached Studio's server key to EVERY forwarded tool call, so anyone on
 * the internet could run mesh tools as our server identity.
 *
 * The rules under test:
 *   1. no credential at all            -> 401, and nothing leaves the process
 *   2. caller sent their own key       -> forward theirs, never attach ours
 *   3. signed in, tool not allowlisted -> 403, and nothing leaves the process
 *   4. signed in, tool allowlisted     -> our key is attached, on purpose
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAuthStub } = vi.hoisted(() => ({ requireAuthStub: vi.fn() }));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthStub,
}));

import { GET, POST } from './route';

const SERVER_KEY = 'srv-key-sentinel';
const CALLER_KEY = 'caller-key-sentinel';

function signedOut() {
  requireAuthStub.mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function signedIn() {
  requireAuthStub.mockResolvedValue({
    user: { id: 'user-1', name: 'Signed In', email: '', image: null, githubUsername: '' },
  });
}

/** Records outbound calls so a test can prove what was — or was not — sent. */
function installOutboundRecorder() {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ result: { ok: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function headersOf(fetchSpy: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fetchSpy.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers ?? {};
}

function post(tool: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tool, input: {} }),
  });
}

describe('/api/mcp/call — credential gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('HOLOSCRIPT_API_KEY', SERVER_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('POST with no credential is refused, and never spends the server key', async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('suggest_traits'));

    expect(response.status).toBe(401);
    // The strongest proof the key did not leak: nothing was sent upstream.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST forwards the caller's own bearer key and attaches no key of ours", async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('suggest_traits', { Authorization: `Bearer ${CALLER_KEY}` }));
    const sent = headersOf(fetchSpy);

    expect(response.status).toBe(200);
    expect(sent['Authorization']).toBe(`Bearer ${CALLER_KEY}`);
    expect(sent['x-mcp-api-key']).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain(SERVER_KEY);
    // A caller with their own key is never asked to sign in.
    expect(requireAuthStub).not.toHaveBeenCalled();
  });

  it("POST forwards the caller's own x-mcp-api-key rather than substituting ours", async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('suggest_traits', { 'x-mcp-api-key': CALLER_KEY }));
    const sent = headersOf(fetchSpy);

    expect(response.status).toBe(200);
    expect(sent['x-mcp-api-key']).toBe(CALLER_KEY);
    expect(sent['x-mcp-api-key']).not.toBe(SERVER_KEY);
  });

  it('a signed-in caller cannot reach a tool outside the allowlist', async () => {
    signedIn();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('exec_shell'));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(body.error).toContain('exec_shell');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a signed-in caller reaches an allowlisted tool under the server key', async () => {
    signedIn();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('suggest_traits'));

    expect(response.status).toBe(200);
    expect(headersOf(fetchSpy)['x-mcp-api-key']).toBe(SERVER_KEY);
  });

  it('a signed-in caller gets a clear refusal when no server key is configured', async () => {
    signedIn();
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post('suggest_traits'));

    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GET does not hand the mesh server inventory to a stranger', async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    const response = await GET(new Request('http://localhost/api/mcp/call'));

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GET never attaches the server key for a caller who sent their own', async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    await GET(
      new Request('http://localhost/api/mcp/call', {
        headers: { Authorization: `Bearer ${CALLER_KEY}` },
      })
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(JSON.stringify(headersOf(fetchSpy))).not.toContain(SERVER_KEY);
  });
});
