export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sceneVersions } from '@/db/schema';
import { getVersionsStore, toSceneVersion } from '../store';

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

    return NextResponse.json({ versions: rows.map(toSceneVersion) });
  }

  const versionsByScene = getVersionsStore();
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
    const rows = await db
      .select()
      .from(sceneVersions)
      .where(and(eq(sceneVersions.projectId, sceneId), eq(sceneVersions.id, versionId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const version = toSceneVersion(row);
    return NextResponse.json({ code: version.code, version });
  }

  const versionsByScene = getVersionsStore();
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
      .returning({ id: sceneVersions.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const remainingRows = await db
      .select({ id: sceneVersions.id })
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, sceneId));

    return NextResponse.json({ ok: true, remaining: remainingRows.length });
  }

  const versionsByScene = getVersionsStore();
  const versions = versionsByScene.get(sceneId) ?? [];
  const filtered = versions.filter((v) => v.versionId !== versionId);

  if (filtered.length === versions.length) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  versionsByScene.set(sceneId, filtered);

  return NextResponse.json({ ok: true, remaining: filtered.length });
}


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
