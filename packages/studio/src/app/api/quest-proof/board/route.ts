import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID ?? '';

export async function GET(req: NextRequest) {
  if (!TEAM_ID) {
    return NextResponse.json(
      { ok: false, board: null, error: 'HOLOMESH_TEAM_ID not configured' },
      { status: 503 }
    );
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (KEY) {
      headers['Authorization'] = `Bearer ${KEY}`;
      headers['x-mcp-api-key'] = KEY;
    }
    const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/board`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, board: null, error: `board upstream ${res.status}` },
        { status: 502 }
      );
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return NextResponse.json({ ok: true, board: body });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        board: null,
        error: err instanceof Error ? err.message : 'board fetch failed',
      },
      { status: 502 }
    );
  }
}
