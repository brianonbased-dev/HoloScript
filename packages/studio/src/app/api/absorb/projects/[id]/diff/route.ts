/**
 * POST /api/absorb/projects/[id]/diff — Credit-gated semantic diff.
 *
 * Compares two versions of source code using AST-based analysis.
 * 2 credits per diff (CPU-only, no LLM).
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

  // Parse request body
  let body: { sourceA?: string; sourceB?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const sourceA = body.sourceA?.trim();
  const sourceB = body.sourceB?.trim();

  if (!sourceA || !sourceB) {
    return NextResponse.json(
      { error: 'Both sourceA and sourceB are required' },
      { status: 400 },
    );
  }

  // Limit source size to prevent abuse (100KB each)
  if (sourceA.length > 100_000 || sourceB.length > 100_000) {
    return NextResponse.json(
      { error: 'Source inputs must be under 100KB each' },
      { status: 400 },
    );
  }

  // Check credits
  const gate = await requireCredits(auth.user.id, 'semantic_diff');
  if (isCreditError(gate)) return gate;

  // Deduct credits
  const result = await deductCredits(
    auth.user.id,
    gate.costCents,
    `Semantic diff — ${project.name}`,
    { projectId: id, operationType: 'semantic_diff' },
  );
  if (!result) {
    return NextResponse.json({ error: 'Credit deduction failed' }, { status: 500 });
  }

  // Update project stats
  await db
    .update(absorbProjects)
    .set({
      totalSpentCents: sql`${absorbProjects.totalSpentCents} + ${gate.costCents}`,
      totalOperations: sql`${absorbProjects.totalOperations} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(absorbProjects.id, id));

  // Execute diff via internal endpoint
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const diffRes = await fetch(`${origin}/api/diff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({ sourceA, sourceB }),
    });

    const diffData = await diffRes.json().catch(() => ({}));

    return NextResponse.json({
      success: diffRes.ok,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      diff: diffData,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Diff failed' },
      { status: 500 },
    );
  }
}
