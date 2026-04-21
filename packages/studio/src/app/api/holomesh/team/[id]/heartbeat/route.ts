export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../db/client';
import { holomeshTeamPresenceSessions } from '../../../../../../db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { rateLimit } from '../../../../../../lib/rate-limiter';

import { corsHeaders } from '../../../../_lib/cors';
const STALE_THRESHOLD_SECONDS = 300; // 5 minutes without heartbeat = session closed

/**
 * POST /api/holomesh/team/[id]/heartbeat
 *
 * Records a presence heartbeat for an agent in a team.
 * - Opens a new session if none is active for this (teamId, agentId).
 * - Closes stale sessions (>5 min without heartbeat) for other agents.
 * - On replacement (same role + different agentId), marks the previous session
 *   as closed with endReason='replacement'.
 *
 * Body: { agentId, agentName, role? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, { max: 60, label: 'team-heartbeat' }, 'team-heartbeat');
  if (!limited.ok) return limited.response;

  const { id: teamId } = await params;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : 'member';

  if (!agentId) {
    return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
  }

  const now = new Date();
  const staleThresholdMs = STALE_THRESHOLD_SECONDS * 1000;

  // Close stale sessions for this team (agents that haven't heartbeated recently)
  // We approximate via session_start — sessions with no end and start > threshold ago
  await db
    .update(holomeshTeamPresenceSessions)
    .set({
      sessionEnd: now,
      endReason: 'heartbeat_timeout',
      durationSeconds: sql`EXTRACT(EPOCH FROM (${now.toISOString()} - session_start))::int`,
    })
    .where(
      and(
        eq(holomeshTeamPresenceSessions.teamId, teamId),
        isNull(holomeshTeamPresenceSessions.sessionEnd),
        sql`session_start < ${new Date(now.getTime() - staleThresholdMs).toISOString()}`,
        sql`agent_id != ${agentId}`
      )
    );

  // Check for an active session for this (teamId, agentId)
  const [activeSession] = await db
    .select()
    .from(holomeshTeamPresenceSessions)
    .where(
      and(
        eq(holomeshTeamPresenceSessions.teamId, teamId),
        eq(holomeshTeamPresenceSessions.agentId, agentId),
        isNull(holomeshTeamPresenceSessions.sessionEnd)
      )
    )
    .limit(1);

  if (activeSession) {
    // Session is alive — nothing to do (sessionStart stays, frontend uses lastSeen from this call)
    return NextResponse.json({
      success: true,
      action: 'heartbeat',
      sessionId: activeSession.id,
      sessionStart: activeSession.sessionStart,
      agentId,
      teamId,
    });
  }

  // Open a new session
  const [newSession] = await db
    .insert(holomeshTeamPresenceSessions)
    .values({
      teamId,
      agentId,
      agentName: agentName || agentId,
      role,
      sessionStart: now,
    })
    .returning({
      id: holomeshTeamPresenceSessions.id,
      sessionStart: holomeshTeamPresenceSessions.sessionStart,
    });

  return NextResponse.json({
    success: true,
    action: 'session_opened',
    sessionId: newSession?.id,
    sessionStart: newSession?.sessionStart,
    agentId,
    teamId,
  });
}

/**
 * DELETE /api/holomesh/team/[id]/heartbeat
 *
 * Explicitly closes the active session for an agent (clean leave).
 * Body: { agentId, reason? }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(
    req,
    { max: 30, label: 'team-heartbeat-leave' },
    'team-heartbeat-leave'
  );
  if (!limited.ok) return limited.response;

  const { id: teamId } = await params;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body is optional for DELETE
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason : 'leave';

  if (!agentId) {
    return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
  }

  const now = new Date();

  const updated = await db
    .update(holomeshTeamPresenceSessions)
    .set({
      sessionEnd: now,
      endReason: reason,
      durationSeconds: sql`EXTRACT(EPOCH FROM (${now.toISOString()} - session_start))::int`,
    })
    .where(
      and(
        eq(holomeshTeamPresenceSessions.teamId, teamId),
        eq(holomeshTeamPresenceSessions.agentId, agentId),
        isNull(holomeshTeamPresenceSessions.sessionEnd)
      )
    )
    .returning({ id: holomeshTeamPresenceSessions.id });

  return NextResponse.json({
    success: true,
    closed: updated.length,
    agentId,
    teamId,
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
