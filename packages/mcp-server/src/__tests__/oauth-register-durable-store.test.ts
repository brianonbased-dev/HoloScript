/**
 * POST /oauth/register through the REAL http-server when the durable client
 * store is full (board task_1790545471449_w6yi).
 *
 * The defect was in the route, not only in the store: `/oauth/register` caught
 * the durable store's refusal, logged a warning, and answered 201 with a client
 * held only in memory. Every deploy wiped that client. From 2026-06-28, when
 * the production store reached its 1000-client cap, that was every
 * registration, and nothing outside the database showed it. A test of the
 * decision helper alone stays green if the route goes back to swallowing the
 * refusal, so this file boots the server the way production does and speaks to
 * the route (same harness as oauth-register-loopback-only.test.ts).
 *
 * The server boots with no DATABASE_URL, so its "durable" store is the
 * in-memory backend and nothing here touches a database. The test reaches that
 * store through the provider singleton the server itself created, and then:
 *   - a client the durable store no longer holds gets no token at /oauth/token,
 *     even though a copy is still in memory;
 *   - with the store filled to the cap, a registration must come back 503, with
 *     no client handed out, the in-memory registry unchanged, an error logged,
 *     and the refusal counted on the public /metrics page;
 *   - a client 40 days idle that starts an authorize flow has its use recorded
 *     there and then, so a registration at the cap cannot retire it mid sign-in;
 *   - once one stored client is provably idle (31 days, no token), a
 *     registration must succeed by retiring exactly that client, while an older
 *     client holding a live token is left alone.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import http from 'http';
import { createServer, type AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InMemoryTokenStore, TokenStoreBackend } from '../auth/token-store';

const TEST_KEY = 'oauth-durable-store-test-key-not-a-founder';
const DAY = 86_400_000;

const REGISTRATION = {
  client_name: 'durable-store-probe',
  redirect_uris: ['https://client.test/callback'],
  scope: 'tools:read',
  token_endpoint_auth_method: 'client_secret_post',
};

const KEEP_ENV = new Set(
  [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'SystemDrive',
    'windir',
    'WINDIR',
    'ComSpec',
    'COMSPEC',
    'OS',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'NODE_OPTIONS',
  ].map((k) => k.toUpperCase())
);
const keepEnv = (k: string) =>
  KEEP_ENV.has(k.toUpperCase()) || k.startsWith('VITEST') || k.startsWith('TINYPOOL');

const savedEnv: NodeJS.ProcessEnv = { ...process.env };
const realFetch = globalThis.fetch;
const offMachine: string[] = [];
let port = 0;
let baseUrl = '';
let backend: InMemoryTokenStore;
let maxClients = 0;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: found } = probe.address() as AddressInfo;
      probe.close(() => resolve(found));
    });
  });
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`http-server did not answer /health within ${timeoutMs}ms (${last})`);
}

type Reply = { status: number; body: Record<string, unknown>; text: string };

/** One request on one fresh loopback connection. */
function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        agent: false,
        headers: {
          'content-type': 'application/json',
          connection: 'close',
          ...(payload !== undefined ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(text) as Record<string, unknown>;
          } catch {
            parsed = { raw: text };
          }
          resolve({ status: res.statusCode ?? 0, body: parsed, text });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/** The in-memory registry's client count, as the public /health page reports it. */
async function inMemoryClientCount(): Promise<number> {
  const health = await request('GET', '/health');
  return Number((health.body.security as Record<string, unknown>).registeredClients);
}

async function seed(
  store: TokenStoreBackend,
  clientId: string,
  ages: { idleDays: number; registeredDaysAgo: number }
): Promise<void> {
  const now = Date.now();
  await store.setClient({
    clientId,
    clientSecretHash: 'seeded-hash',
    clientName: `filler ${clientId}`,
    redirectUris: [],
    scopes: ['tools:read'],
    createdAt: now - ages.registeredDaysAgo * DAY,
    clientType: 'confidential',
    rateLimit: 60,
    lastUsedAt: now - ages.idleDays * DAY,
  });
}

beforeAll(async () => {
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  const sandbox = mkdtempSync(join(tmp, 'mcp-oauth-durable-store-'));
  const dataDir = join(sandbox, 'holomesh');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'keys.json'), JSON.stringify({ keys: [] }));
  port = await freePort();

  for (const k of Object.keys(process.env)) if (!keepEnv(k)) delete process.env[k];
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HOLOSCRIPT_API_KEY: TEST_KEY,
    PORT: String(port),
    MCP_BIND_HOST: '127.0.0.1',
    HOME: sandbox,
    USERPROFILE: sandbox,
    TEMP: tmp,
    TMP: tmp,
    HOLOMESH_DATA_DIR: dataDir,
    HOLOSCRIPT_CACHE_DIR: sandbox,
    HOLOMESH_NO_DOTENV: '1',
    ORCHESTRATOR_URL: 'http://127.0.0.1:9',
  });

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { hostname, origin } = new URL(href);
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) {
      offMachine.push(origin);
      throw new Error(`test network fence: refused ${origin}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  baseUrl = `http://127.0.0.1:${port}`;
  await import('../http-server');
  await waitForHealth(150_000);

  // Imported only now, after the env scrub and the server's own import, so this
  // is the provider singleton the server created, not a second one.
  const { getOAuth2Provider, DEFAULT_PROVIDER_CONFIG } = await import('../auth/oauth2-provider');
  const { InMemoryTokenStore: InMemoryStore } = await import('../auth/token-store');
  const storeBackend = getOAuth2Provider().getStore().backend;
  if (!(storeBackend instanceof InMemoryStore)) {
    throw new Error('expected the no-DATABASE_URL in-memory backend; refusing to touch any other');
  }
  backend = storeBackend;
  // The server builds its provider without a maxClients override, so this is
  // the cap it runs with.
  maxClients = DEFAULT_PROVIDER_CONFIG.maxClients;
  // 360 s, not the 240 s the loopback-only file uses: booting the server
  // measured 100-170 s on a laptop running other sessions, and hit 240 s once
  // there with a cold transform cache. A slow boot is not the thing under test.
}, 360_000);

afterAll(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

describe('POST /oauth/register when the durable client store is full', () => {
  /** The positive control's client, reused later as the one that comes back after 40 days. */
  let controlClientId = '';

  it('positive control: a registration is stored durably under the identity the caller receives', async () => {
    const r = await request('POST', '/oauth/register', REGISTRATION);

    expect(r.status).toBe(201);
    controlClientId = String(r.body.client_id);
    const stored = await backend.getClient(controlClientId);
    expect(stored?.clientName).toBe(REGISTRATION.client_name);
  });

  it('a client the durable store no longer holds gets no token, though a copy is still in memory', async () => {
    const registered = await request('POST', '/oauth/register', REGISTRATION);
    expect(registered.status).toBe(201);
    const clientId = String(registered.body.client_id);
    // Retired underneath this process: by another replica, or a registration
    // that won the race by a millisecond.
    await backend.deleteClient(clientId);
    const inMemoryBefore = await inMemoryClientCount();

    const r = await request('POST', '/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: registered.body.client_secret,
      scope: 'tools:read',
    });

    expect(r.status).toBe(400);
    expect(r.body.access_token).toBeUndefined();
    expect(String(r.body.error_description)).toMatch(/not registered/);
    expect(await inMemoryClientCount()).toBe(inMemoryBefore - 1);
  });

  it('a full store answers 503, hands out no client, logs the refusal, and counts it on /metrics', async () => {
    const existing = await backend.countClients();
    for (let i = 0; i < maxClients - existing; i++) {
      await seed(backend, `filler_${i}`, { idleDays: 0, registeredDaysAgo: 0 });
    }
    expect(await backend.countClients()).toBe(maxClients);
    const inMemoryBefore = await inMemoryClientCount();
    const errors = vi.spyOn(console, 'error');

    const r = await request('POST', '/oauth/register', REGISTRATION);

    expect(r.status).toBe(503);
    expect(r.body.error).toBe('temporarily_unavailable');
    expect(String(r.body.error_description)).toMatch(/Nothing was created/);
    expect(r.body.client_id).toBeUndefined();
    expect(r.body.client_secret).toBeUndefined();
    // No memory-only client was handed out behind the refusal.
    expect(await inMemoryClientCount()).toBe(inMemoryBefore);
    expect(await backend.countClients()).toBe(maxClients);
    expect(errors.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(
      /OAuth client registration REFUSED \(store_full\)/
    );

    const metrics = await request('GET', '/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toMatch(
      /_oauth_client_registration_refused_total\{reason="store_full"\} 1\b/
    );
  });

  it('a client 40 days idle that starts an authorize flow cannot be retired in the middle of it', async () => {
    // Age the control client. A rewrite never moves the use clock back, so
    // replace its row outright, credentials unchanged.
    const row = await backend.getClient(controlClientId);
    if (!row) throw new Error('control client missing from the durable store');
    await backend.deleteClient(controlClientId);
    await backend.setClient({
      ...row,
      createdAt: Date.now() - 90 * DAY,
      lastUsedAt: Date.now() - 40 * DAY,
    });
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: controlClientId,
      redirect_uri: REGISTRATION.redirect_uris[0],
      scope: 'tools:read',
      state: 'mid-sign-in',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    });

    const authorize = await request('GET', `/oauth/authorize?${query.toString()}`);
    expect(authorize.status).toBe(200);
    // Someone registers while the consent page is open. The store is full, and
    // the only old client is the one signing in right now.
    const r = await request('POST', '/oauth/register', REGISTRATION);

    expect(r.status).toBe(503);
    const after = await backend.getClient(controlClientId);
    expect(after).toBeDefined();
    expect(after?.lastUsedAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('retirement makes room: the idle client with no token goes, an older one holding a live token stays', async () => {
    // A rewrite never moves a client's use clock back, so age two fillers by
    // replacing them outright. The token holder is the LONGER idle of the two,
    // so only the token check keeps it.
    await backend.deleteClient('filler_0');
    await seed(backend, 'filler_0', { idleDays: 40, registeredDaysAgo: 90 });
    await backend.deleteClient('filler_1');
    await seed(backend, 'filler_1', { idleDays: 31, registeredDaysAgo: 90 });
    const now = Date.now();
    await backend.setAccessToken({
      token: 'at_filler_0',
      clientId: 'filler_0',
      scopes: ['tools:read'],
      issuedAt: now - 60_000,
      expiresAt: now + 3_600_000,
    });

    const r = await request('POST', '/oauth/register', REGISTRATION);

    expect(r.status).toBe(201);
    expect(await backend.getClient(String(r.body.client_id))).toBeDefined();
    expect(await backend.getClient('filler_1')).toBeUndefined();
    expect(await backend.getClient('filler_0')).toBeDefined();
    expect(await backend.countClients()).toBe(maxClients);

    const metrics = await request('GET', '/metrics');
    expect(metrics.text).toMatch(/_oauth_clients_retired_total 1\b/);
  });

  it('the run tried to reach nothing off this machine', () => {
    expect(offMachine).toEqual([]);
  });
});
