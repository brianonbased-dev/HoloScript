import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { handleMcpStreamableHttp } from './mcp-handler.js';

let server: Server;
let endpoint = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
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

async function rpc(body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
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
});
