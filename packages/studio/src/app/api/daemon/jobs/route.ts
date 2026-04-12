export const maxDuration = 300;

import { NextResponse } from 'next/server';
import {
  createDaemonJob,
  listDaemonJobs,
  getTelemetrySummary,
  type CreateDaemonJobInput,
} from './store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  // GET /api/daemon/jobs?view=telemetry — return telemetry summary
  if (view === 'telemetry') {
    return NextResponse.json({ telemetry: getTelemetrySummary() });
  }

  return NextResponse.json({ jobs: listDaemonJobs() });
}

export async function POST(request: Request) {
  let body: Partial<CreateDaemonJobInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.projectId || !body.profile || !body.projectDna) {
    return NextResponse.json(
      { error: 'Missing required fields: projectId, profile, projectDna' },
      { status: 400 }
    );
  }

  const created = createDaemonJob({
    projectId: body.projectId,
    profile: body.profile,
    projectDna: body.projectDna,
    projectPath: body.projectPath,
    customLimits: body.customLimits,
  });

  return NextResponse.json({ job: created }, { status: 201 });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
