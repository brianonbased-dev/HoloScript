export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  applyPatchesToWorkspaceBranch,
  getDaemonJob,
  getJobLogs,
  getJobPatches,
  recordPatchAction,
} from '../store';

import { corsHeaders } from '../../../_lib/cors';
/**
 * GET /api/daemon/jobs/:id
 * GET /api/daemon/jobs/:id?view=patches  — return only patch proposals
 * GET /api/daemon/jobs/:id?view=logs     — return only job logs
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

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
 * Body: { action: 'apply' | 'apply-to-branch' | 'export' | 'reject', patchIds: string[] }
 *
 * Applies selected patches to a durable workspace branch or records patch
 * review decisions for telemetry and billing signals.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const job = getDaemonJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Daemon job not found' }, { status: 404 });
  }

  let body: { action?: string; patchIds?: string[]; branchName?: string; baseBranch?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, patchIds } = body;
  if (!action || !patchIds || !Array.isArray(patchIds)) {
    return NextResponse.json(
      {
        error:
          'Missing required fields: action (apply|apply-to-branch|export|reject), patchIds (string[])',
      },
      { status: 400 }
    );
  }

  const validActions = ['apply', 'apply-to-branch', 'export', 'reject'];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action "${action}". Must be one of: ${validActions.join(', ')}` },
      { status: 400 }
    );
  }

  if (action === 'apply-to-branch') {
    try {
      const applyResult = applyPatchesToWorkspaceBranch(id, patchIds, {
        branchName: body.branchName,
        baseBranch: body.baseBranch,
      });
      recordPatchAction(id, patchIds, 'applied');
      return NextResponse.json({
        success: true,
        jobId: id,
        action: 'applied',
        patchCount: patchIds.length,
        applyResult,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const mappedAction =
    action === 'apply'
      ? ('applied' as const)
      : action === 'export'
        ? ('exported' as const)
        : ('rejected' as const);

  recordPatchAction(id, patchIds, mappedAction);

  return NextResponse.json({
    success: true,
    jobId: id,
    action: mappedAction,
    patchCount: patchIds.length,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
