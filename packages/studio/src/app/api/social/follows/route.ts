export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { follows, users, activityFeed } from '../../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * /api/social/follows — Follow/unfollow users.
 *
 * GET    /api/social/follows?userId=x        → Get follower/following counts
 * POST   /api/social/follows                 → Follow a user { targetUserId }
 * DELETE /api/social/follows?targetUserId=x  → Unfollow a user
 */

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ followers: 0, following: 0, isFollowing: false });
  }

  const [followerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followingId, userId));

  const [followingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followerId, userId));

  // Check if current user follows this user
  let isFollowing = false;
  const { requireAuth: _ } = await import('../../../../lib/api-auth');
  const { getSession } = await import('../../../../lib/api-auth');
  const session = await getSession();
  if (session?.user?.id && session.user.id !== userId) {
    const [existing] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, session.user.id), eq(follows.followingId, userId)))
      .limit(1);
    isFollowing = !!existing;
  }

  return NextResponse.json({
    followers: followerCount.count,
    following: followingCount.count,
    isFollowing,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { targetUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { targetUserId } = body;
  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
  }

  if (targetUserId === userId) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Check target exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Upsert follow (ignore conflict)
  try {
    await db.insert(follows).values({ followerId: userId, followingId: targetUserId });
  } catch (err: unknown) {
    if ((err as Record<string, unknown>)?.code === '23505') {
      // Already following — not an error
      return NextResponse.json({ ok: true, alreadyFollowing: true });
    }
    throw err;
  }

  // Record activity
  await db.insert(activityFeed).values({
    actorId: userId,
    action: 'followed',
    targetType: 'user',
    targetId: targetUserId,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const targetUserId = req.nextUrl.searchParams.get('targetUserId');
  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  await db
    .delete(follows)
    .where(and(eq(follows.followerId, userId), eq(follows.followingId, targetUserId)));

  return NextResponse.json({ ok: true });
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
