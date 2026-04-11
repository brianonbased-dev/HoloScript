import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../db/client';
import { holomeshTeamPresenceSessions } from '../../../../../../db/schema';
import { eq, and, isNull, _isNotNull, sql } from 'drizzle-orm';
import { rateLimit } from '../../../../../../lib/rate-limiter';

/**
 * GET /api/holomesh/team/[id]/presence
 *
 * Returns presence history and analytics for a team.
 *
 * Query params:
 *   agentId?  string  — filter to a specific agent
 *   active?   boolean — if 'true', return only currently active sessions
 *   limit?    number  — max sessions to return (default 100, max 500)
 *   offset?   number  — pagination offset
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, { max: 120, label: 'team-presence' }, 'team-presence');
  if (!limited.ok) return limited.response;

  const { id: teamId } = await params;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const agentIdFilter = sp.get('agentId') ?? '';
  const activeOnly = sp.get('active') === 'true';
  const limit = Math.min(parseInt(sp.get('limit') ?? '100', 10) || 100, 500);
  const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);

  // Conditions for sessions query
  const baseCond = eq(holomeshTeamPresenceSessions.teamId, teamId);

  const sessionsCond = agentIdFilter
    ? and(baseCond, eq(holomeshTeamPresenceSessions.agentId, agentIdFilter))
    : baseCond;

  const finalCond = activeOnly
    ? and(sessionsCond, isNull(holomeshTeamPresenceSessions.sessionEnd))
    : sessionsCond;

  // Stats per agent (totalUptime, sessionCount, replacementCount)
  interface AgentStatsRow extends Record<string, unknown> {
    agentId: string;
    agentName: string;
    totalUptime: string | null;
    sessionCount: string;
    replacementCount: string;
    lastSeen: Date | null;
    lastStart: Date | null;
  }

  const [sessions, statsResult] = await Promise.all([
    finalCond
      ? db
          .select()
          .from(holomeshTeamPresenceSessions)
          .where(finalCond)
          .orderBy(sql`session_start DESC`)
          .limit(limit)
          .offset(offset)
      : db
          .select()
          .from(holomeshTeamPresenceSessions)
          .orderBy(sql`session_start DESC`)
          .limit(limit)
          .offset(offset),

    db.execute<AgentStatsRow>(sql`
      SELECT
        agent_id        AS "agentId",
        MAX(agent_name) AS "agentName",
        SUM(duration_seconds)::int AS "totalUptime",
        COUNT(*)::int              AS "sessionCount",
        COUNT(replaced_by_agent_id)::int AS "replacementCount",
        MAX(COALESCE(session_end, NOW())) AS "lastSeen",
        MAX(session_start) AS "lastStart"
      FROM holomesh_team_presence_sessions
      WHERE team_id = ${teamId}
        ${agentIdFilter ? sql`AND agent_id = ${agentIdFilter}` : sql``}
      GROUP BY agent_id
      ORDER BY MAX(session_start) DESC
    `),
  ]);

  const agentStats = statsResult.rows.map((r) => ({
    agentId: r.agentId,
    agentName: r.agentName,
    totalUptimeSeconds: Number(r.totalUptime ?? 0),
    sessionCount: Number(r.sessionCount),
    replacementCount: Number(r.replacementCount),
    lastSeen: r.lastSeen,
    lastStart: r.lastStart,
    currentlyActive: sessions.some((s) => s.agentId === r.agentId && s.sessionEnd === null),
  }));

  return NextResponse.json({
    success: true,
    teamId,
    stats: agentStats,
    sessions: sessions.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      agentName: s.agentName,
      role: s.role,
      sessionStart: s.sessionStart,
      sessionEnd: s.sessionEnd,
      durationSeconds: s.durationSeconds,
      endReason: s.endReason,
      replacedByAgentId: s.replacedByAgentId,
    })),
    pagination: {
      limit,
      offset,
      returned: sessions.length,
    },
  });
}
