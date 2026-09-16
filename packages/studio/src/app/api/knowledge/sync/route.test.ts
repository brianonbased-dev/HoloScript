/**
 * Doors audit 2026-09-15: POST /api/knowledge/sync — who may write, and whose
 * key gets spent.
 *
 * Until now this route had no guard of any kind. It attached Studio's own
 * server key to whatever body arrived and posted it to a real upstream write
 * endpoint, so anyone on the internet could write into the knowledge store as
 * us. Its read sibling, /api/knowledge/query, was closed in 886264d9f.
 *
 * The rules under test:
 *   1. no credential at all           -> 401, and nothing leaves the process
 *   2. caller sent their own mesh key -> forward theirs, never attach ours
 *   3. signed in, no key of their own -> our server key, scoped to their own
 *                                        workspace
 *   4. the body is narrowed to the fields Studio's own callers send
 *
 * The upstream here is a recorded fetch double; no request leaves this process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAuthStub } = vi.hoisted(() => ({ requireAuthStub: vi.fn() }));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthStub,
}));

import { POST } from './route';

const SERVER_KEY = 'srv-sync-key-sentinel';
const CALLER_KEY = 'caller-sync-key-sentinel';
const FOUNDER_WORKSPACE_ID = 'ai-ecosystem';

type RecordedCall = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

let calls: RecordedCall[] = [];

function installOutboundRecorder() {
  const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ synced: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function signedOut() {
  requireAuthStub.mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function signedIn() {
  requireAuthStub.mockResolvedValue({
    user: {
      id: 'studio-user-1',
      name: 'Studio User',
      email: 'studio-user@example.test',
      image: null,
      githubUsername: 'studio-user',
    },
  });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://studio.test/api/knowledge/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** One entry in the exact shape the W/P/G filing form sends. */
function filingFormBody(extra: Record<string, unknown> = {}) {
  return {
    workspace_id: 'ws_studio-user',
    entries: [{ type: 'gotcha', domain: 'studio', content: 'A real gotcha worth filing' }],
    ...extra,
  };
}

describe('POST /api/knowledge/sync — credential gate', () => {
  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
    vi.stubEnv('HOLOSCRIPT_API_KEY', SERVER_KEY);
    signedIn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('refuses a caller who is neither signed in nor carrying a key, and writes nothing', async () => {
    signedOut();
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post(filingFormBody()));
    const body = (await response.json()) as { error?: string; signInRequired?: boolean };

    expect(response.status).toBe(401);
    expect(body.signInRequired).toBe(true);
    // The message names the header the upstream actually reads.
    expect(body.error).toContain('x-mcp-api-key');
    // The strongest proof the key did not leak: nothing was sent upstream.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards the caller's own mesh key and attaches no key of ours", async () => {
    signedOut();
    installOutboundRecorder();

    const response = await POST(post(filingFormBody(), { 'x-mcp-api-key': CALLER_KEY }));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['x-mcp-api-key']).toBe(CALLER_KEY);
    expect(JSON.stringify(calls[0].headers)).not.toContain(SERVER_KEY);
    // A caller with their own key is never asked to sign in.
    expect(requireAuthStub).not.toHaveBeenCalled();
  });

  it('sends a bearer key in the header the upstream actually reads', async () => {
    signedOut();
    installOutboundRecorder();

    const response = await POST(
      post(filingFormBody(), { Authorization: `Bearer ${CALLER_KEY}` })
    );

    expect(response.status).toBe(200);
    expect(calls[0].headers['x-mcp-api-key']).toBe(CALLER_KEY);
    expect(JSON.stringify(calls[0].headers)).not.toContain(SERVER_KEY);
  });

  it('files for a signed-in caller under the server key, scoped to their workspace', async () => {
    installOutboundRecorder();

    const response = await POST(post(filingFormBody()));

    expect(response.status).toBe(200);
    expect(calls[0].headers['x-mcp-api-key']).toBe(SERVER_KEY);
    expect(calls[0].body.workspace_id).toBe('ws_studio-user');
    expect(calls[0].body.entries).toEqual([
      {
        content: 'A real gotcha worth filing',
        type: 'gotcha',
        domain: 'studio',
        workspace_id: 'ws_studio-user',
      },
    ]);
  });

  it('will not let a signed-in stranger file into the founder workspace', async () => {
    installOutboundRecorder();

    const response = await POST(post(filingFormBody({ workspace_id: FOUNDER_WORKSPACE_ID })));

    expect(response.status).toBe(200);
    expect(calls[0].body.workspace_id).not.toBe(FOUNDER_WORKSPACE_ID);
    expect(calls[0].body.workspace_id).toBe('ws_studio-user');
    expect(JSON.stringify(calls[0].body)).not.toContain(FOUNDER_WORKSPACE_ID);
  });

  it('forwards only the fields Studio\'s own callers send', async () => {
    installOutboundRecorder();

    await POST(
      post({
        workspace_id: 'ws_studio-user',
        api_key: 'caller-supplied',
        overwrite_all: true,
        entries: [
          {
            type: 'pattern',
            domain: 'studio',
            content: 'Content that should survive',
            metadata: { route: '/create' },
            authorId: 'someone-else',
            price: 99,
          },
        ],
      })
    );

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].body).sort()).toEqual(['entries', 'workspace_id']);
    expect(calls[0].body.entries).toEqual([
      {
        content: 'Content that should survive',
        type: 'pattern',
        domain: 'studio',
        metadata: { route: '/create' },
        workspace_id: 'ws_studio-user',
      },
    ]);
  });

  it('refuses a body with no entries instead of passing it upstream', async () => {
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post({ workspace_id: 'ws_studio-user' }));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to file when only the browser-visible key is configured', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    const fetchSpy = installOutboundRecorder();

    const response = await POST(post(filingFormBody()));

    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
