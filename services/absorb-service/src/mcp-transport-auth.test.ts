/**
 * Every MCP transport route must refuse anonymous callers, and a legacy SSE
 * session must only accept messages from the caller who opened it.
 *
 * Seen live on absorb.holoscript.net (v6.1.3, 2026-09-15): POST /mcp required a
 * key, but an anonymous GET /mcp returned 200 with an SSE session id. POST
 * /mcp/messages had no auth either; it only failed because the old handler stored
 * sessions under its own id instead of the SDK's, so every message got 404. Fixing
 * that id bug without auth would have opened tool calls to anyone, so both land
 * together. The live service was not probed beyond the GET. These tests drive the
 * real Express routes over HTTP with the real
 * MCP SDK transports; only the tool inventory, GitHub identity lookup and credit
 * tier lookup are stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('@holoscript/absorb-service/mcp', () => ({
  codebaseTools: [
    {
      name: 'holo_absorb_manifest',
      description: 'Official HoloAbsorb ownership manifest',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  handleCodebaseTool: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@holoscript/absorb-service/credits', () => ({
  getOrCreateAccount: vi.fn().mockResolvedValue({ tier: 'pro' }),
}));

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

vi.mock('./middleware/github-identity.js', () => ({
  resolveGitHubToken: vi.fn(async (token: string) => {
    if (token === 'ghp_alice') {
      return { userId: ALICE, githubUsername: 'alice', githubId: '1', isAdmin: false };
    }
    if (token === 'ghp_bob') {
      return { userId: BOB, githubUsername: 'bob', githubId: '2', isAdmin: false };
    }
    return null;
  }),
}));

import { mountMcpTransports } from './mcp-handler.js';

const SERVICE_KEY = 'test-absorb-service-key';
const aliceAuth = { authorization: 'Bearer ghp_alice' };
const bobAuth = { authorization: 'Bearer ghp_bob' };

let server: Server;
let base = '';
const openStreams: AbortController[] = [];
const savedEnv = { key: process.env.ABSORB_API_KEY, nodeEnv: process.env.NODE_ENV };

beforeAll(async () => {
  process.env.ABSORB_API_KEY = SERVICE_KEY;
  const app = express();
  app.use(express.json());
  mountMcpTransports(app);
  // Mirror server.ts's global error handler so a late handler error does not
  // tear the socket down differently from production.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no ephemeral port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const c of openStreams) c.abort();
  if (savedEnv.key === undefined) delete process.env.ABSORB_API_KEY;
  else process.env.ABSORB_API_KEY = savedEnv.key;
  process.env.NODE_ENV = savedEnv.nodeEnv;
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Open GET /mcp and, when it streams, read the endpoint event's sessionId. */
async function openSse(headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  openStreams.push(ctrl);
  const res = await fetch(`${base}/mcp`, {
    headers: { accept: 'text/event-stream', ...headers },
    signal: ctrl.signal,
  });
  let sessionId: string | null = null;
  if (res.status === 200 && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    while (!sessionId) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      sessionId = buffered.match(/sessionId=([0-9a-f-]{36})/)?.[1] ?? null;
    }
  } else {
    await res.text().catch(() => '');
  }
  return { status: res.status, sessionId };
}

async function postMessage(sessionId: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/mcp/messages?sessionId=${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  await res.text().catch(() => '');
  return res.status;
}

async function deleteSession(sessionId: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/mcp?sessionId=${sessionId}`, { method: 'DELETE', headers });
  await res.text().catch(() => '');
  return res.status;
}

describe('HoloAbsorb MCP transports refuse anonymous callers', () => {
  it('refuses to open a legacy SSE session without credentials', async () => {
    const sse = await openSse();
    expect(sse.status).toBe(401);
    expect(sse.sessionId).toBeNull();
  });

  it('opens a legacy SSE session for an authenticated caller', async () => {
    const sse = await openSse(aliceAuth);
    expect(sse.status).toBe(200);
    expect(sse.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a message with no credentials even when the sessionId is live', async () => {
    const { sessionId } = await openSse(aliceAuth);
    expect(await postMessage(sessionId!)).toBe(401);
  });

  it("refuses a message from a caller who does not own the session", async () => {
    const { sessionId } = await openSse(aliceAuth);
    expect(await postMessage(sessionId!, bobAuth)).toBe(403);
  });

  it('accepts a message from the caller who opened the session', async () => {
    const { sessionId } = await openSse(aliceAuth);
    expect(await postMessage(sessionId!, aliceAuth)).toBe(202);
  });

  it('refuses to close a session without credentials or as another caller', async () => {
    const { sessionId } = await openSse(aliceAuth);
    expect(await deleteSession(sessionId!)).toBe(401);
    expect(await deleteSession(sessionId!, bobAuth)).toBe(403);
    expect(await deleteSession(sessionId!, aliceAuth)).toBe(200);
  });

  it('keeps POST /mcp (streamable HTTP) behind credentials', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    await res.text().catch(() => '');
    expect(res.status).toBe(401);
  });
});

describe('with no API key configured outside production (local dev mode)', () => {
  it('still refuses an SSE session that has no caller to bind it to', async () => {
    const key = process.env.ABSORB_API_KEY;
    delete process.env.ABSORB_API_KEY;
    process.env.NODE_ENV = 'test';
    try {
      const sse = await openSse();
      expect(sse.status).toBe(401);
      expect(sse.sessionId).toBeNull();
    } finally {
      process.env.ABSORB_API_KEY = key;
    }
  });
});
