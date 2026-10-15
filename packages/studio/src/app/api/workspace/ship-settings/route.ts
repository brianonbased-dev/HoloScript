/**
 * GET   /api/workspace/ship-settings?workspaceId=ws-...
 * PATCH /api/workspace/ship-settings  { workspaceId, directShip: boolean }
 *
 * The per-workspace direct-ship setting. OFF by default (imports are
 * branch + PR). Only the workspace's owner can read or change it. When on,
 * /api/git/ship and /api/git/push may push the default branch, still subject
 * to the caller's GitHub role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { findDurableAbsorbProject, upsertDurableAbsorbProject } from '@/lib/absorb/projectState';
import { callerUserId } from '@/lib/workspace/workspaceOwner';
import { workspaceDirectShipEnabled, workspaceShipMode } from '@/lib/workspace/shipPolicy';
import { corsHeaders } from '../../_lib/cors';

const NOT_FOUND = { error: 'Workspace not found or not accessible' };

async function ownedProject(workspaceId: unknown) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  const userId = callerUserId(session);
  if (!userId) return { status: 401 as const };
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) return { status: 400 as const };
  const project = findDurableAbsorbProject({ projectId: workspaceId });
  if (!project || project.ownerId !== userId) return { status: 404 as const };
  return { status: 200 as const, project, userId };
}

function refusal(status: 400 | 401 | 404) {
  if (status === 401) return NextResponse.json({ error: 'Not authenticated' }, { status });
  if (status === 400) return NextResponse.json({ error: 'workspaceId is required' }, { status });
  return NextResponse.json(NOT_FOUND, { status });
}

export async function GET(req: NextRequest) {
  const owned = await ownedProject(req.nextUrl.searchParams.get('workspaceId'));
  if (owned.status !== 200) return refusal(owned.status);
  return NextResponse.json({
    workspaceId: owned.project.id,
    directShip: workspaceDirectShipEnabled(owned.project),
    shipMode: workspaceShipMode(owned.project),
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    workspaceId?: unknown;
    directShip?: unknown;
  } | null;
  if (typeof body?.directShip !== 'boolean') {
    return NextResponse.json({ error: 'directShip must be true or false' }, { status: 400 });
  }
  const owned = await ownedProject(body.workspaceId);
  if (owned.status !== 200) return refusal(owned.status);
  const updated = upsertDurableAbsorbProject({
    id: owned.project.id,
    name: owned.project.name,
    ownerId: owned.userId,
    metadata: {
      directShip: body.directShip,
      shipMode: body.directShip ? 'direct-ship' : 'branch-pr',
    },
  });
  return NextResponse.json({
    workspaceId: updated.id,
    directShip: workspaceDirectShipEnabled(updated),
    shipMode: workspaceShipMode(updated),
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, PATCH, OPTIONS' }),
  });
}
