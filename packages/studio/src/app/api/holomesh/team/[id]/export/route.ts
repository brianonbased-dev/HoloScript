export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { boardReadLimit } from '../../../../../../lib/rate-limiter';
import { getDb } from '../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { hidePremiumRowsDeep } from '../../../../../../lib/premium-view';
import { callerIsTeamMember, resolveHoloMeshCaller } from '../../../../../../lib/holomesh-proxy';

import { corsHeaders } from '../../../../_lib/cors';
const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

/**
 * GET /api/holomesh/team/[id]/export — a team's whole board, for its own members.
 *
 * Doors audit 2026-09-16. Until this change the route had no caller check of any
 * kind: naming any team id returned that team's team record, its open, claimed
 * and blocked columns and its done list, all fetched under our HOLOMESH_API_KEY.
 * The allowlist entry excused it as "teasers only (premium-exits suite)", but
 * the premium cut only rewrites rows carrying knowledge TEXT and a board task
 * carries `title` and `description` on a row with no price — so the task text,
 * which is the whole point of a board, was never cut by anything and the suite
 * never asserted it was.
 *
 * Now the caller must prove they are on the team, under their own credential.
 * Both checks run BEFORE any upstream call, so a caller we have not identified
 * never causes our key to be spent on their behalf.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const caller = await resolveHoloMeshCaller(req);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  const membership = await callerIsTeamMember(req, id, caller.agentId);
  if (!membership.ok) {
    return NextResponse.json({ error: membership.error }, { status: membership.status });
  }

  // Reuse the read rate limit (same load profile as board GET)
  const limit = boardReadLimit(req, id);
  if (!limit.ok) return limit.response;

  const mcpHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HOLOMESH_API_KEY) mcpHeaders['Authorization'] = `Bearer ${HOLOMESH_API_KEY}`;

  // Run all remote fetches in parallel
  const [teamRes, knowledgeRes] = await Promise.allSettled([
    fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}`, { headers: mcpHeaders }),
    fetch(`${HOLOMESH_API_URL}/api/holomesh/marketplace?teamId=${id}&limit=500`, {
      headers: mcpHeaders,
    }),
  ]);

  const team =
    teamRes.status === 'fulfilled' && teamRes.value.ok ? await teamRes.value.json() : null;
  // Doors audit 2026-09-15: fetched under Studio's server key and served to
  // anyone who names the team, so premium entries leave as teasers only.
  const knowledge =
    knowledgeRes.status === 'fulfilled' && knowledgeRes.value.ok
      ? hidePremiumRowsDeep(await knowledgeRes.value.json())
      : null;

  // Pull full board (all statuses) from DB where available
  let allTasks: unknown[] = [];
  let source = 'mcp';
  try {
    const db = getDb();
    if (db) {
      allTasks = await db
        .select()
        .from(holomeshBoardTasks)
        .where(eq(holomeshBoardTasks.teamId, id))
        .orderBy(desc(holomeshBoardTasks.priority));
      source = 'db';
    }
  } catch {
    // Fall through — allTasks stays empty, we'll fetch from MCP below
  }

  // If DB had no data, fall back to MCP board
  if (allTasks.length === 0) {
    try {
      const boardRes = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}/board`, {
        headers: mcpHeaders,
      });
      if (boardRes.ok) {
        const boardJson = (await boardRes.json()) as {
          board?: { open?: unknown[]; claimed?: unknown[]; blocked?: unknown[] };
          done?: { recent?: unknown[] };
        };
        const b = boardJson.board ?? {};
        allTasks = [
          ...(b.open ?? []),
          ...(b.claimed ?? []),
          ...(b.blocked ?? []),
          ...(boardJson.done?.recent ?? []),
        ];
        source = 'mcp';
      }
    } catch {
      // best-effort
    }
  }

  const open = (allTasks as Array<{ status: string }>).filter((t) => t.status === 'open');
  const claimed = (allTasks as Array<{ status: string }>).filter((t) => t.status === 'claimed');
  const blocked = (allTasks as Array<{ status: string }>).filter((t) => t.status === 'blocked');
  const done = (allTasks as Array<{ status: string }>).filter((t) => t.status === 'done');

  // The team payload came up under the server key too: the whole export is
  // cut, not just the knowledge list.
  return NextResponse.json(
    hidePremiumRowsDeep({
      exportedAt: new Date().toISOString(),
      teamId: id,
      source,
      team: team ?? { id },
      board: { open, claimed, blocked },
      done,
      knowledge: knowledge ?? [],
    })
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
