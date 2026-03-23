/**
 * POST /api/absorb/projects/[id]/query — Credit-gated GraphRAG codebase query.
 *
 * Supports basic semantic search (5 credits) and AI-powered synthesis (15 credits + metered LLM tokens).
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
  let body: { query?: string; withLLM?: boolean; maxResults?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
  }

  const withLLM = body.withLLM ?? false;
  const maxResults = Math.min(body.maxResults ?? 20, 50);
  const operationType = withLLM ? 'query_with_llm' : 'query_basic';

  // Check credits
  const gate = await requireCredits(auth.user.id, operationType);
  if (isCreditError(gate)) return gate;

  // Deduct base credits
  const result = await deductCredits(
    auth.user.id,
    gate.costCents,
    `Query (${withLLM ? 'AI' : 'search'}) — ${project.name}`,
    { projectId: id, operationType, query: query.slice(0, 200) },
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

  // Execute query via internal endpoint
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const queryRes = await fetch(`${origin}/api/codebase/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        query,
        withLLM,
        topK: maxResults,
        projectPath: project.localPath || project.sourceUrl || '',
      }),
    });

    const queryData = await queryRes.json().catch(() => ({}));

    return NextResponse.json({
      success: queryRes.ok,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      query: queryData,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Query failed' },
      { status: 500 },
    );
  }
}
