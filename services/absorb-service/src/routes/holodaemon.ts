import { Router, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Note: These imports will need to be adjusted once the paths are finalized
import {
  listDaemonJobs,
  getTelemetrySummary,
  createDaemonJob,
} from '../daemon/jobs/store.js';

export const holodaemonRouter = Router();

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'compositions'))) {
      return candidate;
    }
  }

  return process.cwd();
}

async function loadCompositionSource(): Promise<{
  code: string;
  sourcePath: string;
  available: boolean;
}> {
  const repoRoot = resolveRepoRoot();
  const sourcePath = path.join(repoRoot, 'compositions', 'holodaemon.hsplus');

  if (!existsSync(sourcePath)) {
    return { code: '', sourcePath: '', available: false };
  }

  try {
    const code = await readFile(sourcePath, 'utf8');
    return { code, sourcePath, available: true };
  } catch {
    return { code: '', sourcePath, available: false };
  }
}

holodaemonRouter.get('/', async (req: Request, res: Response) => {
  const jobs = listDaemonJobs();
  const telemetry = getTelemetrySummary();
  const composition = await loadCompositionSource();

  const runningJobs = jobs.filter((j: any) => j.status === 'running');
  const completedJobs = jobs.filter((j: any) => j.status === 'completed');
  const latestJob = jobs[0] ?? null;

  const daemonStatus = runningJobs.length > 0
    ? 'running'
    : latestJob?.status === 'failed'
      ? 'error'
      : 'idle';

  const latestCompleted = completedJobs[0];
  const qualityScore = latestCompleted?.metrics?.qualityAfter ?? 0;
  const qualityDelta = latestCompleted?.metrics?.qualityDelta ?? 0;

  res.json({
    daemon: {
      name: 'HoloDaemon',
      version: '1.0.0',
      status: daemonStatus,
      activeJobId: runningJobs[0]?.id ?? null,
    },
    telemetry,
    quality: {
      score: qualityScore,
      delta: qualityDelta,
      typeErrors: latestCompleted?.metrics?.filesAnalyzed ?? 0,
    },
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: latestJob.progress,
          profile: latestJob.profile,
          summary: latestJob.summary ?? latestJob.statusMessage,
          metrics: latestJob.metrics,
          patchCount: latestJob.patches?.length ?? 0,
        }
      : null,
    composition: {
      available: composition.available,
      code: composition.code,
      sourcePath: composition.sourcePath,
      format: 'hsplus',
    },
    counts: {
      total: telemetry.totalJobs,
      running: runningJobs.length,
      completed: telemetry.completedJobs,
      failed: telemetry.failedJobs,
      patches: telemetry.totalPatches,
      applied: telemetry.appliedPatches,
    },
  });
});

holodaemonRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body;

  if (body.action === 'start') {
    const profile = body.profile ?? 'balanced';

    const jobs = listDaemonJobs();
    const running = jobs.find((j: any) => j.status === 'running');
    if (running) {
      return res.status(409).json({ error: 'A daemon job is already running', activeJobId: running.id });
    }

    const job = createDaemonJob({
      projectId: 'holoscript',
      profile,
      projectDna: {
        kind: 'spatial',
        confidence: 0.95,
        detectedStack: ['typescript', 'react', 'holoscript', 'three.js'],
        recommendedProfile: profile,
        notes: ['HoloDaemon MVP — self-improvement daemon run'],
      },
      projectPath: body.projectPath,
    });

    return res.status(201).json({ job });
  }

  if (body.action === 'stop') {
    const jobs = listDaemonJobs();
    const running = jobs.find((j: any) => j.status === 'running');

    if (!running) {
      return res.json({ message: 'No daemon job is currently running.' });
    }

    running.status = 'completed' as any;
    running.statusMessage = 'Stopped by user request';
    running.progress = 100;

    return res.json({
      message: 'Stop signal sent. Daemon will halt after current cycle completes.',
      stoppedJobId: running.id,
    });
  }

  return res.status(400).json({ error: `Unknown action: ${body.action}` });
});
