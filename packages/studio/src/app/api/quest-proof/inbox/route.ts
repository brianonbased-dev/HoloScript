import { NextRequest, NextResponse } from 'next/server';
import { parseFounderInboxEntries, extractFeedArray } from './parse';

export const runtime = 'nodejs';

/**
 * Founder Console Inbox (slice B, UI half) — server route.
 *
 * Reads the deployed team feed and returns founder-push items (see parse.ts)
 * so the QuestProofPanel renders them with an Open button. Server-side because
 * the feed read needs the orchestrator key. Closes F.085: the founder never
 * types a URL into his Quest — agents push, this surfaces it.
 */

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const TEAM_ID = process.env.HOLOMESH_TEAM_ID ?? '';

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
  if (!TEAM_ID) {
    return NextResponse.json({ ok: false, items: [], error: 'HOLOMESH_TEAM_ID not configured' });
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (KEY) {
      headers['Authorization'] = `Bearer ${KEY}`;
      headers['x-mcp-api-key'] = KEY;
    }
    const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/feed?limit=${Math.min(limit * 4, 200)}`, {
      headers,
      cache: 'no-store',
    });
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
