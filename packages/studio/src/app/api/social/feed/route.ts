export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { activityFeed, follows, users } from '../../../../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

import { corsHeaders } from '../../_lib/cors';
/**
 * GET /api/social/feed — Activity feed.
 *
 * Returns recent activity from users the current user follows,
 * plus their own activity. Sorted by newest first.
 *
 * Query params:
 *   - limit (default 50, max 100)
 *   - before (ISO timestamp for pagination)
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 100);

  const db = getDb();
  if (!db) {
    return NextResponse.json({ feed: [] });
  }

  // Get list of users we follow
  const followingRows = await db
    .select({ followingId: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, userId));

  const followedIds = followingRows.map((r) => r.followingId);
  const feedUserIds = [userId, ...followedIds];

  // Fetch activity from followed users + self
  const rows = await db
    .select({
      id: activityFeed.id,
      action: activityFeed.action,
      targetType: activityFeed.targetType,
      targetId: activityFeed.targetId,
      metadata: activityFeed.metadata,
      createdAt: activityFeed.createdAt,
      actorId: activityFeed.actorId,
      actorName: users.name,
      actorImage: users.image,
    })
    .from(activityFeed)
    .innerJoin(users, eq(activityFeed.actorId, users.id))
    .where(inArray(activityFeed.actorId, feedUserIds))
    .orderBy(desc(activityFeed.createdAt))
    .limit(limit);

  return NextResponse.json({
    feed: rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      actor: {
        id: r.actorId,
        name: r.actorName,
        image: r.actorImage,
      },
    })),
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
