import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { getDb } from '../../../db/client';
import { sharedScenes } from '../../../db/schema';
import { _eq, sql } from 'drizzle-orm';

/**
 * POST /api/publish
 * Body: HoloScene v2 JSON (same shape as serializer output)
 *
 * GET /api/publish?id=<id>
 * Returns the stored scene JSON.
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to filesystem .published/<id>.json for local dev.
 */

const PUBLISH_DIR = path.join(process.cwd(), '.published');

async function ensurePublishDir() {
  if (!existsSync(PUBLISH_DIR)) {
    await mkdir(PUBLISH_DIR, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid scene data' }, { status: 400 });
    }

    const db = getDb();
    if (db) {
      const [row] = await db
        .insert(sharedScenes)
        .values({
          code: JSON.stringify(body),
          metadata: { type: 'published', publishedAt: new Date().toISOString() },
        })
        .returning();

      const id = row.id.slice(0, 8);
      const baseUrl = req.headers.get('origin') ?? '';
      return NextResponse.json({ id, url: `${baseUrl}/view/${id}` });
    }

    // Fallback: filesystem
    await ensurePublishDir();
    const id = randomBytes(4).toString('hex');
    const filePath = path.join(PUBLISH_DIR, `${id}.json`);

    await writeFile(
      filePath,
      JSON.stringify({ publishedAt: new Date().toISOString(), scene: body }),
      'utf8'
    );

    const baseUrl = req.headers.get('origin') ?? '';
    return NextResponse.json({ id, url: `${baseUrl}/view/${id}` });
  } catch (err) {
    console.error('[publish] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id || !/^[a-f0-9-]{8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid or missing id' }, { status: 400 });
    }

    const db = getDb();
    if (db) {
      // Match by UUID prefix
      const rows = await db
        .select()
        .from(sharedScenes)
        .where(sql`CAST(${sharedScenes.id} AS text) LIKE ${id + '%'}`)
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
      }

      const row = rows[0];
      const scene = JSON.parse(row.code);
      return NextResponse.json({
        publishedAt: row.createdAt.toISOString(),
        scene,
      });
    }

    // Fallback: filesystem
    const filePath = path.join(PUBLISH_DIR, `${id}.json`);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    const raw = await readFile(filePath, 'utf8');
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error('[publish] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
