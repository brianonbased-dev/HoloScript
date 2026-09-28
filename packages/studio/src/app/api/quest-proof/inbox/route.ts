import { NextRequest, NextResponse } from 'next/server';
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
 * Closes F.085: agents push to the feed; the founder taps Open in his headset.
 */

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID ?? '';

function feedHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) {
    h['Authorization'] = `Bearer ${KEY}`;
    h['x-mcp-api-key'] = KEY;
  }
  return h;
}

// ── GET: read the inbox (read feed, filter founderInbox entries) ────────────

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
  if (!TEAM_ID) {
    return NextResponse.json({ ok: false, items: [], error: 'HOLOMESH_TEAM_ID not configured' });
  }
  try {
    const res = await fetch(
      `${BASE}/api/holomesh/team/${TEAM_ID}/feed?limit=${Math.min(limit * 4, 200)}`,
      { headers: feedHeaders(), cache: 'no-store' }
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
