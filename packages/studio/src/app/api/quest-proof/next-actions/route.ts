import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { holomeshUpstream } from '../_lib/holomeshUpstream';
import { buildProposedActions } from './nextActions';

export const runtime = 'nodejs';

/**
 * NextActions (Anticipatory Actions, D.066 — server half).
 *
 * Reads the deployed team board and returns the top proposed next actions the
 * Console renders as approve-on-tap chips, so the founder taps instead of types.
 * Server-side because the board read needs the orchestrator key. Founder-only
 * (GET and POST): requireFounder answers 401/403 before the key is read.
 */


export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const up = holomeshUpstream({ actions: [] });
  if (up instanceof NextResponse) return up;
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 4, 12);
  try {
    const res = await fetch(`${up.base}/api/holomesh/team/${up.teamId}/board?limit=200`, {
      headers: up.headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, actions: [], error: `board upstream ${res.status}` });
    }
    const body = await res.json().catch(() => null);
    const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
    // Only exact-four tasks become Joseph-decision chips. Routine, specialist,
    // platform-control, and prohibited routes were removed by the shared classifier.
    const boardHref = `/holomesh/team/${up.teamId}/board`;
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
 * POST — exact-four Joseph decision intent (N3 signed-write path).
 *
 * Studio never trusts a client-supplied route. The team API reclassifies the
 * server-side task title and admits only exact-four context. Other routes are
 * returned verbatim so the UI cannot turn them into generic Joseph approval.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const up = holomeshUpstream();
  if (up instanceof NextResponse) return up;
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
    const res = await fetch(`${up.base}/api/holomesh/team/${up.teamId}/founder-approval`, {
      method: 'POST',
      headers: up.headers,
      cache: 'no-store',
      body: JSON.stringify({ taskId, intent }),
    });
    const upstream = await res.json().catch(() => null);
    if (res.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error: upstream?.error ?? 'intent is not an exact-four Joseph decision',
          reason: upstream?.reason,
          authorityRoute: upstream?.authorityRoute,
          agentMayProceed: upstream?.agentMayProceed === true,
          requiresSpecialistReview: upstream?.requiresSpecialistReview === true,
          requiresPlatformControl: upstream?.requiresPlatformControl === true,
          prohibited: upstream?.prohibited === true,
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
