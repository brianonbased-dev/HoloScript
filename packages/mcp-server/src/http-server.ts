#!/usr/bin/env node
/**
 * HoloScript MCP Server - Streamable HTTP Transport
 *
 * Production HTTP transport for HoloScript language tooling.
 * Enables remote AI agents to parse, validate, and generate HoloScript code.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import http from 'http';
import { tools } from './tools';
import { handleTool } from './handlers';
import { PluginManager } from './PluginManager';
import { renderPreview, createShareLink } from './renderer';

const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const SERVICE_NAME = 'holoscript-mcp';
const SERVICE_VERSION = '3.6.1';

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Check authentication
 */
function checkAuth(req: http.IncomingMessage): boolean {
  if (!MCP_API_KEY) return true;
  const auth = req.headers['authorization'] || '';
  const key = req.headers['x-api-key'] || '';
  return auth === `Bearer ${MCP_API_KEY}` || key === MCP_API_KEY;
}

/**
 * Parse JSON body from incoming request (native http has no built-in body parsing)
 */
function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Create MCP server instance
 */
function createMcpServer(): Server {
  const server = new Server(
    {
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...tools, ...PluginManager.getTools()],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Check plugins first (for proprietary tools like uaa2_)
      const pluginResult = await PluginManager.handleTool(name, args || {});
      if (pluginResult !== null) {
        return {
          content: [{ type: 'text', text: JSON.stringify(pluginResult, null, 2) }],
        };
      }

      const result = await handleTool(name, args || {});
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Tool error: ${name}`, message);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * HTTP server
 */
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-key, Mcp-Session-Id'
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url?.split('?')[0];

  // Health check (unauthenticated for Railway)
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        uptime: process.uptime(),
        sessions: transports.size,
        tools: tools.length + PluginManager.getTools().length,
      })
    );
    return;
  }

  // MCP Streamable HTTP endpoint
  if (url === '/mcp') {
    // Check authentication
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized - API key required' }));
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // POST without session ID = new session initialization
    if (req.method === 'POST' && !sessionId && isInitializeRequest) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer();
      await server.connect(transport);

      const sid = transport.sessionId!;
      transports.set(sid, transport);

      // Cleanup on close
      transport.onclose = () => {
        transports.delete(sid);
        console.log(`[MCP] Session closed: ${sid}`);
      };

      console.log(`[MCP] New session: ${sid}`);
      await transport.handleRequest(req, res);
      return;
    }

    // Requests with session ID = existing session
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found', sessionId }));
      return;
    }

    // Invalid request
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Bad Request - Missing Mcp-Session-Id header or invalid initialization',
      })
    );
    return;
  }

  // === REST API Endpoints (public, no MCP session required) ===

  // Extended health check with render capabilities
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: process.uptime(),
      capabilities: ['render', 'share', 'mcp'],
      render_url: process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`,
    }));
    return;
  }

  // POST /api/render — render HoloScript to preview
  if (url === '/api/render' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const result = await renderPreview({
        code: body.code as string,
        format: (body.format as 'png' | 'gif' | 'mp4' | 'webp') || 'png',
        resolution: (body.resolution as number[]) || [800, 600],
        camera: body.camera as { position?: number[]; target?: number[] },
        duration: (body.duration as number) || 3000,
        quality: (body.quality as 'draft' | 'preview' | 'production') || 'preview',
        skipRemote: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // POST /api/share — create share links for X/social platforms
  if (url === '/api/share' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const result = await createShareLink({
        code: body.code as string,
        title: (body.title as string) || 'HoloScript Scene',
        description: (body.description as string) || 'Interactive 3D scene built with HoloScript',
        platform: (body.platform as 'x' | 'generic' | 'codesandbox' | 'stackblitz') || 'x',
        skipRemote: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ${SERVICE_NAME} v${SERVICE_VERSION}`);
  console.log(`   Transport: Streamable HTTP (MCP spec 2025-03-26)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Auth: ${MCP_API_KEY ? 'API key required' : 'OPEN (dev mode)'}`);
  console.log(`   Tools: ${tools.length} core + ${PluginManager.getTools().length} plugins`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /health     - Health check (public)`);
  console.log(`     POST /mcp        - MCP Streamable HTTP (authenticated)`);
  console.log(`     GET  /mcp        - MCP session messages (authenticated)`);
  console.log(`     DELETE /mcp      - Close session (authenticated)`);
  console.log(`     GET  /api/health - API health + capabilities (public)`);
  console.log(`     POST /api/render - Render HoloScript preview (public)`);
  console.log(`     POST /api/share  - Create share links (public)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
