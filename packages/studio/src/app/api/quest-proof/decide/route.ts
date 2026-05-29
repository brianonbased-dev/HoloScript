import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID ?? '';

const ALLOWED_ACTIONS = new Set(['done']);
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!TEAM_ID) {
    return NextResponse.json(
      { ok: false, error: 'HOLOMESH_TEAM_ID not configured' },
      { status: 503 }
    );
  }
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
  const summary = typeof payload?.summary === 'string' ? payload.summary.slice(0, 500) : 'founder-console decide-all';
  const verificationEvidence = 'founder-console decide-all';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) {
    headers['Authorization'] = `Bearer ${KEY}`;
    headers['x-mcp-api-key'] = KEY;
  }

  const results = await Promise.all(
    taskIds.map(async (taskId) => {
      try {
        const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/board/${taskId}`, {
          method: 'PATCH',
          headers,
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
