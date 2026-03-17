import { NextResponse } from 'next/server';
import {
  getDaemonJob,
  getJobPatches,
  getJobLogs,
  recordPatchAction,
} from '../store';

/**
 * GET /api/daemon/jobs/:id
 * GET /api/daemon/jobs/:id?view=patches  — return only patch proposals
 * GET /api/daemon/jobs/:id?view=logs     — return only job logs
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  const job = getDaemonJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Daemon job not found' }, { status: 404 });
  }

  if (view === 'patches') {
    return NextResponse.json({ jobId: id, patches: getJobPatches(id) });
  }

  if (view === 'logs') {
    return NextResponse.json({ jobId: id, logs: getJobLogs(id) });
  }

  return NextResponse.json({ job });
}

/**
 * POST /api/daemon/jobs/:id
 *
 * Body: { action: 'apply' | 'export' | 'reject', patchIds: string[] }
 *
 * Records patch review decisions for telemetry and billing signals.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getDaemonJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Daemon job not found' }, { status: 404 });
  }

  let body: { action?: string; patchIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, patchIds } = body;
  if (!action || !patchIds || !Array.isArray(patchIds)) {
    return NextResponse.json(
      { error: 'Missing required fields: action (apply|export|reject), patchIds (string[])' },
      { status: 400 },
    );
  }

  const validActions = ['apply', 'export', 'reject'];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action "${action}". Must be one of: ${validActions.join(', ')}` },
      { status: 400 },
    );
  }

  const mappedAction = action === 'apply'
    ? 'applied' as const
    : action === 'export'
      ? 'exported' as const
      : 'rejected' as const;

  recordPatchAction(id, patchIds, mappedAction);

  return NextResponse.json({
    success: true,
    jobId: id,
    action: mappedAction,
    patchCount: patchIds.length,
  });
}
