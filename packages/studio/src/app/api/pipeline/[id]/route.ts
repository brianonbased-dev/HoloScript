/**
 * GET  /api/pipeline/:id — Get pipeline run details.
 * POST /api/pipeline/:id — Control pipeline (pause/resume/stop/approve/reject).
 *
 * Body: { action: 'pause' | 'resume' | 'stop' | 'approve' | 'reject', layerId?: number, cycleId?: string }
 *
 * Local Testing:
 *   Set DISABLE_AUTH=true in .env.local OR pass ?no-auth=true query parameter
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface ControlRequest {
  action: 'pause' | 'resume' | 'stop' | 'approve' | 'reject';
  layerId?: number;
  cycleId?: string;
}

// Auth bypass for local testing (NEVER enable in production)
const isAuthDisabled = (): boolean => {
  return process.env.DISABLE_AUTH === 'true' || process.env.NODE_ENV === 'test';
};

// Server-side control events queue (consumed by the orchestrator poll loop)
const controlQueue = new Map<string, ControlRequest[]>();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Check auth bypass
  const noAuth = req.nextUrl.searchParams.get('no-auth') === 'true' || isAuthDisabled();

  if (!noAuth) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  const { id } = params;

  // Return any pending control events alongside status
  const pendingControls = controlQueue.get(id) ?? [];

  return NextResponse.json({
    id,
    pendingControls,
    hint: 'Pipeline state is managed client-side in pipelineStore. This endpoint provides server-side coordination.',
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Check auth bypass
  const noAuth = req.nextUrl.searchParams.get('no-auth') === 'true' || isAuthDisabled();

  if (!noAuth) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  let body: ControlRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, layerId, cycleId } = body;
  const validActions = ['pause', 'resume', 'stop', 'approve', 'reject'];

  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${validActions.join(', ')}` },
      { status: 400 },
    );
  }

  if ((action === 'approve' || action === 'reject') && layerId === undefined) {
    return NextResponse.json(
      { error: 'layerId is required for approve/reject' },
      { status: 400 },
    );
  }

  const { id } = params;

  // Queue the control event
  if (!controlQueue.has(id)) {
    controlQueue.set(id, []);
  }
  controlQueue.get(id)!.push({ action, layerId, cycleId });

  // Cap queue size per pipeline
  const queue = controlQueue.get(id)!;
  if (queue.length > 50) {
    controlQueue.set(id, queue.slice(-50));
  }

  return NextResponse.json({
    id,
    action,
    layerId,
    queued: true,
  });
}
