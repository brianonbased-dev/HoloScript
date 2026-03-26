import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getSession } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { comments, users, activityFeed } from '../../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * /api/social/comments — Comments on projects, listings, and scenes.
 *
 * GET    /api/social/comments?targetType=project&targetId=x  → List comments
 * POST   /api/social/comments                                → Add comment
 * DELETE /api/social/comments?id=x                           → Delete own comment
 */

export async function GET(req: NextRequest) {
  const targetType = req.nextUrl.searchParams.get('targetType');
  const targetId = req.nextUrl.searchParams.get('targetId');

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'targetType and targetId are required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ comments: [] });
  }

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorId: comments.authorId,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: {
        id: r.authorId,
        name: r.authorName,
        image: r.authorImage,
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { targetType?: string; targetId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { targetType, targetId, text } = body;
  if (!targetType || !targetId || !text?.trim()) {
    return NextResponse.json(
      { error: 'targetType, targetId, and text are required' },
      { status: 400 }
    );
  }

  if (!['project', 'listing', 'scene'].includes(targetType)) {
    return NextResponse.json(
      { error: 'targetType must be project, listing, or scene' },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const [comment] = await db
    .insert(comments)
    .values({
      authorId: userId,
      targetType,
      targetId,
      body: text.trim(),
    })
    .returning();

  // Record activity
  await db.insert(activityFeed).values({
    actorId: userId,
    action: 'commented',
    targetType,
    targetId,
    metadata: { commentId: comment.id },
  });

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: userId,
          name: auth.user.name,
          image: auth.user.image,
        },
      },
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const commentId = req.nextUrl.searchParams.get('id');
  if (!commentId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Only delete own comments
  const deleted = await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorId, userId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Comment not found or not yours' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
