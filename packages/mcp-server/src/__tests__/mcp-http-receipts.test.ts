/**
 * Every HTTP tool call leaves a receipt (2026-10-05). The stateless POST /mcp
 * JSON-RPC path, which the local agent proxy uses, called
 * securedToolExecution directly, skipping the tool-call gate: no
 * founderGateX402ToolCallCheck and no receipt. The receipt log's last line
 * was 2026-09-23 while agents kept calling the laptop node. This boots the
 * real http-server (harness pattern from oauth-register-loopback-only.test.ts)
 * and proves a POST /mcp call is receipted with the declared client label.
 */
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'fs';
import { createServer, type AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_KEY = 'mcp-http-receipts-test-key-not-a-founder';
const savedEnv: NodeJS.ProcessEnv = { ...process.env };
const realFetch = globalThis.fetch;
let port = 0;
let receiptPath = '';

const KEEP = new Set(
  ['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'NODE_OPTIONS']
);
const keepEnv = (k: string) =>
  KEEP.has(k.toUpperCase()) || k.startsWith('VITEST') || k.startsWith('TINYPOOL');

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

function post(body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/mcp',
        agent: false,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': Buffer.byteLength(payload),
          connection: 'close',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            resolve({ raw: Buffer.concat(chunks).toString('utf8') });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function receipts(): Array<Record<string, unknown>> {
  if (!existsSync(receiptPath)) return [];
  return readFileSync(receiptPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

beforeAll(async () => {
  const tmp = savedEnv.TEMP || savedEnv.TMP || tmpdir();
  const sandbox = mkdtempSync(join(tmp, 'mcp-http-receipts-'));
  const dataDir = join(sandbox, 'holomesh');
  mkdirSync(dataDir, { recursive: true });
  receiptPath = join(sandbox, 'tool-calls.ndjson');
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
    HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH: receiptPath,
  });
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!['127.0.0.1', 'localhost'].includes(new URL(href).hostname)) {
      throw new Error(`test network fence: refused ${href}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  await import('../http-server');
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    try {
      if ((await realFetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('http-server did not come up');
}, 240_000);

afterAll(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

describe('receipts on the stateless POST /mcp path', () => {
  it('receipts a tools/call with the declared client label', async () => {
    const before = receipts().length;
    const reply = await post(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'parse_hs', arguments: { code: 'composition "R" { object "C" { geometry: "cube" } }' } },
      },
      { authorization: `Bearer ${TEST_KEY}`, 'x-holo-client': 'claude-code' }
    );
    expect(reply.error, JSON.stringify(reply).slice(0, 400)).toBeUndefined();
    const added = receipts().slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ tool: 'parse_hs', transport: 'http', status: 'ok', client: 'claude-code' });
  }, 120_000);

  it('drops a malformed client label rather than logging it', async () => {
    const before = receipts().length;
    await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'parse_hs', arguments: { code: 'composition "R" {}' } } },
      { authorization: `Bearer ${TEST_KEY}`, 'x-holo-client': 'claude code <script>' }
    );
    const added = receipts().slice(before);
    expect(added).toHaveLength(1);
    expect('client' in added[0]).toBe(false);
  }, 120_000);
});
