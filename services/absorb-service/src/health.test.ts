/**
 * GET /health must report the host package version and the engine package
 * version Node actually resolved — not a hardcoded string.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { writeHealthResponse } from './health.js';

const require = createRequire(import.meta.url);

const hostPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};
const enginePkgPath = require.resolve('@holoscript/absorb-service/package.json');
const enginePkg = JSON.parse(readFileSync(enginePkgPath, 'utf8')) as {
  name: string;
  version: string;
};

describe('GET /health versions', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.get('/health', (req, res) => {
      writeHealthResponse(req, res, {
        database: 'not configured',
        moltbookAgentCountProbe: 'unavailable',
        mcpSessions: 0,
        mcpTools: 0,
        moltbookActiveAgents: null,
        moltbookProbeLastError: null,
      });
    });
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no ephemeral port');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('returns the host package.json version and the resolved engine package.json version', async () => {
    expect(hostPkg.name).toBe('@holoscript/absorb-service-host');
    expect(enginePkg.name).toBe('@holoscript/absorb-service');

    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      engineVersion: string | null;
      engine?: { name: string; version: string };
      engineVersionReason?: string;
    };

    expect(body.version).toBe(hostPkg.version);
    expect(body.engineVersion).toBe(enginePkg.version);
    expect(body.engine).toEqual({ name: enginePkg.name, version: enginePkg.version });
    expect(body.engineVersionReason).toBeUndefined();
  });
});
