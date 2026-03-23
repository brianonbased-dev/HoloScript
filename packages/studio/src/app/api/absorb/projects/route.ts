/**
 * GET  /api/absorb/projects — List user's absorb projects.
 * POST /api/absorb/projects — Create a new project (from GitHub URL or workspace).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getDb } from '@/db/client';
import { absorbProjects } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getOrCreateAccount } from '@/lib/absorb/creditService';
import { TIER_LIMITS } from '@/lib/absorb/pricing';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  if (!db) return NextResponse.json({ projects: [] });

  const projects = await db
    .select()
    .from(absorbProjects)
    .where(eq(absorbProjects.userId, auth.user.id))
    .orderBy(desc(absorbProjects.createdAt));

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  let body: { name: string; sourceType: string; sourceUrl?: string; localPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.sourceType) {
    return NextResponse.json({ error: 'name and sourceType are required' }, { status: 400 });
  }

  // Check tier project limit
  const account = await getOrCreateAccount(auth.user.id);
  if (account) {
    const tierLimits = TIER_LIMITS[account.tier];
    const existing = await db
      .select()
      .from(absorbProjects)
      .where(eq(absorbProjects.userId, auth.user.id));

    if (existing.length >= tierLimits.maxProjectsActive) {
      return NextResponse.json(
        {
          error: `Project limit reached (${tierLimits.maxProjectsActive} for ${account.tier} tier)`,
          tier: account.tier,
          limit: tierLimits.maxProjectsActive,
          upgradeUrl: '/absorb?tab=pricing',
        },
        { status: 403 },
      );
    }
  }

  const [project] = await db
    .insert(absorbProjects)
    .values({
      userId: auth.user.id,
      name: body.name,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl ?? null,
      localPath: body.localPath ?? null,
      status: 'pending',
    })
    .returning();

  return NextResponse.json({ project }, { status: 201 });
}
