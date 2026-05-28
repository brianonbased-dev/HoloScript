export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { getDb } from '../../../db/client';
import { sharedScenes } from '../../../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

import { corsHeaders } from '../_lib/cors';
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

interface ProtocolPublishResult {
  contentHash: string;
  publish: Record<string, unknown> | null;
  revenue: Record<string, unknown> | null;
  error?: string;
}

async function ensurePublishDir() {
  if (!existsSync(PUBLISH_DIR)) {
    await mkdir(PUBLISH_DIR, { recursive: true });
  }
}

function publishResponseFields(
  body: Record<string, unknown>,
  protocol: ProtocolPublishResult | null,
  baseUrl: string,
  id: string
) {
  const code = typeof body.code === 'string' ? body.code : '';
  const traits = [...new Set(code.match(/@\w+/g) ?? [])];
  const visibility = typeof body.visibility === 'string' ? body.visibility : 'public';

  return {
    id,
    sceneId: id,
    url: `${baseUrl}/view/${id}`,
    embedUrl: `${baseUrl}/embed/${id}`,
    contentHash: protocol?.contentHash ?? createHash('sha256').update(code).digest('hex'),
    traits,
    visibility,
    revenue: protocol?.revenue ?? null,
    protocol,
  };
}

function protocolHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };

  const bearer = req.headers.get('authorization');
  if (bearer) headers.authorization = bearer;

  const apiKey = process.env.HOLOSCRIPT_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY;
  if (apiKey) headers['x-mcp-api-key'] = apiKey;

  return headers;
}

async function publishToProtocol(
  req: Request,
  body: Record<string, unknown>
): Promise<ProtocolPublishResult | null> {
  if (typeof body.code !== 'string' || body.code.trim().length === 0) return null;

  const serverUrl = (
    process.env.HOLOSCRIPT_PROTOCOL_URL ||
    process.env.HOLOSCRIPT_SERVER_URL ||
    'https://mcp.holoscript.net'
  ).replace(/\/$/, '');
  const contentHash = createHash('sha256').update(body.code).digest('hex');
  const author = typeof body.author === 'string' && body.author ? body.author : 'anonymous';
  const license = typeof body.license === 'string' && body.license ? body.license : 'free';
  const price = typeof body.price === 'string' && body.price ? body.price : '0';

  try {
    const publishRes = await fetch(`${serverUrl}/api/protocol`, {
      method: 'POST',
      headers: protocolHeaders(req),
      body: JSON.stringify({
        contentHash,
        author,
        importHashes: [],
        license,
        publishMode: 'studio',
        price,
        source: body.code,
        code: body.code,
        title: typeof body.title === 'string' ? body.title : undefined,
        description:
          typeof body.metadata === 'object' &&
          body.metadata !== null &&
          typeof (body.metadata as { description?: unknown }).description === 'string'
            ? (body.metadata as { description: string }).description
            : undefined,
      }),
    });

    if (!publishRes.ok) {
      return {
        contentHash,
        publish: null,
        revenue: null,
        error: `protocol publish failed (${publishRes.status}): ${await publishRes.text()}`,
      };
    }

    const publish = (await publishRes.json()) as Record<string, unknown>;
    const revenueRes = await fetch(`${serverUrl}/api/protocol/revenue/${contentHash}`, {
      headers: protocolHeaders(req),
    });
    const revenue = revenueRes.ok ? ((await revenueRes.json()) as Record<string, unknown>) : null;

    return { contentHash, publish, revenue };
  } catch (err) {
    return {
      contentHash,
      publish: null,
      revenue: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid scene data' }, { status: 400 });
    }
    const protocol = await publishToProtocol(req, body as Record<string, unknown>);

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
      return NextResponse.json(
        publishResponseFields(body as Record<string, unknown>, protocol, baseUrl, id)
      );
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
    return NextResponse.json(
      publishResponseFields(body as Record<string, unknown>, protocol, baseUrl, id)
    );
  } catch (err) {
    logger.error('[publish] Error:', err);
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
    logger.error('[publish] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
