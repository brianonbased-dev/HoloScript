import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// In-memory graph store (replace with Redis/DB for production scale)
const graphStore = new Map<string, { 
  graph: any; 
  stats: any; 
  createdAt: Date;
  path: string;
  shallow: boolean;
  topology: any;
  fileCount: number;
}>();

const ScanRequestSchema = z.object({
  path: z.string().min(1),
  languages: z.array(z.string()).optional(),
  shallow: z.boolean().optional().default(false),
  projectId: z.string().optional(),
});

const QueryRequestSchema = z.object({
  graphId: z.string().min(1),
  query: z.string().min(1),
  maxResults: z.number().optional().default(10),
});

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  sourceType: z.enum(['github', 'local', 'upload', 'url']),
  sourceUrl: z.string().optional(),
  localPath: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// POST /scan — Scan a codebase
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const body = ScanRequestSchema.parse(req.body);

    // --- CACHE CHECK ---
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    for (const [id, entry] of graphStore.entries()) {
      if (entry.path === body.path && entry.shallow === body.shallow) {
        if (now.getTime() - entry.createdAt.getTime() < CACHE_TTL_MS) {
          // Return cached
          return res.json({
            graphId: id,
            stats: entry.stats,
            fileCount: entry.fileCount,
            cost: 0, // Free if cached
            cached: true,
            topology: entry.topology
          });
        }
      }
    }
    // -------------------

    // Lazy import to avoid loading heavy modules at startup
    const { CodebaseScanner, CodebaseGraph } = await import('@holoscript/absorb-service/engine');

    const scanner = new CodebaseScanner();
    const scanResult = await scanner.scan(body.path, {
      languages: body.languages as any,
      shallow: body.shallow,
    });

    const graph = new CodebaseGraph();
    graph.buildFromScanResult(scanResult);

    const graphId = uuidv4();

    // Build in-degree map for topological intelligence
    const inDegree: Record<string, number> = {};
    const filesList = scanResult.files || [];
    for (const file of filesList) {
      if (!(file.path in inDegree)) inDegree[file.path] = 0;
      for (const imp of file.imports || []) {
        if (imp.resolvedPath) {
          inDegree[imp.resolvedPath] = (inDegree[imp.resolvedPath] ?? 0) + 1;
        }
      }
    }

    // Leaf-first order: sort files by in-degree ascending (safest to fix first)
    const leafFirstOrder = filesList
      .map((f: any) => f.path)
      .sort((a: string, b: string) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0));

    // Deduct credits if authenticated
    if ((req as AuthenticatedRequest).authenticated && body.projectId) {
      const { requireCredits, isCreditError, deductCredits } = await import('@holoscript/absorb-service/credits');
      const userId = (req as AuthenticatedRequest).userId || 'anonymous';
      const opType = body.shallow ? 'absorb_shallow' : 'absorb_deep';
      
      const creditCheck = await requireCredits(userId, opType);
      if (isCreditError(creditCheck)) {
        res.status(402).json(creditCheck);
        return;
      }
      
      await deductCredits(
        userId,
        creditCheck.costCents,
        `Codebase scan: ${body.path}`,
        { graphId, shallow: body.shallow }
      );
    }

    const topology = {
      leafFirstOrder,
      inDegree,
      communities: (graph as any).communities ?? {},
      graphJson: typeof graph.serialize === 'function' ? graph.serialize() : '{}',
      durationMs: scanResult.stats.durationMs ?? 0,
    };

    graphStore.set(graphId, {
      graph,
      stats: scanResult.stats,
      createdAt: new Date(),
      path: body.path,
      shallow: body.shallow,
      topology,
      fileCount: scanResult.files?.length ?? 0,
    });

    res.json({
      graphId,
      stats: scanResult.stats,
      fileCount: scanResult.files?.length ?? 0,
      cost: body.shallow ? 10 : 50,
      cached: false,
      topology
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[absorb/scan] Error:', error.message);
    res.status(500).json({ error: 'Scan failed', message: error.message });
  }
});

// POST /query — GraphRAG query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const body = QueryRequestSchema.parse(req.body);
    const entry = graphStore.get(body.graphId);

    if (!entry) {
      res.status(404).json({ error: 'Graph not found', graphId: body.graphId });
      return;
    }

    const { requireCredits, isCreditError, deductCredits } = await import('@holoscript/absorb-service/credits');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';
    const creditCheck = await requireCredits(userId, 'query_with_llm');
    
    if (isCreditError(creditCheck)) {
      res.status(402).json(creditCheck);
      return;
    }

    const { EmbeddingIndex } = await import('@holoscript/absorb-service/engine');
    const index = new EmbeddingIndex();

    // Build index from graph symbols
    const symbols = entry.graph.getAllSymbols?.() ?? [];
    for (const sym of symbols) {
      index.add(sym.id, sym.name + ' ' + (sym.documentation || ''), sym);
    }

    const results = await index.search(body.query, body.maxResults);

    await deductCredits(
      userId,
      creditCheck.costCents,
      `Semantic codebase query: ${body.query.substring(0, 32)}...`,
      { graphId: body.graphId }
    );

    res.json({
      query: body.query,
      results: results.map((r: any) => ({
        symbol: r.metadata?.name,
        type: r.metadata?.type,
        file: r.metadata?.filePath,
        score: r.score,
        documentation: r.metadata?.documentation,
      })),
      graphId: body.graphId,
      cost: creditCheck.costCents,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[absorb/query] Error:', error.message);
    res.status(500).json({ error: 'Query failed', message: error.message });
  }
});

// GET /projects — List projects
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { eq, desc } = await import('drizzle-orm');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const projects = await db
      .select()
      .from(absorbProjects)
      .where(eq(absorbProjects.userId, userId))
      .orderBy(desc(absorbProjects.createdAt))
      .limit(50);

    res.json({ projects });
  } catch (error: any) {
    console.error('[absorb/projects] Error:', error.message);
    res.status(500).json({ error: 'Failed to list projects', message: error.message });
  }
});

// POST /projects — Create project
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const body = CreateProjectSchema.parse(req.body);
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

    const result = await db
      .insert(absorbProjects)
      .values({
        id: uuidv4(),
        userId,
        name: body.name,
        sourceType: body.sourceType,
        sourceUrl: body.sourceUrl ?? null,
        localPath: body.localPath ?? null,
        status: 'pending',
        metadata: body.metadata ?? {},
      })
      .returning();
    const project = Array.isArray(result) ? result[0] : result;

    res.status(201).json({ project });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('[absorb/projects] Error:', error.message);
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

// GET /projects/:id — Get project detail
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { eq } = await import('drizzle-orm');

    const [project] = await db
      .select()
      .from(absorbProjects)
      .where(eq(absorbProjects.id, req.params.id))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ project });
  } catch (error: any) {
    console.error('[absorb/projects/:id] Error:', error.message);
    res.status(500).json({ error: 'Failed to get project', message: error.message });
  }
});

// DELETE /projects/:id — Delete project
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { eq } = await import('drizzle-orm');

    const deleteResult = await db
      .delete(absorbProjects)
      .where(eq(absorbProjects.id, req.params.id))
      .returning();

    if (!Array.isArray(deleteResult) || deleteResult.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ deleted: true, id: req.params.id });
  } catch (error: any) {
    console.error('[absorb/projects/:id] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete project', message: error.message });
  }
});

// GET /graphs — List active graphs in memory
router.get('/graphs', (_req: Request, res: Response) => {
  const graphs = Array.from(graphStore.entries()).map(([id, entry]) => ({
    graphId: id,
    stats: entry.stats,
    createdAt: entry.createdAt,
  }));
  res.json({ graphs });
});

export { router as absorbRouter };
