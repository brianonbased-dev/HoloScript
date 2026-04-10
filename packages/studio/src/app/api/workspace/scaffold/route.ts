/**
 * POST /api/workspace/scaffold — Generate a Claude-compatible project workspace.
 *
 * Body: ProjectDNA
 * Returns: ScaffoldResult (CLAUDE.md, NORTH_STAR.md, MEMORY.md, skills, hooks, configs)
 *
 * Requires authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { scaffoldProjectWorkspace, ScaffoldValidationError } from '@/lib/workspace/scaffolder';
import type { ProjectDNA } from '@/lib/workspace/scaffolder';

// ─── Request validation ─────────────────────────────────────────────────────

function isProjectDNA(body: unknown): body is ProjectDNA {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;

  return (
    typeof obj['name'] === 'string' &&
    typeof obj['repoUrl'] === 'string' &&
    Array.isArray(obj['techStack']) &&
    Array.isArray(obj['frameworks']) &&
    Array.isArray(obj['languages']) &&
    typeof obj['packageCount'] === 'number' &&
    typeof obj['testCoverage'] === 'number' &&
    typeof obj['codeHealthScore'] === 'number' &&
    Array.isArray(obj['compilationTargets']) &&
    Array.isArray(obj['traits'])
  );
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Type check
  if (!isProjectDNA(body)) {
    return NextResponse.json(
      {
        error:
          'Invalid request body. Required fields: name, repoUrl, techStack, frameworks, languages, packageCount, testCoverage, codeHealthScore, compilationTargets, traits',
      },
      { status: 400 }
    );
  }

  // Scaffold
  try {
    const result = scaffoldProjectWorkspace(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ScaffoldValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 422 });
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
