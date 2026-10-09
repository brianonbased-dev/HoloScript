/**
 * Holes next to the #531 route scopes (board task zeoq), driven through the REAL http-server.ts
 * over real HTTP:
 *
 *  - POST /api/publish wrote protocol records and metadata with no token at all;
 *  - POST /api/publish and POST /api/protocol let any writer replace another account's record for
 *    the same content hash (a probe overwrote author and price);
 *  - the owner stamped to stop that was then served by every public read, and an OAuth client id
 *    is close to a credential for a public client;
 *  - POST /api/protocol trusted the caller's contentHash, so a writer could pre-claim the hash of
 *    code they did not have, and spread the whole body into the record (sceneUrl, editionCount);
 *  - POST /api/protocol/metadata let any writer replace any hash's metadata;
 *  - an operator key replaced any record without saying so, and relays hold one: Studio publishes
 *    every signed-in user under its server key, so any of them could rewrite any account's record;
 *  - a non-text `source` or `code` beside a matching one was stored unchecked;
 *  - metadata pre-claimed before a record stayed served beside the real author's record;
 *  - the 409 did not tell an author how to get their hash back;
 *  - refusals left no audit entry;
 *  - POST /api/credits/check returned the balance of whatever user the body named, to any token;
 *  - POST /api/collect/:hash took any quantity (negative, fractional, a string) into editionCount.
 *
 * (Crosspost's operator scope is in http-route-write-scopes.test.ts; the GitHub token shape check
 * is a unit test, security/__tests__/github-token-shape.test.ts; the record rules alone are
 * security/__tests__/protocol-records.test.ts.)
 */

import { createHash } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
  type Reply,
} from './real-http-server-harness';

let server: RealHttpServer;
/** A read-only client, and two writers from two registered clients: two different principals. */
let reader = { token: '', clientId: '' };
let alice = { token: '', clientId: '' };
let mallory = { token: '', clientId: '' };

beforeAll(async () => {
  server = await bootRealHttpServer({ sandboxPrefix: 'mcp-publish-ownership-' });
  reader = await server.clientWithScope('tools:read');
  // Dynamic clients ask for the public name tools:execute; oauth21 expandScopes makes it tools:write.
  alice = await server.clientWithScope('tools:execute');
  mallory = await server.clientWithScope('tools:execute');
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

let counter = 0;
/** Fresh code per test, so no test sees another's record. */
function uniqueCode(label: string): string {
  counter += 1;
  return `object Orb_${label}_${Date.now()}_${counter} { @glowing position: [0, 2, 0] }`;
}
const hashOf = (code: string) => createHash('sha256').update(code).digest('hex');

function expectRefusedForScope(reply: Reply, required: string[]): void {
  expect(reply.status, JSON.stringify(reply.body)).toBe(403);
  expect(reply.body.error).toBe('insufficient_scope');
  expect(reply.body.required).toEqual(required);
  expect(String(reply.headers?.['www-authenticate'])).toContain('error="insufficient_scope"');
}

function expectPastTheGate(reply: Reply): void {
  expect(reply.status, JSON.stringify(reply.body)).not.toBe(401);
  expect(reply.status, JSON.stringify(reply.body)).not.toBe(403);
}

/** A 409 tells an author whose code someone else published how to get the hash back. */
function expectTellsTheWayBack(reply: Reply): void {
  const message = String(reply.body.message);
  expect(message).toContain('an operator (tools:admin) can reassign the hash to you');
  expect(message).toContain('docs/api/REST_EXAMPLES.md');
}

async function record(hash: string): Promise<Reply> {
  return server.request('GET', `/api/protocol/${hash}`);
}

/** POST /api/protocol the way Studio does: the hash, the content as source and code, the rest. */
async function protocolPublish(
  token: string,
  code: string,
  extra: Record<string, unknown> = {}
): Promise<Reply> {
  return server.request('POST', '/api/protocol', {
    token,
    body: { contentHash: hashOf(code), source: code, code, ...extra },
  });
}

async function publish(token: string, code: string, extra: Record<string, unknown> = {}) {
  return server.request('POST', '/api/publish', { token, body: { code, ...extra } });
}

type AuditEntry = {
  event: string;
  agent: { clientId?: string; agentId?: string; ipHash?: string };
  security?: { requiredScopes?: string[]; deniedAtGate?: number };
  request?: { path?: string; method?: string };
  metadata?: { reason?: string; principal?: string; contentHash?: string };
};

async function auditEntries(event: string): Promise<AuditEntry[]> {
  const audit = await server.request('GET', `/api/audit?event=${event}&limit=5000`, {
    token: REAL_SERVER_ADMIN_KEY,
  });
  expect(audit.status, JSON.stringify(audit.body)).toBe(200);
  return audit.body.entries as AuditEntry[];
}

describe('POST /api/publish needs a write token, like POST /api/protocol', () => {
  it('no token: 401 with the same WWW-Authenticate, an audit entry, and nothing stored', async () => {
    const code = uniqueCode('anon');
    const reply = await server.request('POST', '/api/publish', {
      body: { code, author: 'anyone', price: '5' },
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(401);
    expect(String(reply.headers?.['www-authenticate'])).toBe(
      'Bearer realm="holoscript-mcp", error="invalid_token"'
    );
    expect(reply.body.registration_endpoint).toBe('/oauth/register');
    expect((await record(hashOf(code))).status).toBe(404);

    const reasons = (await auditEntries('auth_failure')).map((e) => e.metadata?.reason);
    expect(reasons).toContain('/api/publish publish - invalid credentials');
  });

  it('a token that is not one: 401, nothing stored', async () => {
    const code = uniqueCode('bad');
    const reply = await publish('not-a-real-token', code);
    expect(reply.status).toBe(401);
    expect((await record(hashOf(code))).status).toBe(404);
  });

  it('a read token: 403 insufficient_scope, nothing stored', async () => {
    const code = uniqueCode('read');
    expectRefusedForScope(await publish(reader.token, code), ['tools:write']);
    expect((await record(hashOf(code))).status).toBe(404);
  });

  it('a write token publishes, and the record is stored under the code hash', async () => {
    const code = uniqueCode('write');
    const reply = await publish(alice.token, code, { author: 'alice' });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect(reply.body.contentHash).toBe(hashOf(code));
    const stored = await record(hashOf(code));
    expect(stored.status).toBe(200);
    expect(stored.body.author).toBe('alice');
  });
});

describe('no public read says who published a hash', () => {
  it('records, author listings, metadata, revenue, extract and the 409 never carry the owner', async () => {
    const author = `alice-reads-${Date.now()}`;
    const viaPublish = uniqueCode('read-publish');
    const viaProtocol = uniqueCode('read-protocol');
    const metadataOnly = hashOf(uniqueCode('read-metadata'));

    expect((await publish(alice.token, viaPublish, { author, price: '0' })).status).toBe(201);
    expect((await protocolPublish(alice.token, viaProtocol, { author })).status).toBe(201);
    const meta = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash: metadataOnly, author } },
    });
    expect(meta.status, JSON.stringify(meta.body)).toBe(201);
    // Mallory's refused takeover: its 409 body is public to the refused caller, too.
    const takeover = await publish(mallory.token, viaPublish, { author: 'mallory' });
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(409);

    const reads: Array<[string, Reply]> = [
      ['GET record (publish)', await record(hashOf(viaPublish))],
      ['GET record (protocol)', await record(hashOf(viaProtocol))],
      [
        'GET author listing',
        await server.request('GET', `/api/protocol/author/${encodeURIComponent(author)}`),
      ],
      ['GET metadata (publish)', await server.request('GET', `/metadata/${hashOf(viaPublish)}`)],
      ['GET metadata (metadata only)', await server.request('GET', `/metadata/${metadataOnly}`)],
      ['GET revenue', await server.request('GET', `/api/protocol/revenue/${hashOf(viaPublish)}`)],
      [
        'POST extract',
        await server.request('POST', '/api/extract', { body: { code: viaPublish } }),
      ],
      ['409 body', takeover],
    ];
    for (const [name, reply] of reads) {
      const text = JSON.stringify(reply.body);
      expect(reply.status, `${name}: ${text}`).toBeLessThan(500);
      expect(text, name).not.toContain('publisherPrincipal');
      expect(text, name).not.toContain(alice.clientId);
    }
    // The reads were real: the listing found both records, the extract found the hash.
    expect(reads[2][1].body).toHaveLength(2);
    expect(reads[6][1].body.alreadyPublished).toBe(true);
  });
});

describe('a caller who is not an operator claims a hash only with the content', () => {
  it('a bare hash is refused (400 content_required) and nothing is stored', async () => {
    const hash = hashOf(uniqueCode('bare'));
    const reply = await server.request('POST', '/api/protocol', {
      token: mallory.token,
      body: { contentHash: hash, author: 'squatter', price: '999' },
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(400);
    expect(reply.body.error).toBe('content_required');
    expect((await record(hash)).status).toBe(404);
  });

  it('content that does not hash to contentHash is refused (400 content_hash_mismatch)', async () => {
    const claimed = hashOf(uniqueCode('claimed'));
    const other = uniqueCode('other');
    for (const body of [
      { contentHash: claimed, source: other },
      { contentHash: claimed, code: other },
      // Every content field sent must match, not just one of them.
      { contentHash: hashOf(other), code: other, source: uniqueCode('mismatched-source') },
    ]) {
      const reply = await server.request('POST', '/api/protocol', {
        token: mallory.token,
        body: { ...body, author: 'squatter' },
      });
      expect(reply.status, JSON.stringify(reply.body)).toBe(400);
      expect(reply.body.error).toBe('content_hash_mismatch');
      expect((await record(body.contentHash)).status).toBe(404);
    }
  });

  it('a squatter cannot lock the real author out of their own code', async () => {
    const code = uniqueCode('template');
    const squat = await server.request('POST', '/api/protocol', {
      token: mallory.token,
      body: { contentHash: hashOf(code), author: 'squatter', price: '999' },
    });
    expect(squat.status, JSON.stringify(squat.body)).toBe(400);
    const author = await publish(alice.token, code, { author: 'alice' });
    expect(author.status, JSON.stringify(author.body)).toBe(201);
    expect((await record(hashOf(code))).body.author).toBe('alice');
  });

  it('a source or code that is not text is refused, even beside one that proves the hash', async () => {
    const code = uniqueCode('not-text');
    for (const content of [
      { source: { injected: 'never checked' }, code },
      { source: null, code },
      { source: code, code: ['alt', 'content'] },
      { source: code, code: 42 },
    ]) {
      const reply = await server.request('POST', '/api/protocol', {
        token: mallory.token,
        body: { contentHash: hashOf(code), author: 'mallory', ...content },
      });
      expect(reply.status, JSON.stringify(reply.body)).toBe(400);
      expect(reply.body.error).toBe('content_not_text');
      expect((await record(hashOf(code))).status).toBe(404);
    }
    // The same content sent as text is accepted.
    expect((await protocolPublish(alice.token, code)).status).toBe(201);
  });

  it("the content's hash as sent and core's line-end-normalised hash both prove it", async () => {
    const crlf = `object Crlf_${Date.now()} {\r\n  @glowing\r\n}\r\n`;
    const asCoreHashesIt = hashOf(crlf.replace(/\r\n/g, '\n'));
    const normalised = await server.request('POST', '/api/protocol', {
      token: alice.token,
      body: { contentHash: asCoreHashesIt, code: crlf, author: 'alice' },
    });
    expect(normalised.status, JSON.stringify(normalised.body)).toBe(201);
    const asSent = uniqueCode('as-sent');
    expect((await protocolPublish(alice.token, asSent)).status).toBe(201);
  });

  it('an operator still registers a bare hash, as the protocol tools and broker do', async () => {
    const hash = `operator-bare-${Date.now()}`;
    const reply = await server.request('POST', '/api/protocol', {
      token: REAL_SERVER_ADMIN_KEY,
      body: { contentHash: hash, author: 'broker' },
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect((await record(hash)).body.author).toBe('broker');
  });
});

describe('a published content hash belongs to its publisher', () => {
  it('/api/publish: the publisher republishes; another writer gets 409 and nothing changes', async () => {
    const code = uniqueCode('own-publish');
    const hash = hashOf(code);
    expect((await publish(alice.token, code, { author: 'alice', price: '0' })).status).toBe(201);

    const again = await publish(alice.token, code, {
      author: 'alice',
      price: '0',
      title: 'same code, new title',
    });
    expect(again.status, JSON.stringify(again.body)).toBe(201);

    const takeover = await publish(mallory.token, code, { author: 'mallory', price: '999' });
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(409);
    expect(takeover.body.error).toBe('already_published');
    expect(takeover.body.contentHash).toBe(hash);
    expectTellsTheWayBack(takeover);

    const after = (await record(hash)).body;
    expect(after.author).toBe('alice');
    expect(after.price).toBe('0');
    const meta = await server.request('GET', `/metadata/${hash}`);
    expect((meta.body.provenance as { author?: string }).author).toBe('alice');
  });

  it('/api/protocol: same rule, and the body cannot name a publisher', async () => {
    const code = uniqueCode('own-protocol');
    const hash = hashOf(code);
    expect((await protocolPublish(alice.token, code, { author: 'alice', price: '0' })).status).toBe(
      201
    );
    const again = await protocolPublish(alice.token, code, { author: 'alice', title: 'again' });
    expect(again.status, JSON.stringify(again.body)).toBe(201);

    const takeover = await protocolPublish(mallory.token, code, {
      author: 'mallory',
      price: '999',
      publisherPrincipal: mallory.clientId,
    });
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(409);
    expect(takeover.body.error).toBe('already_published');
    const after = (await record(hash)).body;
    expect(after.author).toBe('alice');
    expect(after.title).toBe('again');

    // A new hash with someone else's principal in the body still belongs to its writer.
    const own = uniqueCode('mallory-own');
    expect(
      (await protocolPublish(mallory.token, own, { publisherPrincipal: alice.clientId })).status
    ).toBe(201);
    expect((await protocolPublish(alice.token, own, { author: 'alice' })).status).toBe(409);
    expect((await protocolPublish(mallory.token, own, { author: 'mallory' })).status).toBe(201);
  });

  it('the two routes share one registry: a hash published on one is guarded on the other', async () => {
    const code = uniqueCode('cross');
    expect((await publish(alice.token, code)).status).toBe(201);
    const takeover = await protocolPublish(mallory.token, code, { author: 'mallory' });
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(409);
  });

  it("an operator replaces another account's record only when it says so; the owner stays", async () => {
    const code = uniqueCode('operator');
    const hash = hashOf(code);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);

    const unasked = await publish(REAL_SERVER_ADMIN_KEY, code, { author: 'alice (moderated)' });
    expect(unasked.status, JSON.stringify(unasked.body)).toBe(409);
    expect(unasked.body.error).toBe('already_published');
    expect((await record(hash)).body.author).toBe('alice');

    const replaced = await publish(REAL_SERVER_ADMIN_KEY, code, {
      author: 'alice (moderated)',
      replaceOwned: true,
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(201);
    expect((await record(hash)).body.author).toBe('alice (moderated)');

    expect((await publish(mallory.token, code, { author: 'mallory' })).status).toBe(409);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);
  });
});

describe('an operator can give a hash to another principal, or to nobody', () => {
  it('publisherPrincipal from an operator reassigns the hash; from anyone else it is ignored', async () => {
    const code = uniqueCode('reassign');
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);

    const given = await protocolPublish(REAL_SERVER_ADMIN_KEY, code, {
      author: 'moderated',
      publisherPrincipal: mallory.clientId,
    });
    expect(given.status, JSON.stringify(given.body)).toBe(201);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(409);
    expect((await protocolPublish(mallory.token, code, { author: 'mallory' })).status).toBe(201);
  });

  it('publisherPrincipal: null leaves the hash with nobody, so only operators may write it', async () => {
    const code = uniqueCode('cleared');
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);
    const cleared = await publish(REAL_SERVER_ADMIN_KEY, code, {
      author: 'taken down',
      publisherPrincipal: null,
    });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(201);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(409);
    expect((await publish(mallory.token, code, { author: 'mallory' })).status).toBe(409);
    // Operators too must say so: an operator key is also what relays hold.
    expect((await publish(REAL_SERVER_ADMIN_KEY, code, { author: 'relayed' })).status).toBe(409);
    expect(
      (await publish(REAL_SERVER_ADMIN_KEY, code, { author: 'restored', replaceOwned: true }))
        .status
    ).toBe(201);
    expect((await record(hashOf(code))).body.author).toBe('restored');
  });

  it('an operator naming no principal sensibly is refused with 400 and nothing changes', async () => {
    const code = uniqueCode('bad-principal');
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);
    for (const publisherPrincipal of [42, '', '   ', { id: 'x' }]) {
      const reply = await protocolPublish(REAL_SERVER_ADMIN_KEY, code, {
        author: 'operator',
        publisherPrincipal,
      });
      expect(reply.status, JSON.stringify(reply.body)).toBe(400);
      expect(reply.body.error).toBe('invalid_publisher_principal');
    }
    expect((await record(hashOf(code))).body.author).toBe('alice');
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);
  });
});

describe("a relay holding the operator key cannot overwrite another account's record", () => {
  // Studio publishes every signed-in user under its one server key (studio app/api/publish
  // route.ts), and holo_protocol_publish and the secrets broker use the server's key too. So an
  // operator key is not, by itself, an operator meaning to replace someone's record.
  //
  // The owner here is a TENANT key, the kind a Studio user sends as their own key. The server
  // looks tenant keys up in Postgres or Upstash Redis (security/tenant-auth.ts); the test serves
  // the Upstash REST lookup on loopback, the one store reachable without a database.
  const UPSTASH_TOKEN = 'loopback-upstash-test-token';
  const TENANT_KEY = 'studio_tenant_key_for_ownership_test_0001';
  const TENANT_PRINCIPAL = 'agent_tenant_studio_owner';
  let upstash: http.Server;

  beforeAll(async () => {
    upstash = http.createServer((req, res) => {
      const asked = decodeURIComponent((req.url ?? '').replace(/^\/get\/apikey:/, ''));
      const known = req.headers.authorization === `Bearer ${UPSTASH_TOKEN}` && asked === TENANT_KEY;
      const tenant = {
        tenantId: 'tenant_studio_owner',
        subscriptionTier: 'pro',
        limits: {
          maxVideoDurationSec: 60,
          maxMediaResolution: 1024,
          allowProcessExec: false,
          rateLimitRequestsPerMin: 600,
        },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: known ? JSON.stringify(tenant) : null }));
    });
    await new Promise<void>((resolve) => upstash.listen(0, '127.0.0.1', () => resolve()));
    process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(upstash.address() as AddressInfo).port}`;
    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
  });

  afterAll(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await new Promise<void>((resolve) => upstash.close(() => resolve()));
  });

  /** The body Studio's publishToProtocol builds, field for field. */
  function studioBody(code: string, author: string, price: string): Record<string, unknown> {
    return {
      contentHash: hashOf(code),
      author,
      importHashes: [],
      license: 'free',
      publishMode: 'studio',
      price,
      source: code,
      code,
      title: 'Studio scene',
      description: 'published from Studio',
    };
  }

  /** POST /api/protocol with the key in x-mcp-api-key, the one header Studio sends. */
  async function viaStudio(key: string, body: Record<string, unknown>): Promise<Reply> {
    return server.request('POST', '/api/protocol', { headers: { 'x-mcp-api-key': key }, body });
  }

  it('the tenant key is a real principal that is not an operator', async () => {
    const bare = await viaStudio(TENANT_KEY, { contentHash: hashOf(uniqueCode('tenant-bare')) });
    expect(bare.status, JSON.stringify(bare.body)).toBe(400);
    expect(bare.body.error).toBe('content_required');
    const code = uniqueCode('tenant-own');
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant', '0'))).status).toBe(201);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(409);
  });

  it("a signed-in Studio publish under the server key gets 409 on a tenant's code; nothing changes", async () => {
    const code = uniqueCode('tenant-owned');
    const hash = hashOf(code);
    const owned = await viaStudio(TENANT_KEY, studioBody(code, 'tenant-owner', '0'));
    expect(owned.status, JSON.stringify(owned.body)).toBe(201);

    const before = (await auditEntries('ownership_refused')).length;
    const relay = await viaStudio(
      REAL_SERVER_ADMIN_KEY,
      studioBody(code, 'signed-in-stranger', '999')
    );
    expect(relay.status, JSON.stringify(relay.body)).toBe(409);
    expect(relay.body.error).toBe('already_published');
    expectTellsTheWayBack(relay);

    const after = (await record(hash)).body;
    expect(after.author).toBe('tenant-owner');
    expect(after.price).toBe('0');
    const revenue = await server.request('GET', `/api/protocol/revenue/${hash}`);
    expect(JSON.stringify(revenue.body)).not.toContain('signed-in-stranger');

    const audited = await auditEntries('ownership_refused');
    expect(audited.length).toBe(before + 1);
    const entry = audited.find((e) => e.metadata?.contentHash === hash);
    expect(entry?.metadata?.principal).toBe('legacy-api-key');
    expect(entry?.request?.path).toBe('/api/protocol');
    expect(JSON.stringify(audited)).not.toContain(REAL_SERVER_ADMIN_KEY);

    // The tenant still owns it.
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant-owner', '1'))).status).toBe(201);
  });

  it("holo_protocol_publish's body under the server key gets the same 409, metadata too", async () => {
    const code = uniqueCode('tenant-owned-tool');
    const hash = hashOf(code);
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant-owner', '0'))).status).toBe(201);
    const meta = await server.request('POST', '/api/protocol/metadata', {
      headers: { 'x-mcp-api-key': REAL_SERVER_ADMIN_KEY },
      body: { contentHash: hash, provenance: { hash, author: 'tool-caller' } },
    });
    expect(meta.status, JSON.stringify(meta.body)).toBe(409);
    const tool = await viaStudio(REAL_SERVER_ADMIN_KEY, {
      contentHash: hash,
      author: 'tool-caller',
      importHashes: [],
      license: 'free',
      publishMode: 'original',
      price: '5',
      referralBps: 250,
      metadataURI: `http://localhost/metadata/${hash}`,
      mintAsNFT: false,
      code,
      title: 'MCP Published: tool-caller',
      description: 'Published via MCP protocol tool',
    });
    expect(tool.status, JSON.stringify(tool.body)).toBe(409);
    expect((await record(hash)).body.author).toBe('tenant-owner');
  });

  it('the server key still republishes what it owns; a cleared hash needs replaceOwned', async () => {
    const own = uniqueCode('server-owned');
    expect((await viaStudio(REAL_SERVER_ADMIN_KEY, studioBody(own, 'user-1', '0'))).status).toBe(
      201
    );
    expect((await viaStudio(REAL_SERVER_ADMIN_KEY, studioBody(own, 'user-1', '2'))).status).toBe(
      201
    );

    const cleared = uniqueCode('cleared-by-operator');
    expect((await viaStudio(TENANT_KEY, studioBody(cleared, 'tenant', '0'))).status).toBe(201);
    const takenDown = await viaStudio(REAL_SERVER_ADMIN_KEY, {
      ...studioBody(cleared, 'taken down', '0'),
      publisherPrincipal: null,
    });
    expect(takenDown.status, JSON.stringify(takenDown.body)).toBe(201);
    // A Studio-shaped body (no flag) cannot reach the hash the operator cleared.
    expect(
      (await viaStudio(REAL_SERVER_ADMIN_KEY, studioBody(cleared, 'relayed', '0'))).status
    ).toBe(409);
    expect((await record(hashOf(cleared))).body.author).toBe('taken down');
    expect(
      (
        await viaStudio(REAL_SERVER_ADMIN_KEY, {
          ...studioBody(cleared, 'restored', '0'),
          replaceOwned: true,
        })
      ).status
    ).toBe(201);
    expect((await record(hashOf(cleared))).body.author).toBe('restored');
  });

  it('an operator who means it says so: replaceOwned keeps the owner, publisherPrincipal moves it', async () => {
    const code = uniqueCode('moderated');
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant', '0'))).status).toBe(201);
    const moderated = await viaStudio(REAL_SERVER_ADMIN_KEY, {
      ...studioBody(code, 'tenant (moderated)', '0'),
      replaceOwned: true,
    });
    expect(moderated.status, JSON.stringify(moderated.body)).toBe(201);
    expect((await record(hashOf(code))).body.author).toBe('tenant (moderated)');
    expect((await record(hashOf(code))).body.replaceOwned).toBeUndefined();
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant', '0'))).status).toBe(201);

    const reassigned = await viaStudio(REAL_SERVER_ADMIN_KEY, {
      ...studioBody(code, 'alice', '0'),
      publisherPrincipal: alice.clientId,
    });
    expect(reassigned.status, JSON.stringify(reassigned.body)).toBe(201);
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant', '0'))).status).toBe(409);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);

    // Handed back by the tenant's principal (agent_<tenantId>), the tenant's key owns it again.
    const back = await viaStudio(REAL_SERVER_ADMIN_KEY, {
      ...studioBody(code, 'tenant', '0'),
      publisherPrincipal: TENANT_PRINCIPAL,
    });
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    expect((await viaStudio(TENANT_KEY, studioBody(code, 'tenant', '0'))).status).toBe(201);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(409);
  });
});

describe('POST /api/protocol/metadata follows the owner of its hash', () => {
  it("a record's metadata is written by its owner or an operator; anyone else gets 409", async () => {
    const code = uniqueCode('meta-owned');
    const hash = hashOf(code);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);

    const takeover = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash, author: 'mallory' } },
    });
    expect(takeover.status, JSON.stringify(takeover.body)).toBe(409);
    expect(takeover.body.error).toBe('already_published');
    const meta = await server.request('GET', `/metadata/${hash}`);
    expect((meta.body.provenance as { author?: string }).author).toBe('alice');

    const own = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash, author: 'alice' } },
    });
    expect(own.status, JSON.stringify(own.body)).toBe(201);

    // An operator writes over the record owner's metadata only when it says so, as on the record.
    const unasked = await server.request('POST', '/api/protocol/metadata', {
      token: REAL_SERVER_ADMIN_KEY,
      body: { provenance: { hash, author: 'operator' } },
    });
    expect(unasked.status, JSON.stringify(unasked.body)).toBe(409);
    const onPurpose = await server.request('POST', '/api/protocol/metadata', {
      token: REAL_SERVER_ADMIN_KEY,
      body: { provenance: { hash, author: 'alice (moderated)' }, replaceOwned: true },
    });
    expect(onPurpose.status, JSON.stringify(onPurpose.body)).toBe(201);
    const served = (await server.request('GET', `/metadata/${hash}`)).body;
    expect((served.provenance as { author?: string }).author).toBe('alice (moderated)');
    expect(served.replaceOwned).toBeUndefined();
  });

  it('with no record, the first writer owns the metadata until a record exists', async () => {
    const code = uniqueCode('meta-first');
    const hash = hashOf(code);
    const first = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash, author: 'mallory' } },
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const second = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash, author: 'alice' } },
    });
    expect(second.status, JSON.stringify(second.body)).toBe(409);
    const meta = await server.request('GET', `/metadata/${hash}`);
    expect((meta.body.provenance as { author?: string }).author).toBe('mallory');

    // The author publishes the record (with the content), and the record's owner now governs.
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);
    const retake = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash, author: 'mallory' } },
    });
    expect(retake.status, JSON.stringify(retake.body)).toBe(409);
    const own = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash, author: 'alice', note: 'mine' } },
    });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
  });

  it('a first record on /api/protocol drops metadata someone else stored before it', async () => {
    const code = uniqueCode('meta-preclaimed');
    const hash = hashOf(code);
    const preclaim = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash, author: 'mallory-fake-provenance' } },
    });
    expect(preclaim.status, JSON.stringify(preclaim.body)).toBe(201);

    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);
    const served = await server.request('GET', `/metadata/${hash}`);
    expect(served.status, JSON.stringify(served.body)).toBe(404);
    expect(JSON.stringify(served.body)).not.toContain('mallory-fake-provenance');

    // The record's owner now governs the metadata.
    const retake = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash, author: 'mallory-fake-provenance' } },
    });
    expect(retake.status, JSON.stringify(retake.body)).toBe(409);
    const own = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash, author: 'alice' } },
    });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    const after = (await server.request('GET', `/metadata/${hash}`)).body;
    expect((after.provenance as { author?: string }).author).toBe('alice');
  });

  it("metadata the record's writer stored first stays, the order the protocol tools use", async () => {
    // The author's own metadata, then the author's record.
    const own = uniqueCode('meta-own-first');
    const first = await server.request('POST', '/api/protocol/metadata', {
      token: alice.token,
      body: { provenance: { hash: hashOf(own), author: 'alice' } },
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await protocolPublish(alice.token, own, { author: 'alice' })).status).toBe(201);
    const ownMeta = (await server.request('GET', `/metadata/${hashOf(own)}`)).body;
    expect((ownMeta.provenance as { author?: string }).author).toBe('alice');

    // holo_protocol_publish (server key): metadata, then the record, over a squatter's metadata.
    const tool = uniqueCode('meta-tool-first');
    const squat = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash: hashOf(tool), author: 'mallory-fake-provenance' } },
    });
    expect(squat.status, JSON.stringify(squat.body)).toBe(201);
    const toolMeta = await server.request('POST', '/api/protocol/metadata', {
      token: REAL_SERVER_ADMIN_KEY,
      body: {
        contentHash: hashOf(tool),
        provenance: { hash: hashOf(tool), author: 'tool-author' },
      },
    });
    expect(toolMeta.status, JSON.stringify(toolMeta.body)).toBe(201);
    const toolRecord = await server.request('POST', '/api/protocol', {
      token: REAL_SERVER_ADMIN_KEY,
      body: { contentHash: hashOf(tool), code: tool, author: 'tool-author' },
    });
    expect(toolRecord.status, JSON.stringify(toolRecord.body)).toBe(201);
    const served = (await server.request('GET', `/metadata/${hashOf(tool)}`)).body;
    expect((served.provenance as { author?: string }).author).toBe('tool-author');
  });
});

describe('POST /api/protocol stores only the fields callers send; the rest is the server', () => {
  const PLANTED = {
    sceneUrl: 'https://example.invalid/not-the-scene',
    embedUrl: 'https://example.invalid/not-the-embed',
    sceneId: 'planted-scene-id',
    editionCount: 999,
    visibility: 'planted',
    timestamp: 'yesterday',
  };

  it('scene links, edition count and unknown fields from the body are not stored', async () => {
    const withSource = uniqueCode('planted-source');
    const created = await protocolPublish(alice.token, withSource, { author: 'alice', ...PLANTED });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const sceneId = created.body.sceneId as string;
    expect(typeof sceneId).toBe('string');
    const stored = (await record(hashOf(withSource))).body;
    expect(stored.sceneId).toBe(sceneId);
    expect(String(stored.sceneUrl)).toMatch(new RegExp(`/scene/${sceneId}$`));
    expect(String(stored.embedUrl)).toMatch(new RegExp(`/embed/${sceneId}$`));
    expect(stored.editionCount).toBeUndefined();
    expect(stored.visibility).toBeUndefined();
    expect(typeof stored.timestamp).toBe('number');

    const codeOnly = uniqueCode('planted-code');
    const createdCodeOnly = await server.request('POST', '/api/protocol', {
      token: alice.token,
      body: { contentHash: hashOf(codeOnly), code: codeOnly, author: 'alice', ...PLANTED },
    });
    expect(createdCodeOnly.status, JSON.stringify(createdCodeOnly.body)).toBe(201);
    const storedCodeOnly = (await record(hashOf(codeOnly))).body;
    for (const field of ['sceneId', 'sceneUrl', 'embedUrl', 'editionCount', 'visibility']) {
      expect(storedCodeOnly[field], field).toBeUndefined();
    }

    // The links a refused caller and a pre-publish check see are the server's, never the body's.
    const refused = await protocolPublish(mallory.token, withSource, { author: 'mallory' });
    expect(refused.status).toBe(409);
    expect(String(refused.body.existingUrl)).toMatch(new RegExp(`/scene/${sceneId}$`));
    const refusedCodeOnly = await server.request('POST', '/api/protocol', {
      token: mallory.token,
      body: { contentHash: hashOf(codeOnly), code: codeOnly },
    });
    expect(refusedCodeOnly.status).toBe(409);
    expect(refusedCodeOnly.body.existingUrl).toBeNull();
    const extract = await server.request('POST', '/api/extract', { body: { code: codeOnly } });
    expect(extract.body.alreadyPublished).toBe(true);
    expect(extract.body.existingUrl).toBeNull();

    // The edition count starts from what collect recorded, not from the body.
    const collected = await server.request('POST', `/api/collect/${hashOf(withSource)}`, {
      token: alice.token,
      body: { quantity: 1 },
    });
    expect(collected.body.editions).toEqual([1]);
  });

  it("every field the real callers send is kept (Studio's, the protocol tools', the marketplace's)", async () => {
    const code = uniqueCode('callers');
    const fields = {
      author: 'alice',
      title: 'Callers',
      description: 'every allowed field',
      license: 'cc-by',
      price: '0',
      publishMode: 'studio',
      importHashes: ['a', 'b'],
      referralBps: 250,
      metadataURI: 'https://mcp.holoscript.net/metadata/x',
      mintAsNFT: false,
      timestamp: 1_700_000_000_000,
    };
    expect((await protocolPublish(alice.token, code, fields)).status).toBe(201);
    const stored = (await record(hashOf(code))).body;
    expect(stored).toMatchObject({ ...fields, source: code, code, contentHash: hashOf(code) });
  });

  it('collected editions survive a republish, so edition numbers are never handed out twice', async () => {
    const code = uniqueCode('editions');
    const hash = hashOf(code);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);
    const first = await server.request('POST', `/api/collect/${hash}`, {
      token: alice.token,
      body: { quantity: 3 },
    });
    expect(first.body.editions).toEqual([1, 2, 3]);
    expect(
      (await protocolPublish(alice.token, code, { author: 'alice', title: 'v2' })).status
    ).toBe(201);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);
    const next = await server.request('POST', `/api/collect/${hash}`, {
      token: alice.token,
      body: { quantity: 1 },
    });
    expect(next.body.editions).toEqual([4]);
  });
});

describe('refusals are audited without the token', () => {
  it('each 409 writes ownership_refused with the caller principal, the hash and a hashed IP', async () => {
    const code = uniqueCode('audit-409');
    const hash = hashOf(code);
    expect((await publish(alice.token, code, { author: 'alice' })).status).toBe(201);

    const before = (await auditEntries('ownership_refused')).length;
    expect((await publish(mallory.token, code)).status).toBe(409);
    expect((await protocolPublish(mallory.token, code)).status).toBe(409);
    const metadata = await server.request('POST', '/api/protocol/metadata', {
      token: mallory.token,
      body: { provenance: { hash } },
    });
    expect(metadata.status).toBe(409);

    const entries = (await auditEntries('ownership_refused')).filter(
      (e) => e.metadata?.contentHash === hash
    );
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect((await auditEntries('ownership_refused')).length).toBe(before + 3);
    expect(entries.map((e) => e.request?.path).sort()).toEqual([
      '/api/protocol',
      '/api/protocol/metadata',
      '/api/publish',
    ]);
    for (const entry of entries) {
      expect(entry.agent.clientId).toBe(mallory.clientId);
      expect(entry.metadata?.principal).toBe(mallory.clientId);
      expect(typeof entry.agent.ipHash).toBe('string');
      expect(JSON.stringify(entry)).not.toContain(mallory.token);
    }
  });

  it('each scope refusal (403) writes gate_denied with the route and the scope it needed', async () => {
    const code = uniqueCode('audit-403');
    expect((await publish(reader.token, code)).status).toBe(403);
    expect(
      (
        await server.request('POST', '/api/credits/check', {
          token: alice.token,
          body: { userId: 'someone-else', operation: 'studio_generate' },
        })
      ).status
    ).toBe(403);
    expect(
      (
        await server.request('POST', '/api/moltbook/crosspost', {
          token: alice.token,
          body: { taskId: 'audit', title: 't', description: 'd', status: 'completed' },
        })
      ).status
    ).toBe(403);

    const denied = await auditEntries('gate_denied');
    const find = (path: string, clientId: string) =>
      denied.find((e) => e.request?.path === path && e.agent.clientId === clientId);
    const publishRefusal = find('/api/publish', reader.clientId);
    expect(publishRefusal?.security?.requiredScopes).toEqual(['tools:write']);
    expect(publishRefusal?.security?.deniedAtGate).toBe(2);
    expect(find('/api/credits/check', alice.clientId)?.security?.requiredScopes).toEqual([
      'tools:admin',
    ]);
    expect(find('/api/moltbook/crosspost', alice.clientId)?.security?.requiredScopes).toEqual([
      'tools:admin',
    ]);
    const text = JSON.stringify(denied);
    expect(text).not.toContain(reader.token);
    expect(text).not.toContain(alice.token);
  });
});

describe('POST /api/credits/check needs an operator scope, like deduct', () => {
  const CHECK_BODY = { userId: 'someone-else', operation: 'studio_generate' };

  it('a read token cannot read another account balance', async () => {
    expectRefusedForScope(
      await server.request('POST', '/api/credits/check', { token: reader.token, body: CHECK_BODY }),
      ['tools:admin']
    );
  });

  it('a write token cannot either: the body names whose balance', async () => {
    expectRefusedForScope(
      await server.request('POST', '/api/credits/check', { token: alice.token, body: CHECK_BODY }),
      ['tools:admin']
    );
  });

  it('the server key (admin:*) passes the gate', async () => {
    expectPastTheGate(
      await server.request('POST', '/api/credits/check', {
        token: REAL_SERVER_ADMIN_KEY,
        body: CHECK_BODY,
      })
    );
  });

  it('no token is still 401', async () => {
    const reply = await server.request('POST', '/api/credits/check', { body: CHECK_BODY });
    expect(reply.status).toBe(401);
  });
});

describe('POST /api/collect/:hash takes a whole number of editions, 1 to 10000', () => {
  it('refuses a bad quantity with 400 and leaves editionCount alone', async () => {
    const code = uniqueCode('collect');
    const hash = hashOf(code);
    expect((await protocolPublish(alice.token, code, { author: 'alice' })).status).toBe(201);

    for (const quantity of [0, -3, 2.5, '3', 10_001, Number.MAX_SAFE_INTEGER, true, [2], {}]) {
      const reply = await server.request('POST', `/api/collect/${hash}`, {
        token: alice.token,
        body: { quantity },
      });
      expect(
        reply.status,
        `quantity ${JSON.stringify(quantity)}: ${JSON.stringify(reply.body)}`
      ).toBe(400);
      expect(reply.body.error).toBe('invalid_quantity');
    }
    expect((await record(hash)).body.editionCount).toBeUndefined();

    const one = await server.request('POST', `/api/collect/${hash}`, {
      token: alice.token,
      body: { quantity: 1 },
    });
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.editions).toEqual([1]);

    const defaulted = await server.request('POST', `/api/collect/${hash}`, {
      token: alice.token,
      body: {},
    });
    expect(defaulted.body.editions).toEqual([2]);

    const most = await server.request('POST', `/api/collect/${hash}`, {
      token: alice.token,
      body: { quantity: 10_000 },
    });
    expect(most.status, JSON.stringify(most.body)).toBe(200);
    const editions = most.body.editions as number[];
    expect(editions).toHaveLength(10_000);
    expect(editions[0]).toBe(3);
    expect(editions[editions.length - 1]).toBe(10_002);
    expect((await record(hash)).body.editionCount).toBe(10_002);
  });
});
