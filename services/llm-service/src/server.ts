/**
 * HoloScript LLM Service
 *
 * Standalone local LLM service for building HoloScript programs.
 * Open source - no login required. Describe what you want, get HoloScript code.
 *
 * Port: 8000
 * Storage: .holoscript-llm/ (local file storage)
 * LLM: Ollama (local inference)
 *
 * Pattern: P.HOLOSCRIPT.LLM_SERVICE.01 - User-friendly local AI
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { StorageService } from './services/StorageService';
import { OllamaService } from './services/OllamaService';
import { BuildService } from './services/BuildService';
import { logger } from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 8000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// No authentication - open source project
app.use((req: Request, res: Response, next) => {
  (req as any).userId = 'anonymous';
  next();
});

// ============================================================================
// INITIALIZE SERVICES
// ============================================================================

const storage = new StorageService(join(__dirname, '..', '..', '.holoscript-llm'));
const ollama = new OllamaService(
  process.env.OLLAMA_URL || 'http://localhost:11434',
  process.env.OLLAMA_MODEL || 'mistral'
);
const buildService = new BuildService(storage, ollama);

// ============================================================================
// ROUTES - OPEN SOURCE (NO AUTH)
// ============================================================================

/**
 * GET /api/auth/me
 * Returns current user (always 'anonymous' - no login needed)
 */
app.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({ userId: 'anonymous', authenticated: true });
});

// ============================================================================
// ROUTES - LLM INFERENCE
// ============================================================================

/**
 * POST /api/generate
 * Generate HoloScript from natural language prompt
 */
app.post('/api/generate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || 'anonymous';

    const { prompt, context = 'holoscript', model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const result = await buildService.generateFromPrompt(prompt, {
      context,
      model,
      userId,
    });

    res.json(result);
  } catch (error) {
    logger.error('Generate error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

/**
 * POST /api/builds
 * Save a new build
 */
app.post('/api/builds', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || 'anonymous';

    const { name, code, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'name and code required' });
    }

    const build = await buildService.saveBuild(userId, {
      name,
      code,
      description,
    });

    res.json({ success: true, build });
  } catch (error) {
    logger.error('Save build error:', error);
    res.status(500).json({ error: 'Failed to save build' });
  }
});

/**
 * GET /api/builds
 * List all builds (shared globally)
 */
app.get('/api/builds', async (req: Request, res: Response) => {
  try {
    const userId = 'anonymous';

    const builds = await buildService.getBuildsByUser(userId);
    res.json({ builds });
  } catch (error) {
    logger.error('Get builds error:', error);
    res.status(500).json({ error: 'Failed to retrieve builds' });
  }
});

/**
 * GET /api/builds/:id
 * Get specific build
 */
app.get('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const userId = 'anonymous';

    const build = await buildService.getBuild(req.params.id, userId);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    res.json(build);
  } catch (error) {
    logger.error('Get build error:', error);
    res.status(500).json({ error: 'Failed to retrieve build' });
  }
});

/**
 * DELETE /api/builds/:id
 * Delete a build
 */
app.delete('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const userId = 'anonymous';

    await buildService.deleteBuild(req.params.id, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete build error:', error);
    res.status(500).json({ error: 'Failed to delete build' });
  }
});

// ============================================================================
// ROUTES - STATUS
// ============================================================================

/**
 * GET /api/health
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const ollamaStatus = await ollama.getStatus();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'holoscript-llm-service',
      version: '1.0.0-alpha.1',
      ollama: ollamaStatus,
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: 'Service unavailable' });
  }
});

/**
 * GET /api/models
 */
app.get('/api/models', async (req: Request, res: Response) => {
  try {
    const models = await ollama.listModels();
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list models' });
  }
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
    // Initialize storage
    await storage.init();
    logger.info('[Storage] Initialized at', storage.basePath);

    // Check Ollama connection
    try {
      const status = await ollama.getStatus();
      logger.info('[Ollama] Connected -', status);
    } catch (error) {
      logger.warn('[Ollama] Not available - generate will fail');
      logger.warn('Start Ollama with: ollama serve');
      logger.warn('Pull a model with: ollama pull mistral');
    }

    // Start server
    app.listen(PORT, () => {
      logger.info('');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('HoloScript LLM Service Started');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('');
      logger.info(`Port:         http://localhost:${PORT}`);
      logger.info('');
      logger.info('Quick Start:');
      logger.info(`  1. Open http://localhost:${PORT}`);
      logger.info('  2. Login with: user / password');
      logger.info('  3. Describe your HoloScript');
      logger.info('  4. AI generates code');
      logger.info('');
      logger.info('API Docs:');
      logger.info(`  POST   /api/auth/login   - Login`);
      logger.info(`  POST   /api/generate     - Generate HoloScript`);
      logger.info(`  POST   /api/builds       - Save build`);
      logger.info(`  GET    /api/builds       - List builds`);
      logger.info(`  GET    /api/health       - Health check`);
      logger.info('');
    });
  } catch (error) {
    logger.error('Startup failed:', error);
    process.exit(1);
  }
}

start();
