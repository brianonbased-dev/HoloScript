import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { holomeshUpstream } from '../_lib/holomeshUpstream';

export const runtime = 'nodejs';


const ALLOWED_ACTIONS = new Set(['done']);
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Founder-only: requireFounder answers 401/403 before the team key is read. */
export async function POST(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const up = holomeshUpstream();
  if (up instanceof NextResponse) return up;
  let payload: { taskIds?: unknown; action?: unknown; summary?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON body required' }, { status: 400 });
  }
  const taskIds = Array.isArray(payload?.taskIds)
    ? (payload.taskIds as unknown[]).filter(
        (id): id is string => typeof id === 'string' && TASK_ID_RE.test(id)
      )
    : [];
  if (taskIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'taskIds array is required' }, { status: 400 });
  }
  const rawAction = typeof payload?.action === 'string' ? payload.action : 'done';
  if (!ALLOWED_ACTIONS.has(rawAction)) {
    return NextResponse.json(
      { ok: false, error: `action '${rawAction}' not allowed` },
      { status: 400 }
    );
  }
  const action = rawAction;
  const summary =
    typeof payload?.summary === 'string'
      ? payload.summary.slice(0, 500)
      : 'founder-console decide-all';
  const verificationEvidence = 'founder-console decide-all';


  const results = await Promise.all(
    taskIds.map(async (taskId) => {
      try {
        const res = await fetch(`${up.base}/api/holomesh/team/${up.teamId}/board/${taskId}`, {
          method: 'PATCH',
          headers: up.headers,
          cache: 'no-store',
          body: JSON.stringify({ action, summary, verification_evidence: verificationEvidence }),
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        return { taskId, ok: res.ok, status: res.status, body };
      } catch (err) {
        return {
          taskId,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : 'patch failed',
        };
      }
    })
  );

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
