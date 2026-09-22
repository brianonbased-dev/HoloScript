/**
 * POST /oauth/register is loopback-only unless OAUTH_ALLOW_REMOTE_REGISTRATION
 * is set — driven through the REAL http-server.ts over real HTTP.
 *
 * Why this exists: registration takes no credentials and mints a client that
 * may hold every public scope, tools:execute included. On an anchor bound to
 * 0.0.0.0 that let any LAN device register a client and call tools — shown from
 * another machine on 2026-09-22 (board task_1790062507560_px5q). The gate is a
 * branch inside the route handler, and a helper-only test stays green with the
 * branch deleted (that is how the credit routes shipped untested; see
 * credit-routes-without-ledger.test.ts), so this file boots the server the way
 * production does and speaks to the route.
 *
 * How a "remote" peer is produced without a second machine: the socket a
 * request arrives on is captured at the server's 'connection' event and given
 * an own `remoteAddress` for that one request. The gate reads
 * `req.socket.remoteAddress`, which is that property. Every request here opens
 * its own connection (no keep-alive), so a spoof cannot bleed into the next
 * request. The server itself stays bound to 127.0.0.1: nothing here listens on
 * the LAN.
 *
 * Environment handling follows credit-routes-without-ledger.test.ts: process.env
 * scrubbed to an allowlist before import, sandboxed home/data dirs, a closed
 * loopback port for the orchestrator, and fetch fenced to loopback.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import http from 'http';
import { createServer, type AddressInfo, type Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Accepted by the legacy-key path; not in the key registry, so not a founder.
const TEST_KEY = 'oauth-register-test-key-not-a-founder';
const FLAG = 'OAUTH_ALLOW_REMOTE_REGISTRATION';
const LAN_PEER = '192.168.0.42';
const REFUSAL =
  'client registration is loopback-only on this server; set OAUTH_ALLOW_REMOTE_REGISTRATION=1 to allow remote registration';

/** A public client asking for the scope the defect handed out: tools:execute. */
const VALID_REGISTRATION = {
  client_name: 'loopback-gate-probe',
  redirect_uris: ['https://client.test/callback'],
  scope: 'tools:read tools:execute',
  token_endpoint_auth_method: 'none',
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
const realCreateServer = http.createServer;
const offMachine: string[] = [];
const createdServers: http.Server[] = [];
let port = 0;
let baseUrl = '';
let sandbox = '';
let serverUnderTest: http.Server | undefined;

/**
 * While set, every connection the server under test accepts reports this as
 * its peer address. Set for exactly one request at a time (see `request`).
 */
let spoofRemoteAddress: string | undefined;

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

type Reply = { status: number; body: Record<string, unknown> };

/**
 * One request on one fresh connection. `remote` makes the server see that
 * peer address for this request only; without it the peer is the real
 * 127.0.0.1 the connection came from.
 */
function request(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; remote?: string } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    spoofRemoteAddress = options.remote;
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
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          spoofRemoteAddress = undefined;
          const text = Buffer.concat(chunks).toString('utf8');
          let body: Record<string, unknown>;
          try {
            body = JSON.parse(text) as Record<string, unknown>;
          } catch {
            body = { raw: text };
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on('error', (e) => {
      spoofRemoteAddress = undefined;
      reject(e);
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  sandbox = mkdtempSync(join(tmp, 'mcp-oauth-register-'));
  const dataDir = join(sandbox, 'holomesh');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, 'keys.json'),
    JSON.stringify({
      keys: [
        {
          key: 'fixture-unrelated-registry-key',
          walletAddress: '0x0000000000000000000000000000000000000002',
          agentId: 'agent_fixture',
          agentName: 'Fixture',
          scopes: [],
          createdAt: '2026-09-15T00:00:00.000Z',
          rotationCount: 0,
          lastRotatedAt: null,
          isFounder: false,
        },
      ],
    })
  );
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

  // http-server.ts does not export its server, so the socket capture rides on
  // the module's own http.createServer call at import time.
  vi.spyOn(http, 'createServer').mockImplementation(((...args: unknown[]) => {
    const server = (realCreateServer as (...a: unknown[]) => http.Server)(...args);
    createdServers.push(server);
    server.on('connection', (socket: Socket) => {
      if (spoofRemoteAddress !== undefined) {
        Object.defineProperty(socket, 'remoteAddress', {
          value: spoofRemoteAddress,
          configurable: true,
        });
      }
    });
    return server;
  }) as typeof http.createServer);

  baseUrl = `http://127.0.0.1:${port}`;
  await import('../http-server');
  await waitForHealth(150_000);
  serverUnderTest = createdServers.find(
    (server) => (server.address() as AddressInfo | null)?.port === port
  );
}, 240_000);

afterEach(() => {
  delete process.env[FLAG];
  spoofRemoteAddress = undefined;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  // The server keeps listening until this test process exits and its data lives
  // in the sandbox, so the sandbox is left in the OS temp dir, not deleted under it.
});

describe('POST /oauth/register through the real http-server', () => {
  it('positive control: the server booted, and the socket capture holds it', async () => {
    expect(process.env[FLAG]).toBeUndefined();
    expect(
      serverUnderTest,
      `http.createServer capture saw ${createdServers.length} server(s), none on port ${port}`
    ).toBeDefined();
    const health = await request('GET', '/health');
    expect(health.status).toBe(200);
  });

  it('loopback: an empty body reaches metadata validation (400, not 403)', async () => {
    const r = await request('POST', '/oauth/register', { body: {} });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_client_metadata');
    expect(String(r.body.error_description)).toMatch(/redirect_uri/);
  });

  it('loopback: a valid registration is minted, tools:execute included', async () => {
    const r = await request('POST', '/oauth/register', { body: VALID_REGISTRATION });
    expect(r.status).toBe(201);
    expect(typeof r.body.client_id).toBe('string');
    expect(String(r.body.scope).split(' ')).toContain('tools:execute');
  });

  it('a LAN peer is refused 403 access_denied and no client is minted', async () => {
    const r = await request('POST', '/oauth/register', {
      body: VALID_REGISTRATION,
      remote: LAN_PEER,
    });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'access_denied', error_description: REFUSAL });
    expect(r.body.client_id).toBeUndefined();
  });

  it('the refusal comes before the body is read: a LAN peer with an empty body gets 403, not 400', async () => {
    const r = await request('POST', '/oauth/register', { body: {}, remote: LAN_PEER });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('access_denied');
  });

  it('x-forwarded-for cannot launder a LAN peer into loopback', async () => {
    const r = await request('POST', '/oauth/register', {
      body: VALID_REGISTRATION,
      headers: { 'x-forwarded-for': '127.0.0.1' },
      remote: '10.0.0.7',
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('access_denied');
  });

  it.each(['::1', '::ffff:127.0.0.1', '127.0.0.1'])(
    'peer %s is loopback and reaches metadata validation',
    async (peer) => {
      const r = await request('POST', '/oauth/register', { body: {}, remote: peer });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('invalid_client_metadata');
    }
  );

  it('OAUTH_ALLOW_REMOTE_REGISTRATION=1 restores remote registration, and unsetting it closes the door again', async () => {
    process.env[FLAG] = '1';
    const open = await request('POST', '/oauth/register', {
      body: VALID_REGISTRATION,
      remote: LAN_PEER,
    });
    expect(open.status).toBe(201);
    expect(typeof open.body.client_id).toBe('string');

    delete process.env[FLAG];
    const closed = await request('POST', '/oauth/register', {
      body: VALID_REGISTRATION,
      remote: LAN_PEER,
    });
    expect(closed.status).toBe(403);
  });

  it.each(['0', 'false', 'no', 'off', ''])(
    'OAUTH_ALLOW_REMOTE_REGISTRATION=%j is off, not on: a LAN peer stays refused',
    async (value) => {
      process.env[FLAG] = value;
      const r = await request('POST', '/oauth/register', {
        body: VALID_REGISTRATION,
        remote: LAN_PEER,
      });
      expect(r.status).toBe(403);
    }
  );

  it.each(['true', 'YES', ' on '])(
    'OAUTH_ALLOW_REMOTE_REGISTRATION=%j is on: a LAN peer registers',
    async (value) => {
      process.env[FLAG] = value;
      const r = await request('POST', '/oauth/register', {
        body: VALID_REGISTRATION,
        remote: LAN_PEER,
      });
      expect(r.status).toBe(201);
    }
  );

  it('the run tried to reach nothing off this machine', () => {
    expect(offMachine).toEqual([]);
  });
});
