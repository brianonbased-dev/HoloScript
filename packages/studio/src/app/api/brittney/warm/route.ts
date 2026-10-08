export const runtime = 'nodejs';

/**
 * POST /api/brittney/warm — wake Brittney before the first chat message.
 *
 * Records demand with the orchestrator (one `/serve/resolve`, no chat, no credits) so the
 * serving autoscaler rents her box while the person is still looking around. Signed-in
 * only: proxy.ts keeps this path on the session floor (api-public-paths carves it out of
 * `/api/brittney/**`), and the route checks the session again. One call per user per two
 * minutes reaches the orchestrator; the rest get 429 with Retry-After.
 *
 * Answers { status: 'warm' | 'waking' | 'not_fleet' | 'unreachable', etaSeconds }.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { wakeBrittneyFor } from '@/lib/brittney/wake';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const outcome = await wakeBrittneyFor(userId);
  if (!outcome.ok) {
    return NextResponse.json(
      { status: 'rate_limited', retryAfterSeconds: outcome.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(outcome.retryAfterSeconds) } }
    );
  }
  return NextResponse.json({ status: outcome.status, etaSeconds: outcome.etaSeconds });
}
