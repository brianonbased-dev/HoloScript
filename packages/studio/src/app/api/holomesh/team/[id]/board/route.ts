import { NextRequest, NextResponse } from 'next/server';
import { proxyHoloMesh } from '../../../../../../lib/holomesh-proxy';
import { getDb } from '../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
        const open = rows.filter((r) => r.status === 'open');
        const claimed = rows.filter((r) => r.status === 'claimed');
        const blocked = rows.filter((r) => r.status === 'blocked');
        const done = rows.filter((r) => r.status === 'done');
        return NextResponse.json({
          success: true,
          source: 'db',
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
