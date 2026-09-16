/**
 * Doors audit 2026-09-15: the marketplace cache refresh — who may run it, and
 * whose key gets spent.
 *
 * Until now this route was rate-limited and nothing else. A rate limit is not a
 * door: it caps how FAST a stranger may do a thing, not WHETHER they may. Any
 * caller could spend Studio's own mesh key on an upstream read and write the
 * result into the cache that the knowledge catalog and the entry GET fallback
 * serve to other visitors.
 *
 * The rules under test:
 *   1. no credential at all           -> 401, nothing leaves the process,
 *                                        nothing is written to the cache
 *   2. caller sent their own key      -> forward theirs, never attach ours
 *   3. signed in, no key of their own -> our server key, on purpose
 *   4. signed in, no key configured   -> 503, and nothing leaves the process
 *   5. the rate limit still runs, in front of all of it
 *
 * The upstream is a recorded double; no request leaves this process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuthStub, rateLimitStub, recordedInserts } = vi.hoisted(() => ({
  requireAuthStub: vi.fn(),
  rateLimitStub: vi.fn(),
  recordedInserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthStub,
}));

vi.mock('@/lib/rate-limiter', () => ({
  rateLimit: rateLimitStub,
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: Array<Record<string, unknown>>) => {
        recordedInserts.push(...values);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  }),
}));

import { POST } from './route';

const SERVER_KEY = 'srv-marketplace-key-sentinel';
const CALLER_KEY = 'caller-marketplace-key-sentinel';
const SYNC_URL = 'https://studio.test/api/holomesh/marketplace/sync';

type RecordedCall = { url: string; headers: Record<string, string> };

let calls: RecordedCall[] = [];

/** Answers the upstream read with one entry so a write would be visible. */
function installOutboundRecorder() {
  const outbound = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(
      JSON.stringify({ success: true, entries: [{ id: 'entry-1', content: 'free row' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
  vi.stubGlobal('fetch', outbound);
  return outbound;
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

function post(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
  });
}

describe('POST marketplace cache refresh — credential gate', () => {
  beforeEach(() => {
    calls = [];
    recordedInserts.length = 0;
    vi.clearAllMocks();
    rateLimitStub.mockReturnValue({ ok: true, remaining: 9, reset: Date.now() + 60_000 });
    vi.stubEnv('HOLOMESH_API_KEY', SERVER_KEY);
    signedIn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('refuses a caller who is neither signed in nor carrying a key, and writes nothing', async () => {
    signedOut();
    const outbound = installOutboundRecorder();

    const response = await POST(post());
    const body = (await response.json()) as { error?: string; signInRequired?: boolean };

    expect(response.status).toBe(401);
    expect(body.signInRequired).toBe(true);
    // The refusal names the header that actually works.
    expect(body.error).toContain('x-mcp-api-key');
    // The strongest proof the key did not leak: nothing was sent upstream.
    expect(outbound).not.toHaveBeenCalled();
    // And nothing a stranger chose reached the cache other visitors read.
    expect(recordedInserts).toHaveLength(0);
  });

  it("forwards the caller's own key and attaches no key of ours", async () => {
    signedOut();
    installOutboundRecorder();

    const response = await POST(post({ 'x-mcp-api-key': CALLER_KEY }));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${CALLER_KEY}`);
    expect(JSON.stringify(calls[0].headers)).not.toContain(SERVER_KEY);
    // A caller with their own key is never asked to sign in.
    expect(requireAuthStub).not.toHaveBeenCalled();
  });

  it('sends a bearer key in the header this upstream actually reads', async () => {
    signedOut();
    installOutboundRecorder();

    const response = await POST(post({ Authorization: `Bearer ${CALLER_KEY}` }));

    expect(response.status).toBe(200);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${CALLER_KEY}`);
    expect(JSON.stringify(calls[0].headers)).not.toContain(SERVER_KEY);
  });

  it('will not hand a Studio API key to a different service', async () => {
    signedOut();
    const outbound = installOutboundRecorder();

    // `bk_` keys are Studio's own. Treating one as a mesh key would present a
    // Studio credential upstream, where a failed validation records it.
    const response = await POST(post({ Authorization: 'Bearer bk_studio_key' }));

    expect(response.status).toBe(401);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('refreshes for a signed-in caller under the server key', async () => {
    installOutboundRecorder();

    const response = await POST(post());
    const body = (await response.json()) as { success?: boolean; synced?: number };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.synced).toBe(1);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${SERVER_KEY}`);
    expect(recordedInserts).toHaveLength(1);
  });

  it('refuses to refresh when no server key is configured, instead of calling upstream anonymously', async () => {
    vi.stubEnv('HOLOMESH_API_KEY', '');
    vi.stubEnv('HOLOMESH_KEY', '');
    const outbound = installOutboundRecorder();

    const response = await POST(post());

    expect(response.status).toBe(503);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('keeps the rate limit in front of the credential check', async () => {
    rateLimitStub.mockReturnValue({
      ok: false,
      response: NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    });
    const outbound = installOutboundRecorder();

    const response = await POST(post({ 'x-mcp-api-key': CALLER_KEY }));

    expect(response.status).toBe(429);
    expect(outbound).not.toHaveBeenCalled();
    expect(requireAuthStub).not.toHaveBeenCalled();
  });
});
