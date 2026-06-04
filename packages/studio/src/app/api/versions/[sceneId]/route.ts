export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sceneVersions } from '@/db/schema';
import { getVersionsStore, toSceneVersion } from '../store';
import { requireAuth } from '@/lib/api-auth';
import { scopedSceneKey, unscopeSceneId } from '../../_lib/sceneOwnerScope';

import { corsHeaders } from '../../_lib/cors';
/**
 * GET  /api/versions/[sceneId]              — list versions for scene
 * PUT  /api/versions/[sceneId]?v=<versionId> — restore a specific version (returns code)
 * DELETE /api/versions/[sceneId]?v=<versionId> — delete a specific version
 *
 * SECURITY (task_1780469216849_kd86): every read/write requires auth and is
 * scoped to the caller via an owner-namespaced storage key. A second user
 * cannot restore or delete another user's version — the scoped key won't match
 * the row's owner-prefixed `project_id`, so they get 404 (not the owner's data).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const { sceneId } = await params;
  const scopedKey = scopedSceneKey(userId, sceneId);
  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, scopedKey))
      .orderBy(desc(sceneVersions.createdAt))
      .limit(50);

    return NextResponse.json({
      versions: rows.map((r) => ({
        ...toSceneVersion(r),
        sceneId: unscopeSceneId(r.projectId, userId),
      })),
    });
  }

  const versionsByScene = getVersionsStore();
  const versions = versionsByScene.get(scopedKey) ?? [];
  return NextResponse.json({
    versions: [...versions].reverse().map((v) => ({ ...v, sceneId })),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const { sceneId } = await params;
  const scopedKey = scopedSceneKey(userId, sceneId);
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
      .where(and(eq(sceneVersions.projectId, scopedKey), eq(sceneVersions.id, versionId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const version = { ...toSceneVersion(row), sceneId: unscopeSceneId(row.projectId, userId) };
    return NextResponse.json({ code: version.code, version });
  }

  const versionsByScene = getVersionsStore();
  const versions = versionsByScene.get(scopedKey) ?? [];
  const target = versions.find((v) => v.versionId === versionId);
  if (!target) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  return NextResponse.json({ code: target.code, version: { ...target, sceneId } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const { sceneId } = await params;
  const scopedKey = scopedSceneKey(userId, sceneId);
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get('v');
  if (!versionId) {
    return NextResponse.json({ error: 'v (versionId) query param is required' }, { status: 400 });
  }

  const db = getDb();
  if (db) {
    const deleted = await db
      .delete(sceneVersions)
      .where(and(eq(sceneVersions.projectId, scopedKey), eq(sceneVersions.id, versionId)))
      .returning({ id: sceneVersions.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const remainingRows = await db
      .select({ id: sceneVersions.id })
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, scopedKey));

    return NextResponse.json({ ok: true, remaining: remainingRows.length });
  }

  const versionsByScene = getVersionsStore();
  const versions = versionsByScene.get(scopedKey) ?? [];
  const filtered = versions.filter((v) => v.versionId !== versionId);

  if (filtered.length === versions.length) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  versionsByScene.set(scopedKey, filtered);

  return NextResponse.json({ ok: true, remaining: filtered.length });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
