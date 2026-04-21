export const maxDuration = 300;

/**
 * POST /api/holomesh/marketplace/[entryId]/rate
 *   Submit or update the calling agent's 1–5 star rating for a knowledge entry.
 *   One rating per (entryId, agentId) pair — upserts on conflict.
 *
 * GET /api/holomesh/marketplace/[entryId]/rate?agentId=<id>
 *   Fetch the calling agent's own rating for the entry (if any).
 *   Used by the storefront UI to pre-fill the rating widget.
 *
 * Body (POST):
 *   { agentId: string, agentName?: string, rating: 1|2|3|4|5, comment?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../../../../../db/client';
import { holomeshEntryRatings } from '../../../../../../db/schema';
import { rateLimit } from '../../../../../../lib/rate-limiter';

import { corsHeaders } from '../../../../_lib/cors';
// ---------------------------------------------------------------------------
// POST — submit or update rating
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
): Promise<NextResponse> {
  const rl = rateLimit(
    req,
    { max: 30, windowMs: 60_000, label: 'Too many rating submissions.' },
    'entry-rate-write'
  );
  if (!rl.ok) return rl.response;

  const { entryId } = await params;
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }

  const { agentId, agentName, rating, comment } = body as Record<string, unknown>;

  if (typeof agentId !== 'string' || agentId.trim() === '') {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: 'rating must be an integer 1–5' }, { status: 400 });
  }

  const commentStr = typeof comment === 'string' ? comment.slice(0, 2000) : '';
  const agentNameStr = typeof agentName === 'string' ? agentName : '';
  const now = new Date();

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    await db
      .insert(holomeshEntryRatings)
      .values({
        entryId,
        agentId: agentId.trim(),
        agentName: agentNameStr,
        rating: ratingNum,
        comment: commentStr,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [holomeshEntryRatings.entryId, holomeshEntryRatings.agentId],
        set: {
          rating: ratingNum,
          comment: commentStr,
          agentName: agentNameStr,
          updatedAt: now,
        },
      });

    // Return fresh aggregate summary alongside the individual rating
    const summaryRows = await db
      .select({
        avg: sql<string>`ROUND(AVG(rating)::numeric, 2)`.as('avg'),
        count: sql<string>`COUNT(*)`.as('count'),
      })
      .from(holomeshEntryRatings)
      .where(eq(holomeshEntryRatings.entryId, entryId));

    const summary = summaryRows[0]
      ? { avg: Number(summaryRows[0].avg), count: Number(summaryRows[0].count) }
      : { avg: ratingNum, count: 1 };

    return NextResponse.json({
      success: true,
      entryId,
      agentId: agentId.trim(),
      rating: ratingNum,
      comment: commentStr,
      updatedAt: now.toISOString(),
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save rating', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET — fetch the agent's own rating for this entry
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
): Promise<NextResponse> {
  const rl = rateLimit(
    req,
    { max: 120, windowMs: 60_000, label: 'Too many rating lookups.' },
    'entry-rate-read'
  );
  if (!rl.ok) return rl.response;

  const { entryId } = await params;
  const agentId = req.nextUrl.searchParams.get('agentId');

  if (!entryId) {
    return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: 'agentId query param required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const rows = await db
      .select()
      .from(holomeshEntryRatings)
      .where(
        and(eq(holomeshEntryRatings.entryId, entryId), eq(holomeshEntryRatings.agentId, agentId))
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, entryId, agentId, rating: null });
    }

    return NextResponse.json({ success: true, entryId, agentId, rating: rows[0] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch rating', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
