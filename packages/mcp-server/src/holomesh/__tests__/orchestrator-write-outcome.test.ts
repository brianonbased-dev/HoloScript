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
  return { host, port, baseUrl, dataDir, mode: 'ok', hits: 0 };
});

import * as fs from 'fs';
import { createServer, type Server } from 'http';
import { handleHoloMeshRoute } from '../http-routes';
import { handleHoloMeshTool, _resetHoloMeshClientForTests } from '../holomesh-tools';
import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import { DEFAULT_MESH_CONFIG, type MeshKnowledgeEntry } from '../types';

/** The private entry the 'refuse-sync' stand-in reports, for the promote route. */
const PROMOTE_ID = 'W.priv.promote-me';

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
    standIn.hits += 1;
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
      // Accepts the request and never answers: no status line, no headers. A fetch that only
      // waits for the headers (postOk) hangs on this, where 'stall' below would not stop it.
      if (standIn.mode === 'silent') return;
      // Only the write goes silent; queries still answer (the team route's ordering test).
      if (standIn.mode === 'silent-sync' && req.url === '/knowledge/sync') return;
      // Queries find one private entry and writes are refused (the promote route's test).
      if (standIn.mode === 'refuse-sync') {
        if (req.url === '/knowledge/query') {
          return jsonReply(200, {
            results: [{ id: PROMOTE_ID, type: 'wisdom', content: 'A private lesson', workspace_id: 'private:x' }],
          });
        }
        return jsonReply(403, { error: leakText });
      }
      if (standIn.mode === 'success-false') return jsonReply(200, { success: false, error: leakText });
      if (standIn.mode === 'bom') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(String.fromCharCode(0xfeff) + JSON.stringify({ success: true, synced: sent }));
      }
      if (standIn.mode === 'big') {
        return jsonReply(200, { success: true, synced: sent, padding: 'x'.repeat(70 * 1024) });
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

  // task_1790588649622_mbp7 (claude2's re-read of #319): #319 bounded the knowledge writes, but the
  // heartbeat, message, subscribe and broadcast calls, and every GET, still waited forever on an
  // orchestrator that took the connection and never answered.
  // Each call returns early with no agent id, so every test sets one and counts what reached the
  // stand-in: a call that never left the process would pass these for the wrong reason.
  it('heartbeat, message, subscribe and broadcast give up within the timeout on a silent orchestrator', async () => {
    standIn.mode = 'silent';
    const client = realClient();
    client.setAgentId('agent-a');
    const hitsBefore = standIn.hits;
    const started = Date.now();
    expect(await client.heartbeat()).toBe(false);
    expect(await client.sendMessage('agent-b', { text: 'hello' })).toBe(false);
    expect(await client.subscribe('topic')).toBe(false);
    expect(await client.broadcast({ text: 'hello' })).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(standIn.hits - hitsBefore).toBe(4);
  });

  it.each(['silent', 'stall'])(
    'every GET gives up within the timeout when the answer is %s',
    async (mode) => {
      standIn.mode = mode;
      const client = realClient();
      client.setAgentId('agent-a');
      const hitsBefore = standIn.hits;
      const started = Date.now();
      expect(await client.discoverPeers()).toEqual([]);
      expect(await client.getAgentCard('agent-b')).toBeNull();
      expect(await client.readInbox()).toEqual([]);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(standIn.hits - hitsBefore).toBe(3);
    }
  );

  // claude3's re-read of #319, P3 notes (task xzgt).
  it('a 200 whose JSON says success:false is not acceptance, though it names no count', async () => {
    standIn.mode = 'success-false';
    const outcome = await realClient().contributeKnowledgeDetailed([entry]);
    expect(outcome).toEqual({ synced: 0, accepted: false, status: 200, reason: 'answered success:false' });
    expectNoLeak(outcome);
  });

  it('an answer that starts with a byte-order mark is still read', async () => {
    standIn.mode = 'bom';
    expect(await realClient().contributeKnowledgeDetailed([entry])).toMatchObject({ synced: 1, accepted: true });
  });

  it('an answer too large to read is named as that, not as a missing JSON body', async () => {
    standIn.mode = 'big';
    expect(await realClient().contributeKnowledgeDetailed([entry])).toEqual({
      synced: 0,
      accepted: false,
      status: 200,
      reason: 'answer over 64 KiB',
    });
  });

  it('a timeout setting too large for a timer is clamped, not turned into an instant failure', async () => {
    // Node's AbortSignal.timeout throws on a delay above 2^32-1, which read as "unreachable" for every write.
    const saved = process.env.HOLOMESH_ORCHESTRATOR_POST_TIMEOUT_MS;
    process.env.HOLOMESH_ORCHESTRATOR_POST_TIMEOUT_MS = '99999999999';
    try {
      expect(await realClient().contributeKnowledgeDetailed([entry])).toMatchObject({
        synced: 1,
        accepted: true,
      });
    } finally {
      process.env.HOLOMESH_ORCHESTRATOR_POST_TIMEOUT_MS = saved;
    }
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

// claude3's re-read of #319 (task xzgt): the other knowledge writes still answered a refusal as a
// success, and the team route's mirror-first order had no test (mutants N05/N21 survived 269 tests).
describe('the other knowledge writes say what the orchestrator did', () => {
  const lesson = 'A lesson long enough to pass the fifty character minimum on this route.';
  const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

  it('the team route writes its mirror before it waits on the orchestrator', async () => {
    const auth = bearer(await registerCaller());
    const team = await call('POST', '/api/holomesh/team', { name: `write-order-${Date.now()}` }, auth);
    expect(team.status).toBe(201);
    const tid = (team.body.team as { id: string }).id;
    standIn.mode = 'silent-sync';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let posted = false;
    const rows = [1, 2].map((n) => ({
      id: `W.order.${Date.now()}.${n}`,
      type: 'wisdom',
      content: `Team row ${n}`,
      domain: 'compilation',
    }));
    const post = call('POST', `/api/holomesh/team/${tid}/knowledge`, { entries: rows }, auth).then((r) => {
      posted = true;
      return r;
    });
    // The POST's handler reads its body at 200 ms, writes the mirror, then waits 400 ms on the silent
    // write. A GET reads no body, so it is served when it is sent: at 350 ms, after the mirror and
    // before the orchestrator gives up.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const mirror = await call('GET', `/api/holomesh/team/${tid}/knowledge`, undefined, auth);
    expect(posted).toBe(false);
    expect(mirror.body.count).toBe(2);
    const reply = await post;
    expect(reply.status).toBe(201);
    expect(reply.body.orchestrator).toMatchObject({ accepted: false, reason: 'unreachable (TIMEOUT)' });
    // An operator sees why the rows are only in the mirror: one line, no orchestrator text.
    const lines = warn.mock.calls.map((args) => String(args[0]));
    warn.mockRestore();
    expect(lines.filter((line) => line.includes('kept in the team mirror'))).toEqual([
      `[holomesh] team ${tid} knowledge: 2 row(s) kept in the team mirror; orchestrator unreachable (TIMEOUT)`,
    ]);
  });

  it('POST /contribute answers 502 and no id when the orchestrator refuses, 201 when it accepts', async () => {
    const auth = bearer(await registerCaller());
    const accepted = await call('POST', '/api/holomesh/contribute', { content: lesson }, auth);
    expect(accepted.status).toBe(201);
    standIn.mode = 'refuse';
    const refused = await call('POST', '/api/holomesh/contribute', { content: lesson }, auth);
    expect(refused.status).toBe(502);
    expect(refused.body).toMatchObject({ success: false, error: 'orchestrator_refused' });
    expect(refused.body).not.toHaveProperty('id');
    expectNoLeak(refused.body);
  });

  it('POST /knowledge/private answers 502 on a refusal and 503 when the orchestrator is out of reach', async () => {
    const auth = bearer(await registerCaller());
    const entries = [{ id: `W.priv.write-outcome.${Date.now()}`, type: 'wisdom', content: lesson, domain: 'compilation' }];
    expect((await call('POST', '/api/holomesh/knowledge/private', { entries }, auth)).status).toBe(201);
    standIn.mode = 'refuse';
    const refused = await call('POST', '/api/holomesh/knowledge/private', { entries }, auth);
    expect(refused.status).toBe(502);
    expect(refused.body).not.toHaveProperty('entries');
    standIn.mode = 'stall';
    expect((await call('POST', '/api/holomesh/knowledge/private', { entries }, auth)).status).toBe(503);
  });

  it('POST /knowledge/promote answers 502 when the orchestrator refuses the public copy', async () => {
    const auth = bearer(await registerCaller());
    standIn.mode = 'refuse-sync';
    const reply = await call('POST', '/api/holomesh/knowledge/promote', { entry_id: PROMOTE_ID }, auth);
    expect(reply.status).toBe(502);
    expect(reply.body).not.toHaveProperty('promoted');
    expectNoLeak(reply.body);
  });

  it('DELETE /knowledge/private/:id answers 502 when the orchestrator refuses the tombstone', async () => {
    const auth = bearer(await registerCaller());
    expect((await call('DELETE', '/api/holomesh/knowledge/private/W.priv.gone', undefined, auth)).status).toBe(200);
    standIn.mode = 'refuse';
    const refused = await call('DELETE', '/api/holomesh/knowledge/private/W.priv.gone', undefined, auth);
    expect(refused.status).toBe(502);
    expect(refused.body).not.toHaveProperty('deleted');
  });

  it('holomesh_contribute says it failed when the orchestrator refuses, and says why', async () => {
    _resetHoloMeshClientForTests();
    const args = { type: 'wisdom', content: lesson, domain: 'compilation' };
    // An accepted write first, which also registers the tool's client while the stand-in says yes.
    expect(await handleHoloMeshTool('holomesh_contribute', args)).toMatchObject({ success: true, synced: 1 });
    standIn.mode = 'refuse';
    const refused = await handleHoloMeshTool('holomesh_contribute', args);
    expect(refused).toMatchObject({
      success: false,
      error: 'orchestrator_refused',
      orchestrator: { accepted: false, status: 403, reason: 'refused (HTTP 403)' },
    });
    expect(refused).not.toHaveProperty('entryId');
    expectNoLeak(refused);
  });
});