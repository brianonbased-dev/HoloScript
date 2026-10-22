import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = await vi.hoisted(async () => {
  // A tiny stand-in for the per-owner GraphRAG store: an owner scope plus a
  // Map of what each owner absorbed, so the test can see where state lands.
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const scope = new AsyncLocalStorage<string>();
  const store = new Map<string, string>();
  return {
    scope,
    store,
    setRequestHandler: vi.fn(),
    handleGraphRagTool: vi.fn(async (_n: string, _a: unknown, ctx?: { ownerKey: string | null }) => {
      const owner = ctx?.ownerKey;
      return owner && store.has(owner) ? { graph: store.get(owner) } : { error: 'absorb first' };
    }),
    handleCodebaseTool: vi.fn(async (_n: string, args: { query?: string }) => {
      const owner = scope.getStore() ?? 'local';
      store.set(owner, String(args.query));
      return { ok: true, owner };
    }),
    runWithGraphRAGOwner: vi.fn((owner: string, fn: () => unknown) => scope.run(owner, fn)),
    resetGraphRAGState: vi.fn(() => {
      store.delete(scope.getStore() ?? 'local');
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    server = { registerCapabilities: vi.fn(), setRequestHandler: mocks.setRequestHandler };
    connect = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({ SSEServerTransport: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('@holoscript/absorb-service/mcp', () => ({
  absorbServiceTools: [],
  handleAbsorbServiceTool: vi.fn(),
  absorbTypescriptTools: [],
  handleAbsorbTypescriptTool: vi.fn(),
  graphRagTools: [{ name: 'holo_semantic_search', inputSchema: { type: 'object' } }],
  handleGraphRagTool: mocks.handleGraphRagTool,
  codebaseTools: [{ name: 'holo_absorb_repo', inputSchema: { type: 'object' } }],
  handleCodebaseTool: mocks.handleCodebaseTool,
  runWithGraphRAGOwner: mocks.runWithGraphRAGOwner,
  resetGraphRAGState: mocks.resetGraphRAGState,
}));
vi.mock('./middleware/github-identity.js', () => ({ resolveGitHubToken: vi.fn() }));

import { handleMcpStreamableHttp } from './mcp-handler.js';

function res(): Response {
  const r: any = { on: () => r, status: () => r, json: () => r, headersSent: false };
  return r;
}

async function callToolAs(
  req: Partial<Request> & Record<string, unknown>,
  name: string,
  query = 'q'
) {
  mocks.setRequestHandler.mockClear();
  await handleMcpStreamableHttp({ body: {}, ...req } as Request, res());
  // setRequestHandler(ListTools), then setRequestHandler(CallTool)
  const callTool = mocks.setRequestHandler.mock.calls[1][1];
  return callTool({ params: { name, arguments: { query } } });
}

describe('HoloAbsorb MCP tool calls run as the authenticated caller', () => {
  beforeEach(() => {
    mocks.handleGraphRagTool.mockClear();
    mocks.handleCodebaseTool.mockClear();
    mocks.runWithGraphRAGOwner.mockClear();
    mocks.resetGraphRAGState.mockClear();
    mocks.store.clear();
  });

  it('passes the principal to graph-rag tools and scopes absorb to it', async () => {
    await callToolAs({ authenticated: true, userId: 'github:alice' }, 'holo_semantic_search');
    expect(mocks.handleGraphRagTool).toHaveBeenCalledWith(
      'holo_semantic_search',
      { query: 'q' },
      { ownerKey: 'github:alice' }
    );
    expect(mocks.runWithGraphRAGOwner).toHaveBeenCalledWith('github:alice', expect.any(Function));

    await callToolAs({ authenticated: true, userId: 'github:bob' }, 'holo_absorb_repo');
    expect(mocks.runWithGraphRAGOwner).toHaveBeenLastCalledWith('github:bob', expect.any(Function));
    expect(mocks.handleCodebaseTool).toHaveBeenCalledWith('holo_absorb_repo', { query: 'q' });
  });

  it('refuses graph-rag tools with owner_required (401) when no caller is verified', async () => {
    const out = await callToolAs({ authenticated: false }, 'holo_semantic_search');
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toMatchObject({ error: 'owner_required', status: 401 });
    expect(mocks.handleGraphRagTool).not.toHaveBeenCalled();
  });

  it('never uses a shared service-key slot: key-only callers are stateless and isolated', async () => {
    const keyOnly = { authenticated: true }; // service key, no forwarded userId
    const a = await callToolAs(keyOnly, 'holo_absorb_repo', 'SECRET_GRAPH_OF_A');
    const b = await callToolAs(keyOnly, 'holo_absorb_repo', 'SECRET_GRAPH_OF_B');
    const ownerA = JSON.parse(a.content[0].text).owner;
    const ownerB = JSON.parse(b.content[0].text).owner;
    expect(ownerA).toMatch(/^ephemeral:/);
    expect(ownerB).toMatch(/^ephemeral:/);
    expect(ownerA).not.toBe(ownerB);
    for (const call of mocks.runWithGraphRAGOwner.mock.calls) {
      expect(call[0]).not.toBe('service:absorb-api-key');
    }
    // Nothing a key-only caller absorbed survives its call.
    expect(mocks.resetGraphRAGState).toHaveBeenCalledTimes(2);
    expect(mocks.store.size).toBe(0);

    // Neither key-only caller can read a saved graph, its own or the other's.
    const search = await callToolAs(keyOnly, 'holo_semantic_search');
    expect(JSON.parse(search.content[0].text)).toMatchObject({ error: 'owner_required', status: 401 });
    expect(search.content[0].text).not.toContain('SECRET_GRAPH_OF');
    expect(mocks.handleGraphRagTool).not.toHaveBeenCalled();
  });

  it('a forwarded user keeps its own saved graph; a key-only caller cannot see it', async () => {
    await callToolAs({ authenticated: true, userId: 'github:alice' }, 'holo_absorb_repo', 'ALICE_GRAPH');
    const alice = await callToolAs({ authenticated: true, userId: 'github:alice' }, 'holo_semantic_search');
    expect(alice.content[0].text).toContain('ALICE_GRAPH');
    const keyOnly = await callToolAs({ authenticated: true }, 'holo_semantic_search');
    expect(keyOnly.content[0].text).not.toContain('ALICE_GRAPH');
    expect(JSON.parse(keyOnly.content[0].text)).toMatchObject({ error: 'owner_required' });
  });
});
