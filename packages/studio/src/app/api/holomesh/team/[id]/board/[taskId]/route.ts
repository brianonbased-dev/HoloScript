import { NextRequest, NextResponse } from 'next/server';
import { proxyHoloMesh } from '../../../../../../../lib/holomesh-proxy';
import { boardWriteLimit } from '../../../../../../../lib/rate-limiter';
import { getDb } from '../../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../../db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;

  // Rate-limit: 20 writes per minute per IP+key
  const limit = boardWriteLimit(req, id);
  if (!limit.ok) return limit.response;

  // Clone body so we can read it twice (once for DB, once for proxy)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Heartbeat: update syncedAt to reset the 30-min stale-expiry clock.
  // Handled locally — not forwarded to MCP.
  if (body.action === 'heartbeat') {
    try {
      const db = getDb();
      if (db) {
        const [task] = await db
          .select({ id: holomeshBoardTasks.id, status: holomeshBoardTasks.status, claimedBy: holomeshBoardTasks.claimedBy })
          .from(holomeshBoardTasks)
          .where(eq(holomeshBoardTasks.id, taskId))
          .limit(1);
        if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
        if (task.status !== 'claimed' || task.claimedBy !== (body.agentId as string)) {
          return NextResponse.json({ success: false, error: 'Task not claimed by this agent' }, { status: 403 });
        }
        await db
          .update(holomeshBoardTasks)
          .set({ syncedAt: new Date() })
          .where(eq(holomeshBoardTasks.id, taskId));
        return NextResponse.json({ success: true, heartbeat: new Date().toISOString() });
      }
    } catch {
      return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 });
  }

  // Proxy first — MCP is source of truth
  const proxyReq = new Request(req.url, {
    method: 'PATCH',
    headers: req.headers,
    body: JSON.stringify(body),
  });
  const mcpRes = await proxyHoloMesh(`/api/holomesh/team/${id}/board/${taskId}`, proxyReq as NextRequest);

  // Mirror status to DB (non-fatal)
  try {
    const db = getDb();
    if (db) {
      const action = body.action as string | undefined;
      if (action === 'claim') {
        await db
          .update(holomeshBoardTasks)
          .set({
            status: 'claimed',
            claimedBy: body.agentId as string || null,
            claimedByName: body.agentName as string || null,
            syncedAt: new Date(),
          })
          .where(eq(holomeshBoardTasks.id, taskId));
      } else if (action === 'done') {
        await db
          .update(holomeshBoardTasks)
          .set({
            status: 'done',
            completedBy: body.agentName as string || null,
            commitHash: body.commit as string || null,
            completedAt: new Date(),
            syncedAt: new Date(),
          })
          .where(eq(holomeshBoardTasks.id, taskId));
      } else if (action === 'open' || action === 'reopen') {
        await db
          .update(holomeshBoardTasks)
          .set({ status: 'open', claimedBy: null, claimedByName: null, syncedAt: new Date() })
          .where(eq(holomeshBoardTasks.id, taskId));
      }
    }
  } catch {
    // Non-fatal — DB mirror failure does not fail the request
  }

  return mcpRes;
}
