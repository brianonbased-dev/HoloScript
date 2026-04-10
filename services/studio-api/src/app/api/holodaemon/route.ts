/**
 * HoloDaemon API Route — /api/holodaemon
 *
 * Dedicated API endpoint for the HoloDaemon MVP. Provides:
 *   GET  — Returns daemon state, composition source, and telemetry
 *   POST — Start/stop/configure daemon operations
 *
 * This route bridges the holodaemon.hsplus composition with the
 * existing daemon runner infrastructure.
 *
 * @module api/holodaemon
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  listDaemonJobs,
  getTelemetrySummary,
  createDaemonJob,
} from '@/app/api/daemon/jobs/store';
import type { DaemonProfile } from '@/lib/daemon/types';

// ---------------------------------------------------------------------------
// Composition Source Loading
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// GET /api/holodaemon
// ---------------------------------------------------------------------------

export async function GET() {
  const jobs = listDaemonJobs();
  const telemetry = getTelemetrySummary();
  const composition = await loadCompositionSource();

  const runningJobs = jobs.filter((j) => j.status === 'running');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const latestJob = jobs[0] ?? null;

  // Derive daemon status from job state
  const daemonStatus = runningJobs.length > 0
    ? 'running'
    : latestJob?.status === 'failed'
      ? 'error'
      : 'idle';

  // Aggregate quality from latest completed job
  const latestCompleted = completedJobs[0];
  const qualityScore = latestCompleted?.metrics?.qualityAfter ?? 0;
  const qualityDelta = latestCompleted?.metrics?.qualityDelta ?? 0;

  return NextResponse.json({
    // Daemon state
    daemon: {
      name: 'HoloDaemon',
      version: '1.0.0',
      status: daemonStatus,
      activeJobId: runningJobs[0]?.id ?? null,
    },

    // Telemetry
    telemetry,

    // Quality metrics
    quality: {
      score: qualityScore,
      delta: qualityDelta,
      typeErrors: latestCompleted?.metrics?.filesAnalyzed ?? 0,
    },

    // Latest job summary
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

    // Composition source
    composition: {
      available: composition.available,
      code: composition.code,
      sourcePath: composition.sourcePath,
      format: 'hsplus',
    },

    // Job count summary
    counts: {
      total: telemetry.totalJobs,
      running: runningJobs.length,
      completed: telemetry.completedJobs,
      failed: telemetry.failedJobs,
      patches: telemetry.totalPatches,
      applied: telemetry.appliedPatches,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/holodaemon
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: {
    action: 'start' | 'stop';
    profile?: DaemonProfile;
    projectPath?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action === 'start') {
    const profile = body.profile ?? 'balanced';

    // Check if a job is already running
    const jobs = listDaemonJobs();
    const running = jobs.find((j) => j.status === 'running');
    if (running) {
      return NextResponse.json(
        { error: 'A daemon job is already running', activeJobId: running.id },
        { status: 409 },
      );
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

    return NextResponse.json({ job }, { status: 201 });
  }

  if (body.action === 'stop') {
    const jobs = listDaemonJobs();
    const running = jobs.find((j) => j.status === 'running');

    if (!running) {
      return NextResponse.json({ message: 'No daemon job is currently running.' });
    }

    // Mark the job as stopping so the runner's next cycle check exits gracefully
    running.status = 'completed' as any;
    running.statusMessage = 'Stopped by user request';
    running.progress = 100;

    return NextResponse.json({
      message: 'Stop signal sent. Daemon will halt after current cycle completes.',
      stoppedJobId: running.id,
    });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
}
