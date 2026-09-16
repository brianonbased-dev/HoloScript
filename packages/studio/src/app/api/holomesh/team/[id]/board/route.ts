export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import {
  callerIsTeamMember,
  proxyHoloMesh,
  resolveHoloMeshCaller,
} from '../../../../../../lib/holomesh-proxy';
import { boardReadLimit, boardWriteLimit } from '../../../../../../lib/rate-limiter';
import { getDb } from '../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

import { corsHeaders } from '../../../../_lib/cors';
const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const STALE_CLAIM_MS = 30 * 60 * 1000; // 30 minutes

async function fetchDoneCount(teamId: string): Promise<number | null> {
  try {
    const headers: Record<string, string> = {};
    if (HOLOMESH_API_KEY) headers.Authorization = `Bearer ${HOLOMESH_API_KEY}`;

    const res = await fetch(
      `${HOLOMESH_API_URL}/api/holomesh/team/${teamId}/board/done?limit=1&offset=0`,
      { headers }
    );
    if (!res.ok) return null;

    const json = (await res.json()) as { count?: unknown };
    const count = typeof json.count === 'number' ? json.count : Number(json.count);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

/**
 * Who may read or write a team's board.
 *
 * Doors audit 2026-09-16, second pass. The `/export` route beside this one was
 * closed to non-members; closing one of two doors into the same rows is what
 * made this one reachable-and-surprising. `/board` serves the SAME
 * holomeshBoardTasks rows `/export` returns (:46-50), and fell through to
 * proxyHoloMesh under our HOLOMESH_API_KEY (:107) for anyone who named a team
 * id — a lower bar than the door next to it, which is the shape nobody expects.
 *
 * Its shape differs from `/export` in the one way that decides the fix.
 * `/export` has no browser caller at all — it is an agent endpoint, so it can
 * simply demand a HoloMesh key. `/board` is the Studio team UI's own read:
 * app/teams/[id]/page.tsx:93 and :118, app/teams/[id]/board/page.tsx:90,
 * components/teams/BoardTab.tsx:109, components/ai/BrittneyChatPanel.tsx:704,
 * components/projects/ReposTab.tsx:729 and app/operations/page.tsx:576 all
 * fetch it from the browser carrying nothing but a session cookie. Demanding a
 * mesh key here would refuse every one of them — a legitimate caller silently
 * refused, which counts equally with a door left open.
 *
 * So the rule is: identify whoever CAN be identified, and never spend our key
 * for a caller we could not.
 *  - A caller presenting their OWN mesh credential is resolved upstream and
 *    must be a member of the team they named — the same two checks `/export`
 *    makes, under the caller's own key, both before any read.
 *  - A caller with no credential of their own must hold a Studio session.
 *  - Anyone else is refused before the DB is read or our key is spent.
 *
 * Residue, named rather than hidden: a signed-in Studio user can still name
 * another team's id. Studio accounts are not HoloMesh agents — no mapping from
 * a session to an agentId exists in this schema, and the knowledge/query route
 * says the same thing in its own header — so membership cannot be checked for a
 * browser caller until one exists. That is strictly narrower than what this
 * closes, and it is written down for the lead rather than left to be rediscovered.
 */
function hasOwnMeshCredential(req: NextRequest): boolean {
  const authorization = req.headers.get('authorization')?.trim();
  if (authorization && /^Bearer\s+\S+/i.test(authorization)) return true;
  return Boolean(req.headers.get('x-mcp-api-key')?.trim());
}

async function boardCallerRefusal(
  req: NextRequest,
  teamId: string
): Promise<NextResponse | null> {
  if (hasOwnMeshCredential(req)) {
    const caller = await resolveHoloMeshCaller(req);
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status });
    }
    const membership = await callerIsTeamMember(req, teamId, caller.agentId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: membership.status });
    }
    return null;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error:
          'This board needs a caller. Sign in to HoloScript Studio, or send your own HoloMesh key as "x-mcp-api-key: <your key>".',
      },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const refusal = await boardCallerRefusal(req, id);
  if (refusal) return refusal;

  // Rate-limit: 120 GETs per minute per IP+key
  const limit = boardReadLimit(req, id);
  if (!limit.ok) return limit.response;

  // DB-first: serve cached board when available
  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(holomeshBoardTasks)
        .where(eq(holomeshBoardTasks.teamId, id))
        .orderBy(desc(holomeshBoardTasks.priority));

      if (rows.length > 0) {
        // Auto-expire stale claimed tasks (> 30 min without heartbeat)
        const now = Date.now();
        const staleIds = rows
          .filter(
            (r) =>
              r.status === 'claimed' &&
              r.syncedAt != null &&
              now - r.syncedAt.getTime() > STALE_CLAIM_MS
          )
          .map((r) => r.id);

        if (staleIds.length > 0) {
          for (const taskId of staleIds) {
            await db
              .update(holomeshBoardTasks)
              .set({ status: 'open', claimedBy: null, claimedByName: null, syncedAt: new Date() })
              .where(eq(holomeshBoardTasks.id, taskId));
            // Notify MCP to reopen (fire-and-forget)
            const mcpHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (HOLOMESH_API_KEY) mcpHeaders['Authorization'] = `Bearer ${HOLOMESH_API_KEY}`;
            fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}/board/${taskId}`, {
              method: 'PATCH',
              headers: mcpHeaders,
              body: JSON.stringify({ action: 'reopen', reason: 'stale-claim' }),
            }).catch(() => {});
          }
          // Update rows in place to reflect expiry in this response
          for (const row of rows) {
            if (staleIds.includes(row.id)) {
              row.status = 'open';
              row.claimedBy = null;
              row.claimedByName = null;
            }
          }
        }

        const open = rows.filter((r) => r.status === 'open');
        const claimed = rows.filter((r) => r.status === 'claimed');
        const blocked = rows.filter((r) => r.status === 'blocked');
        const done = rows.filter((r) => r.status === 'done');
        const doneCount = await fetchDoneCount(id);
        return NextResponse.json({
          success: true,
          source: 'db',
          expired: staleIds.length > 0 ? staleIds : undefined,
          board: { open, claimed, blocked },
          done: { total: doneCount ?? done.length, recent: done.slice(0, 10) },
        });
      }
    }
  } catch {
    // Fall through to MCP proxy on any DB error
  }

  return proxyHoloMesh(`/api/holomesh/team/${id}/board`, req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A write to someone else's board is worse than a read of it, so the same
  // check runs first here. app/teams/[id]/page.tsx:118 posts a mode change from
  // the browser with only a session cookie, which is why this is not
  // mesh-key-only.
  const refusal = await boardCallerRefusal(req, id);
  if (refusal) return refusal;

  return proxyHoloMesh(`/api/holomesh/team/${id}/board`, req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
