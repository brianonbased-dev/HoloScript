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
    // Tapping a REVERSIBLE chip records a founder-approval via POST below (the
    // one-tap signed-write path, N3). Irreversible chips carry an href so the
    // panel routes them to explicit review instead (D.044).
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

/**
 * POST — one-tap founder approval (N3 signed-write path).
 *
 * The panel calls this when a founder taps a REVERSIBLE chip. It proxies the
 * tap (server-side Bearer key) to the team-API `founder-approval` route, which
 * records low-stakes intent a signing agent later executes. No signing key ever
 * reaches the browser (F.002 custody). The team-API re-derives reversibility
 * server-side and 403s irreversible/spend/custody intents (D.044) — Studio does
 * NOT pre-trust the client; it forwards taskId and lets the authority decide.
 */
export async function POST(req: NextRequest) {
  if (!TEAM_ID) {
    return NextResponse.json(
      { ok: false, error: 'HOLOMESH_TEAM_ID not configured' },
      { status: 503 }
    );
  }
  let payload: { taskId?: unknown; intent?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON body required' }, { status: 400 });
  }
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
  if (!taskId) {
    return NextResponse.json({ ok: false, error: 'taskId is required' }, { status: 400 });
  }
  const intent = typeof payload?.intent === 'string' ? payload.intent.slice(0, 400) : undefined;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (KEY) {
      headers['Authorization'] = `Bearer ${KEY}`;
      headers['x-mcp-api-key'] = KEY;
    }
    const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/founder-approval`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({ taskId, intent }),
    });
    const upstream = await res.json().catch(() => null);
    if (res.status === 403) {
      // Irreversible intent — surface the review requirement so the panel keeps
      // it on the explicit navigate-to-review path instead of optimistically
      // removing the chip.
      return NextResponse.json(
        {
          ok: false,
          requiresExplicitReview: true,
          reason: upstream?.reason ?? 'intent is not one-tap eligible',
        },
        { status: 403 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: upstream?.error ?? `approval upstream ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, approval: upstream?.approval ?? null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'approval failed' },
      { status: 502 }
    );
  }
}
