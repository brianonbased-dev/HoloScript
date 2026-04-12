export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../db/client';
import { holomeshReferrals } from '../../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { rateLimit } from '../../../../lib/rate-limiter';

/**
 * GET /api/holomesh/referrals
 *
 * Returns referral commission records, optionally filtered by agent.
 *
 * Query params:
 *   referrerId?  string  — filter to a specific referrer agent
 *   buyerId?     string  — filter to a specific buyer agent
 *   entryId?     string  — filter to a specific knowledge entry
 *   status?      string  — 'pending' | 'paid' | 'failed'
 *   limit?       number  — max 200 (default 50)
 *   offset?      number  — pagination (default 0)
 *
 * Also computes aggregate stats:
 *   totalCommissionCents  — sum of commission for filtered referrer
 *   totalReferrals        — count of referral records
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { max: 60, label: 'referrals-get' }, 'referrals-get');
  if (!limited.ok) return limited.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const referrerId = searchParams.get('referrerId') ?? '';
  const buyerId = searchParams.get('buyerId') ?? '';
  const entryId = searchParams.get('entryId') ?? '';
  const status = searchParams.get('status') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  // Build where condition
  const conditions = [
    referrerId ? eq(holomeshReferrals.referrerAgentId, referrerId) : undefined,
    buyerId ? eq(holomeshReferrals.buyerAgentId, buyerId) : undefined,
    entryId ? eq(holomeshReferrals.entryId, entryId) : undefined,
    status ? eq(holomeshReferrals.status, status) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const where =
    conditions.length === 1
      ? conditions[0]
      : conditions.length > 1
        ? and(
            ...(conditions as [
              (typeof conditions)[0],
              (typeof conditions)[0],
              ...typeof conditions,
            ])
          )
        : undefined;

  try {
    const rows = await db
      .select()
      .from(holomeshReferrals)
      .where(where)
      .orderBy(desc(holomeshReferrals.createdAt))
      .limit(limit)
      .offset(offset);

    // Aggregate stats for referrer (if filtered)
    let stats: {
      totalCommissionCents: number;
      totalReferrals: number;
      paidReferrals: number;
    } | null = null;

    if (referrerId) {
      interface StatsRow extends Record<string, unknown> {
        total_commission: unknown;
        total_referrals: unknown;
        paid_referrals: unknown;
      }

      const statsResult = await db.execute<StatsRow>(
        sql`SELECT
          COALESCE(SUM(commission_cents), 0)::int AS total_commission,
          COUNT(*)::int AS total_referrals,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_referrals
        FROM holomesh_referrals
        WHERE referrer_agent_id = ${referrerId}`
      );
      const s = statsResult.rows[0];
      if (s) {
        stats = {
          totalCommissionCents: Number(s.total_commission),
          totalReferrals: Number(s.total_referrals),
          paidReferrals: Number(s.paid_referrals),
        };
      }
    }

    return NextResponse.json({
      success: true,
      referrals: rows,
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit,
      },
      stats,
      filters: { referrerId, buyerId, entryId, status },
    });
  } catch (err) {
    console.error('[referrals] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch referrals' }, { status: 500 });
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
