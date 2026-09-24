/**
 * What a knowledge write tells its caller, proven over real HTTP (claude3's review of #319).
 *
 * The REAL orchestrator client and the REAL route handler talk HTTP to a stand-in
 * orchestrator on the loopback interface, the premium-exits.test.ts pattern: no module
 * replacement, nothing production touched. Ruled under /founder (2026-09-23): the behaviour
 * under test is how this server handles an orchestrator that REFUSES, stalls or answers
 * garbage; production cannot be made to do that on demand, and writing test rows into the
 * production knowledge store (with a real key in the test shell) is not allowed. Named
 * limitation: this proves the handling of those answers, not that production answers that
 * way; the live check is the deployed route answering 502, not 201, to a refused write.
 *
 * Safety: before any import this file points the orchestrator URL at the loopback stand-in,
 * replaces both client keys with dummies and removes the Moltbook key; beforeAll refuses to
 * run unless the client URL is exactly the stand-in.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';

const standIn = vi.hoisted(() => {
  const host = '127.0.0.1';
  const port = 40000 + Math.floor(Math.random() * 20000);
  const tmp = process.env.TEMP || process.env.TMPDIR || '/tmp';
  const dataDir = `${tmp}/holomesh-write-outcome-${process.pid}-${Date.now()}`;
  const baseUrl = `http://${host}:${port}`;
  process.env.MCP_ORCHESTRATOR_URL = baseUrl;
  process.env.HOLOMESH_API_KEY = 'dummy-route-client-key';
  process.env.HOLOSCRIPT_API_KEY = 'dummy-tool-client-key';
  delete process.env.MOLTBOOK_API_KEY;
  delete process.env.DATABASE_URL;
  process.env.HOLOMESH_DATA_DIR = dataDir;
  process.env.HOLOMESH_SIGNING_GRACE = '1';
  process.env.HOLOMESH_ORCHESTRATOR_POST_TIMEOUT_MS = '400';
  return { host, port, baseUrl, dataDir, mode: 'ok' };
});

import * as fs from 'fs';
import { createServer, type Server } from 'http';
import { handleHoloMeshRoute } from '../http-routes';
import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import { DEFAULT_MESH_CONFIG, type MeshKnowledgeEntry } from '../types';

/** Text an orchestrator refusal might carry: none of it may reach a caller. */
const LEAK = ['sk-live-LEAKED-token', 'owner@example.com', '/home/ops/.env', 'db.internal:5432'];
const leakText = LEAK.join(' ');

function expectNoLeak(value: unknown): void {
  const text = JSON.stringify(value);
  for (const piece of [...LEAK, 'S3cretPassw0rd']) expect(text).not.toContain(piece);
}

const entry: MeshKnowledgeEntry = {
  id: 'W.write-outcome.1',
  workspaceId: 'default',
  type: 'wisdom',
  content: 'a row for the stand-in orchestrator',
  provenanceHash: 'hash',
  authorId: 'agent-a',
  authorName: 'Agent A',
  price: 0,
  queryCount: 0,
  reuseCount: 0,
  createdAt: '2026-09-23T12:00:00.000Z',
};

/** A loopback port nothing listens on: bound, read, released. */
async function closedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function realClient(orchestratorUrl = standIn.baseUrl): HoloMeshOrchestratorClient {
  return new HoloMeshOrchestratorClient({ ...DEFAULT_MESH_CONFIG, orchestratorUrl, apiKey: 'dummy' });
}

// ── Route driver (real handler, in-process request/response objects) ──

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<Reply> {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  Object.defineProperty(req, 'socket', {
    value: { remoteAddress: `write-outcome-${Math.random().toString(36).slice(2)}` },
  });
  setTimeout(() => {
    if (body) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 200);
  const reply: Reply = { status: 0, body: {} };
  const res = {
    writeHead(status: number) {
      reply.status = status;
      return res;
    },
    setHeader() {},
    end(data?: string) {
      if (data) {
        try {
          reply.body = JSON.parse(data);
        } catch {
          reply.body = { raw: data };
        }
      }
    },
  };
  await handleHoloMeshRoute(req, res as unknown as http.ServerResponse, url);
  return reply;
}

async function registerCaller(): Promise<string> {
  const reply = await call('POST', '/api/holomesh/register', {
    name: `write-outcome-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });
  expect(reply.status).toBe(201);
  return (reply.body.agent as { api_key: string }).api_key;
}

// ── Stand-in orchestrator on the loopback interface ──

let server: Server;

beforeAll(async () => {
  if (DEFAULT_MESH_CONFIG.orchestratorUrl !== standIn.baseUrl) {
    throw new Error('Refusing to run: the orchestrator URL is not the loopback stand-in.');
  }
  fs.mkdirSync(standIn.dataDir, { recursive: true });
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const sent = (() => {
        try {
          return (JSON.parse(raw).entries ?? []).length;
        } catch {
          return 0;
        }
      })();
      const jsonReply = (status: number, value: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (standIn.mode === 'refuse') return jsonReply(403, { error: leakText });
      // A 500 whose body also carries a row: a post() that returned a failure's body would surface it.
      if (standIn.mode === 'fail500') {
        return jsonReply(500, { error: leakText, results: [{ id: 'row-from-a-500', content: leakText }] });
      }
      if (standIn.mode === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body>Sign in to continue</body></html>');
      }
      if (standIn.mode === 'zero') return jsonReply(200, { synced: 0, errors: [leakText] });
      if (standIn.mode === 'huge') return jsonReply(200, { synced: 999999 });
      if (standIn.mode === 'stall') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"synced":');
        return; // never finishes
      }
      if (req.url === '/knowledge/query') return jsonReply(200, { results: [] });
      return jsonReply(200, { success: true, synced: sent });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(standIn.port, standIn.host, () => resolve());
  });
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(standIn.dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  standIn.mode = 'ok';
});

describe('the orchestrator client over real HTTP', () => {
  it('names a refusal by status only: the orchestrator text never reaches the caller', async () => {
    standIn.mode = 'refuse';
    const outcome = await realClient().contributeKnowledgeDetailed([entry]);
    expect(outcome).toEqual({ synced: 0, accepted: false, status: 403, reason: 'refused (HTTP 403)' });
    expectNoLeak(outcome);
  });

  it('an HTML login page answering 200 is not acceptance', async () => {
    standIn.mode = 'html';
    expect(await realClient().contributeKnowledgeDetailed([entry])).toEqual({
      synced: 0,
      accepted: false,
      status: 200,
      reason: 'HTTP 200 without a JSON body',
    });
  });

  it('a 200 that accepted nothing is not acceptance, and its error text is not passed on', async () => {
    standIn.mode = 'zero';
    const outcome = await realClient().contributeKnowledgeDetailed([entry]);
    expect(outcome).toEqual({ synced: 0, accepted: false, status: 200, reason: 'accepted 0 of 1' });
    expectNoLeak(outcome);
  });

  it('a count larger than what was sent is clamped to what was sent', async () => {
    standIn.mode = 'huge';
    expect(await realClient().contributeKnowledgeDetailed([entry])).toMatchObject({ synced: 1, accepted: true });
  });

  it('a refused connection is named by its code, as real fetch reports it', async () => {
    // A port that was free a moment ago refuses the connection. (Port 1 would not do:
    // fetch refuses the standard's "bad ports" before connecting, with no code at all.)
    const outcome = await realClient(`http://127.0.0.1:${await closedPort()}`).contributeKnowledgeDetailed([entry]);
    expect(outcome).toEqual({ synced: 0, accepted: false, status: null, reason: 'unreachable (ECONNREFUSED)' });
  });

  it('credentials written into the orchestrator URL never appear in a reason', async () => {
    // fetch refuses a URL with credentials, and its message quotes the whole URL.
    const outcome = await realClient(
      `http://svc-user:S3cretPassw0rd@127.0.0.1:${await closedPort()}`
    ).contributeKnowledgeDetailed([entry]);
    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toMatch(/^unreachable/);
    expectNoLeak(outcome);
  });

  it('an answer whose body stalls after the headers times out instead of hanging', async () => {
    standIn.mode = 'stall';
    const started = Date.now();
    const outcome = await realClient().contributeKnowledgeDetailed([entry]);
    expect(outcome).toMatchObject({ synced: 0, accepted: false, reason: 'unreachable (TIMEOUT)' });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('the plain post() path still answers nothing on a 500, and does not hang on a stall', async () => {
    standIn.mode = 'fail500';
    expect(await realClient().queryKnowledge('anything')).toEqual([]);
    standIn.mode = 'stall';
    const started = Date.now();
    expect(await realClient().queryKnowledge('anything')).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('POST /api/holomesh/knowledge over real HTTP', () => {
  const content = 'A lesson long enough to pass the fifty character minimum on this route.';

  it('answers 201 with an entryId and an audit when the orchestrator accepts the write', async () => {
    const apiKey = await registerCaller();
    const reply = await call('POST', '/api/holomesh/knowledge', { content }, { authorization: `Bearer ${apiKey}` });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ success: true, synced: 1 });
    expect(typeof reply.body.entryId).toBe('string');
    expect(reply.body.audit).toBeTruthy();
  });

  it('answers 502 with no entryId and no audit when the orchestrator refuses: nothing was stored', async () => {
    const apiKey = await registerCaller();
    standIn.mode = 'refuse';
    const reply = await call('POST', '/api/holomesh/knowledge', { content }, { authorization: `Bearer ${apiKey}` });
    expect(reply.status).toBe(502);
    expect(reply.body).toEqual({
      success: false,
      error: 'orchestrator_refused',
      orchestrator: { accepted: false, status: 403, reason: 'refused (HTTP 403)' },
    });
    expectNoLeak(reply.body);
  });

  it('answers 503 when the orchestrator cannot be reached in time', async () => {
    const apiKey = await registerCaller();
    standIn.mode = 'stall';
    const reply = await call('POST', '/api/holomesh/knowledge', { content }, { authorization: `Bearer ${apiKey}` });
    expect(reply.status).toBe(503);
    expect(reply.body).toMatchObject({ success: false, error: 'orchestrator_unreachable' });
    expect(reply.body).not.toHaveProperty('entryId');
  });
});