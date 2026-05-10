export const maxDuration = 300;

/**
 * HoloHeal / HoloDaemon API Route — /api/holodaemon
 *
 * Dedicated API endpoint for the HoloHeal self-improvement runtime.
 * HoloDaemon remains the backward-compatible route and runner name.
 *
 * Provides:
 *   GET  — Returns daemon state, composition source, and telemetry
 *   POST — Start/stop/configure daemon operations
 *
 * This route bridges the holoheal.hsplus / holodaemon.hsplus composition with the
 * existing daemon runner infrastructure.
 *
 * @module api/holodaemon
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { listDaemonJobs, getTelemetrySummary, createDaemonJob } from '@/app/api/daemon/jobs/store';
import type { DaemonProfile } from '@/lib/daemon/types';
import {
  HOLO_DAEMON_MISSIONS,
  buildHoloDaemonAgentConfig,
  getHoloDaemonMission,
} from '@/lib/daemon/agentProfiles';

import { corsHeaders } from '../_lib/cors';
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
  compositionName: string;
  available: boolean;
}> {
  const repoRoot = resolveRepoRoot();
  const candidates = [
    { file: 'holoheal.hsplus', compositionName: 'HoloHeal' },
    { file: 'holodaemon.hsplus', compositionName: 'HoloDaemon' },
  ];

  for (const candidate of candidates) {
    const sourcePath = path.join(repoRoot, 'compositions', candidate.file);
    if (!existsSync(sourcePath)) continue;

    try {
      const code = await readFile(sourcePath, 'utf8');
      return { code, sourcePath, compositionName: candidate.compositionName, available: true };
    } catch {
      return { code: '', sourcePath: '', compositionName: candidate.compositionName, available: false };
    }
  }

  return { code: '', sourcePath: '', compositionName: 'HoloHeal', available: false };
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
  const daemonStatus =
    runningJobs.length > 0 ? 'running' : latestJob?.status === 'failed' ? 'error' : 'idle';

  // Aggregate quality from latest completed job
  const latestCompleted = completedJobs[0];
  const qualityScore = latestCompleted?.metrics?.qualityAfter ?? 0;
  const qualityDelta = latestCompleted?.metrics?.qualityDelta ?? 0;

  return NextResponse.json({
    // Daemon state
    daemon: {
      name: 'HoloHeal',
      legacyName: 'HoloDaemon',
      semanticLoop: 'self-improvement',
      runtime: 'HoloDaemon',
      version: '1.0.0',
      status: daemonStatus,
      activeJobId: runningJobs[0]?.id ?? null,
    },

    runtime: {
      name: 'HoloDaemon',
      role: 'customizable resident agent runtime',
      defaultMission: 'holoheal',
      missions: HOLO_DAEMON_MISSIONS,
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
      name: composition.compositionName,
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
    missionProfile?: string;
    agentName?: string;
    skills?: unknown;
    authorityRefs?: unknown;
    schedules?: unknown;
    projectPath?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action === 'start') {
    const mission = getHoloDaemonMission(body.missionProfile);
    const profile = body.profile ?? mission.defaultMode;
    const daemonAgent = buildHoloDaemonAgentConfig({
      missionProfile: body.missionProfile,
      agentName: body.agentName,
      skills: body.skills,
      authorityRefs: body.authorityRefs,
      schedules: body.schedules,
    });

    // Check if a job is already running
    const jobs = listDaemonJobs();
    const running = jobs.find((j) => j.status === 'running');
    if (running) {
      return NextResponse.json(
        { error: 'A daemon job is already running', activeJobId: running.id },
        { status: 409 }
      );
    }

    const job = createDaemonJob({
      projectId: 'holoscript',
      profile,
      projectDna: {
        kind: 'spatial',
        confidence: 0.95,
        detectedStack: ['typescript', 'react', 'holoscript', 'three.js', `daemon:${daemonAgent.missionProfile}`],
        recommendedProfile: profile,
        notes: [
          `HoloDaemon mission: ${daemonAgent.missionProfile}`,
          `${daemonAgent.agentName} — ${mission.description}`,
          'Raw secret access disabled; use capability handles and receipts.',
        ],
        daemonAgent,
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
    (running as { status: string }).status = 'completed';
    running.statusMessage = 'Stopped by user request';
    running.progress = 100;

    return NextResponse.json({
      message: 'Stop signal sent. Daemon will halt after current cycle completes.',
      stoppedJobId: running.id,
    });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
