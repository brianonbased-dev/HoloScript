/**
 * POST /api/absorb/projects/[id]/absorb — Credit-gated codebase absorb.
 *
 * Deducts credits, then delegates to the internal /api/daemon/absorb endpoint.
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

  // Fetch project
  const [project] = await db
    .select()
    .from(absorbProjects)
    .where(and(eq(absorbProjects.id, id), eq(absorbProjects.userId, auth.user.id)))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Parse optional depth and tier parameters
  let body: { depth?: 'shallow' | 'deep'; tier?: 'low' | 'medium' | 'high' | 'ultra' } = {};
  try {
    body = await req.json();
  } catch {
    // default to shallow
  }
  const depth = body.depth ?? 'shallow';
  const tier = body.tier ?? 'medium';
  const operationType = depth === 'deep' ? 'absorb_deep' : 'absorb_shallow';

  // Check credits
  const gate = await requireCredits(auth.user.id, operationType);
  if (isCreditError(gate)) return gate;

  // Deduct credits
  const result = await deductCredits(auth.user.id, gate.costCents, `Absorb (${depth}) — ${project.name}`, {
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
      status: 'absorbing',
      totalSpentCents: sql`${absorbProjects.totalSpentCents} + ${gate.costCents}`,
      totalOperations: sql`${absorbProjects.totalOperations} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(absorbProjects.id, id));

  // Delegate to internal absorb endpoint
  const projectPath = project.localPath || project.sourceUrl || '';
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const absorbRes = await fetch(`${origin}/api/daemon/absorb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({ projectPath, tier }),
    });

    const absorbData = await absorbRes.json().catch(() => ({}));

    // Update project with results
    await db
      .update(absorbProjects)
      .set({
        status: absorbRes.ok ? 'ready' : 'error',
        lastAbsorbedAt: absorbRes.ok ? new Date() : undefined,
        absorbResultJson: absorbRes.ok ? JSON.stringify(absorbData) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(absorbProjects.id, id));

    return NextResponse.json({
      success: absorbRes.ok,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      absorb: absorbData,
    });
  } catch (err) {
    await db
      .update(absorbProjects)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(absorbProjects.id, id));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Absorb failed' },
      { status: 500 },
    );
  }
}
