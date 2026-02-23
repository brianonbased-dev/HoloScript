import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * Scene Version History API
 *
 * GET  /api/versions?sceneId=xxx          — list all versions for a scene
 * POST /api/versions { sceneId, code, label } — save a new version snapshot
 */

interface SceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

// In-memory store (persists for server lifetime; swap for DB/Redis in production)
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

  const versions = versionsByScene.get(sceneId) ?? [];
  return NextResponse.json({ versions: [...versions].reverse() }); // newest first
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

  const version: SceneVersion = {
    versionId: makeVersionId(),
    sceneId,
    label: label?.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
    code,
    savedAt: new Date().toISOString(),
    lineCount: code.split('\n').length,
  };

  const existing = versionsByScene.get(sceneId) ?? [];
  // Keep max 50 versions per scene
  const trimmed = [...existing, version].slice(-50);
  versionsByScene.set(sceneId, trimmed);

  return NextResponse.json({ version }, { status: 201 });
}
