import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

const transports = new Map<string, StreamableHTTPServerTransport>();

function getToolCount(): number {
  // Count tools from the absorb service MCP modules
  try {
    return 20; // Known tool count from absorb-service/mcp
  } catch {
    return 0;
  }
}

async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'absorb-service',
    version: '6.0.0',
  });

  // Register absorb tools
  try {
    const { absorbServiceTools, absorbServiceToolHandler } = await import('@holoscript/absorb-service/mcp');
    for (const tool of absorbServiceTools) {
      server.tool(tool.name, tool.description || '', tool.inputSchema?.properties ? tool.inputSchema as any : {}, async (params: any) => {
        const result = await absorbServiceToolHandler(tool.name, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    }
  } catch (e: any) {
    console.warn('[mcp] Failed to register absorb tools:', e.message);
  }

  // Register TypeScript-specific tools
  try {
    const { absorbTypescriptTools, absorbTypescriptToolHandler } = await import('@holoscript/absorb-service/mcp');
    for (const tool of absorbTypescriptTools) {
      server.tool(tool.name, tool.description || '', tool.inputSchema?.properties ? tool.inputSchema as any : {}, async (params: any) => {
        const result = await absorbTypescriptToolHandler(tool.name, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    }
  } catch (e: any) {
    console.warn('[mcp] Failed to register typescript tools:', e.message);
  }

  // Register codebase query tools
  try {
    const { codebaseTools, codebaseToolHandler } = await import('@holoscript/absorb-service/mcp');
    for (const tool of codebaseTools) {
      server.tool(tool.name, tool.description || '', tool.inputSchema?.properties ? tool.inputSchema as any : {}, async (params: any) => {
        const result = await codebaseToolHandler(tool.name, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    }
  } catch (e: any) {
    console.warn('[mcp] Failed to register codebase tools:', e.message);
  }

  // Register GraphRAG tools
  try {
    const { graphRagTools, graphRagToolHandler } = await import('@holoscript/absorb-service/mcp');
    for (const tool of graphRagTools) {
      server.tool(tool.name, tool.description || '', tool.inputSchema?.properties ? tool.inputSchema as any : {}, async (params: any) => {
        const result = await graphRagToolHandler(tool.name, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      });
    }
  } catch (e: any) {
    console.warn('[mcp] Failed to register graphrag tools:', e.message);
  }

  return server;
}

async function getOrCreateTransport(sessionId?: string): Promise<StreamableHTTPServerTransport> {
  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId || randomUUID(),
  });

  const server = await createMcpServer();
  await server.connect(transport);

  const sid = transport.sessionId!;
  transports.set(sid, transport);

  transport.onclose = () => {
    transports.delete(sid);
  };

  return transport;
}

// POST /mcp — Handle MCP JSON-RPC messages
export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = await getOrCreateTransport(sessionId);

    // Pipe the request/response through the transport
    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    console.error('[mcp] POST error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed', message: error.message });
    }
  }
}

// GET /mcp — SSE stream for server-initiated messages
export async function handleMcpGet(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
}

// DELETE /mcp — Close session
export async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
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
    version: '6.0.0',
    description: 'HoloScript Codebase Intelligence & Recursive Self-Improvement Service — scan codebases, build knowledge graphs, run GraphRAG queries, and execute recursive improvement pipelines.',
    transport: {
      type: 'streamable-http',
      url: `${baseUrl}/mcp`,
      authentication: {
        type: 'bearer',
        headerName: 'Authorization',
      },
    },
    capabilities: {
      tools: { count: getToolCount() },
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
