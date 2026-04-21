export const maxDuration = 300;

/**
 * Generic composition surface API — /api/surface/[slug]
 *
 * Serves .hsplus compositions from compositions/studio/ as JSON for
 * HoloSurfaceRenderer hydration. Maps URL slugs to composition files:
 *   /api/surface/templates  → compositions/studio/templates.hsplus
 *   /api/surface/registry   → compositions/studio/registry.hsplus
 *   /api/surface/projects   → compositions/studio/projects.hsplus
 *   /api/surface/operations → compositions/studio/operations.hsplus
 *
 * @module api/surface/[slug]/route
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Allowed slugs — prevents path traversal
const ALLOWED_SLUGS = new Set([
  'templates',
  'registry',
  'projects',
  'operations',
  'home',
  'workspace',
]);

function resolveCompositionsDir(): string {
  // Walk up from packages/studio/src/app/api/surface/[slug] to repo root
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'compositions', 'studio');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  // Fallback: try relative from process.cwd()
  return path.join(process.cwd(), 'compositions', 'studio');
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Validate slug
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ error: `Unknown surface: ${slug}` }, { status: 404 });
  }

  try {
    const compositionsDir = resolveCompositionsDir();
    const filePath = path.join(compositionsDir, `${slug}.hsplus`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Composition not found: ${slug}.hsplus` }, { status: 404 });
    }

    const code = fs.readFileSync(filePath, 'utf-8');

    return NextResponse.json({
      kind: slug,
      format: 'hsplus',
      code,
      sourcePath: filePath,
      generation: {
        native: true,
        mode: 'loaded-from-composition',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to load composition',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}


// PUBLIC-CORS: documented-public endpoint, intentional wildcard (SEC-T11)
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
