/**
 * POST /api/absorb/projects/[id]/improve — Credit-gated daemon improvement.
 *
 * Deducts credits, then delegates to the internal /api/daemon/jobs endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getDb } from '@/db/client';
import { absorbProjects } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireCredits, isCreditError } from '@/lib/absorb/requireCredits';
import { deductCredits } from '@/lib/absorb/creditService';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const [project] = await db
    .select()
    .from(absorbProjects)
    .where(and(eq(absorbProjects.id, id), eq(absorbProjects.userId, auth.user.id)))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Parse profile and tier
  let body: { profile?: 'quick' | 'balanced' | 'deep'; tier?: 'low' | 'medium' | 'high' | 'ultra' } = {};
  try {
    body = await req.json();
  } catch {}

  const profile = body.profile ?? 'quick';
  const tier = body.tier ?? 'medium';
  const operationType = `daemon_${profile}` as const;

  // Check credits
  const gate = await requireCredits(auth.user.id, operationType);
  if (isCreditError(gate)) return gate;

  // Deduct credits
  const result = await deductCredits(auth.user.id, gate.costCents, `Improve (${profile}) — ${project.name}`, {
    projectId: id,
    operationType,
  });
  if (!result) {
    return NextResponse.json({ error: 'Credit deduction failed' }, { status: 500 });
  }

  // Update project status
  await db
    .update(absorbProjects)
    .set({
      status: 'improving',
      totalSpentCents: sql`${absorbProjects.totalSpentCents} + ${gate.costCents}`,
      totalOperations: sql`${absorbProjects.totalOperations} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(absorbProjects.id, id));

  // Delegate to internal daemon endpoint
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const jobRes = await fetch(`${origin}/api/holodaemon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        action: 'start',
        profile,
        tier,
        projectPath: project.localPath || project.sourceUrl || '',
      }),
    });

    const jobData = await jobRes.json().catch(() => ({}));

    if (!jobRes.ok) {
      // Restore status on failure
      await db
        .update(absorbProjects)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(absorbProjects.id, id));
    }

    return NextResponse.json({
      success: jobRes.ok,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      job: jobData,
    });
  } catch (err) {
    await db
      .update(absorbProjects)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(absorbProjects.id, id));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Improvement failed' },
      { status: 500 },
    );
  }
}
