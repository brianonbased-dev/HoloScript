import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const pipelineRouter = Router();

// In-memory run registry (single-server; swap for Redis in production)
const activeRuns = new Map<string, {
  id: string;
  mode: string;
  targetProject: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: string;
  completedAt: string | null;
}>();

export interface StartPipelineRequest {
  mode: 'single' | 'continuous' | 'self-target';
  targetProject: string;
}

pipelineRouter.get('/', (req: Request, res: Response) => {
  const runs = Array.from(activeRuns.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  res.json({ runs, total: runs.length });
});

pipelineRouter.post('/', (req: Request, res: Response) => {
  const { mode, targetProject } = req.body as StartPipelineRequest;

  if (!mode || !['single', 'continuous', 'self-target'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "single", "continuous", or "self-target"' });
  }

  if (!targetProject || typeof targetProject !== 'string') {
    return res.status(400).json({ error: 'targetProject is required' });
  }

  const active = Array.from(activeRuns.values()).find((r) => r.status === 'running');
  if (active) {
    return res.status(409).json({ error: 'A pipeline is already running', activeId: active.id });
  }

  const id = `pipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    id,
    mode,
    targetProject,
    status: 'running' as const,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  activeRuns.set(id, run);

  res.json({
    id,
    mode,
    targetProject,
    status: 'running',
    startedAt: run.startedAt,
    hint: `GET /api/pipeline/${id} for status. POST /api/pipeline/${id} to control.`,
  });
});
