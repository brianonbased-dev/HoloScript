/**
 * POST /api/absorb/projects/[id]/pipeline — Credit-gated recursive pipeline.
 *
 * Deducts credits for the requested layer, then delegates to /api/pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getDb } from '@/db/client';
import { absorbProjects } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireCredits, isCreditError } from '@/lib/absorb/requireCredits';
import { deductCredits } from '@/lib/absorb/creditService';
import { TIER_LIMITS } from '@/lib/absorb/pricing';
import { getOrCreateAccount } from '@/lib/absorb/creditService';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  // Check tier allows pipeline
  const account = await getOrCreateAccount(auth.user.id);
  if (account && !TIER_LIMITS[account.tier].pipelineEnabled) {
    return NextResponse.json(
      { error: 'Pipeline requires Pro or Enterprise tier', upgradeUrl: '/absorb?tab=pricing' },
      { status: 403 },
    );
  }

  const [project] = await db
    .select()
    .from(absorbProjects)
    .where(and(eq(absorbProjects.id, id), eq(absorbProjects.userId, auth.user.id)))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Parse mode
  let body: { mode?: 'single' | 'continuous'; layer?: 'l0' | 'l1' | 'l2' } = {};
  try {
    body = await req.json();
  } catch {}

  const layer = body.layer ?? 'l0';
  const operationType = `pipeline_${layer}` as const;

  // Check credits
  const gate = await requireCredits(auth.user.id, operationType);
  if (isCreditError(gate)) return gate;

  // Deduct credits
  const result = await deductCredits(auth.user.id, gate.costCents, `Pipeline ${layer.toUpperCase()} — ${project.name}`, {
    projectId: id,
    operationType,
  });
  if (!result) {
    return NextResponse.json({ error: 'Credit deduction failed' }, { status: 500 });
  }

  // Update project
  await db
    .update(absorbProjects)
    .set({
      status: 'improving',
      totalSpentCents: sql`${absorbProjects.totalSpentCents} + ${gate.costCents}`,
      totalOperations: sql`${absorbProjects.totalOperations} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(absorbProjects.id, id));

  // Delegate to pipeline API
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const pipeRes = await fetch(`${origin}/api/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        mode: body.mode ?? 'single',
        targetProject: project.localPath || project.sourceUrl || '',
      }),
    });

    const pipeData = await pipeRes.json().catch(() => ({}));

    return NextResponse.json({
      success: pipeRes.ok,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      pipeline: pipeData,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed' },
      { status: 500 },
    );
  }
}
