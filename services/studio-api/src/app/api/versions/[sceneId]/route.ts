import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { sceneVersions } from '../../../../db/schema';
import {
  getStudioDevMemoryStores,
  requireDevMemoryPersistence,
} from '../../../../lib/studio-dev-persistence';

/**
 * GET  /api/versions/[sceneId]              — list versions for scene
 * PUT  /api/versions/[sceneId]?v=<versionId> — restore a specific version (returns code)
 * DELETE /api/versions/[sceneId]?v=<versionId> — delete a specific version
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, sceneId))
      .orderBy(desc(sceneVersions.createdAt))
      .limit(50);

    const versions = rows.map((r) => ({
      versionId: r.id,
      sceneId: r.projectId,
      label: (r.metadata as Record<string, string>)?.label ?? '',
      code: r.code,
      savedAt: r.createdAt.toISOString(),
      lineCount: r.code.split('\n').length,
    }));

    return NextResponse.json({ versions });
  }

  const unavailable = requireDevMemoryPersistence('versions');
  if (unavailable) return unavailable;

  const versionsByScene = getStudioDevMemoryStores().versionsByScene;
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

  const db = getDb();
  if (db) {
    const [target] = await db
      .select()
      .from(sceneVersions)
      .where(and(eq(sceneVersions.projectId, sceneId), eq(sceneVersions.id, versionId)))
      .limit(1);
    if (!target) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    const version = {
      versionId: target.id,
      sceneId: target.projectId,
      label: (target.metadata as Record<string, string>)?.label ?? '',
      code: target.code,
      savedAt: target.createdAt.toISOString(),
      lineCount: target.code.split('\n').length,
    };
    return NextResponse.json({ code: target.code, version });
  }

  const unavailable = requireDevMemoryPersistence('versions');
  if (unavailable) return unavailable;

  const versionsByScene = getStudioDevMemoryStores().versionsByScene;
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

  const db = getDb();
  if (db) {
    const deleted = await db
      .delete(sceneVersions)
      .where(and(eq(sceneVersions.projectId, sceneId), eq(sceneVersions.id, versionId)))
      .returning();
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, remaining: null });
  }

  const unavailable = requireDevMemoryPersistence('versions');
  if (unavailable) return unavailable;

  const versionsByScene = getStudioDevMemoryStores().versionsByScene;
  const versions = versionsByScene.get(sceneId) ?? [];
  const filtered = versions.filter((v) => v.versionId !== versionId);
  versionsByScene.set(sceneId, filtered);

  return NextResponse.json({ ok: true, remaining: filtered.length });
}
