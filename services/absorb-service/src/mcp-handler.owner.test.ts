import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  setRequestHandler: vi.fn(),
  handleGraphRagTool: vi.fn().mockResolvedValue({ ok: true }),
  handleCodebaseTool: vi.fn().mockResolvedValue({ ok: true }),
  runWithGraphRAGOwner: vi.fn((_owner: string, fn: () => unknown) => fn()),
}));

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
}));
vi.mock('./middleware/github-identity.js', () => ({ resolveGitHubToken: vi.fn() }));

import { handleMcpStreamableHttp } from './mcp-handler.js';

function res(): Response {
  const r: any = { on: () => r, status: () => r, json: () => r, headersSent: false };
  return r;
}

async function callToolAs(req: Partial<Request> & Record<string, unknown>, name: string) {
  mocks.setRequestHandler.mockClear();
  await handleMcpStreamableHttp({ body: {}, ...req } as Request, res());
  // setRequestHandler(ListTools), then setRequestHandler(CallTool)
  const callTool = mocks.setRequestHandler.mock.calls[1][1];
  return callTool({ params: { name, arguments: { query: 'q' } } });
}

describe('HoloAbsorb MCP tool calls run as the authenticated caller', () => {
  beforeEach(() => {
    mocks.handleGraphRagTool.mockClear();
    mocks.handleCodebaseTool.mockClear();
    mocks.runWithGraphRAGOwner.mockClear();
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

  it('gives graph-rag tools a null owner (refused by the library) when no caller is verified', async () => {
    await callToolAs({ authenticated: false }, 'holo_semantic_search');
    expect(mocks.handleGraphRagTool).toHaveBeenCalledWith(
      'holo_semantic_search',
      { query: 'q' },
      { ownerKey: null }
    );
    expect(mocks.runWithGraphRAGOwner).not.toHaveBeenCalled();
  });
});
