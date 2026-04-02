import { NextRequest, NextResponse } from 'next/server';
import { boardReadLimit } from '../../../../../../lib/rate-limiter';
import { getDb } from '../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
  const knowledge =
    knowledgeRes.status === 'fulfilled' && knowledgeRes.value.ok
      ? await knowledgeRes.value.json()
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

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    teamId: id,
    source,
    team: team ?? { id },
    board: { open, claimed, blocked },
    done,
    knowledge: knowledge ?? [],
  });
}
