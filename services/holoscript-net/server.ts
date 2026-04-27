import express from 'express';
import fs from 'fs';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, handleTool } from '@holoscript/mcp-server';

const app = express();
const port = process.env.PORT || 3001;
const server = http.createServer(app);

// Middleware
app.use(morgan('combined'));
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://esm.sh"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "https:", "blob:"],
        "connect-src": ["'self'", "https:", "wss:", "blob:", "https://esm.sh"],
      },
    },
  })
);

// Serve Static Files
const ROOT = process.cwd();
const DOCS_DIST = path.resolve(ROOT, '../../docs/.vitepress/dist');
const NATIVE_ENGINE_DIST = path.resolve(ROOT, './dist/client');
const COMPOSITIONS_DIR = path.resolve(ROOT, '../../docs');

console.log('--- Path Resolution ---');
console.log('ROOT:', ROOT);
console.log('NATIVE_ENGINE_DIST:', NATIVE_ENGINE_DIST);
console.log('-----------------------');

// Serve Native V2 Landing Page at the Root /
app.use(express.static(NATIVE_ENGINE_DIST));

// Live evidence manifest: explicit route so a missing file does not fall through to the SPA
// index.html (which would break JSON fetch on the landing strip).
app.get('/live-evidence.json', (_req, res) => {
  const candidates = [
    path.join(NATIVE_ENGINE_DIST, 'live-evidence.json'),
    path.join(DOCS_DIST, 'live-evidence.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.sendFile(p);
      return;
    }
  }
  res
    .status(404)
    .type('application/json')
    .send(JSON.stringify({ error: 'live-evidence manifest not built', hint: 'run scripts/build-live-evidence-manifest.mjs and holoscript-net build' }));
});

// Serve VitePress Documentation at /docs
app.use('/docs', express.static(DOCS_DIST));

app.use('/native/assets/@holoscript/core', express.static(path.resolve(ROOT, '../../packages/core/dist')));
app.use('/native/assets/@holoscript/runtime', express.static(path.resolve(ROOT, '../../packages/runtime/dist')));
app.use('/native/assets/@holoscript/r3f-renderer', express.static(path.resolve(ROOT, '../../packages/r3f-renderer/dist')));
app.get('/native/assets/node-fs-shim.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.resolve(ROOT, './src/empty-module.ts'));
});

// ZERO-BUNDLE ESM SERVING
app.use('/src', express.static(path.resolve(ROOT, './src')));
app.use('/node_modules', express.static(path.resolve(ROOT, './node_modules')));

// Serve .holo files directly from the docs directory
app.get('/site.holo', (req, res) => {
  res.sendFile(path.join(COMPOSITIONS_DIR, 'site.holo'));
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', engine: 'holoscript-native' });
});

// --- SEO & Crawlers ---
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /

Sitemap: https://holoscript.net/sitemap.xml`);
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(DOCS_DIST, 'sitemap.xml'));
});

// Fallbacks
app.get('/docs*', (req, res) => {
  res.sendFile(path.join(DOCS_DIST, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(NATIVE_ENGINE_DIST, 'index.html'));
});

// --- Live Spatial Presence (CRDT WebSocket Hub) ---
import { WebSocketServer, WebSocket } from 'ws';
const wss = new WebSocketServer({ server, path: '/socket/presence' });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.on('message', (message) => {
    // Basic CRDT relay logic: Broadcast the cursor/action to all other peers
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) { // 1 = OPEN
        client.send(message);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// --- Embedded MCP Brain ---
const mcpTransports = new Map<string, SSEServerTransport>();

function createMcpServer() {
  const s = new Server({ name: 'holoscript-net', version: '6.0.0' }, { capabilities: { tools: {} } });
  s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  s.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await handleTool(name, args || {});
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  });
  return s;
}

app.get('/api/mcp', async (req, res) => {
  const transport = new SSEServerTransport('/api/mcp/message', res);
  const mcp = createMcpServer();
  await mcp.connect(transport);
  mcpTransports.set(transport.sessionId, transport);
  res.on('close', () => mcpTransports.delete(transport.sessionId));
});

app.post('/api/mcp/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = mcpTransports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send('Session not found');
  }
});

// Stateless HTTP JSON-RPC endpoint for MCP tools
app.post('/mcp', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { method, params, id, jsonrpc } = req.body;
    if (jsonrpc !== '2.0') {
      res.status(400).json({ error: 'Invalid JSON-RPC version' });
      return;
    }

    if (method === 'tools/list') {    
       res.json({
         jsonrpc: '2.0',
         id,
         result: { tools }
       });
       return;
    }

    if (method === 'tools/call') {
       const { name, arguments: args } = params as { name: string, arguments?: Record<string, unknown> };
       try {
         const result = await handleTool(name, args || {});
         res.json({
           jsonrpc: '2.0',
           id,
           result: {
             content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
           }
         });
       } catch (e: any) {
         res.json({
           jsonrpc: '2.0',
           id,
           error: { code: -32603, message: e.message }
         });
       }
       return;
    }

    // Default error
    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (err: any) {
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: err.message } });
  }
});

server.listen(port, () => {
  console.log(`HoloScript.net Spatial Server running on port ${port}`);
});
