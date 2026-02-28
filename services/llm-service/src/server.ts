/**
 * Brittney Cloud Service
 *
 * Cloud-grade API gateway for Brittney AI — the first-party HoloScript
 * spatial intelligence. Routes inference to GPU providers (Fireworks/Together)
 * with auth, rate limiting, usage metering, and SSE streaming.
 *
 * Port: 8000 (configurable via PORT env)
 *
 * Endpoints:
 *   POST /api/chat       — SSE streaming Brittney chat (primary)
 *   POST /api/generate   — Non-streaming code generation
 *   GET  /api/usage      — Per-key usage stats
 *   GET  /api/providers  — List inference providers
 *   GET  /api/health     — Service health
 *   POST /api/builds     — Save a build
 *   GET  /api/builds     — List builds
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { StorageService } from './services/StorageService';
import { InferenceRouter, type ChatRequest, type StreamEvent } from './services/InferenceRouter';
import { RateLimiter } from './services/RateLimiter';
import { UsageTracker } from './services/UsageTracker';
import { BuildService } from './services/BuildService';
import { OllamaService } from './services/OllamaService';
import { logger } from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 8000;

// ============================================================================
// SERVICES
// ============================================================================

const storage = new StorageService(join(__dirname, '..', '..', '.holoscript-llm'));
const inference = new InferenceRouter();
const rateLimiter = new RateLimiter();
const usage = new UsageTracker();

// BuildService still uses OllamaService for backward compat
const ollama = new OllamaService(
  process.env.OLLAMA_URL || 'http://localhost:11434',
  process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest'
);
const buildService = new BuildService(storage, ollama);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/**
 * Auth middleware — extract API key from Authorization header.
 * In dev mode (no REQUIRE_AUTH), allow anonymous access.
 */
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const requireAuth = process.env.REQUIRE_AUTH === 'true';

  if (authHeader?.startsWith('Bearer ')) {
    (req as any).apiKey = authHeader.slice(7);
    (req as any).authenticated = true;
  } else if (!requireAuth) {
    (req as any).apiKey = 'anonymous';
    (req as any).authenticated = false;
  } else {
    res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
    return;
  }

  next();
}

app.use(authMiddleware);

// ============================================================================
// ROUTES — CHAT (SSE Streaming)
// ============================================================================

/**
 * POST /api/chat
 * Primary Brittney endpoint. SSE streaming with tool calling.
 */
app.post('/api/chat', rateLimiter.middleware(), async (req: Request, res: Response) => {
  const apiKey = (req as any).apiKey || 'anonymous';
  const { messages, sceneContext, tools, model, temperature, maxTokens, tier } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  // Check daily token limit
  if (usage.isOverDailyLimit(apiKey)) {
    res.status(429).json({ error: 'Daily token limit exceeded', message: 'Try again tomorrow or upgrade your plan' });
    return;
  }

  // Estimate prompt tokens
  const promptText = messages.map((m: any) => m.content || '').join(' ') + (sceneContext || '');
  const estimatedPromptTokens = usage.estimateTokens(promptText);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const request: ChatRequest = { messages, sceneContext, tools, model, temperature, maxTokens, tier: tier || 'standard' };
  let completionText = '';

  try {
    for await (const event of inference.chat(request)) {
      if (event.type === 'text' && typeof event.payload === 'string') {
        completionText += event.payload;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', payload: String(error) })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', payload: null })}\n\n`);
  }

  // Record usage
  const completionTokens = usage.estimateTokens(completionText);
  usage.record(apiKey, estimatedPromptTokens, completionTokens);

  res.end();
});

// ============================================================================
// ROUTES — GENERATE (Non-streaming, backward compat)
// ============================================================================

/**
 * POST /api/generate
 * Non-streaming code generation (backward compat with existing llm-service)
 */
app.post('/api/generate', rateLimiter.middleware(), async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey || 'anonymous';
    const { prompt, context = 'holoscript', model } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt required' });
      return;
    }

    // Try inference router (non-streaming)
    const request: ChatRequest = {
      messages: [{ role: 'user', content: prompt }],
      sceneContext: context,
      model,
    };

    let fullResponse = '';
    for await (const event of inference.chat(request)) {
      if (event.type === 'text' && typeof event.payload === 'string') {
        fullResponse += event.payload;
      }
    }

    if (fullResponse) {
      usage.record(apiKey, usage.estimateTokens(prompt), usage.estimateTokens(fullResponse));
      res.json({ success: true, code: fullResponse });
      return;
    }

    // Fallback: BuildService (Ollama direct)
    const result = await buildService.generateFromPrompt(prompt, { context, model, userId: apiKey });
    res.json(result);
  } catch (error) {
    logger.error('Generate error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// ============================================================================
// ROUTES — USAGE & PROVIDERS
// ============================================================================

/**
 * GET /api/usage
 * Get usage stats for the current API key
 */
app.get('/api/usage', (req: Request, res: Response) => {
  const apiKey = (req as any).apiKey || 'anonymous';
  const summary = usage.getSummary(apiKey);
  res.json(summary);
});

/**
 * GET /api/providers
 * List available inference providers and their status
 */
app.get('/api/providers', async (req: Request, res: Response) => {
  const providers = await inference.getStatus();
  res.json({
    preferred: inference.getPreferredProvider(),
    providers,
  });
});

// ============================================================================
// ROUTES — BUILDS (unchanged)
// ============================================================================

app.post('/api/builds', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).apiKey || 'anonymous';
    const { name, code, description } = req.body;
    if (!name || !code) { res.status(400).json({ error: 'name and code required' }); return; }
    const build = await buildService.saveBuild(userId, { name, code, description });
    res.json({ success: true, build });
  } catch (error) {
    logger.error('Save build error:', error);
    res.status(500).json({ error: 'Failed to save build' });
  }
});

app.get('/api/builds', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).apiKey || 'anonymous';
    const builds = await buildService.getBuildsByUser(userId);
    res.json({ builds });
  } catch (error) {
    logger.error('Get builds error:', error);
    res.status(500).json({ error: 'Failed to retrieve builds' });
  }
});

app.get('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).apiKey || 'anonymous';
    const build = await buildService.getBuild(req.params.id, userId);
    if (!build) { res.status(404).json({ error: 'Build not found' }); return; }
    res.json(build);
  } catch (error) {
    logger.error('Get build error:', error);
    res.status(500).json({ error: 'Failed to retrieve build' });
  }
});

app.delete('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).apiKey || 'anonymous';
    await buildService.deleteBuild(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete build error:', error);
    res.status(500).json({ error: 'Failed to delete build' });
  }
});

// ============================================================================
// ROUTES — HEALTH
// ============================================================================

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const providers = await inference.getStatus();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'brittney-service',
      version: '1.0.0',
      preferred: inference.getPreferredProvider(),
      providers,
      rateLimiter: rateLimiter.getStats(),
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: 'Service unavailable' });
  }
});

app.get('/api/models', async (req: Request, res: Response) => {
  try {
    const models = await ollama.listModels();
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// For backward compat
app.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({ apiKey: (req as any).apiKey, authenticated: (req as any).authenticated });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// STARTUP
// ============================================================================

async function start() {
  try {
    await storage.init();
    logger.info('[Storage] Initialized at', storage.basePath);

    // Check inference providers
    const providers = await inference.getStatus();
    for (const p of providers) {
      logger.info(`[Provider] ${p.provider} (${p.tier}): ${p.available ? '✅ available' : '❌ unavailable'}`);
    }

    app.listen(PORT, () => {
      logger.info('');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('Brittney Cloud Service Started');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('');
      logger.info(`Port:       http://localhost:${PORT}`);
      logger.info(`Provider:   ${inference.getPreferredProvider()}`);
      logger.info('');
      logger.info('Endpoints:');
      logger.info(`  POST  /api/chat       - Brittney SSE chat (primary)`);
      logger.info(`  POST  /api/generate   - Code generation`);
      logger.info(`  GET   /api/usage      - Usage stats`);
      logger.info(`  GET   /api/providers  - Provider status`);
      logger.info(`  GET   /api/health     - Health check`);
      logger.info('');
    });
  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

start();
