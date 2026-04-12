export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../../../db/client';
import { holomeshBoardTasks } from '../../../../../../../db/schema';

const HOLOMESH_API_URL =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const HOLOMESH_API_KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

interface RemoteTask {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  role?: string;
  source?: string;
  claimedBy?: string;
  claimedByName?: string;
  completedBy?: string;
  commitHash?: string;
  createdAt?: string;
  completedAt?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (HOLOMESH_API_KEY) headers['Authorization'] = `Bearer ${HOLOMESH_API_KEY}`;

  // Fetch current board from MCP
  const boardRes = await fetch(`${HOLOMESH_API_URL}/api/holomesh/team/${id}/board`, { headers });
  if (!boardRes.ok) {
    return NextResponse.json(
      { success: false, error: `MCP board fetch failed: ${boardRes.status}` },
      { status: 502 }
    );
  }

  const data = (await boardRes.json()) as {
    board?: { open?: RemoteTask[]; claimed?: RemoteTask[]; blocked?: RemoteTask[] };
    done?: { recent?: RemoteTask[] };
  };

  const board = data.board ?? {};
  const allTasks: RemoteTask[] = [
    ...(board.open ?? []),
    ...(board.claimed ?? []),
    ...(board.blocked ?? []),
    ...(data.done?.recent ?? []),
  ];

  if (allTasks.length === 0) {
    return NextResponse.json({ success: true, synced: 0 });
  }

  // Upsert each task individually for accurate status mirroring
  let synced = 0;
  for (const t of allTasks) {
    const row = {
      id: t.id,
      teamId: id,
      title: t.title ?? '(untitled)',
      description: t.description ?? '',
      status: (t.status ?? 'open') as 'open' | 'claimed' | 'done' | 'blocked',
      priority: t.priority ?? 2,
      role: t.role ?? 'coder',
      source: t.source ?? 'manual',
      claimedBy: t.claimedBy ?? null,
      claimedByName: t.claimedByName ?? null,
      completedBy: t.completedBy ?? null,
      commitHash: t.commitHash ?? null,
      metadata: {} as Record<string, unknown>,
      mcpCreatedAt: t.createdAt ? new Date(t.createdAt) : null,
      completedAt: t.completedAt ? new Date(t.completedAt) : null,
      syncedAt: new Date(),
    };
    await db
      .insert(holomeshBoardTasks)
      .values(row)
      .onConflictDoUpdate({
        target: holomeshBoardTasks.id,
        set: {
          title: row.title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          claimedBy: row.claimedBy,
          claimedByName: row.claimedByName,
          completedBy: row.completedBy,
          commitHash: row.commitHash,
          completedAt: row.completedAt,
          syncedAt: row.syncedAt,
        },
      });
    synced++;
  }

  return NextResponse.json({ success: true, synced });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
