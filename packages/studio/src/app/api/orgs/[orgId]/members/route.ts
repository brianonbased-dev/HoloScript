import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/api-auth';
import { getDb } from '../../../../../db/client';
import { orgMembers, _organizations, users } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * /api/orgs/[orgId]/members — Team member management.
 *
 * GET    /api/orgs/[orgId]/members           → List members
 * POST   /api/orgs/[orgId]/members           → Invite/add a member { email, role }
 * DELETE /api/orgs/[orgId]/members?userId=x   → Remove a member (owner only)
 */

async function requireOrgAccess(userId: string, orgId: string, requiredRole?: string) {
  const db = getDb();
  if (!db) return { error: 'Database not configured', status: 503 };

  const [membership] = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);

  if (!membership) return { error: 'Not a member of this organization', status: 403 };

  if (requiredRole === 'owner' && membership.role !== 'owner') {
    return { error: 'Owner access required', status: 403 };
  }

  if (requiredRole === 'admin' && !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Admin access required', status: 403 };
  }

  return { membership };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const access = await requireOrgAccess(auth.user.id, orgId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const db = getDb()!;
  const members = await db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      joinedAt: orgMembers.joinedAt,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId));

  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      image: m.image,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Only admins/owners can add members
  const access = await requireOrgAccess(auth.user.id, orgId, 'admin');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, role = 'member' } = body;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  if (!['member', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'role must be "member" or "admin"' }, { status: 400 });
  }

  const db = getDb()!;

  // Find user by email
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    return NextResponse.json(
      { error: 'User not found. They must sign up first.' },
      { status: 404 }
    );
  }

  // Check if already a member
  const [existing] = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'User is already a member' }, { status: 409 });
  }

  const [member] = await db.insert(orgMembers).values({ orgId, userId: user.id, role }).returning();

  return NextResponse.json(
    {
      member: {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Only owners can remove members
  const access = await requireOrgAccess(auth.user.id, orgId, 'owner');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const targetUserId = req.nextUrl.searchParams.get('userId');
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId query parameter required' }, { status: 400 });
  }

  // Can't remove yourself as owner
  if (targetUserId === auth.user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself as owner' }, { status: 400 });
  }

  const db = getDb()!;
  const deleted = await db
    .delete(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
