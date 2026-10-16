import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { holomeshUpstream } from '../_lib/holomeshUpstream';

export const runtime = 'nodejs';


/** Founder-only: requireFounder answers 401/403 before the team key is read. */
export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const up = holomeshUpstream({ board: null });
  if (up instanceof NextResponse) return up;
  try {
    const res = await fetch(`${up.base}/api/holomesh/team/${up.teamId}/board`, {
      headers: up.headers,
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
