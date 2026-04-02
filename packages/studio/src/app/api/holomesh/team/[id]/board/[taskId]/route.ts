import { NextRequest } from 'next/server';
import { proxyHoloMesh } from '../../../../../../../lib/holomesh-proxy';
import { getDb } from '../../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../../db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;

  // Clone body so we can read it twice (once for DB, once for proxy)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

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
