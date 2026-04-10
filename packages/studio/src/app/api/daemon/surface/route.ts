import { NextResponse } from 'next/server';
import { listDaemonJobs, getTelemetrySummary } from '@/app/api/daemon/jobs/store';
import { loadDaemonSurface, type DaemonSurfaceKind } from '@/lib/daemon/compositionSurfaces';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kindParam = searchParams.get('kind');
  const kind: DaemonSurfaceKind = kindParam === 'orchestration' ? 'orchestration' : 'dashboard';

  const jobs = listDaemonJobs();
  const telemetry = getTelemetrySummary();

  try {
    const surface = await loadDaemonSurface(kind, jobs, telemetry);

    return NextResponse.json({
      ...surface,
      jobCount: jobs.length,
      telemetry,
      generation: {
        native: true,
        mode: 'loaded-from-composition',
        hydrated: true,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        kind,
        format: 'hsplus',
        name: kind === 'dashboard' ? 'StudioOperationsDashboard' : 'StudioJobOrchestration',
        code: '',
        sourcePath: '',
        jobCount: jobs.length,
        telemetry,
        summary: {
          activityCount: 0,
          agentCount: 0,
          forkCount: 0,
          runningJobs: 0,
          queuedJobs: 0,
          reviewJobs: 0,
        },
        validation: {
          valid: false,
          errors: [err instanceof Error ? err.message : String(err)],
        },
        generation: {
          native: true,
          mode: 'loaded-from-composition',
          hydrated: false,
        },
      },
      { status: 500 }
    );
  }
}
