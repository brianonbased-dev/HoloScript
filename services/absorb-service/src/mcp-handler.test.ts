import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => {
  const connect = vi.fn();
  const serverClose = vi.fn().mockResolvedValue(undefined);
  const registerCapabilities = vi.fn();
  const setRequestHandler = vi.fn();
  const handleRequest = vi.fn().mockResolvedValue(undefined);
  const transportClose = vi.fn().mockResolvedValue(undefined);
  const streamableConstructor = vi.fn();

  return {
    connect,
    serverClose,
    registerCapabilities,
    setRequestHandler,
    handleRequest,
    transportClose,
    streamableConstructor,
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    server = {
      registerCapabilities: mocks.registerCapabilities,
      setRequestHandler: mocks.setRequestHandler,
    };
    connect = mocks.connect;
    close = mocks.serverClose;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    constructor(options: unknown) {
      mocks.streamableConstructor(options);
    }

    handleRequest = mocks.handleRequest;
    close = mocks.transportClose;
  },
}));

vi.mock('@holoscript/absorb-service/mcp', () => ({
  absorbServiceTools: [],
  handleAbsorbServiceTool: vi.fn(),
  absorbTypescriptTools: [],
  handleAbsorbTypescriptTool: vi.fn(),
  graphRagTools: [],
  handleGraphRagTool: vi.fn(),
  codebaseTools: [
    {
      name: 'holo_absorb_manifest',
      description: 'Official HoloAbsorb ownership manifest',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  handleCodebaseTool: vi.fn().mockResolvedValue({ manifest: { productName: 'HoloAbsorb' } }),
}));

vi.mock('./middleware/github-identity.js', () => ({
  resolveGitHubToken: vi.fn(),
}));

import {
  assertMcpToolInventoryReady,
  getRegisteredToolCount,
  handleMcpDiscovery,
  handleMcpStreamableHttp,
} from './mcp-handler.js';

function createResponse(): Response & {
  closeHandler?: () => void;
  payload?: unknown;
} {
  const res: any = {
    headersSent: false,
    statusCode: 200,
    on(event: string, handler: () => void) {
      if (event === 'close') res.closeHandler = handler;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.payload = payload;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}

describe('HoloAbsorb MCP transports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles POST /mcp with an isolated stateless JSON response transport', async () => {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };
    const req = { body } as Request;
    const res = createResponse();

    await handleMcpStreamableHttp(req, res);

    expect(mocks.streamableConstructor).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.handleRequest).toHaveBeenCalledWith(req, res, body);
    expect(mocks.registerCapabilities).toHaveBeenCalledWith({
      tools: { listChanged: true },
    });
    expect(mocks.setRequestHandler).toHaveBeenCalledTimes(2);

    res.closeHandler?.();
    await vi.waitFor(() => {
      expect(mocks.transportClose).toHaveBeenCalledTimes(1);
      expect(mocks.serverClose).toHaveBeenCalledTimes(1);
    });
  });

  it('primes a non-empty tool inventory before the service is admitted', async () => {
    await expect(assertMcpToolInventoryReady()).resolves.toBe(1);
    expect(getRegisteredToolCount()).toBe(1);
    expect(mocks.serverClose).toHaveBeenCalledTimes(1);
  });

  it('advertises stateless Streamable HTTP first and SSE only as a legacy fallback', () => {
    const req = {
      headers: {
        host: 'absorb.holoscript.net',
        'x-forwarded-proto': 'https',
      },
    } as Request;
    const res = createResponse();

    handleMcpDiscovery(req, res);

    expect(res.payload).toMatchObject({
      name: 'absorb-service',
      productName: 'HoloAbsorb',
      transport: {
        type: 'streamableHttp',
        url: 'https://absorb.holoscript.net/mcp',
        stateless: true,
        authentication: {
          type: 'bearer',
          headerName: 'Authorization',
        },
        fallback: {
          type: 'sse',
          url: 'https://absorb.holoscript.net/mcp',
          messagesUrl: 'https://absorb.holoscript.net/mcp/messages',
          lifecycle: 'legacy',
        },
      },
    });
  });
});
