import { NextRequest, NextResponse } from 'next/server';
import { applyMove, isValidEntityId } from '@/lib/world-state-loro';

/**
 * POST /api/world-drive  { entityId, position:{x,y,z} }
 *
 * The agent-side "drive an avatar" endpoint of the live loop: an agent (e.g.
 * scripts/agent-avatar-driver.mjs) decides a move and posts it here; the
 * in-process world authority records the new position; the headset viewer reads
 * it back via /api/world-state. Local = no prod-MCP dependency, no 500s, low
 * latency over the cable.
 *
 * This is a WRITE endpoint into in-process state. It's open on the local dev
 * server (where the headset loop runs over the cable), but fails CLOSED in
 * production unless WORLD_STATE_TOKEN is set and presented — a public,
 * unauthenticated write surface is not acceptable on the deployed studio.
 */

export const dynamic = 'force-dynamic';

const toFinite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function authorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true; // local dev + the headset loop
  const token = process.env.WORLD_STATE_TOKEN;
  return Boolean(token) && req.headers.get('x-world-state-token') === token;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ _error: 'not available' }, { status: 404 });
  }
  try {
    const body = (await req.json()) as {
      entityId?: unknown;
      position?: { x?: unknown; y?: unknown; z?: unknown };
    };
    const { entityId, position } = body;
    if (!isValidEntityId(entityId)) {
      return NextResponse.json(
        { _error: 'entityId must be 1-128 chars of [A-Za-z0-9 _ : @ . -]' },
        { status: 400 }
      );
    }
    const x = toFinite(position?.x);
    if (x === null) {
      return NextResponse.json({ _error: 'position.x must be a finite number' }, { status: 400 });
    }
    applyMove(entityId, { x, y: toFinite(position?.y) ?? 0, z: toFinite(position?.z) ?? 0 });
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    return NextResponse.json(
      { _error: err instanceof Error ? err.message : 'unknown' },
      { status: 400 }
    );
  }
}
