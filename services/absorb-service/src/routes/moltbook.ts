import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const CreateAgentSchema = z.object({
  agentName: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Only alphanumeric, underscores, and hyphens'),
  projectId: z.string().uuid(),
  moltbookApiKey: z.string().min(1),
  config: z.object({
    pillars: z.array(z.string()).optional(),
    submolts: z.array(z.string()).optional(),
    searchTopics: z.array(z.string()).optional(),
    persona: z.string().optional(),
  }).optional(),
});

const UpdateAgentSchema = z.object({
  agentName: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  heartbeatEnabled: z.boolean().optional(),
  config: z.object({
    pillars: z.array(z.string()).optional(),
    submolts: z.array(z.string()).optional(),
    searchTopics: z.array(z.string()).optional(),
    persona: z.string().optional(),
  }).optional(),
});

const SemanticDedupSchema = z.object({
  concept: z.string().min(1),
  history: z.array(z.string()),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mask API key for safe display: mb_***...*** */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***...' + key.slice(-3);
}

/** Fire-and-forget event logger. Never throws. */
async function logAgentEvent(
  agentId: string,
  eventType: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    const { moltbookAgentEvents } = await import('../db/schema.js');
    await db.insert(moltbookAgentEvents).values({
      id: uuidv4(),
      agentId,
      eventType,
      details,
    });
  } catch {
    // Best-effort logging — never block the main operation
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET / — List user's agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, desc } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const agents = await db
      .select()
      .from(moltbookAgents)
      .where(eq(moltbookAgents.userId, userId))
      .orderBy(desc(moltbookAgents.createdAt))
      .limit(50);

    // Strip API keys from response
    const safeAgents = agents.map((a) => ({
      ...a,
      moltbookApiKey: maskApiKey(a.moltbookApiKey),
    }));

    res.json({ agents: safeAgents });
  } catch (error: any) {
    console.error('[moltbook] List error:', error.message);
    res.status(500).json({ error: 'Failed to list agents', message: error.message });
  }
});

// GET /summary — Aggregate stats
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, sql } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const [summary] = await db
      .select({
        totalAgents: sql<number>`count(*)::int`,
        activeAgents: sql<number>`count(*) filter (where ${moltbookAgents.heartbeatEnabled} = true)::int`,
        totalPosts: sql<number>`coalesce(sum(${moltbookAgents.totalPostsGenerated}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${moltbookAgents.totalCommentsGenerated}), 0)::int`,
        totalLlmSpentCents: sql<number>`coalesce(sum(${moltbookAgents.totalLlmSpentCents}), 0)::int`,
        totalUpvotesGiven: sql<number>`coalesce(sum(${moltbookAgents.totalUpvotesGiven}), 0)::int`,
      })
      .from(moltbookAgents)
      .where(eq(moltbookAgents.userId, userId));

    res.json(summary);
  } catch (error: any) {
    console.error('[moltbook] Summary error:', error.message);
    res.status(500).json({ error: 'Failed to get summary', message: error.message });
  }
});

// POST / — Create agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateAgentSchema.parse(req.body);
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents, absorbProjects } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    // Verify project ownership
    const [project] = await db
      .select({ id: absorbProjects.id })
      .from(absorbProjects)
      .where(and(eq(absorbProjects.id, body.projectId), eq(absorbProjects.userId, userId)))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found or not owned by you' });
      return;
    }

    const result = await db
      .insert(moltbookAgents)
      .values({
        id: uuidv4(),
        userId,
        projectId: body.projectId,
        agentName: body.agentName,
        moltbookApiKey: body.moltbookApiKey,
        config: body.config ?? {},
      })
      .returning();

    const agent = Array.isArray(result) ? result[0] : result;

    logAgentEvent(agent.id, 'created', { agentName: body.agentName, projectId: body.projectId });

    res.status(201).json({
      agent: { ...agent, moltbookApiKey: maskApiKey(agent.moltbookApiKey) },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[moltbook] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create agent', message: error.message });
  }
});

// PATCH /:id — Update agent
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateAgentSchema.parse(req.body);
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.agentName !== undefined) updates.agentName = body.agentName;
    if (body.heartbeatEnabled !== undefined) updates.heartbeatEnabled = body.heartbeatEnabled;
    if (body.config !== undefined) updates.config = body.config;

    const result = await db
      .update(moltbookAgents)
      .set(updates)
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .returning();

    if (!Array.isArray(result) || result.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const agent = result[0];

    logAgentEvent(req.params.id, 'config_updated', { fields: Object.keys(body).filter((k) => k !== 'config') });

    res.json({ agent: { ...agent, moltbookApiKey: maskApiKey(agent.moltbookApiKey) } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[moltbook] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update agent', message: error.message });
  }
});

// DELETE /:id — Delete agent
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const result = await db
      .delete(moltbookAgents)
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .returning();

    if (!Array.isArray(result) || result.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({ deleted: true, id: req.params.id });
  } catch (error: any) {
    console.error('[moltbook] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete agent', message: error.message });
  }
});

// POST /semantic-dedup — Deprecate substring dedup with semantic vector analysis
router.post('/semantic-dedup', async (req: Request, res: Response) => {
  try {
    const body = SemanticDedupSchema.parse(req.body);
    if (body.history.length === 0) {
      res.json({ isDuplicate: false, score: 0 });
      return;
    }

    const { requireCredits, isCreditError, deductCredits } = await import('@holoscript/absorb-service/credits');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';
    const creditCheck = await requireCredits(userId, 'semantic_dedup');
    
    if (isCreditError(creditCheck)) {
      res.status(402).json(creditCheck);
      return;
    }

    const { EmbeddingIndex } = await import('@holoscript/absorb-service/engine');
    const index = new EmbeddingIndex();

    // Construct the semantic index out of the past post concepts
    body.history.forEach((text, i) => {
      index.add(`hist-${i}`, text, { text });
    });

    const results = await index.search(body.concept, 1);
    
    // Similarity > 0.85 = Semantic duplicate
    const isDuplicate = results.length > 0 && results[0].score > 0.85;

    await deductCredits(
      userId,
      creditCheck.costCents,
      `Semantic deduplication evaluation`,
      { concept: body.concept.substring(0, 32) }
    );

    res.json({
      isDuplicate,
      score: results.length > 0 ? results[0].score : 0,
      matched: isDuplicate ? results[0].metadata?.text : null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[moltbook] Semantic dedup error:', error.message);
    res.status(500).json({ error: 'Semantic dedup failed', message: error.message });
  }
});

// ─── Agent Control Routes ───────────────────────────────────────────────────
// These endpoints update the DB state. The MCP agent manager polls or listens
// for these state changes to start/stop the actual heartbeat daemon.

// POST /:id/start — Enable heartbeat
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const result = await db
      .update(moltbookAgents)
      .set({ heartbeatEnabled: true, updatedAt: new Date() })
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .returning();

    if (!Array.isArray(result) || result.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    logAgentEvent(req.params.id, 'started', { agentName: result[0].agentName });

    res.json({ started: true, agent: { ...result[0], moltbookApiKey: maskApiKey(result[0].moltbookApiKey) } });
  } catch (error: any) {
    console.error('[moltbook] Start error:', error.message);
    res.status(500).json({ error: 'Failed to start agent', message: error.message });
  }
});

// POST /:id/stop — Disable heartbeat
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const result = await db
      .update(moltbookAgents)
      .set({ heartbeatEnabled: false, updatedAt: new Date() })
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .returning();

    if (!Array.isArray(result) || result.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    logAgentEvent(req.params.id, 'stopped', { agentName: result[0].agentName });

    res.json({ stopped: true, agent: { ...result[0], moltbookApiKey: maskApiKey(result[0].moltbookApiKey) } });
  } catch (error: any) {
    console.error('[moltbook] Stop error:', error.message);
    res.status(500).json({ error: 'Failed to stop agent', message: error.message });
  }
});

// POST /:id/trigger — Trigger a single heartbeat tick
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    // Verify ownership
    const [agent] = await db
      .select()
      .from(moltbookAgents)
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Update last heartbeat timestamp
    await db
      .update(moltbookAgents)
      .set({ lastHeartbeat: new Date(), updatedAt: new Date() })
      .where(eq(moltbookAgents.id, req.params.id));

    logAgentEvent(req.params.id, 'triggered', { agentName: agent.agentName });

    res.json({
      triggered: true,
      agentId: req.params.id,
      agentName: agent.agentName,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[moltbook] Trigger error:', error.message);
    res.status(500).json({ error: 'Failed to trigger heartbeat', message: error.message });
  }
});

// GET /:id/status — Get detailed agent status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const [agent] = await db
      .select()
      .from(moltbookAgents)
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const config = (agent.config as Record<string, unknown>) ?? {};
    const heartbeatState = config.heartbeatState as Record<string, unknown> | undefined;

    res.json({
      id: agent.id,
      agentName: agent.agentName,
      heartbeatEnabled: agent.heartbeatEnabled,
      lastHeartbeat: agent.lastHeartbeat,
      stats: {
        totalPosts: agent.totalPostsGenerated,
        totalComments: agent.totalCommentsGenerated,
        totalUpvotesGiven: agent.totalUpvotesGiven,
        challengeFailures: agent.challengeFailures,
        llmSpentCents: agent.totalLlmSpentCents,
      },
      heartbeatState: heartbeatState ?? null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });
  } catch (error: any) {
    console.error('[moltbook] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get agent status', message: error.message });
  }
});

// GET /:id/events — Agent activity log
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { moltbookAgents, moltbookAgentEvents } = await import('../db/schema.js');
    const { eq, and, desc } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    // Verify agent ownership
    const [agent] = await db
      .select({ id: moltbookAgents.id })
      .from(moltbookAgents)
      .where(and(eq(moltbookAgents.id, req.params.id), eq(moltbookAgents.userId, userId)))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);

    const events = await db
      .select()
      .from(moltbookAgentEvents)
      .where(eq(moltbookAgentEvents.agentId, req.params.id))
      .orderBy(desc(moltbookAgentEvents.createdAt))
      .limit(limit);

    res.json({ events });
  } catch (error: any) {
    console.error('[moltbook] Events error:', error.message);
    res.status(500).json({ error: 'Failed to get events', message: error.message });
  }
});

export { router as moltbookRouter };
