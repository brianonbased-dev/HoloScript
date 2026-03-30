import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * GET  /api/versions/[sceneId]              — list versions for scene
 * PUT  /api/versions/[sceneId]?v=<versionId> — restore a specific version (returns code)
 * DELETE /api/versions/[sceneId]?v=<versionId> — delete a specific version
 */

interface SceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

// Share the in-memory store via module-level singleton (Next.js route co-location)
// In production replace with Redis / PostgreSQL
declare global {
  var __versionStore__: Map<string, SceneVersion[]> | undefined;
}
const versionsByScene: Map<string, SceneVersion[]> =
  globalThis.__versionStore__ ?? (globalThis.__versionStore__ = new Map());

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const versions = versionsByScene.get(sceneId) ?? [];
  return NextResponse.json({ versions: [...versions].reverse() });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('v');
  if (!versionId) {
    return NextResponse.json({ error: 'v (versionId) query param is required' }, { status: 400 });
  }

  const versions = versionsByScene.get(sceneId) ?? [];
  const target = versions.find((v) => v.versionId === versionId);
  if (!target) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  return NextResponse.json({ code: target.code, version: target });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('v');
  if (!versionId) {
    return NextResponse.json({ error: 'v (versionId) query param is required' }, { status: 400 });
  }

  const versions = versionsByScene.get(sceneId) ?? [];
  const filtered = versions.filter((v) => v.versionId !== versionId);
  versionsByScene.set(sceneId, filtered);

  return NextResponse.json({ ok: true, remaining: filtered.length });
}
