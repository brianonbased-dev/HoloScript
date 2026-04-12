export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { users, projects, marketplaceListings, creatorProfiles } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { getSession } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * /api/users/[id] — User profile API.
 *
 * GET  /api/users/[id]  → Public profile (name, avatar, public projects, listings)
 * PUT  /api/users/[id]  → Update own profile (auth required, can only update self)
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Fetch user
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch public projects
    const publicProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(eq(projects.ownerId, id), eq(projects.visibility, 'public')))
      .orderBy(desc(projects.createdAt))
      .limit(20);

    // Fetch published marketplace listings
    const listings = await db
      .select({
        id: marketplaceListings.id,
        title: marketplaceListings.title,
        description: marketplaceListings.description,
        priceCents: marketplaceListings.priceCents,
        currency: marketplaceListings.currency,
        createdAt: marketplaceListings.createdAt,
      })
      .from(marketplaceListings)
      .where(and(eq(marketplaceListings.sellerId, id), eq(marketplaceListings.status, 'published')))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(20);

    // Fetch creator profile (bio, display name)
    const [profile] = await db
      .select({
        displayName: creatorProfiles.displayName,
        bio: creatorProfiles.bio,
        website: creatorProfiles.website,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, id))
      .limit(1);

    return NextResponse.json({
      user: {
        id: user.id,
        name: profile?.displayName ?? user.name,
        avatar: user.image,
        bio: profile?.bio ?? null,
        website: profile?.website ?? null,
        joinedAt: user.createdAt.toISOString(),
      },
      projects: publicProjects.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      listings: listings.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('[Users API] Failed to load user profile:', error);
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Users can only update their own profile
    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: { displayName?: string; bio?: string; website?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Upsert creator profile
    const [existing] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, id))
      .limit(1);

    if (existing) {
      await db
        .update(creatorProfiles)
        .set({
          displayName: body.displayName ?? existing.displayName,
          bio: body.bio ?? existing.bio,
          website: body.website ?? existing.website,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.userId, id));
    } else {
      await db.insert(creatorProfiles).values({
        userId: id,
        displayName: body.displayName ?? null,
        bio: body.bio ?? null,
        website: body.website ?? null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[Users API] Failed to update user profile:', error);
    return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
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
