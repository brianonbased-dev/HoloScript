import express from 'express';
import cors from 'cors';
import { getDb, closeDb } from './db/client.js';
import { authMiddleware } from './middleware/auth.js';
import { absorbRouter } from './routes/absorb.js';
import { creditsRouter } from './routes/credits.js';
import { holodaemonRouter } from './routes/holodaemon.js';
import { pipelineRouter } from './routes/pipeline.js';
import {
  handleMcpPost,
  handleMcpGet,
  handleMcpDelete,
  handleMcpDiscovery,
  getActiveSessionCount,
} from './mcp-handler.js';

const app = express();
const PORT = process.env.PORT || 3005;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Public endpoints (no auth) ---
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'absorb-service',
    version: '6.0.0',
    uptime: process.uptime(),
    database: getDb() ? 'connected' : 'not configured',
    mcpSessions: getActiveSessionCount(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/.well-known/mcp', handleMcpDiscovery);
app.get('/.well-known/mcp.json', handleMcpDiscovery);

// --- MCP Streamable HTTP transport ---
app.post('/mcp', handleMcpPost);
app.get('/mcp', handleMcpGet);
app.delete('/mcp', handleMcpDelete);

// --- Auth middleware for API routes ---
app.use('/api', authMiddleware);

// --- API routes ---
app.use('/api/absorb', absorbRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/holodaemon', holodaemonRouter);

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
