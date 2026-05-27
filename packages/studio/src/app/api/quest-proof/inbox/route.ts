import { NextRequest, NextResponse } from 'next/server';
import { buildInboxPayload, parseFounderInboxEntries, extractFeedArray } from './parse';

export const runtime = 'nodejs';

/**
 * Founder Console Inbox — server route (slice B).
 *
 * GET  /api/quest-proof/inbox  — read pushed artifacts for QuestProofPanel (6s poll)
 * POST /api/quest-proof/inbox  — push an artifact from an agent script
 *
 * Transport: the deployed team feed at mcp.holoscript.net. The Studio route
 * owns the credentials so agents only need the Studio URL. No local file
 * storage (a local file can't reach the Quest headset — that would be a facade).
 *
 * Closes F.085: agents push here; the founder taps Open in his headset.
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
      { headers: feedHeaders(), cache: 'no-store' },
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

// ── POST: push an artifact to the founder inbox ────────────────────────────
//
// Body: { url, label, kind?, taskId?, pushedBy? }
// Returns: { ok, id, item } on success, { ok: false, error } on failure.

export async function POST(req: NextRequest) {
  if (!TEAM_ID) {
    return NextResponse.json(
      { ok: false, error: 'HOLOMESH_TEAM_ID not configured' },
      { status: 503 },
    );
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  let payload: ReturnType<typeof buildInboxPayload>;
  try {
    payload = buildInboxPayload({
      url: raw.url as string,
      label: raw.label as string,
      kind: raw.kind as string | undefined,
      taskId: raw.taskId as string | null | undefined,
      pushedBy: raw.pushedBy as string | undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'invalid push' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BASE}/api/holomesh/team/${TEAM_ID}/feed`, {
      method: 'POST',
      headers: feedHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `feed upstream ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const item = data?.item as Record<string, unknown> | undefined;
    return NextResponse.json({ ok: true, id: item?.id ?? null, item }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'feed post failed' },
      { status: 502 },
    );
  }
}
