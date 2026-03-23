/**
 * POST /api/absorb/projects/[id]/render — Credit-gated screenshot/PDF export.
 *
 * Screenshot: 3 credits. PDF: 5 credits.
 * Delegates to PuppeteerRenderer for headless Chrome rendering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getDb } from '@/db/client';
import { absorbProjects } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireCredits, isCreditError } from '@/lib/absorb/requireCredits';
import { deductCredits } from '@/lib/absorb/creditService';

type RouteContext = { params: Promise<{ id: string }> };

const VALID_IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
const VALID_FORMATS = [...VALID_IMAGE_FORMATS, 'pdf'] as const;
type RenderFormat = (typeof VALID_FORMATS)[number];

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
  let body: { format?: string; width?: number; height?: number; quality?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const format = (body.format ?? 'png') as RenderFormat;
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` },
      { status: 400 },
    );
  }

  const width = Math.min(Math.max(body.width ?? 1280, 320), 3840);
  const height = Math.min(Math.max(body.height ?? 720, 240), 2160);
  const quality = Math.min(Math.max(body.quality ?? 90, 10), 100);
  const operationType = format === 'pdf' ? 'pdf_export' : 'screenshot';

  // Check credits
  const gate = await requireCredits(auth.user.id, operationType);
  if (isCreditError(gate)) return gate;

  // Deduct credits
  const result = await deductCredits(
    auth.user.id,
    gate.costCents,
    `Render (${format}) — ${project.name}`,
    { projectId: id, operationType, format, width, height },
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

  // Execute render via internal endpoint
  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const renderRes = await fetch(`${origin}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        projectPath: project.localPath || project.sourceUrl || '',
        format,
        width,
        height,
        quality,
      }),
    });

    if (!renderRes.ok) {
      const errData = await renderRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || 'Render failed', creditsUsed: gate.costCents },
        { status: 500 },
      );
    }

    // Return the rendered content as base64
    const renderData = await renderRes.json().catch(() => null);
    if (renderData) {
      return NextResponse.json({
        success: true,
        creditsUsed: gate.costCents,
        remainingBalance: result.balanceCents,
        render: renderData,
      });
    }

    // If the internal endpoint returns raw binary, forward it
    const buffer = await renderRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = format === 'pdf' ? 'application/pdf' : `image/${format}`;

    return NextResponse.json({
      success: true,
      creditsUsed: gate.costCents,
      remainingBalance: result.balanceCents,
      render: {
        data: base64,
        mimeType,
        format,
        width,
        height,
        size: buffer.byteLength,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Render failed' },
      { status: 500 },
    );
  }
}
