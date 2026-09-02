import { NextRequest, NextResponse } from 'next/server';
import { applyFields, isValidEntityId, readEntity } from '@/lib/world-state-loro';

/**
 * GET  /api/world-state/[entityId]  — read the authoritative twin fields for one entity.
 * POST /api/world-state/[entityId]  — set twin fields  { fields: { ... } }
 *
 * Browser-facing read of the in-process authoritative world state for one
 * entity — the "Loro -> viewer" bridge in the agent-avatar loop. An agent drives
 * an entity via /api/world-drive; the headset reads its position here every ~1s.
 * Returns the entity fields ({transform:{position}, updatedAt}) or {_null:true}.
 *
 * POST exists so a twin can hold what a SURFACE claims to mirror, not only a position: it is the
 * producer side of the @verified_view / @live_proof check (see /api/verified-view/live-proof).
 * Writing a value here that disagrees with what a panel displays is exactly how you make that
 * check go red on purpose — which is the only way to know it still can.
 *
 * Local in-process read (see lib/world-state-loro.ts): Loro CRDT-backed
 * authority that persists across Next.js hot-reloads.
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const { entityId } = await params;
  if (!isValidEntityId(entityId)) {
    return NextResponse.json(
      { _error: 'entityId must be 1-128 chars of [A-Za-z0-9 _ : @ . -]' },
      { status: 400 }
    );
  }
  let fields: unknown;
  try {
    ({ fields } = (await req.json()) as { fields?: unknown });
  } catch {
    return NextResponse.json({ _error: 'body must be JSON' }, { status: 400 });
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return NextResponse.json({ _error: 'fields must be a JSON object' }, { status: 400 });
  }
  applyFields(entityId, fields as Record<string, unknown>);
  return NextResponse.json(readEntity(entityId), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
