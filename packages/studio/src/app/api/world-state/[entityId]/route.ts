import { NextRequest, NextResponse } from 'next/server';
import { readEntity } from '@/lib/world-state-local';

/**
 * GET /api/world-state/[entityId]
 *
 * Browser-facing read of the in-process authoritative world state for one
 * entity — the "Loro -> viewer" bridge in the agent-avatar loop. An agent drives
 * an entity via /api/world-drive; the headset reads its position here every ~1s.
 * Returns the entity fields ({transform:{position}, updatedAt}) or {_null:true}.
 *
 * Local in-process read (see lib/world-state-local.ts): the shared production
 * MCP proved too flaky for a live loop, and a single-process avatar loop's
 * correct authority is local anyway.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params;
  if (!entityId) {
    return NextResponse.json({ _error: 'missing entityId' }, { status: 400 });
  }
  return NextResponse.json(readEntity(entityId), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
