/**
 * Boots the REAL http-server.ts for a test file and speaks to it over real HTTP, the way
 * production runs it. A helper-only test stays green with a route's branches deleted; this
 * does not.
 *
 * Extracted from a2a-routes-require-login.test.ts (same method, first used by
 * oauth-register-loopback-only.test.ts): process.env scrubbed to an allowlist before the
 * import, a sandboxed home and data dir, a closed loopback port for the orchestrator, and fetch
 * fenced to loopback. The server binds 127.0.0.1 only. Not a test file (no .test.ts), so
 * vitest does not collect it.
 *
 * Use: `server = await bootRealHttpServer({ sandboxPrefix: 'mcp-x-' })` in beforeAll (give it
 * the 240 s the boot can take), `restoreRealHttpServerEnv()` in afterAll. The server keeps
 * listening until the test process exits, and its sandbox is left in the OS temp dir.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import http from 'http';
import { createServer, type AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/** Accepted by the legacy-key path (admin); not in the key registry, so not a founder. */
export const REAL_SERVER_ADMIN_KEY = 'real-http-server-test-key-not-a-founder';

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

export type Reply = { status: number; body: Record<string, unknown> };

export interface RealHttpServer {
  port: number;
  /** One request on one fresh connection; the answer parsed as JSON (or `{ raw }`). */
  request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options?: { body?: unknown; token?: string }
  ): Promise<Reply>;
  /** A client-credentials token for a client registered over loopback with exactly `scope`. */
  tokenWithScope(scope: string): Promise<string>;
}

let savedEnv: NodeJS.ProcessEnv | undefined;
let realFetch: typeof fetch | undefined;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

export async function bootRealHttpServer(options: {
  sandboxPrefix: string;
  /** Extra settings, applied after the scrub (HOLOSCRIPT_API_KEY is the admin key unless set). */
  env?: Record<string, string>;
  healthTimeoutMs?: number;
}): Promise<RealHttpServer> {
  savedEnv = { ...process.env };
  realFetch = globalThis.fetch;
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  const sandbox = mkdtempSync(join(tmp, options.sandboxPrefix));
  const dataDir = join(sandbox, 'holomesh');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'keys.json'), JSON.stringify({ keys: [] }));
  const port = await freePort();

  for (const k of Object.keys(process.env)) if (!keepEnv(k)) delete process.env[k];
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HOLOSCRIPT_API_KEY: REAL_SERVER_ADMIN_KEY,
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
    ...options.env,
  });

  const passThrough = realFetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { hostname, origin } = new URL(href);
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) {
      throw new Error(`test network fence: refused ${origin}`);
    }
    return passThrough(input, init);
  }) as typeof fetch;

  const request: RealHttpServer['request'] = (method, path, opts = {}) =>
    new Promise((resolve, reject) => {
      const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
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
            ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
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

  await import('../http-server');
  const deadline = Date.now() + (options.healthTimeoutMs ?? 150_000);
  let last = '';
  for (;;) {
    try {
      const health = await request('GET', '/health');
      if (health.status === 200) break;
      last = `HTTP ${health.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (Date.now() > deadline) {
      throw new Error(`http-server did not answer /health in time (${last})`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const tokenWithScope: RealHttpServer['tokenWithScope'] = async (scope) => {
    const registered = await request('POST', '/oauth/register', {
      body: {
        client_name: `probe-${scope.replace(/[^a-z]+/g, '-')}`,
        redirect_uris: ['https://client.test/callback'],
        scope,
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['client_credentials'],
      },
    });
    if (registered.status !== 201) {
      throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.body)}`);
    }
    const issued = await request('POST', '/oauth/token', {
      body: {
        grant_type: 'client_credentials',
        client_id: registered.body.client_id,
        client_secret: registered.body.client_secret,
        scope,
      },
    });
    if (issued.status !== 200) {
      throw new Error(`token failed: ${issued.status} ${JSON.stringify(issued.body)}`);
    }
    return issued.body.access_token as string;
  };

  return { port, request, tokenWithScope };
}

export function restoreRealHttpServerEnv(): void {
  if (realFetch) globalThis.fetch = realFetch;
  if (savedEnv) {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}
