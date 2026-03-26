import { NextResponse, NextRequest } from 'next/server';
import { getDb } from '../../../db/client';
import { sceneVersions } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Scene Version History API
 *
 * GET  /api/versions?sceneId=xxx          — list all versions for a scene
 * POST /api/versions { sceneId, code, label } — save a new version snapshot
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory Map for local dev without a database.
 */

interface SceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

// Fallback in-memory store for local dev without DATABASE_URL
const versionsByScene = new Map<string, SceneVersion[]>();

function makeVersionId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

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

  // Fallback: in-memory
  const versions = versionsByScene.get(sceneId) ?? [];
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

  const existing = versionsByScene.get(sceneId) ?? [];
  const trimmed = [...existing, version].slice(-50);
  versionsByScene.set(sceneId, trimmed);

  return NextResponse.json({ version }, { status: 201 });
}
