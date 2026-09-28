/**
 * The /a2a task routes need credentials, and a task runs with the caller's
 * own scopes, driven through the REAL http-server.ts over real HTTP.
 *
 * Why this exists: POST /a2a and POST /a2a/tasks never authenticated, and the
 * A2A tool handler hard-coded admin:*, so a caller with no credentials ran any
 * registered tool as admin, and GET /a2a/tasks listed every caller's results.
 * The fix is branches inside the route handlers. A helper-only test stays
 * green with those branches deleted, so this file boots the server the way
 * production does and speaks to the routes.
 *
 * Environment handling follows oauth-register-loopback-only.test.ts:
 * process.env scrubbed to an allowlist before import, sandboxed home/data
 * dirs, a closed loopback port for the orchestrator, and fetch fenced to
 * loopback. The server binds 127.0.0.1 only.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import http from 'http';
import { createServer, type AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Accepted by the legacy-key path (admin); not in the key registry, so not a founder.
const TEST_KEY = 'a2a-login-test-key-not-a-founder';
const UNKNOWN_TASK_ID = '00000000-0000-4000-8000-000000000000';

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
let port = 0;
let baseUrl = '';
let readToken = '';

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

/** One request on one fresh connection. */
function request(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { body?: unknown; token?: string } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
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
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
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
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const sendTask = (skillId: string, token?: string) =>
  request('POST', '/a2a/tasks', { body: { skillId, arguments: {} }, token });

const taskState = (reply: Reply) =>
  (reply.body.status as { state?: string } | undefined)?.state;

async function adminTaskTotal(): Promise<number> {
  const listed = await request('GET', '/a2a/tasks', { token: TEST_KEY });
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return listed.body.total as number;
}

beforeAll(async () => {
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  const sandbox = mkdtempSync(join(tmp, 'mcp-a2a-login-'));
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
      throw new Error(`test network fence: refused ${origin}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  baseUrl = `http://127.0.0.1:${port}`;
  await import('../http-server');
  await waitForHealth(150_000);

  // A real read-only login: a client registered over loopback with only
  // tools:read, then a client-credentials token for it.
  const registered = await request('POST', '/oauth/register', {
    body: {
      client_name: 'a2a-read-only-probe',
      redirect_uris: ['https://client.test/callback'],
      scope: 'tools:read',
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['client_credentials'],
    },
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  const issued = await request('POST', '/oauth/token', {
    body: {
      grant_type: 'client_credentials',
      client_id: registered.body.client_id,
      client_secret: registered.body.client_secret,
      scope: 'tools:read',
    },
  });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  readToken = issued.body.access_token as string;
}, 240_000);

afterAll(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  // The server keeps listening until this test process exits and its data lives
  // in the sandbox, so the sandbox is left in the OS temp dir, not deleted under it.
});

describe('/a2a routes through the real http-server', () => {
  it('positive control: the agent card stays public and the read login was issued', async () => {
    const card = await request('GET', '/a2a');
    expect(card.status).toBe(200);
    expect(readToken.length).toBeGreaterThan(0);
  });

  it('refuses every task route without credentials', async () => {
    const replies = {
      'POST /a2a/tasks': await sendTask('list_traits'),
      'POST /a2a': await request('POST', '/a2a', {
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'a2a.sendMessage',
          params: {
            message: { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
            skillId: 'list_traits',
            arguments: {},
          },
        },
      }),
      'GET /a2a/tasks': await request('GET', '/a2a/tasks'),
      'GET /a2a/tasks/:id': await request('GET', `/a2a/tasks/${UNKNOWN_TASK_ID}`),
      'DELETE /a2a/tasks/:id': await request('DELETE', `/a2a/tasks/${UNKNOWN_TASK_ID}`),
    };
    for (const [route, reply] of Object.entries(replies)) {
      expect(reply.status, `${route} without credentials: ${JSON.stringify(reply.body)}`).toBe(
        401
      );
    }
  });

  it('a refused request creates no task', async () => {
    const before = await adminTaskTotal();
    expect((await sendTask('list_traits')).status).toBe(401);
    expect(await adminTaskTotal()).toBe(before);
  });

  it('an admin key still runs a task', async () => {
    const reply = await sendTask('list_traits', TEST_KEY);
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(taskState(reply), JSON.stringify(reply.body.status)).toBe('completed');
  });

  it('a read login runs a read tool', async () => {
    const reply = await sendTask('list_traits', readToken);
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(taskState(reply), JSON.stringify(reply.body.status)).toBe('completed');
  });

  it('a read login is refused a write tool: the task runs with its scopes, not admin', async () => {
    const reply = await sendTask('create_share_link', readToken);
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(taskState(reply), JSON.stringify(reply.body.status)).toBe('failed');
    expect(JSON.stringify(reply.body.status)).toContain('Insufficient scope');
  });

  it('a read login cannot list every caller\'s tasks, over REST or JSON-RPC', async () => {
    const rest = await request('GET', '/a2a/tasks', { token: readToken });
    expect(rest.status, JSON.stringify(rest.body)).toBe(403);

    const rpc = await request('POST', '/a2a', {
      token: readToken,
      body: { jsonrpc: '2.0', id: 7, method: 'a2a.listTasks', params: {} },
    });
    expect(rpc.status).toBe(200);
    expect((rpc.body.error as { code?: number } | undefined)?.code, JSON.stringify(rpc.body)).toBe(
      -32003
    );
  });
});
