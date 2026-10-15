/**
 * Local custody at dispatch, driven through the REAL http-server.ts over real HTTP.
 *
 * Why this exists: `localCustody` lets the server's own loopback identity
 * (MCP_TRUST_LOOPBACK, no token, `tools:codebase` only) name absolute paths for
 * codebase tools; the absorb root allowlist still confines it. Since #407 the
 * unsigned dispatch context copies `localCustody` from auth only when the
 * loopback branch set it (http-server.ts, `securedToolExecutionInner`). Making
 * that copy unconditional widens the host-path rule for every unsigned
 * non-admin token caller's re-entered (batch) children, and every shipped
 * suite stayed green with it (Release's #407 post-merge review, negative
 * control NC1). C2 below is the test that goes red. A4 pins the feature itself
 * (losing the copy, or step 0b's 4th argument, fails it closed).
 *
 * Harness: the same as oauth-register-loopback-only.test.ts. process.env is
 * scrubbed to an allowlist before import, home/data dirs are sandboxed, the
 * orchestrator points at a closed loopback port, fetch is fenced to loopback,
 * and a "LAN" peer is a captured socket given its own remoteAddress for one
 * request. The server stays bound to 127.0.0.1.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import http from 'http';
import { createServer, type AddressInfo, type Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Accepted by the legacy-key path; not in the key registry, so not a founder.
const TEST_KEY = 'local-custody-dispatch-key-not-a-founder';
const LAN_PEER = '192.168.0.42';
/** Outside ABSORB_ALLOWED_ROOTS, absolute: names the server's disk. */
const OUTSIDE = '/etc';
const HOST_PATH_REFUSED = 'Host path argument refused';
const ROOT_REFUSED = 'is outside the folders this server may scan';

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
  sandbox = mkdtempSync(join(tmp, 'mcp-local-custody-'));
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
    MCP_TRUST_LOOPBACK: 'true',
    ABSORB_ALLOWED_ROOTS: join(sandbox, 'allowed'),
  });
  mkdirSync(join(sandbox, 'allowed'), { recursive: true });

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
  spoofRemoteAddress = undefined;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  expect(offMachine).toEqual([]);
  if (serverUnderTest) {
    serverUnderTest.closeAllConnections?.();
    await new Promise<void>((resolve) => serverUnderTest!.close(() => resolve()));
  }
  // Best effort: a handle the module still holds (Windows) must not fail the suite.
  try {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* left in the OS temp dir */
  }
});

let rpcId = 0;
async function callTool(
  name: string,
  args: Record<string, unknown>,
  opts: { headers?: Record<string, string>; remote?: string } = {}
) {
  const r = await request('POST', '/mcp', {
    body: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } },
    ...opts,
  });
  return { ...r, text: JSON.stringify(r.body) };
}

/** A non-admin OAuth token (tools:read + tools:execute) minted over loopback. */
async function mintToken(): Promise<string> {
  const reg = await request('POST', '/oauth/register', {
    body: {
      client_name: 'local-custody-dispatch',
      redirect_uris: ['https://client.test/callback'],
      scope: 'tools:read tools:execute',
      token_endpoint_auth_method: 'client_secret_post',
    },
  });
  expect(reg.status, JSON.stringify(reg.body)).toBeLessThan(300);
  const tok = await request('POST', '/oauth/token', {
    body: {
      grant_type: 'client_credentials',
      client_id: reg.body.client_id,
      client_secret: reg.body.client_secret,
      scope: 'tools:read tools:execute',
    },
  });
  expect(tok.status, JSON.stringify(tok.body)).toBe(200);
  return String(tok.body.access_token);
}

describe('local custody at dispatch (real /mcp)', () => {
  it('the server under test booted', () => {
    expect(serverUnderTest).toBeDefined();
  });

  describe('A. loopback peer, no token: the sovereign-loopback identity', () => {
    it('A4 may name a host path for holo_absorb_repo, and the absorb root allowlist refuses /etc', async () => {
      const r = await callTool('holo_absorb_repo', { rootDir: OUTSIDE });
      expect(r.text).not.toContain(HOST_PATH_REFUSED);
      expect(r.text).toContain(ROOT_REFUSED);
    });

    it('A5 has codebase tools only: batch_tool_call is refused at Gate 2 before any child runs', async () => {
      const r = await callTool('batch_tool_call', {
        calls: [{ name: 'holo_absorb_repo', args: { rootDir: OUTSIDE } }],
      });
      expect(r.text).toMatch(
        /Security gate 2 denied: Insufficient scope\. Required one of: \[tools:read\]/
      );
      expect(r.text).not.toContain(ROOT_REFUSED);
    });
  });

  describe('B. LAN peer, no token', () => {
    it('B1 gets 401: no local custody and no anonymous access', async () => {
      const r = await callTool('holo_absorb_repo', { rootDir: OUTSIDE }, { remote: LAN_PEER });
      expect(r.status).toBe(401);
      expect(r.text).not.toContain(ROOT_REFUSED);
    });
  });

  describe('C. loopback peer with a non-admin token: the loopback branch must not fire', () => {
    let bearer = '';
    beforeAll(async () => {
      bearer = await mintToken();
    });

    it('C1 holo_absorb_repo naming /etc is refused by the host-path rule (Gate 3)', async () => {
      const r = await callTool(
        'holo_absorb_repo',
        { rootDir: OUTSIDE },
        { headers: { authorization: `Bearer ${bearer}` } }
      );
      expect(r.text).toContain(HOST_PATH_REFUSED);
    });

    it('C2 a batch child naming /etc is refused by the host-path rule: the dispatch context carries no localCustody', async () => {
      const r = await callTool(
        'batch_tool_call',
        { calls: [{ name: 'holo_absorb_repo', args: { rootDir: OUTSIDE } }] },
        { headers: { authorization: `Bearer ${bearer}` } }
      );
      expect(r.text).toContain(HOST_PATH_REFUSED);
      // Reaching the absorb allowlist means the host-path rule was skipped.
      expect(r.text).not.toContain(ROOT_REFUSED);
    });
  });
});
