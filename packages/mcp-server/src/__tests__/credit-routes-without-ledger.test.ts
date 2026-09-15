/**
 * POST /api/credits/check and POST /api/credits/deduct, driven through the REAL
 * http-server.ts — production mode, no DATABASE_URL, real HTTP requests.
 *
 * Why this exists: security/__tests__/credit-check-without-ledger.test.ts only
 * proves the helper's answer. It stayed green with the pre-#297 http-server.ts
 * put back, because nothing checked that the routes actually use the helper.
 * This file starts http-server.ts the way production does (import it; its
 * startup block listens on PORT) and calls the routes over HTTP, so it goes red
 * if either route answers "ok" without a credit ledger.
 *
 * Nothing is mocked. Only the environment and fixture data are chosen:
 *  - process.env is scrubbed to an OS/test-runner allowlist before import, so
 *    no real key, DATABASE_URL, Railway token or opt-in loop from the shell that
 *    runs this file can reach the server under test;
 *  - home, data and cache dirs point at a temp dir, so nothing is read from or
 *    written to the real ~/.holoscript;
 *  - keys.json holds one unrelated non-founder record, so first-boot founder
 *    seeding does not turn the test key into a founder (production has the same
 *    shape after its first boot);
 *  - ORCHESTRATOR_URL points at a closed loopback port: the ci-public worker
 *    starts whenever HOLOSCRIPT_API_KEY is set and would otherwise poll the live
 *    orchestrator;
 *  - fetch is fenced to loopback, and the last test asserts nothing tried to
 *    leave this machine.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Accepted by the legacy-key path; not in the key registry, so not a founder.
const TEST_KEY = 'credit-route-test-key-not-a-founder';

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
let baseUrl = '';
let sandbox = '';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
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

beforeAll(async () => {
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  sandbox = mkdtempSync(join(tmp, 'mcp-credit-routes-'));
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
  const port = await freePort();

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
    const href =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
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
}, 240_000);

afterAll(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  // The server keeps listening until this test process exits and its data lives
  // in the sandbox, so the sandbox is left in the OS temp dir, not deleted under it.
});

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = { 'x-mcp-api-key': TEST_KEY }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const ROUTES = ['/api/credits/check', '/api/credits/deduct'] as const;

describe('credit routes with no credit ledger, in production (real http-server)', () => {
  it('positive control: the caller is authenticated, not a founder, and reaches the route body', async () => {
    expect(process.env.DATABASE_URL).toBeUndefined();
    // A founder gets 200 before the body is read; an unauthenticated caller gets
    // 401. Only a real, non-founder request reaches the operation lookup.
    for (const path of ROUTES) {
      const r = await post(path, { userId: 'route-test-user', operation: 'no_such_operation' });
      expect(r.status, path).toBe(400);
      expect(String(r.body.error), path).toMatch(/Unknown operation/);
    }
  });

  it('control: without credentials both routes answer 401', async () => {
    for (const path of ROUTES) {
      const r = await post(path, { userId: 'route-test-user', operation: 'studio_generate' }, {});
      expect(r.status, path).toBe(401);
    }
  });

  it('POST /api/credits/check refuses with 503 instead of "ok, balance Infinity"', async () => {
    const r = await post('/api/credits/check', {
      userId: 'route-test-user',
      operation: 'studio_generate',
    });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.balance).toBeUndefined();
    expect(r.body.required).toBeGreaterThan(0);
  });

  it('POST /api/credits/deduct refuses with 503 instead of "ok, cost N" with nothing recorded', async () => {
    const r = await post('/api/credits/deduct', {
      userId: 'route-test-user',
      operation: 'studio_generate',
    });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.cost).toBeUndefined();
    expect(r.body.required).toBeGreaterThan(0);
  });

  it('the run tried to reach nothing off this machine', () => {
    expect(offMachine).toEqual([]);
  });
});
