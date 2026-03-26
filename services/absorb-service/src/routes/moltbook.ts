import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mask API key for safe display: mb_***...*** */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***...' + key.slice(-3);
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
    const userId = (req as any).userId || 'anonymous';

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
    const userId = (req as any).userId || 'anonymous';

    const [summary] = await db
      .select({
        totalAgents: sql<number>`count(*)::int`,
        activeAgents: sql<number>`count(*) filter (where ${moltbookAgents.heartbeatEnabled} = true)::int`,
        totalPosts: sql<number>`coalesce(sum(${moltbookAgents.totalPostsGenerated}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${moltbookAgents.totalCommentsGenerated}), 0)::int`,
        totalLlmSpentCents: sql<number>`coalesce(sum(${moltbookAgents.totalLlmSpentCents}), 0)::int`,
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
    const userId = (req as any).userId || 'anonymous';

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
    const userId = (req as any).userId || 'anonymous';

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
    const userId = (req as any).userId || 'anonymous';

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

export { router as moltbookRouter };
