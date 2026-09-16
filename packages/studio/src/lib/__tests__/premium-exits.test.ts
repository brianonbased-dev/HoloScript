/**
 * Doors audit 2026-09-15 (rework of #299): Studio exits that hand out
 * knowledge rows.
 *
 * The stand-in upstream answers the way HoloMesh would answer a fully
 * entitled key (a founder key): whole premium text. That is the worst case
 * for a Studio route that calls upstream under Studio's own server key: none
 * of that belongs to the visitor, so a visitor who sent no key of its own must
 * see premium rows only as teasers. A visitor who sends its own key is judged
 * by HoloMesh's own gate, so its answer passes through unchanged.
 *
 * Every upstream call is answered by a stand-in fetch and the database by a
 * stand-in object; nothing leaves this process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const stand = vi.hoisted(() => {
  process.env.HOLOMESH_API_URL = 'https://mesh.test';
  process.env.HOLOMESH_API_KEY = 'dummy-studio-server-key';
  process.env.HOLOSCRIPT_API_KEY = 'dummy-studio-tool-key';
  delete process.env.GOLD_FOUNDER_KEY;

  const state = {
    rows: [] as Array<Record<string, unknown>>,
    inserted: [] as Array<Record<string, unknown>>,
    entryMissing: false,
    calls: [] as Array<{ url: string; auth: string | undefined }>,
  };

  type Chain = Record<string, unknown>;
  const chain = (result: () => unknown): Chain => {
    const handler: ProxyHandler<Chain> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve, reject);
        }
        return () => proxy;
      },
    };
    const proxy: Chain = new Proxy({}, handler);
    return proxy;
  };

  const db = {
    select: (fields?: unknown) =>
      chain(() => (fields ? [{ count: state.rows.length }] : state.rows)),
    insert: () => ({
      values: (values: Array<Record<string, unknown>>) => {
        state.inserted.push(...values);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };

  return { state, db };
});

vi.mock('../../db/client', () => ({ getDb: () => stand.db }));

/**
 * Every caller in this file is a visitor with no session — that is the whole
 * premise of the suite — so `requireAuth` answers the way it answers a signed-out
 * request.
 *
 * It has to be substituted rather than left alone: the real one reaches
 * `getServerSession`, which calls Next's `headers()`, which throws
 * "`headers` was called outside a request scope" when a route handler is invoked
 * directly instead of served. That throw is a property of calling handlers in a
 * test, not of the door — the door itself is proven in
 * `src/__tests__/api-fail-closed.test.ts`, which drives the real middleware.
 */
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api-auth')>()),
  requireAuth: async () =>
    NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
}));

import { fetchHoloMeshJson } from '../holomesh-proxy';
import { executeMCPTool } from '../brittney/MCPToolExecutor';
import { GET as feedGet } from '../../app/api/holomesh/feed/route';
import { GET as marketplaceGet } from '../../app/api/holomesh/marketplace/route';
import { GET as searchGet } from '../../app/api/holomesh/search/route';
import { GET as storefrontGet } from '../../app/api/holomesh/agent/[id]/storefront/route';
import { GET as entryGet } from '../../app/api/holomesh/entry/[id]/route';
import { GET as catalogGet } from '../../app/api/holomesh/knowledge/catalog/route';
import { GET as trendingGet } from '../../app/api/holomesh/marketplace/trending/route';
import { GET as exportGet } from '../../app/api/holomesh/team/[id]/export/route';
import { POST as syncPost } from '../../app/api/holomesh/marketplace/sync/route';
import { POST as purchasePost } from '../../app/api/holomesh/entry/[id]/purchase/route';

const PAID_TAIL = 'STUDIO-PAID-TAIL-NOBODY-READS-FREE';
const SHORT_SECRET = 'Studio short paid secret';
const FREE_TEXT = 'Free studio wisdom stays whole';

function upstreamRows(): Array<Record<string, unknown>> {
  return [
    {
      id: 'sp-long',
      type: 'gotcha',
      content: `${'Paid studio body. '.repeat(12)}${PAID_TAIL}`,
      price: 0.05,
      authorId: 'author-x',
      metadata: { title: `Title ${PAID_TAIL}` },
    },
    { id: 'sp-short', type: 'gotcha', content: SHORT_SECRET, metadata: { price: 0.05 } },
    { id: 'sp-flagged', type: 'wisdom', content: SHORT_SECRET, premium: true, price: 0 },
    { id: 'sf-free', type: 'wisdom', content: FREE_TEXT, price: 0 },
  ];
}

function cacheRow(id: string, content: string, premium: boolean): Record<string, unknown> {
  return {
    id,
    workspaceId: 'studio-ws',
    type: 'gotcha',
    content,
    authorId: 'author-x',
    authorName: 'author-x',
    domain: 'compilation',
    price: premium ? 5 : 0,
    premium,
    confidence: 90,
    tags: [],
    provenanceHash: null,
    queryCount: 0,
    reuseCount: 0,
    salesCount: 0,
    mcpCreatedAt: new Date('2026-09-15T00:00:00Z'),
    syncedAt: new Date('2026-09-15T00:00:00Z'),
  };
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function upstream(url: string, init?: RequestInit): Promise<Response> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  stand.state.calls.push({ url, auth: headers['Authorization'] ?? headers['x-mcp-api-key'] });
  if (url.includes('/knowledge/query')) return reply({ results: upstreamRows() });
  if (url.includes('/api/holomesh/entry/')) {
    if (stand.state.entryMissing) return reply({ error: 'not found' }, 404);
    return reply({ success: true, entry: upstreamRows()[0] });
  }
  if (url.includes('/api/holomesh/search')) return reply({ success: true, results: upstreamRows() });
  return reply({ success: true, entries: upstreamRows() });
}

function expectNoPaidText(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(PAID_TAIL);
  expect(text).not.toContain(SHORT_SECRET);
}

const visitor = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://studio.test${path}`, init);

beforeEach(() => {
  stand.state.rows = [];
  stand.state.inserted = [];
  stand.state.entryMissing = false;
  stand.state.calls = [];
  vi.stubGlobal('fetch', vi.fn(upstream));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Studio relays of HoloMesh answers (doors audit)', () => {
  it('fetchHoloMeshJson: a visitor with no key gets teasers; a visitor with its own key gets what HoloMesh gave it', async () => {
    const anonymous = await fetchHoloMeshJson('/api/holomesh/feed', visitor('/api/holomesh/feed'));
    expect(stand.state.calls.at(-1)?.auth).toBe('Bearer dummy-studio-server-key');
    expectNoPaidText(anonymous.data);
    expect(JSON.stringify(anonymous.data)).toContain(FREE_TEXT);

    const own = await fetchHoloMeshJson(
      '/api/holomesh/feed',
      visitor('/api/holomesh/feed', { headers: { authorization: 'Bearer visitor-own-key' } })
    );
    expect(stand.state.calls.at(-1)?.auth).toBe('Bearer visitor-own-key');
    expect(JSON.stringify(own.data)).toContain(PAID_TAIL);
  });

  it('feed, marketplace, search and storefront relays give a visitor with no key teasers only', async () => {
    const answers = [
      await feedGet(visitor('/api/holomesh/feed')),
      await marketplaceGet(visitor('/api/holomesh/marketplace')),
      await searchGet(visitor('/api/holomesh/search?q=paid')),
      await storefrontGet(visitor('/api/holomesh/agent/author-x/storefront'), {
        params: Promise.resolve({ id: 'author-x' }),
      }),
    ];
    for (const res of answers) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(JSON.stringify(body)).toContain('sp-short');
      expectNoPaidText(body);
    }

    // With the visitor's own key the relay passes HoloMesh's answer through.
    const own = await feedGet(
      visitor('/api/holomesh/feed', { headers: { authorization: 'Bearer visitor-own-key' } })
    );
    expect(JSON.stringify(await own.json())).toContain(PAID_TAIL);
  });

  it('GET /api/holomesh/entry/:id: the server-key answer and the cache fallback both give teasers', async () => {
    const live = await entryGet(visitor('/api/holomesh/entry/sp-long'), {
      params: Promise.resolve({ id: 'sp-long' }),
    });
    expect(live.status).toBe(200);
    const liveBody = await live.json();
    expect(JSON.stringify(liveBody)).toContain('sp-long');
    expectNoPaidText(liveBody);

    stand.state.entryMissing = true;
    stand.state.rows = [cacheRow('sp-short', SHORT_SECRET, true)];
    const cached = await entryGet(visitor('/api/holomesh/entry/sp-short'), {
      params: Promise.resolve({ id: 'sp-short' }),
    });
    const cachedBody = await cached.json();
    expect(cachedBody.source).toBe('db-cache');
    expectNoPaidText(cachedBody);
  });

  it('GET /api/holomesh/knowledge/catalog: cache rows and the live fallback give teasers', async () => {
    stand.state.rows = [cacheRow('sp-short', SHORT_SECRET, true), cacheRow('sf-free', FREE_TEXT, false)];
    const cached = await catalogGet(visitor('/api/holomesh/knowledge/catalog'));
    const cachedBody = await cached.json();
    expect(cachedBody.entries).toHaveLength(2);
    expect(JSON.stringify(cachedBody)).toContain(FREE_TEXT);
    expectNoPaidText(cachedBody);

    stand.state.rows = [];
    const live = await catalogGet(visitor('/api/holomesh/knowledge/catalog'));
    const liveBody = await live.json();
    expect(liveBody.source).toBe('mcp-live');
    expect(JSON.stringify(liveBody)).toContain('sp-short');
    expectNoPaidText(liveBody);
  });

  it('GET /api/holomesh/marketplace/trending and GET /api/holomesh/team/:id/export give teasers', async () => {
    const trending = await trendingGet(visitor('/api/holomesh/marketplace/trending'));
    const trendingBody = await trending.json();
    expect(trendingBody.success).toBe(true);
    expect(JSON.stringify(trendingBody)).toContain('sp-short');
    expectNoPaidText(trendingBody);

    const exported = await exportGet(visitor('/api/holomesh/team/team-1/export'), {
      params: Promise.resolve({ id: 'team-1' }),
    });
    const exportBody = await exported.json();
    expect(JSON.stringify(exportBody.knowledge)).toContain('sp-short');
    expectNoPaidText(exportBody);
  });

  it('POST /api/holomesh/entry/:id/purchase: an answer released to the server key reaches the visitor as a teaser', async () => {
    const params = { params: Promise.resolve({ id: 'sp-long' }) };
    const anonymous = await purchasePost(
      visitor('/api/holomesh/entry/sp-long/purchase', { method: 'POST', body: '{}' }),
      params
    );
    const anonymousBody = await anonymous.json();
    expect(JSON.stringify(anonymousBody)).toContain('sp-long');
    expectNoPaidText(anonymousBody);

    const own = await purchasePost(
      visitor('/api/holomesh/entry/sp-long/purchase', {
        method: 'POST',
        body: '{}',
        headers: { authorization: 'Bearer visitor-own-key' },
      }),
      { params: Promise.resolve({ id: 'sp-long' }) }
    );
    expect(JSON.stringify(await own.json())).toContain(PAID_TAIL);
  });

  it('POST /api/holomesh/marketplace/sync refuses a caller with no identity at all', async () => {
    // This assertion used to expect 200: an anonymous caller could spend our
    // mesh key upstream AND choose what landed in the cache that the catalog
    // and the entry GET fallback then serve to everyone else. A rate limit was
    // the only thing in front of it, and a rate limit caps how FAST a stranger
    // may do a thing, not whether they may.
    const res = await syncPost(
      visitor('/api/holomesh/marketplace/sync', { method: 'POST', body: '{}' })
    );

    expect(res.status).toBe(401);
    expect(stand.state.inserted).toHaveLength(0);
    // Nothing of ours went upstream on a stranger's behalf.
    expect(stand.state.calls).toHaveLength(0);
  });

  it("POST /api/holomesh/marketplace/sync still stores premium entries as teasers for a caller who may call it", async () => {
    // The premium guarantee this suite exists to prove, now exercised through
    // the door rather than around it: the caller runs under their OWN key.
    const res = await syncPost(
      visitor('/api/holomesh/marketplace/sync', {
        method: 'POST',
        body: '{}',
        headers: { 'x-mcp-api-key': 'visitor-own-key' },
      })
    );

    expect(res.status).toBe(200);
    expect(stand.state.inserted).toHaveLength(4);
    expect(JSON.stringify(stand.state.inserted)).toContain(FREE_TEXT);
    expectNoPaidText(stand.state.inserted);
  });
});

describe('Brittney knowledge_query (doors audit)', () => {
  it('outside the founder session premium rows reach the model as teasers', async () => {
    const result = await executeMCPTool('knowledge_query', { search: 'paid' }, {});
    expect(result.success).toBe(true);
    expect(stand.state.calls.at(-1)?.url).toContain('/knowledge/query');
    expect(JSON.stringify(result.data)).toContain('sp-short');
    expectNoPaidText(result.data);
  });

  it('the founder session keeps its full read (unchanged by this audit)', async () => {
    const result = await executeMCPTool(
      'knowledge_query',
      { search: 'paid' },
      { allowFounderWorkspace: true }
    );
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain(PAID_TAIL);
  });
});
