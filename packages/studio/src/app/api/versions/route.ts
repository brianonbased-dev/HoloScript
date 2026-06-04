export const maxDuration = 300;

import { NextResponse, NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { sceneVersions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getVersionsStore, makeVersionId, toSceneVersion, type SceneVersion } from './store';
import { requireAuth } from '@/lib/api-auth';
import { scopedSceneKey, unscopeSceneId } from '../_lib/sceneOwnerScope';

import { corsHeaders } from '../_lib/cors';
/**
 * Scene Version History API
 *
 * GET  /api/versions?sceneId=xxx          — list all versions for a scene
 * POST /api/versions { sceneId, code, label } — save a new version snapshot
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory Map for local dev without a database.
 *
 * SECURITY (task_1780469216849_kd86): every read/write requires auth and is
 * scoped to the caller via an owner-namespaced storage key
 * (`${userId}::${sceneId}`). A second authenticated user querying the same
 * sceneId resolves to a different key and sees none of the first user's data.
 * See ../_lib/sceneOwnerScope.ts for the rationale (these tables have no
 * ownerId column, so the existing `project_id` text key carries the namespace).
 */

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const { searchParams } = new URL(request.url);
  const sceneId = searchParams.get('sceneId')?.trim();
  if (!sceneId) {
    return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
  }
  const scopedKey = scopedSceneKey(userId, sceneId);

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, scopedKey))
      .orderBy(desc(sceneVersions.createdAt))
      .limit(50);

    const versions = rows.map((r) => {
      const v = toSceneVersion(r);
      return { ...v, sceneId: unscopeSceneId(r.projectId, userId) };
    });

    return NextResponse.json({ versions });
  }

  // Fallback: in-memory (owner-scoped key)
  const versions = getVersionsStore().get(scopedKey) ?? [];
  return NextResponse.json({
    versions: [...versions].reverse().map((v) => ({ ...v, sceneId })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { sceneId?: string; code?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sceneId, code, label } = body;
  if (!sceneId || !code) {
    return NextResponse.json({ error: 'sceneId and code are required' }, { status: 400 });
  }
  const scopedKey = scopedSceneKey(userId, sceneId);

  const versionLabel = label?.trim() || `Snapshot ${new Date().toLocaleTimeString()}`;

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sceneVersions)
      .values({
        projectId: scopedKey,
        code,
        metadata: { label: versionLabel, lineCount: code.split('\n').length },
      })
      .returning();

    return NextResponse.json(
      {
        version: {
          versionId: row.id,
          sceneId: unscopeSceneId(row.projectId, userId),
          label: versionLabel,
          code: row.code,
          savedAt: row.createdAt.toISOString(),
          lineCount: code.split('\n').length,
        },
      },
      { status: 201 }
    );
  }

  // Fallback: in-memory (owner-scoped key)
  const version: SceneVersion = {
    versionId: makeVersionId(),
    sceneId,
    label: versionLabel,
    code,
    savedAt: new Date().toISOString(),
    lineCount: code.split('\n').length,
  };

  const versionsByScene = getVersionsStore();
  const existing = versionsByScene.get(scopedKey) ?? [];
  const trimmed = [...existing, version].slice(-50);
  versionsByScene.set(scopedKey, trimmed);

  return NextResponse.json({ version }, { status: 201 });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
