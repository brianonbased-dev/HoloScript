import { NextRequest, NextResponse } from 'next/server';
import { proxyHoloMesh } from '../../../../../../lib/holomesh-proxy';
import { boardReadLimit, boardWriteLimit } from '../../../../../../lib/rate-limiter';
import { getDb } from '../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

const HOLOMESH_API_URL = process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const STALE_CLAIM_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
              now - r.syncedAt.getTime() > STALE_CLAIM_MS,
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
        return NextResponse.json({
          success: true,
          source: 'db',
          expired: staleIds.length > 0 ? staleIds : undefined,
          board: { open, claimed, blocked },
          done: { total: done.length, recent: done.slice(0, 10) },
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
  return proxyHoloMesh(`/api/holomesh/team/${id}/board`, req);
}
