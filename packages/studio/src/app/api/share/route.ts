import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '../../../db/client';
import { sharedScenes } from '../../../db/schema';
import { desc } from 'drizzle-orm';

/**
 * Scene Sharing API
 *
 * POST /api/share — publish a scene and get back a share token
 * GET  /api/share — list recently shared scenes (public gallery)
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory Map for local dev without a database.
 */

// Fallback in-memory store for local dev
const sharedScenesMap = new Map<
  string,
  {
    id: string;
    name: string;
    code: string;
    author: string;
    createdAt: string;
    views: number;
  }
>();

/** POST /api/share — publish a scene and get back a share token */
export async function POST(req: NextRequest) {
  let body: { name?: string; code?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name = 'Untitled', code, author = 'Anonymous' } = body;
  if (!code) return NextResponse.json({ error: '`code` is required' }, { status: 400 });

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sharedScenes)
      .values({
        code,
        metadata: { name, author },
      })
      .returning();

    const shortId = row.id.slice(0, 8);
    return NextResponse.json({ id: shortId, url: `/shared/${shortId}` }, { status: 201 });
  }

  // Fallback: in-memory
  const id = randomUUID().slice(0, 8);
  sharedScenesMap.set(id, { id, name, code, author, createdAt: new Date().toISOString(), views: 0 });

  return NextResponse.json({ id, url: `/shared/${id}` }, { status: 201 });
}

/** GET /api/share — list recently shared scenes (public gallery) */
export async function GET() {
  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sharedScenes)
      .orderBy(desc(sharedScenes.createdAt))
      .limit(50);

    const scenes = rows.map((r) => {
      const meta = r.metadata as Record<string, string>;
      return {
        id: r.id.slice(0, 8),
        name: meta?.name ?? 'Untitled',
        author: meta?.author ?? 'Anonymous',
        createdAt: r.createdAt.toISOString(),
        views: r.viewCount,
      };
    });

    return NextResponse.json({ scenes });
  }

  // Fallback: in-memory
  const list = Array.from(sharedScenesMap.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)
    .map(({ id, name, author, createdAt, views }) => ({ id, name, author, createdAt, views }));

  return NextResponse.json({ scenes: list });
}
