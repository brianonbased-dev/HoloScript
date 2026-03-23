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
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import http from 'http';
import { tools } from './tools';
import { handleTool } from './handlers';
import { PluginManager } from './PluginManager';
import { renderPreview, createShareLink, getScene, storeScene, generateBrowserTemplate } from './renderer';
import {
  buildAgentCard,
  createTask,
  getTask,
  listTasks,
  cancelTask,
  executeTask,
  taskToResponse,
  type SendTaskRequest,
  type TaskMessage,
  type TaskState,
} from './a2a';

const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const SERVICE_NAME = 'holoscript-mcp';
const SERVICE_VERSION = '3.6.1';

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

async function createAndStoreSessionTransport(sessionId?: string): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId || randomUUID(),
  });

  const server = createMcpServer();
  await server.connect(transport);

  const sid = transport.sessionId!;
  transports.set(sid, transport);

  transport.onclose = () => {
    console.log(`[MCP] Session closed: ${sid}`);
  };

  return transport;
}

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
 * Unified tool handler for A2A task execution.
 * Routes through plugins first, then the main handler pipeline.
 */
async function handleToolForA2A(name: string, args: Record<string, unknown>): Promise<unknown> {
  const pluginResult = await PluginManager.handleTool(name, args);
  if (pluginResult !== null) return pluginResult;
  return handleTool(name, args);
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

    // POST without session ID = create a new session transport
    if (req.method === 'POST' && !sessionId) {
      const transport = await createAndStoreSessionTransport();
      console.log(`[MCP] New session: ${transport.sessionId!}`);
      await transport.handleRequest(req, res);
      return;
    }

    // Requests with session ID = existing session
    if (sessionId) {
      let transport = transports.get(sessionId);
      if (!transport && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const method = typeof body.method === 'string' ? body.method : '';

        if (method === 'notifications/initialized') {
          // Clients may send this to a different instance in non-sticky environments.
          // Accept it as a no-op so the session can continue.
          res.writeHead(202);
          res.end();
          return;
        }

        if (method === 'tools/list') {
          const id = (body.id as string | number | null | undefined) ?? null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [...tools, ...PluginManager.getTools()],
              },
            })
          );
          return;
        }

        if (method === 'tools/call') {
          const id = (body.id as string | number | null | undefined) ?? null;
          const params = (body.params as Record<string, unknown>) || {};
          const name = params.name as string;
          const args = (params.arguments as Record<string, unknown>) || {};

          try {
            const pluginResult = await PluginManager.handleTool(name, args);
            const result =
              pluginResult !== null ? pluginResult : await handleTool(name, args);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text:
                        typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                  ],
                },
              })
            );
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
                  isError: true,
                },
              })
            );
            return;
          }
        }
      }
      if (transport) {
        await transport.handleRequest(req, res);
        if (req.method === 'DELETE') {
          transports.delete(sessionId);
          console.log(`[MCP] Session removed: ${sessionId}`);
        }
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

  // .well-known/mcp discovery endpoint (MCP specification)
  if (url === '/.well-known/mcp' || url === '/.well-known/mcp.json') {
    const allTools = [...tools, ...PluginManager.getTools()];
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify({
      mcpVersion: '2025-03-26',
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      description: 'HoloScript language tooling — parse, validate, compile, and render .hs/.hsplus/.holo compositions across 27 backend targets.',
      transport: {
        type: 'streamable-http',
        url: `${baseUrl}/mcp`,
        authentication: MCP_API_KEY
          ? { type: 'bearer', header: 'Authorization' }
          : null,
      },
      capabilities: {
        tools: { count: allTools.length },
        resources: false,
        prompts: false,
      },
      tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
      })),
      endpoints: {
        mcp: `${baseUrl}/mcp`,
        health: `${baseUrl}/health`,
        render: `${baseUrl}/api/render`,
        share: `${baseUrl}/api/share`,
        a2a: `${baseUrl}/a2a`,
        agentCard: `${baseUrl}/.well-known/agent-card.json`,
      },
      contact: {
        repository: 'https://github.com/buildwithholoscript/HoloScript',
      },
    }));
    return;
  }

  // === A2A Protocol Endpoints ===

  // GET /.well-known/agent-card.json — A2A Agent Card discovery
  if ((url === '/.well-known/agent-card.json' || url === '/.well-known/agent-card') && req.method === 'GET') {
    const allTools = [...tools, ...PluginManager.getTools()];
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    const card = buildAgentCard(allTools, baseUrl, !!MCP_API_KEY);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify(card, null, 2));
    return;
  }

  // POST /a2a/tasks — Send/create a task (A2A tasks/send)
  if (url === '/a2a/tasks' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);

      // Build SendTaskRequest from body
      const message: TaskMessage = (body.message as TaskMessage) || {
        role: 'user',
        parts: [{ type: 'text', text: JSON.stringify(body) }],
        timestamp: new Date().toISOString(),
      };

      const request: SendTaskRequest = {
        id: body.id as string | undefined,
        sessionId: body.sessionId as string | undefined,
        message,
        skillId: body.skillId as string | undefined,
        arguments: body.arguments as Record<string, unknown> | undefined,
        metadata: {
          ...(body.metadata as Record<string, unknown> || {}),
          // Propagate skillId and arguments into metadata for task execution
          ...(body.skillId ? { skillId: body.skillId } : {}),
          ...(body.arguments ? { arguments: body.arguments } : {}),
        },
      };

      // Create the task
      const task = createTask(request);

      // Execute the task asynchronously (non-blocking for the response)
      // For synchronous execution, we await it here since A2A tasks/send
      // expects the result in the response for non-streaming agents.
      const executed = await executeTask(task, handleToolForA2A);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(taskToResponse(executed), null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // GET /a2a/tasks — List tasks (with optional query filters)
  if (url === '/a2a/tasks' && req.method === 'GET') {
    const queryString = req.url?.split('?')[1] || '';
    const params = new URLSearchParams(queryString);
    const filters: {
      sessionId?: string;
      state?: TaskState;
      limit?: number;
      offset?: number;
    } = {};

    if (params.get('sessionId')) filters.sessionId = params.get('sessionId')!;
    if (params.get('state')) filters.state = params.get('state') as TaskState;
    if (params.get('limit')) filters.limit = parseInt(params.get('limit')!, 10);
    if (params.get('offset')) filters.offset = parseInt(params.get('offset')!, 10);

    const result = listTasks(filters);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tasks: result.tasks.map(taskToResponse),
      total: result.total,
    }, null, 2));
    return;
  }

  // GET /a2a/tasks/:id — Get a specific task
  const taskGetMatch = url?.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
  if (taskGetMatch && req.method === 'GET') {
    const task = getTask(taskGetMatch[1]);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found', id: taskGetMatch[1] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(taskToResponse(task), null, 2));
    return;
  }

  // DELETE /a2a/tasks/:id — Cancel a task
  const taskDeleteMatch = url?.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
  if (taskDeleteMatch && req.method === 'DELETE') {
    const task = cancelTask(taskDeleteMatch[1]);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found', id: taskDeleteMatch[1] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(taskToResponse(task), null, 2));
    return;
  }

  // GET /a2a — A2A protocol info / discovery redirect
  if (url === '/a2a' && req.method === 'GET') {
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      protocol: 'a2a',
      version: '1.0.0',
      agentCard: `${baseUrl}/.well-known/agent-card.json`,
      endpoints: {
        tasks: `${baseUrl}/a2a/tasks`,
        agentCard: `${baseUrl}/.well-known/agent-card.json`,
      },
      description: 'HoloScript A2A (Agent-to-Agent) protocol endpoint. See agent card for capabilities.',
    }, null, 2));
    return;
  }

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

  // GET /scene/:id — serve stored scene as interactive HTML
  const sceneMatch = url?.match(/^\/scene\/([a-f0-9]{8})$/);
  if (sceneMatch && req.method === 'GET') {
    const scene = getScene(sceneMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    // Return the full interactive HTML template
    // generateBrowserTemplate imported at top of file
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateBrowserTemplate(scene.code, scene.title));
    return;
  }

  // GET /embed/:id — same as /scene/:id for iframe embedding
  const embedMatch = url?.match(/^\/embed\/([a-f0-9]{8})$/);
  if (embedMatch && req.method === 'GET') {
    const scene = getScene(embedMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    // generateBrowserTemplate imported at top of file
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
    });
    res.end(generateBrowserTemplate(scene.code, scene.title));
    return;
  }

  // GET /api/scene/:id — return scene metadata as JSON
  const apiSceneMatch = url?.match(/^\/api\/scene\/([a-f0-9]{8})$/);
  if (apiSceneMatch && req.method === 'GET') {
    const scene = getScene(apiSceneMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(scene));
    return;
  }

  // POST /api/scene — store a scene and get short URL
  if (url === '/api/scene' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const scene = storeScene(
        body.code as string,
        (body.title as string) || undefined,
        (body.description as string) || undefined,
      );
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: scene.id,
        url: `${baseUrl}/scene/${scene.id}`,
        embed: `${baseUrl}/embed/${scene.id}`,
        api: `${baseUrl}/api/scene/${scene.id}`,
      }));
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
  console.log(`     GET  /health                    - Health check (public)`);
  console.log(`     GET  /.well-known/mcp           - MCP discovery (public)`);
  console.log(`     GET  /.well-known/agent-card.json - A2A Agent Card (public)`);
  console.log(`     POST /mcp                       - MCP Streamable HTTP (authenticated)`);
  console.log(`     GET  /mcp                       - MCP session messages (authenticated)`);
  console.log(`     DELETE /mcp                     - Close session (authenticated)`);
  console.log(`     GET  /a2a                       - A2A protocol info (public)`);
  console.log(`     POST /a2a/tasks                 - A2A send task (public)`);
  console.log(`     GET  /a2a/tasks                 - A2A list tasks (public)`);
  console.log(`     GET  /a2a/tasks/:id             - A2A get task (public)`);
  console.log(`     DELETE /a2a/tasks/:id           - A2A cancel task (public)`);
  console.log(`     GET  /api/health                - API health + capabilities (public)`);
  console.log(`     POST /api/render                - Render HoloScript preview (public)`);
  console.log(`     POST /api/share                 - Create share links (public)`);
  console.log(`     POST /api/scene                 - Store scene, get short URL (public)`);
  console.log(`     GET  /scene/:id                 - View stored scene (public)`);
  console.log(`     GET  /embed/:id                 - Embed stored scene (public)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
