export const maxDuration = 300;

/**
 * GET /api/holomesh/marketplace/[entryId]/ratings
 *
 * Returns the rating summary and paginated review list for a knowledge
 * marketplace entry. Shown on the storefront entry card and detail view.
 *
 * Query params:
 *   limit   – reviews per page (default 20, max 100)
 *   offset  – pagination offset (default 0)
 *
 * Response:
 *   {
 *     success: true,
 *     entryId: string,
 *     summary: { avg: number, count: number, distribution: { 1:n, 2:n, 3:n, 4:n, 5:n } },
 *     ratings: Array<{ agentId, agentName, rating, comment, updatedAt }>,
 *     total: number,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from '../../../../../../db/client';
import { holomeshEntryRatings } from '../../../../../../db/schema';
import { rateLimit } from '../../../../../../lib/rate-limiter';

import { corsHeaders } from '../../../../_lib/cors';
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
): Promise<NextResponse> {
  const rl = rateLimit(
    req,
    { max: 120, windowMs: 60_000, label: 'Too many ratings requests.' },
    'entry-ratings-read'
  );
  if (!rl.ok) return rl.response;

  const { entryId } = await params;
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    // Run summary and paginated list in parallel
    const [summaryResult, listResult, countResult] = await Promise.all([
      // Aggregate: avg + distribution
      db.execute<Record<string, unknown>>(sql`
        SELECT
          ROUND(AVG(rating)::numeric, 2)                           AS avg,
          COUNT(*)::int                                            AS total,
          COUNT(*) FILTER (WHERE rating = 1)::int                  AS r1,
          COUNT(*) FILTER (WHERE rating = 2)::int                  AS r2,
          COUNT(*) FILTER (WHERE rating = 3)::int                  AS r3,
          COUNT(*) FILTER (WHERE rating = 4)::int                  AS r4,
          COUNT(*) FILTER (WHERE rating = 5)::int                  AS r5
        FROM ${holomeshEntryRatings}
        WHERE entry_id = ${entryId}
      `),
      // Paginated reviews, most-recent first
      db
        .select({
          agentId: holomeshEntryRatings.agentId,
          agentName: holomeshEntryRatings.agentName,
          rating: holomeshEntryRatings.rating,
          comment: holomeshEntryRatings.comment,
          updatedAt: holomeshEntryRatings.updatedAt,
        })
        .from(holomeshEntryRatings)
        .where(eq(holomeshEntryRatings.entryId, entryId))
        .orderBy(desc(holomeshEntryRatings.updatedAt))
        .limit(limit)
        .offset(offset),
      // Total count for pagination
      db
        .select({ count: sql<number>`count(*)`.as('count') })
        .from(holomeshEntryRatings)
        .where(eq(holomeshEntryRatings.entryId, entryId)),
    ]);

    const agg = summaryResult.rows[0];
    const summary = agg
      ? {
          avg: Number(agg.avg) || 0,
          count: Number(agg.total) || 0,
          distribution: {
            1: Number(agg.r1) || 0,
            2: Number(agg.r2) || 0,
            3: Number(agg.r3) || 0,
            4: Number(agg.r4) || 0,
            5: Number(agg.r5) || 0,
          },
        }
      : { avg: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

    const total = Number(countResult[0]?.count) || 0;

    return NextResponse.json({
      success: true,
      entryId,
      summary,
      ratings: listResult,
      total,
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to fetch ratings',
        detail: err instanceof Error ? err.message : String(err),
      },
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
