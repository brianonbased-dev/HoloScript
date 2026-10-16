import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { holomeshUpstream } from '../_lib/holomeshUpstream';
import { parseFounderInboxEntries, extractFeedArray } from './parse';

export const runtime = 'nodejs';

/**
 * Founder Console Inbox — server route (slice B).
 *
 * GET  /api/quest-proof/inbox  — read pushed artifacts for the Founder Console (6s poll)
 *
 * Transport: the deployed team feed at mcp.holoscript.net. No local file storage
 * (a local file can't reach the Quest headset — that would be a facade).
 *
 * Studio takes no writes here. Agents push straight to the team feed, signed
 * with their own seat key (ai-ecosystem scripts/push-to-founder-console.mjs),
 * so the feed records who pushed. This route used to export a POST that pushed
 * any signed-in Studio user's url and label into the founder's inbox under
 * Studio's own key, with nobody recorded; nothing called it. It was removed
 * 2026-09-28 (task_1790602604837_whpw, item 10, after the stored-XSS fix #411).
 *
 * Founder-only (requireFounder, 401/403 before any upstream call). The only
 * caller is the same-origin Founder Console, which carries the founder session.
 *
 * Closes F.085: agents push to the feed; the founder taps Open in his headset.
 */


// ── GET: read the inbox (read feed, filter founderInbox entries) ────────────

export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const up = holomeshUpstream({ items: [] });
  if (up instanceof NextResponse) return up;
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
  try {
    const res = await fetch(
      `${up.base}/api/holomesh/team/${up.teamId}/feed?limit=${Math.min(limit * 4, 200)}`,
      { headers: up.headers, cache: 'no-store' }
    );
    if (!res.ok) {
      return NextResponse.json({ ok: false, items: [], error: `feed upstream ${res.status}` });
    }
    const body = await res.json().catch(() => null);
    const items = parseFounderInboxEntries(extractFeedArray(body), limit);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      items: [],
      error: err instanceof Error ? err.message : 'feed fetch failed',
    });
  }
}
