import express from 'express';
import cors from 'cors';
import { getDb, closeDb } from './db/client.js';
import { authMiddleware } from './middleware/auth.js';
import { absorbRouter } from './routes/absorb.js';
import { creditsRouter } from './routes/credits.js';
import { creditsWebhookRouter } from './routes/creditsWebhook.js';
import { holodaemonRouter } from './routes/holodaemon.js';
import { pipelineRouter } from './routes/pipeline.js';
import { moltbookRouter } from './routes/moltbook.js';
import { adminRouter } from './routes/admin.js';
import {
  handleMcpSse,
  handleMcpMessages,
  handleMcpDelete,
  handleMcpDiscovery,
  getActiveSessionCount,
} from './mcp-handler.js';

const app = express();
const PORT = process.env.PORT || 3005;

// --- Middleware ---
app.use(cors());

// --- Webhooks (must come before express.json to preserve raw Buffer) ---
app.use('/api/credits/webhook', express.raw({ type: 'application/json' }), creditsWebhookRouter);

// --- Standard JSON Middleware ---
app.use(express.json({ limit: '50mb' }));

// --- UI Redirect (absorb.holoscript.net -> Studio Frontend) ---
app.get('/', (req, res) => {
  // If users navigate to the raw absorb-service Railway URL in their browser,
  // we gracefully bounce them back to the HoloScript Studio frontend where the Absorb UI lives.
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>HoloScript Absorb Service</title>
        <meta http-equiv="refresh" content="2;url=https://holoscript.net/studio/absorb" />
        <style>
          body { font-family: system-ui, sans-serif; background: #09090b; color: #ededed; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          a { color: #3b82f6; text-decoration: none; padding: 10px 20px; border: 1px solid #3b82f6; border-radius: 6px; margin-top: 20px; transition: all 0.2s; }
          a:hover { background: #3b82f6; color: white; }
        </style>
      </head>
      <body>
        <h2>📡 Absorb Mesh Service Running</h2>
        <p>This is the headless microservice API.</p>
        <p>Redirecting you to the Studio UI...</p>
        <a href="https://holoscript.net/studio/absorb">Go to Studio Dashboard</a>
      </body>
    </html>
  `);
});

// --- Public endpoints (no auth) ---
app.get('/health', async (_req, res) => {
  let moltbookAgentCount: number | null = null;
  const db = getDb();
  if (db) {
    try {
      const { moltbookAgents } = await import('./db/schema.js');
      const { sql } = await import('drizzle-orm');
      const [row] = await db
        .select({ count: sql<number>`count(*) filter (where ${moltbookAgents.heartbeatEnabled} = true)::int` })
        .from(moltbookAgents);
      moltbookAgentCount = row?.count ?? 0;
    } catch {
      // Schema not migrated yet — skip
    }
  }

  res.json({
    status: 'ok',
    service: 'absorb-service',
    version: '6.0.0',
    uptime: process.uptime(),
    database: db ? 'connected' : 'not configured',
    mcpSessions: getActiveSessionCount(),
    moltbookActiveAgents: moltbookAgentCount,
    timestamp: new Date().toISOString(),
  });
});

app.get('/.well-known/mcp', handleMcpDiscovery);
app.get('/.well-known/mcp.json', handleMcpDiscovery);

// --- MCP SSE transport ---
app.get('/mcp', handleMcpSse);
app.post('/mcp/messages', handleMcpMessages);
app.delete('/mcp', handleMcpDelete);

// --- Auth middleware for API routes ---
app.use('/api', authMiddleware);

// --- API routes ---
app.use('/api/absorb', absorbRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/holodaemon', holodaemonRouter);
app.use('/api/absorb/moltbook', moltbookRouter);
app.use('/api/admin', adminRouter);

// --- Global error handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[absorb-service] Unhandled error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    });
  }
});

// --- Initialize credit system DB provider ---
async function initializeCreditSystem(): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      const { setDbProvider } = await import('@holoscript/absorb-service/credits');
      setDbProvider(db);
      console.log('[absorb-service] Credit system initialized with database');
    } catch (e: any) {
      console.warn('[absorb-service] Credit system init skipped:', e.message);
    }
  } else {
    console.warn('[absorb-service] No DATABASE_URL configured — credit system disabled');
  }
}

// --- Start server ---
async function start(): Promise<void> {
  await initializeCreditSystem();

  const server = app.listen(PORT, () => {
    console.log(`[absorb-service] Running on http://localhost:${PORT}`);
    console.log(`[absorb-service] MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`[absorb-service] Discovery: http://localhost:${PORT}/.well-known/mcp`);
    console.log(`[absorb-service] Health: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[absorb-service] ${signal} received, shutting down...`);
    server.close(() => {
      closeDb();
      console.log('[absorb-service] Shut down complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[absorb-service] Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[absorb-service] Uncaught exception:', err);
    shutdown('uncaughtException');
  });
}

start().catch((err) => {
  console.error('[absorb-service] Failed to start:', err);
  process.exit(1);
});
