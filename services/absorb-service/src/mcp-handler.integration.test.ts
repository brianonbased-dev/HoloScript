import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleMcpStreamableHttp } from './mcp-handler.js';
import type { AuthenticatedRequest } from './middleware/auth.js';

let server: Server;
let endpoint = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Stand-in for authMiddleware: the caller named in x-test-caller is
  // authenticated ("admin" as an admin, anything else as a GitHub user).
  app.use((req, _res, next) => {
    const caller = req.headers['x-test-caller'];
    if (typeof caller === 'string') {
      const authReq = req as AuthenticatedRequest;
      authReq.authenticated = true;
      authReq.userId = caller;
      authReq.isAdmin = caller === 'admin';
    }
    next();
  });
  app.post('/mcp', handleMcpStreamableHttp);

  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate an ephemeral HoloAbsorb MCP port');
  }
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function rpc(body: Record<string, unknown>, caller?: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(caller ? { 'x-test-caller': caller } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error(`MCP returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return {
    response,
    body: parsed,
  };
}

describe('HoloAbsorb stateless MCP integration', () => {
  it('initializes without allocating an affinity-bound session', async () => {
    const { response, body } = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'holoabsorb-integration-test', version: '1.0.0' },
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('mcp-session-id')).toBeNull();
    expect(body.result).toMatchObject({
      protocolVersion: '2025-03-26',
      serverInfo: {
        name: 'absorb-service',
      },
    });
  }, 60_000);

  it('lists and calls the official HoloAbsorb manifest on independent requests', async () => {
    const listed = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(listed.response.status).toBe(200);
    expect(listed.body.result.tools.length).toBeGreaterThan(0);
    expect(
      listed.body.result.tools.some((tool: { name?: string }) => tool.name === 'holo_absorb_manifest'),
    ).toBe(true);

    const called = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'holo_absorb_manifest',
        arguments: {},
      },
    });

    expect(called.response.status).toBe(200);
    const text = called.body.result.content.find(
      (entry: { type?: string }) => entry.type === 'text',
    )?.text;
    const result = JSON.parse(text);
    expect(result.manifest).toMatchObject({
      productName: 'HoloAbsorb',
      officialMcpTool: 'holo_absorb_manifest',
    });
  }, 60_000);

  it('reads source code only for admins: a GitHub user gets code_read_not_allowed (claude4, 2026-10-08)', async () => {
    const CODE_LINE = 'return headMatches && fingerprintMatches;';
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoabsorb-host-gate-repo-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, windowsHide: true });
    git('init');
    git('config', 'user.email', 'codex@example.test');
    git('config', 'user.name', 'Codex Test');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'src', 'freshness.ts'),
      [
        'export function isCachedMapFresh(headMatches: boolean, fingerprintMatches: boolean): boolean {',
        `  ${CODE_LINE}`,
        '}',
        '',
      ].join('\n'),
    );
    git('add', '.');
    git('commit', '-m', 'init');
    const saved = { ...process.env };
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoabsorb-host-gate-cache-')),
      HOLOSCRIPT_WORKSPACE_ROOT: repo,
      ABSORB_ALLOWED_ROOTS: repo,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
    });
    try {
      const call = (name: string, args: Record<string, unknown>, caller: string) =>
        rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, caller);
      const resultText = (r: { body: Record<string, any> }) =>
        String(r.body.result?.content?.find((e: { type?: string }) => e.type === 'text')?.text ?? '');

      const absorb = await call('holo_absorb_repo', { force: true, outputFormat: 'stats' }, 'admin');
      expect(resultText(absorb)).not.toContain('"error"');

      const source = { query: 'isCachedMapFresh', queryType: 'source', symbolName: 'isCachedMapFresh' };
      const user = resultText(await call('holo_query_codebase', source, 'github-user-1'));
      expect(user).toContain('code_read_not_allowed');
      expect(user).not.toContain(CODE_LINE);
      const admin = resultText(await call('holo_query_codebase', source, 'admin'));
      expect(admin).toContain(CODE_LINE);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  }, 120_000);
});
