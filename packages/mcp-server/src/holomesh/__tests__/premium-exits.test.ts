/**
 * Doors audit 2026-09-15, round 3: premium entry text leaves the server only
 * to an entitled reader (the author, a founder key, or a recorded purchase),
 * through EVERY exit that returns knowledge lookup rows, not just
 * GET /api/holomesh/entry/:id. And a purchase is recorded only after a
 * verified payment, on every buy route.
 *
 * The REAL orchestrator client (no vi module replacement) talks HTTP to a
 * stand-in orchestrator on the loopback interface that answers
 * POST /knowledge/query with orchestrator-shaped rows (price and author
 * inside `metadata`, as production returns them). Live services are off
 * limits for this proof: the shell that runs tests here can carry the
 * founder's key, and probing production for leaks is not allowed.
 *
 * Safety: before any import this file points the orchestrator URL at the
 * loopback stand-in, replaces both client keys with dummy values and removes
 * the Moltbook key; beforeAll refuses to run unless the client URL is exactly
 * the stand-in.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';

const standIn = vi.hoisted(() => {
  const host = '127.0.0.1';
  const port = 40000 + Math.floor(Math.random() * 20000);
  const tmp = process.env.TEMP || process.env.TMPDIR || '/tmp';
  const dataDir = `${tmp}/holomesh-premium-exits-${process.pid}-${Date.now()}`;
  const baseUrl = `http://${host}:${port}`;
  process.env.MCP_ORCHESTRATOR_URL = baseUrl;
  process.env.HOLOMESH_API_KEY = 'dummy-route-client-key';
  process.env.HOLOSCRIPT_API_KEY = 'dummy-tool-client-key';
  delete process.env.MOLTBOOK_API_KEY;
  delete process.env.DATABASE_URL;
  process.env.HOLOMESH_DATA_DIR = dataDir;
  process.env.HOLOMESH_SIGNING_GRACE = '1';
  return {
    host,
    port,
    baseUrl,
    dataDir,
    rows: [] as Array<Record<string, unknown>>,
    requests: [] as string[],
  };
});

import * as fs from 'fs';
import { createServer, type Server } from 'http';
import { handleHoloMeshRoute } from '../http-routes';
import { keyRegistry, teamStore, paidAccessStore } from '../state';
import { handleHoloMeshTool, _resetHoloMeshClientForTests } from '../holomesh-tools';
import { DEFAULT_MESH_CONFIG, type Team } from '../types';

// ── Fixtures ──

const PAID_TAIL = 'THE-PAID-PART-NOBODY-READS-FREE';
const SHORT_SECRET = 'Short paid tip, entirely secret';
const FOUNDER_KEY = 'premium-exits-founder-key';

/** An orchestrator row: price/author live in metadata, as in production. */
function orchRow(
  id: string,
  content: string,
  opts: { price?: number; authorId?: string; type?: string; tags?: string[] } = {}
): Record<string, unknown> {
  const price = opts.price ?? 0.05;
  return {
    id,
    type: opts.type ?? 'gotcha',
    content,
    workspace_id: 'default',
    tags: opts.tags ?? [],
    created_at: new Date().toISOString(),
    metadata: {
      price,
      authorId: opts.authorId ?? 'someone-else',
      authorName: 'author',
      domain: 'compilation',
      provenanceHash: `hash-${id}`,
      // Author-written metadata on a priced entry must not carry its text out
      // either. Free rows get a plain title: they are meant to pass whole.
      title: price > 0 ? `Title with ${PAID_TAIL}` : 'Free entry title',
    },
  };
}

function longPremium(id: string, opts: Parameters<typeof orchRow>[2] = {}) {
  return orchRow(id, `${'Premium body text. '.repeat(12)}${PAID_TAIL}`, opts);
}

function shortPremium(id: string, opts: Parameters<typeof orchRow>[2] = {}) {
  return orchRow(id, SHORT_SECRET, opts);
}

function expectNoPremiumText(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(PAID_TAIL);
  expect(text).not.toContain(SHORT_SECRET);
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
    value: { remoteAddress: `premium-exits-${Math.random().toString(36).slice(2)}` },
  });
  // Emit after any async work that runs before the body parser attaches.
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

async function registerCaller(prefix: string): Promise<{ apiKey: string; id: string }> {
  const reply = await call('POST', '/api/holomesh/register', {
    name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });
  expect(reply.status).toBe(201);
  const agent = reply.body.agent as { api_key: string; id: string };
  return { apiKey: agent.api_key, id: agent.id };
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
      standIn.requests.push(`${req.method} ${req.url}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/knowledge/query') {
        res.end(JSON.stringify({ results: standIn.rows }));
        return;
      }
      res.end(JSON.stringify({ success: true, synced: 1, agents: [] }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(standIn.port, standIn.host, () => resolve());
  });
  keyRegistry.set(FOUNDER_KEY, {
    key: FOUNDER_KEY,
    walletAddress: '0x0000000000000000000000000000000000000001',
    agentId: 'agent_founder',
    agentName: 'Founder',
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: true,
  });
});

afterAll(async () => {
  keyRegistry.delete(FOUNDER_KEY);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(standIn.dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  standIn.rows = [];
  _resetHoloMeshClientForTests();
});

// ── HTTP exits ──

describe('premium text on HTTP exits (doors audit round 3)', () => {
  it('GET /search gives an anonymous caller only the teaser', async () => {
    standIn.rows = [longPremium('premium-s1'), shortPremium('premium-s2')];
    const reply = await call('GET', '/api/holomesh/search?q=premium');

    expect(reply.status).toBe(200);
    const results = reply.body.results as Array<{ locked?: boolean }>;
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.locked === true)).toBe(true);
    expectNoPremiumText(reply.body);
  });

  it('GET /search still gives the author their own premium text', async () => {
    const author = await registerCaller('search-author');
    standIn.rows = [longPremium('premium-s3', { authorId: author.id })];
    const reply = await call('GET', '/api/holomesh/search?q=premium', undefined, {
      authorization: `Bearer ${author.apiKey}`,
    });

    expect(reply.status).toBe(200);
    expect(JSON.stringify(reply.body)).toContain(PAID_TAIL);
  });

  it('a founder key reads a premium entry in full (GET /entry/:id)', async () => {
    standIn.rows = [longPremium('premium-f1')];
    const reply = await call('GET', '/api/holomesh/entry/premium-f1', undefined, {
      authorization: `Bearer ${FOUNDER_KEY}`,
    });

    expect(reply.status).toBe(200);
    expect((reply.body.entry as { access?: string }).access).toBe('founder');
    expect(JSON.stringify(reply.body)).toContain(PAID_TAIL);
  });

  it('POST /quickstart feed_preview is the public feed: teasers only, no raw dumps', async () => {
    standIn.rows = [
      longPremium('premium-q1'),
      shortPremium('premium-q2'),
      orchRow('raw-q3', 'RAW-OPERATIONAL-DUMP-LINE from a session', {
        price: 0,
        type: 'wisdom',
        tags: ['raw-dump'],
      }),
      orchRow('free-q4', 'Free public wisdom stays whole', { price: 0, type: 'wisdom' }),
    ];
    const reply = await call('POST', '/api/holomesh/quickstart', {
      name: `premium-quickstart-${Date.now()}`,
    });

    expect(reply.status).toBe(201);
    const preview = reply.body.feed_preview as Array<{ id: string; content: string }>;
    expect(preview.map((e) => e.id)).toEqual(['premium-q1', 'premium-q2', 'free-q4']);
    expect(preview.find((e) => e.id === 'free-q4')?.content).toBe('Free public wisdom stays whole');
    expectNoPremiumText(reply.body);
    expect(JSON.stringify(reply.body)).not.toContain('RAW-OPERATIONAL-DUMP-LINE');
  });

  it('GET /quickstart sample entries carry teasers only', async () => {
    standIn.rows = [longPremium('premium-g1'), shortPremium('premium-g2')];
    const reply = await call('GET', '/api/holomesh/quickstart');

    expect(reply.status).toBe(200);
    expect((reply.body.sample_entries as unknown[]).length).toBeGreaterThan(0);
    expectNoPremiumText(reply.body);
  });

  it.each([
    '/api/holomesh/feed',
    '/api/holomesh/onboard',
    '/api/holomesh/showcase/film3d',
    '/api/holomesh/leaderboard',
  ])('anonymous %s never carries premium text, short entries included', async (path) => {
    standIn.rows = [
      longPremium('premium-a1', { tags: ['film3d'] }),
      shortPremium('premium-a2', { tags: ['film3d'] }),
    ];
    const reply = await call('GET', path);

    expect(reply.status).toBe(200);
    expect(JSON.stringify(reply.body)).toContain('premium-a2');
    expectNoPremiumText(reply.body);
  });

  it('Brittney review, compile-gate and cultural-context never quote premium text to a caller who did not pay', async () => {
    const { apiKey } = await registerCaller('brittney-bot');
    standIn.rows = [
      longPremium('premium-b1', { type: 'wisdom' }),
      shortPremium('premium-b2', { type: 'gotcha' }),
      shortPremium('premium-b3', { type: 'wisdom' }),
    ];
    for (const path of [
      '/api/holomesh/brittney/review',
      '/api/holomesh/brittney/compile-gate',
      '/api/holomesh/brittney/cultural-context',
    ]) {
      const reply = await call(
        'POST',
        path,
        { source: 'object Foo { position: [0, 0, 0] }', target: 'r3f' },
        { authorization: `Bearer ${apiKey}` }
      );
      expect(reply.status).toBe(200);
      expectNoPremiumText(reply.body);
    }
  });

  it("POST /knowledge/promote refuses to re-publish someone else's premium entry", async () => {
    const { apiKey } = await registerCaller('promote-bot');
    standIn.rows = [longPremium('premium-p1')];
    const writesBefore = standIn.requests.filter((r) => r === 'POST /knowledge').length;

    const reply = await call(
      'POST',
      '/api/holomesh/knowledge/promote',
      { entry_id: 'premium-p1', price: 0 },
      { authorization: `Bearer ${apiKey}` }
    );

    expect(reply.status).toBe(403);
    expect(reply.body.error).toBe('premium-entry-author-only');
    expect(standIn.requests.filter((r) => r === 'POST /knowledge').length).toBe(writesBefore);
  });

  it('POST /marketplace/buy records no purchase without a verified payment', async () => {
    const author = await registerCaller('mkt-author');
    const buyer = await registerCaller('mkt-buyer');

    const created = await call(
      'POST',
      '/api/holomesh/team',
      { name: `mkt-team-${Date.now()}` },
      { authorization: `Bearer ${FOUNDER_KEY}` }
    );
    expect(created.status).toBe(201);
    const tid = (created.body.team as { id: string }).id;
    const team = teamStore.get(tid);
    expect(team).toBeDefined();
    for (const member of [author, buyer]) {
      const joined: Team['members'][number] = {
        agentId: member.id,
        agentName: member.id,
        role: 'member',
        joinedAt: new Date().toISOString(),
      };
      team!.members.push(joined);
    }
    teamStore.set(tid, team!);

    standIn.rows = [longPremium('premium-m1', { authorId: author.id })];
    const listed = await call(
      'POST',
      '/api/holomesh/marketplace/list',
      { teamId: tid, entryId: 'premium-m1', price: 0.05 },
      { authorization: `Bearer ${author.apiKey}` }
    );
    expect(listed.status).toBe(201);
    const listing = listed.body.listing as { listingId?: string; id?: string };
    const listingId = listing.listingId ?? listing.id ?? '';
    expect(listingId).toBeTruthy();

    for (const headers of [
      { authorization: `Bearer ${buyer.apiKey}` },
      {
        authorization: `Bearer ${buyer.apiKey}`,
        'x-payment': 'eyJhbGciOiJFUzI1NiJ9.forged-but-long-enough-payment',
      },
    ]) {
      const bought = await call(
        'POST',
        '/api/holomesh/marketplace/buy',
        { teamId: tid, listingId },
        headers
      );
      expect(bought.status).toBe(402);
      expect(['x402-payment-missing', 'x402-verification-unavailable']).toContain(bought.body.code);
    }
    const flagged = await call(
      'POST',
      '/api/holomesh/marketplace/buy',
      { teamId: tid, listingId, paid: true },
      { authorization: `Bearer ${buyer.apiKey}` }
    );
    expect(flagged.status).toBe(402);

    // The refused buys changed nothing: no purchase record, still for sale,
    // and the entry is still closed to the buyer.
    expect(paidAccessStore.has(`${buyer.id}:premium-m1`)).toBe(false);
    const stored = teamStore.get(tid) as unknown as {
      knowledgeMarketplace: { getListing(id: string): { status: string } | undefined };
    };
    expect(stored.knowledgeMarketplace.getListing(listingId)?.status).toBe('active');
    const read = await call('GET', '/api/holomesh/entry/premium-m1', undefined, {
      authorization: `Bearer ${buyer.apiKey}`,
    });
    expect(read.status).toBe(402);
    expectNoPremiumText(read.body);
  });
});

// ── MCP tool exits ──
// `__authAgentId` is what handlers.ts stamps from the verified signer (it
// deletes any caller-supplied value first); these tests pass it directly.

describe('premium text on MCP HoloMesh tools (doors audit round 3)', () => {
  it('holomesh_query gives an anonymous caller only the teaser, without metadata', async () => {
    standIn.rows = [longPremium('premium-t1'), shortPremium('premium-t1b')];
    const result = (await handleHoloMeshTool('holomesh_query', { search: 'paid' })) as {
      results: Array<{ locked?: boolean }>;
    };

    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.locked === true)).toBe(true);
    expectNoPremiumText(result);
  });

  it('holomesh_query gives the author their full text', async () => {
    standIn.rows = [longPremium('premium-t2', { authorId: 'author-agent' })];
    const result = await handleHoloMeshTool('holomesh_query', {
      search: 'paid',
      __authAgentId: 'author-agent',
    });

    expect(JSON.stringify(result)).toContain(PAID_TAIL);
  });

  it('holomesh_query opens for a recorded purchase, not for any signed caller', async () => {
    standIn.rows = [longPremium('premium-t3')];
    const before = await handleHoloMeshTool('holomesh_query', {
      search: 'paid',
      __authAgentId: 'buyer-agent',
    });
    expect(JSON.stringify(before)).not.toContain(PAID_TAIL);

    paidAccessStore.add('buyer-agent:premium-t3');
    try {
      const after = await handleHoloMeshTool('holomesh_query', {
        search: 'paid',
        __authAgentId: 'buyer-agent',
      });
      expect(JSON.stringify(after)).toContain(PAID_TAIL);
    } finally {
      paidAccessStore.delete('buyer-agent:premium-t3');
    }
  });

  it('holomesh_collect returns no premium text and claims no payment', async () => {
    standIn.rows = [longPremium('premium-t4')];
    const result = (await handleHoloMeshTool('holomesh_collect', {
      contentHash: 'hash-premium-t4',
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.code).toBe('x402-payment-required');
    expect(String(result.message)).not.toMatch(/queued/i);
    expectNoPremiumText(result);
  });

  it('holomesh_crosspost_moltbook refuses a premium entry for anyone but its author', async () => {
    standIn.rows = [longPremium('premium-t5', { authorId: 'author-agent' })];

    for (const args of [
      { entry_id: 'premium-t5', __authAgentId: 'buyer-agent' },
      { entry_id: 'premium-t5' },
    ]) {
      const refused = (await handleHoloMeshTool('holomesh_crosspost_moltbook', args)) as Record<
        string,
        unknown
      >;
      expect(refused.error).toBe('premium-entry-author-only');
    }

    // Positive control: the author passes the premium check and stops only at
    // the missing Moltbook key (removed for this file, so nothing is posted).
    const author = (await handleHoloMeshTool('holomesh_crosspost_moltbook', {
      entry_id: 'premium-t5',
      __authAgentId: 'author-agent',
    })) as Record<string, unknown>;
    expect(String(author.error)).toContain('MOLTBOOK_API_KEY not configured');
  });
});
