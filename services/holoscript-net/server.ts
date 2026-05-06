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

type LotusBloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';

interface LotusPaperEvidence {
  paperId: string;
  label: string;
  cluster: 'roots' | 'p1' | 'p2' | 'p3' | 'center';
  venue: string;
  hasDraft: boolean;
  stubCount: number;
  benchmarkTodoCount: number;
  otsAnchored: boolean;
  baseAnchored: boolean;
  anchorMismatch: boolean;
  retracted?: boolean;
}

interface LotusDerivation {
  state: LotusBloomState;
  reason: string;
  blockedBy?: Array<keyof LotusPaperEvidence>;
}

const LOTUS_COLORS: Record<LotusBloomState, string> = {
  sealed: '#64748b',
  budding: '#f59e0b',
  blooming: '#38bdf8',
  full: '#34d399',
  wilted: '#ef4444',
};

const LOTUS_PROGRAM: LotusPaperEvidence[] = [
  {
    paperId: 'trust-by-construction',
    label: 'Trust by Construction',
    cluster: 'roots',
    venue: 'IEEE TVCG 2026',
    hasDraft: true,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'cael-causal-agents',
    label: 'CAEL: Causal Agents',
    cluster: 'p1',
    venue: 'AAMAS 2027',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 1,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'trust-by-replay',
    label: 'Trust by Replay',
    cluster: 'p1',
    venue: 'USENIX Security 2026',
    hasDraft: true,
    stubCount: 3,
    benchmarkTodoCount: 2,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  {
    paperId: 'snn-tropical',
    label: 'Tropical SNN',
    cluster: 'p1',
    venue: 'NeurIPS 2027',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 0,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  {
    paperId: 'crdt-state',
    label: 'CRDT State',
    cluster: 'p1',
    venue: 'ECOOP 2027',
    hasDraft: true,
    stubCount: 1,
    benchmarkTodoCount: 1,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  {
    paperId: 'sandboxed-sim',
    label: 'Sandboxed Simulation',
    cluster: 'p1',
    venue: 'USENIX Security 2027',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 1,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  {
    paperId: 'graphrag-evidence',
    label: 'GraphRAG Evidence',
    cluster: 'p1',
    venue: 'ICSE 2027',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 2,
    otsAnchored: true,
    baseAnchored: true,
    anchorMismatch: false,
  },
  {
    paperId: 'mcp-trust',
    label: 'MCP Trust',
    cluster: 'p1',
    venue: 'CCS 2027',
    hasDraft: true,
    stubCount: 2,
    benchmarkTodoCount: 1,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'perception-contracts',
    label: 'Perception Contracts',
    cluster: 'p1',
    venue: 'CVPR 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'contracted-animation',
    label: 'Contracted Animation',
    cluster: 'p2',
    venue: 'SCA 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'ik-convergence',
    label: 'IK Convergence',
    cluster: 'p2',
    venue: 'I3D 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'unified-sim-animation',
    label: 'Unified Sim + Anim',
    cluster: 'p2',
    venue: 'SIGGRAPH 2027',
    hasDraft: true,
    stubCount: 4,
    benchmarkTodoCount: 3,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'motion-provenance',
    label: 'AI Motion Provenance',
    cluster: 'p2',
    venue: 'SIGGRAPH Asia 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'holoscript-core-ir',
    label: 'HoloScript Core IR',
    cluster: 'p3',
    venue: 'PLDI 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'reactive-traits',
    label: 'Reactive Traits',
    cluster: 'p3',
    venue: 'ECOOP 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'scene-composition',
    label: 'Scene Composition',
    cluster: 'p3',
    venue: 'I3D 2027',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
  {
    paperId: 'dumb-glass',
    label: 'Dumb Glass',
    cluster: 'center',
    venue: 'SIGGRAPH 2028',
    hasDraft: false,
    stubCount: 0,
    benchmarkTodoCount: 0,
    otsAnchored: false,
    baseAnchored: false,
    anchorMismatch: false,
  },
];

function deriveLotusBloomState(evidence: LotusPaperEvidence): LotusDerivation {
  if (evidence.retracted) {
    return { state: 'wilted', reason: 'Paper retracted or moved off-program.', blockedBy: ['retracted'] };
  }
  if (evidence.anchorMismatch && !evidence.otsAnchored && !evidence.baseAnchored) {
    return { state: 'wilted', reason: 'Anchor mismatch with no surviving anchors.', blockedBy: ['anchorMismatch', 'otsAnchored', 'baseAnchored'] };
  }
  if (!evidence.hasDraft) {
    return { state: 'sealed', reason: 'No draft content yet.', blockedBy: ['hasDraft'] };
  }
  if (evidence.stubCount > 0) {
    return { state: 'budding', reason: `Draft present with ${evidence.stubCount} stub(s).`, blockedBy: ['stubCount'] };
  }
  if (evidence.benchmarkTodoCount > 0) {
    return { state: 'blooming', reason: `${evidence.benchmarkTodoCount} benchmark(s) pending.`, blockedBy: ['benchmarkTodoCount'] };
  }
  if (!evidence.otsAnchored || !evidence.baseAnchored) {
    const missing: Array<keyof LotusPaperEvidence> = [];
    if (!evidence.otsAnchored) missing.push('otsAnchored');
    if (!evidence.baseAnchored) missing.push('baseAnchored');
    return { state: 'blooming', reason: `Awaiting ${missing.map((m) => (m === 'otsAnchored' ? 'OTS' : 'Base')).join(' + ')} anchor.`, blockedBy: missing };
  }
  return { state: 'full', reason: 'Content complete and dual-anchored.' };
}

function getBearerToken(req: express.Request): string {
  const auth = req.header('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function getLotusTeamTokens(): Set<string> {
  const raw = [
    process.env.LOTUS_TEAM_BEARER,
    process.env.LOTUS_TEAM_TOKEN,
    process.env.HOLOMESH_API_KEY,
    process.env.HOLOSCRIPT_API_KEY,
    process.env.MCP_API_KEY,
    process.env.LOTUS_TEAM_BEARERS,
  ]
    .filter(Boolean)
    .join(',');

  return new Set(
    raw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );
}

function isLotusTeamRequest(req: express.Request): boolean {
  const token = getBearerToken(req);
  return token.length > 0 && getLotusTeamTokens().has(token);
}

function buildLotusModeAResponse() {
  let fullPetals = 0;
  const petals = LOTUS_PROGRAM.map((paper, index) => {
    const derived = deriveLotusBloomState(paper);
    if (derived.state === 'full') fullPetals++;
    return {
      index,
      paper_id: paper.paperId,
      label: paper.label,
      cluster: paper.cluster,
      venue: paper.venue,
      state: derived.state,
      color: LOTUS_COLORS[derived.state],
      reason: derived.reason,
      measured: {
        hasDraft: paper.hasDraft,
        stubCount: paper.stubCount,
        benchmarkTodoCount: paper.benchmarkTodoCount,
        otsAnchored: paper.otsAnchored,
        baseAnchored: paper.baseAnchored,
      },
      claimed: {
        state: derived.state,
        blockedBy: derived.blockedBy ?? [],
      },
    };
  });

  return {
    mode: 'A',
    petals,
    readiness: {
      ready: fullPetals === LOTUS_PROGRAM.length && fullPetals > 0,
      fullPetals,
      totalPetals: LOTUS_PROGRAM.length,
    },
    metadata: {
      snapshot_at: new Date().toISOString(),
      source: 'services/holoscript-net/server.ts',
      disclosure: 'team',
    },
  };
}

function buildLotusModeBResponse() {
  let fullPetals = 0;
  const petals = LOTUS_PROGRAM.map((paper, index) => {
    const derived = deriveLotusBloomState(paper);
    if (derived.state === 'full') fullPetals++;
    return {
      index,
      cluster: paper.cluster,
      state: derived.state,
      color: LOTUS_COLORS[derived.state],
    };
  });

  return {
    mode: 'B',
    petals,
    readiness: {
      fullPetals,
      totalPetals: LOTUS_PROGRAM.length,
    },
    metadata: {
      snapshot_at: new Date().toISOString(),
      disclosure: 'public',
    },
  };
}

// Middleware
app.use(morgan('combined'));
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://esm.sh", "https://ga.jspm.io"],
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
  const builtShim = path.join(NATIVE_ENGINE_DIST, 'native/assets/node-fs-shim.js');
  res.sendFile(fs.existsSync(builtShim) ? builtShim : path.resolve(ROOT, './src/empty-module.ts'));
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

app.get('/api/lotus', (req, res) => {
  const modeA = isLotusTeamRequest(req);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Lotus-Mode', modeA ? 'A' : 'B');
  res.json(modeA ? buildLotusModeAResponse() : buildLotusModeBResponse());
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
app.get(/^\/docs(?:\/.*)?$/, (req, res) => {
  res.sendFile(path.join(DOCS_DIST, 'index.html'));
});

app.get(/.*/, (req, res) => {
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
