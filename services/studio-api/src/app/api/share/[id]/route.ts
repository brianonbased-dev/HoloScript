import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { sharedScenes } from '../../../../db/schema';
import {
  getStudioDevMemoryStores,
  requireDevMemoryPersistence,
} from '../../../../lib/studio-dev-persistence';

/** GET /api/share/[id] — retrieve a shared scene by its token.
 *
 * Uses PostgreSQL when DATABASE_URL is configured. Dev memory retrieval
 * requires STUDIO_API_PERSISTENCE=memory-dev.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const db = getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(sharedScenes)
        .where(sql`CAST(${sharedScenes.id} AS text) LIKE ${id + '%'}`)
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: `Scene '${id}' not found` }, { status: 404 });
      }
      const meta = row.metadata as Record<string, string>;
      return NextResponse.json({
        id,
        name: meta?.name ?? 'Untitled',
        author: meta?.author ?? 'Anonymous',
        code: row.code,
        createdAt: row.createdAt.toISOString(),
        views: row.viewCount,
      });
    }

    const unavailable = requireDevMemoryPersistence('share');
    if (unavailable) return unavailable;

    const scene = getStudioDevMemoryStores().sharedScenes.get(id);
    if (!scene) {
      return NextResponse.json({ error: `Scene '${id}' not found` }, { status: 404 });
    }

    scene.views += 1;
    return NextResponse.json(scene);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
