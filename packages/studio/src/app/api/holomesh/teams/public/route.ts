export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '../../../_lib/cors';

const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

/**
 * GET /api/holomesh/teams/public
 * Public (no auth required) team listing for the HoloMesh discover surface.
 * Returns name, taskCount, memberCount, knowledgeCount per team.
 * Sensitive fields (wallets, internal IDs) are stripped server-side.
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  // /guilds is the no-auth public directory; /teams requires auth and returns caller's teams only
  const upstream = await fetch(`${BASE}/api/holomesh/guilds${search}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: 'Could not load teams' },
      { status: upstream.status }
    );
  }

  type TeamRaw = Record<string, unknown>;
  const data = (await upstream.json()) as { teams?: TeamRaw[]; count?: number } | null;
  const teams = Array.isArray(data?.teams) ? data.teams : [];

  // Strip internal fields — public surface shows only display-safe data
  const publicTeams = teams.map((t) => ({
    teamId: t.teamId ?? t.id,
    teamName: t.teamName ?? t.name,
    memberCount: t.memberCount ?? 0,
    tasksCompleted: t.tasksCompleted ?? 0,
    knowledgeContributed: t.knowledgeContributed ?? 0,
    revenueEarnedCents: t.revenueEarnedCents ?? 0,
  }));

  return NextResponse.json(
    { success: true, teams: publicTeams, count: publicTeams.length },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        ...corsHeaders(req, { methods: 'GET, OPTIONS' }),
      },
    }
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
