import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

/**
 * POST /api/publish
 * Body: HoloScene v2 JSON (same shape as serializer output)
 *
 * Saves the scene to .published/<id>.json in the project root
 * (for local dev). Returns { id, url }.
 *
 * GET /api/publish?id=<id>
 * Returns the stored scene JSON.
 */

const PUBLISH_DIR = path.join(process.cwd(), '.published');

async function ensurePublishDir() {
  if (!existsSync(PUBLISH_DIR)) {
    await mkdir(PUBLISH_DIR, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    await ensurePublishDir();

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid scene data' }, { status: 400 });
    }

    // Generate a short 8-char ID
    const id = randomBytes(4).toString('hex');
    const filePath = path.join(PUBLISH_DIR, `${id}.json`);

    await writeFile(
      filePath,
      JSON.stringify({
        publishedAt: new Date().toISOString(),
        scene: body,
      }),
      'utf8'
    );

    const baseUrl = req.headers.get('origin') ?? '';
    return NextResponse.json({
      id,
      url: `${baseUrl}/view/${id}`,
    });
  } catch (err) {
    console.error('[publish] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id || !/^[a-f0-9]{8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid or missing id' }, { status: 400 });
    }

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
