export const maxDuration = 300;

import { NextResponse, NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { sceneVersions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getVersionsStore, makeVersionId, toSceneVersion, type SceneVersion } from './store';

import { corsHeaders } from '../_lib/cors';
/**
 * Scene Version History API
 *
 * GET  /api/versions?sceneId=xxx          — list all versions for a scene
 * POST /api/versions { sceneId, code, label } — save a new version snapshot
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory Map for local dev without a database.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sceneId = searchParams.get('sceneId')?.trim();
  if (!sceneId) {
    return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
  }

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sceneVersions)
      .where(eq(sceneVersions.projectId, sceneId))
      .orderBy(desc(sceneVersions.createdAt))
      .limit(50);

    const versions = rows.map(toSceneVersion);

    return NextResponse.json({ versions });
  }

  // Fallback: in-memory
  const versions = getVersionsStore().get(sceneId) ?? [];
  return NextResponse.json({ versions: [...versions].reverse() });
}

export async function POST(request: NextRequest) {
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

  const versionLabel = label?.trim() || `Snapshot ${new Date().toLocaleTimeString()}`;

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sceneVersions)
      .values({
        projectId: sceneId,
        code,
        metadata: { label: versionLabel, lineCount: code.split('\n').length },
      })
      .returning();

    return NextResponse.json(
      {
        version: {
          versionId: row.id,
          sceneId: row.projectId,
          label: versionLabel,
          code: row.code,
          savedAt: row.createdAt.toISOString(),
          lineCount: code.split('\n').length,
        },
      },
      { status: 201 }
    );
  }

  // Fallback: in-memory
  const version: SceneVersion = {
    versionId: makeVersionId(),
    sceneId,
    label: versionLabel,
    code,
    savedAt: new Date().toISOString(),
    lineCount: code.split('\n').length,
  };

  const versionsByScene = getVersionsStore();
  const existing = versionsByScene.get(sceneId) ?? [];
  const trimmed = [...existing, version].slice(-50);
  versionsByScene.set(sceneId, trimmed);

  return NextResponse.json({ version }, { status: 201 });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
