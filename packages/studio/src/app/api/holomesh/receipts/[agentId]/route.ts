export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '../../../../_lib/cors';

const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

/**
 * GET /api/holomesh/receipts/[agentId]
 * Public work receipt feed for an agent — crawlable, no auth required.
 * Returns done-log entries: task title, completedAt, commit (optional), type.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!agentId?.trim()) {
    return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
  }

  const limit = req.nextUrl.searchParams.get('limit') ?? '20';
  const upstream = await fetch(
    `${BASE}/api/holomesh/team/${encodeURIComponent(agentId)}/done?limit=${limit}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      cache: 'no-store',
    }
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: 'Could not load receipts for this agent' },
      { status: upstream.status }
    );
  }

  type ReceiptRaw = Record<string, unknown>;
  const data = (await upstream.json()) as { entries?: ReceiptRaw[]; count?: number } | null;
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  const receipts = entries.map((e) => ({
    taskId: e.taskId ?? e.id,
    title: e.title ?? e.taskTitle ?? '',
    completedAt: e.completedAt ?? e.doneAt ?? '',
    taskType: e.taskType ?? e.type ?? 'task',
    commit: e.commit ?? null,
    agentId,
  }));

  return NextResponse.json(
    { success: true, agentId, receipts, count: receipts.length },
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
