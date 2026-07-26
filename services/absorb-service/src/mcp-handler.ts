import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { resolveGitHubToken } from './middleware/github-identity.js';
import { SERVICE_VERSION } from './version.js';

const transports = new Map<string, SSEServerTransport>();
const sessionUserMap = new Map<string, string>();

/**
 * Live tool count registered on the most recent createMcpServer() call.
 * Updated once at first-session setup; reported in /.well-known/mcp so the
 * discovery doc doesn't lie when the underlying @holoscript/absorb-service
 * package changes its exported tool surface.
 */
let _lastRegisteredToolCount = 0;

export function getSessionUserId(sessionId: string): string | undefined {
  return sessionUserMap.get(sessionId);
}

export function getRegisteredToolCount(): number {
  // Report the actual count registered on the last MCP server setup.
  // Zero means no MCP session has initialized yet — discovery clients should
  // still receive a valid number without a hardcoded guess.
  return _lastRegisteredToolCount;
}

async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'absorb-service',
    version: SERVICE_VERSION,
  });

  type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;
  const registeredTools = new Map<string, { definition: any; handler: ToolHandler }>();

  const addToolFamily = (definitions: unknown, handler: unknown) => {
    if (!Array.isArray(definitions) || typeof handler !== 'function') return;
    for (const definition of definitions) {
      if (!definition || typeof definition.name !== 'string') continue;
      registeredTools.set(definition.name, {
        definition,
        handler: handler as ToolHandler,
      });
    }
  };

  try {
    const mcpModule = (await import('@holoscript/absorb-service/mcp')) as Record<string, any>;

    addToolFamily(
      mcpModule.absorbServiceTools,
      mcpModule.handleAbsorbServiceTool ?? mcpModule.absorbServiceToolHandler,
    );
    addToolFamily(
      mcpModule.absorbTypescriptTools,
      mcpModule.handleAbsorbTypescriptTool ?? mcpModule.absorbTypescriptToolHandler,
    );
    addToolFamily(
      mcpModule.codebaseTools,
      mcpModule.handleCodebaseTool ?? mcpModule.codebaseToolHandler,
    );
    addToolFamily(
      mcpModule.graphRagTools,
      mcpModule.handleGraphRagTool ?? mcpModule.graphRagToolHandler,
    );

  } catch (e: any) {
    console.warn('[mcp] Failed to register absorb MCP tools:', e.message);
  }
  // Fail closed on observability: zero is more useful than a stale count from a
  // prior request when the current runtime closure cannot be imported.
  _lastRegisteredToolCount = registeredTools.size;

  // The package exports standard JSON Schema definitions. Register them on the
  // SDK's low-level server rather than passing them to McpServer.tool(), whose
  // high-level overload accepts Zod schemas only. The old mismatch caused the
  // first nested schema to abort the entire live tool registration loop.
  server.server.registerCapabilities({
    tools: {
      listChanged: true,
    },
  });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...registeredTools.values()].map(({ definition }) => definition),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const entry = registeredTools.get(name);
    if (!entry) {
      return {
        content: [{ type: 'text' as const, text: `Unknown HoloAbsorb tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await entry.handler(
        name,
        (request.params.arguments ?? {}) as Record<string, unknown>,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Resolve the complete package-backed tool registry before the HTTP listener is
 * admitted. Railway should roll back a broken image instead of serving a
 * healthy-looking process whose MCP inventory is empty.
 */
export async function assertMcpToolInventoryReady(): Promise<number> {
  const server = await createMcpServer();
  const count = getRegisteredToolCount();
  await server.close().catch(() => {});
  if (count < 1) {
    throw new Error(
      'HoloAbsorb MCP tool inventory is empty; verify the packaged workspace runtime closure',
    );
  }
  return count;
}

export async function handleMcpSse(req: Request, res: Response): Promise<void> {
  const sessionId = randomUUID();
  
  // Client should POST to /mcp/messages with sessionId in query
  const host = req.headers.host || 'localhost:3005';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;
  const transport = new SSEServerTransport(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, res);
  transports.set(sessionId, transport);

  req.on('close', () => {
    transports.delete(sessionId);
    sessionUserMap.delete(sessionId);
  });

  const server = await createMcpServer();
  await server.connect(transport);
  await transport.start();
}

/**
 * POST /mcp — canonical stateless Streamable HTTP transport.
 *
 * A transport and MCP server are created per request deliberately. Railway may
 * route consecutive requests to different replicas, so correctness cannot
 * depend on an in-memory session map or a sticky edge. `enableJsonResponse`
 * keeps ordinary initialize/list/call requests as bounded JSON responses while
 * remaining protocol-compatible with Streamable HTTP clients.
 */
export async function handleMcpStreamableHttp(req: Request, res: Response): Promise<void> {
  const server = await createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  };

  res.on('close', () => {
    void close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    console.error('[mcp] Streamable HTTP POST error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32603,
          message: 'Internal MCP transport error',
        },
      });
    }
    await close();
  }
}

// POST /mcp/messages — Handle incoming JSON-RPC messages from the client
export async function handleMcpMessages(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    // Bind userId to session from Authorization header (best-effort)
    if (!sessionUserMap.has(sessionId)) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        try {
          const identity = await resolveGitHubToken(token);
          if (identity) {
            sessionUserMap.set(sessionId, identity.userId);
          }
        } catch {
          // Token resolution failed — session remains anonymous
        }
      }
    }

    // Pipe the request/response through the transport
    await transport.handlePostMessage(req, res, req.body);
  } catch (error: any) {
    console.error('[mcp] POST error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed', message: error.message });
    }
  }
}

// DELETE /mcp — Close session (optional for SSE, but kept for compatibility)
export async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const sessionId = req.query.sessionId as string;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.close();
  transports.delete(sessionId);
  res.json({ closed: true });
}

// GET /.well-known/mcp — MCP discovery document
export function handleMcpDiscovery(req: Request, res: Response): void {
  const host = req.headers.host || 'localhost:3005';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;

  res.json({
    mcpVersion: '2025-03-26',
    name: 'absorb-service',
    productName: 'HoloAbsorb',
    version: SERVICE_VERSION,
    description: 'HoloScript Codebase Intelligence & Recursive Self-Improvement Service — scan codebases, build knowledge graphs, run GraphRAG queries, and execute recursive improvement pipelines.',
    transport: {
      type: 'streamableHttp',
      url: `${baseUrl}/mcp`,
      authentication: {
        type: 'bearer',
        headerName: 'Authorization',
      },
      stateless: true,
      fallback: {
        type: 'sse',
        url: `${baseUrl}/mcp`,
        messagesUrl: `${baseUrl}/mcp/messages`,
        lifecycle: 'legacy',
      },
    },
    capabilities: {
      tools: { count: getRegisteredToolCount() },
      resources: false,
      prompts: false,
    },
    categories: {
      'Codebase Scanning': 5,
      'Graph Analysis': 4,
      'GraphRAG Queries': 4,
      'TypeScript Analysis': 3,
      'Pipeline Management': 2,
      'Credit System': 2,
    },
    endpoints: {
      health: `${baseUrl}/health`,
      api: `${baseUrl}/api`,
      mcp: `${baseUrl}/mcp`,
      discovery: `${baseUrl}/.well-known/mcp`,
    },
    contact: {
      repository: 'https://github.com/brianonbased-dev/HoloScript',
    },
  });
}

export function getActiveSessionCount(): number {
  return transports.size;
}
