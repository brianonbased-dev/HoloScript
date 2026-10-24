import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  setRequestHandler: vi.fn(),
  handleCodebaseTool: vi.fn().mockResolvedValue({ ok: true }),
  handleGraphRagTool: vi.fn().mockResolvedValue({ ok: true }),
  handleAbsorbServiceTool: vi.fn().mockResolvedValue({ ok: true }),
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
const tool = (name: string) => ({ name, description: name, inputSchema: { type: 'object', properties: {} } });
vi.mock('@holoscript/absorb-service/mcp', () => ({
  absorbServiceTools: [tool('absorb_run_absorb'), tool('absorb_query')],
  handleAbsorbServiceTool: mocks.handleAbsorbServiceTool,
  absorbTypescriptTools: [],
  handleAbsorbTypescriptTool: vi.fn(),
  graphRagTools: [tool('holo_ask_codebase')],
  handleGraphRagTool: mocks.handleGraphRagTool,
  codebaseTools: [tool('holo_absorb_repo'), tool('holo_absorb_manifest'), tool('holo_detect_drift')],
  handleCodebaseTool: mocks.handleCodebaseTool,
}));
vi.mock('./middleware/github-identity.js', () => ({ resolveGitHubToken: vi.fn() }));

import { handleMcpStreamableHttp } from './mcp-handler.js';

function res(): Response {
  const r: any = { headersSent: false, on: () => r, status: () => r, json: () => r };
  return r;
}

/** Open a /mcp request as `auth` and return the CallTool handler bound to that caller. */
async function callToolAs(auth: Record<string, unknown>) {
  mocks.setRequestHandler.mockClear();
  await handleMcpStreamableHttp({ body: {}, ...auth } as unknown as Request, res());
  const callTool = mocks.setRequestHandler.mock.calls[1][1] as (r: unknown) => Promise<any>;
  return (name: string, args: Record<string, unknown> = {}) => callTool({ params: { name, arguments: args } });
}

const GITHUB_USER = { authenticated: true, authKind: 'github', userId: 'gh-user-1' };
const SERVICE = { authenticated: true, authKind: 'service' };
const SERVICE_FOR_USER = { authenticated: true, authKind: 'service', userId: 'gh-user-2' };
const ORCHESTRATOR = {
  authenticated: true,
  authKind: 'orchestrator',
  orchestratorGated: true,
  userId: 'orchestrator:key-id-1',
};

describe('absorb /mcp paid tools by caller', () => {
  beforeEach(() => {
    mocks.handleCodebaseTool.mockClear();
    mocks.handleGraphRagTool.mockClear();
    mocks.handleAbsorbServiceTool.mockClear();
  });

  it('refuses paid tools to a GitHub-token caller (402) without running them', async () => {
    const call = await callToolAs(GITHUB_USER);
    for (const name of ['holo_absorb_repo', 'holo_absorb_manifest', 'holo_detect_drift', 'absorb_run_absorb', 'absorb_query']) {
      const out = await call(name);
      expect(out.isError).toBe(true);
      expect(JSON.parse(out.content[0].text)).toMatchObject({ status: 402, error: 'payment_required' });
    }
    expect(mocks.handleCodebaseTool).not.toHaveBeenCalled();
    expect(mocks.handleAbsorbServiceTool).not.toHaveBeenCalled();
  });

  it('refuses paid tools to an unauthenticated (local dev) caller (403)', async () => {
    const call = await callToolAs({});
    const out = await call('holo_absorb_repo');
    expect(JSON.parse(out.content[0].text)).toMatchObject({ status: 403 });
    expect(mocks.handleCodebaseTool).not.toHaveBeenCalled();
  });

  it('admits paid tools for the service key and a verified orchestrator call', async () => {
    await (await callToolAs(SERVICE))('holo_absorb_repo');
    await (await callToolAs(ORCHESTRATOR))('holo_absorb_repo');
    expect(mocks.handleCodebaseTool).toHaveBeenCalledTimes(2);
    // Bare service key: trusted operator, legacy state (no caller context).
    expect(mocks.handleCodebaseTool.mock.calls[0][2]).toBeUndefined();
    // Orchestrator: server keys allowed, but its key id is never an owner.
    expect(mocks.handleCodebaseTool.mock.calls[1][2]).toEqual({ ownerId: null, serverKeysAllowed: true });
  });

  it('passes the resolved account (never a key) to holo_ask_codebase, with server keys only for the service', async () => {
    await (await callToolAs(GITHUB_USER))('holo_ask_codebase', { question: 'q' });
    await (await callToolAs(SERVICE_FOR_USER))('holo_ask_codebase', { question: 'q' });
    expect(mocks.handleGraphRagTool.mock.calls[0][2]).toEqual({ ownerId: 'gh-user-1', serverKeysAllowed: false });
    expect(mocks.handleGraphRagTool.mock.calls[1][2]).toEqual({ ownerId: 'gh-user-2', serverKeysAllowed: true });
  });
});
