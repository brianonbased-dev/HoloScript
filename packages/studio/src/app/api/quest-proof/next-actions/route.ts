import { NextRequest, NextResponse } from 'next/server';
import { buildProposedActions } from './nextActions';

export const runtime = 'nodejs';

/**
 * NextActions (Anticipatory Actions, D.066 — server half).
 *
 * Reads the deployed team board and returns the top proposed next actions the
 * Console renders as approve-on-tap chips, so the founder taps instead of types.
 * Server-side because the board read needs the orchestrator key.
 */

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID ?? '';

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 4, 12);
  if (!TEAM_ID) {
    return NextResponse.json({ ok: false, actions: [], error: 'HOLOMESH_TEAM_ID not configured' });
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (KEY) {
      headers['Authorization'] = `Bearer ${KEY}`;
      headers['x-mcp-api-key'] = KEY;
    }
    const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/board?limit=200`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, actions: [], error: `board upstream ${res.status}` });
    }
    const body = await res.json().catch(() => null);
    const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
    // Tapping a chip takes the founder to act on the task (the board). The
    // one-tap auto-execute loop is a follow-on (needs Studio's signed-write path).
    const boardHref = `/holomesh/team/${TEAM_ID}/board`;
    const actions = buildProposedActions(tasks, limit).map((a) => ({ ...a, href: boardHref }));
    return NextResponse.json({ ok: true, actions });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      actions: [],
      error: err instanceof Error ? err.message : 'board fetch failed',
    });
  }
}
