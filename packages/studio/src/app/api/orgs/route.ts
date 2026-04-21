export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/api-auth';
import { getDb } from '../../../db/client';
import { organizations, orgMembers } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';

import { corsHeaders } from '../_lib/cors';
/**
 * /api/orgs — Organization management.
 *
 * GET  /api/orgs          → List orgs the current user belongs to
 * POST /api/orgs          → Create a new organization
 */

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ orgs: [] });
  }

  // Find all orgs where user is a member
  const memberships = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgOwnerId: organizations.ownerId,
      createdAt: organizations.createdAt,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(desc(organizations.createdAt));

  return NextResponse.json({
    orgs: memberships.map((m) => ({
      id: m.orgId,
      name: m.orgName,
      slug: m.orgSlug,
      role: m.role,
      isOwner: m.orgOwnerId === userId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { name?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, slug } = body;
  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase alphanumeric with hyphens' },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Create org + add creator as owner member
  const [org] = await db.insert(organizations).values({ name, slug, ownerId: userId }).returning();

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId,
    role: 'owner',
  });

  return NextResponse.json(
    {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
