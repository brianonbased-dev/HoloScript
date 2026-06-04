export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '../../../db/client';
import { sharedScenes } from '../../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getSession } from '../../../lib/api-auth';

import { corsHeaders } from '../_lib/cors';
/**
 * Scene Sharing API
 *
 * POST /api/share         — publish a scene and get back a share token
 * GET  /api/share         — list recently shared scenes (public gallery)
 * GET  /api/share?mine=1  — list shares owned by the authenticated user
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set.
 * Falls back to in-memory Map for local dev without a database.
 *
 * Ownership: when the caller is authenticated, the share row is stamped with
 * sharedScenes.ownerId = session.user.id so shares can be attributed to a
 * creator and listed via ?mine=1. Anonymous shares (no session) are still
 * allowed — they land with ownerId NULL and appear in the public gallery only.
 */

// Fallback in-memory store for local dev
const sharedScenesMap = new Map<
  string,
  {
    id: string;
    name: string;
    code: string;
    author: string;
    ownerId: string | null;
    createdAt: string;
    views: number;
  }
>();

/** POST /api/share — publish a scene and get back a share token */
export async function POST(req: NextRequest) {
  let body: { name?: string; code?: string; author?: string; customDomain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name = 'Untitled', code, author = 'Anonymous', customDomain } = body;
  if (!code) return NextResponse.json({ error: '`code` is required' }, { status: 400 });

  const domain = typeof customDomain === 'string' ? customDomain.trim() : undefined;

  // Resolve the caller (if any). Sharing stays open to anonymous users, but an
  // authenticated share is attributed to its owner so it can be listed and
  // attributed later. Previously ownerId was never populated → every share was
  // orphaned (no 'my shares', no creator attribution).
  const session = await getSession();
  const ownerId = session?.user?.id ?? null;

  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(sharedScenes)
      .values({
        ownerId,
        code,
        metadata: { name, author, ...(domain ? { customDomain: domain } : {}) },
      })
      .returning();

    const shortId = row.id.slice(0, 8);
    const response: Record<string, string> = { id: shortId, url: `/shared/${shortId}` };
    if (domain) {
      response.customUrl = `https://${domain}/w/${shortId}`;
    }
    return NextResponse.json(response, { status: 201 });
  }

  // Fallback: in-memory
  const id = randomUUID().slice(0, 8);
  sharedScenesMap.set(id, {
    id,
    name,
    code,
    author,
    ownerId,
    createdAt: new Date().toISOString(),
    views: 0,
  });

  const response: Record<string, string> = { id, url: `/shared/${id}` };
  if (domain) {
    response.customUrl = `https://${domain}/w/${id}`;
  }
  return NextResponse.json(response, { status: 201 });
}

/**
 * GET /api/share          — list recently shared scenes (public gallery)
 * GET /api/share?mine=1   — list shares owned by the authenticated user
 *
 * The ?mine=1 path requires authentication and scopes the listing to
 * session.user.id; it returns 401 when the caller is unauthenticated.
 */
export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get('mine') === '1';

  let ownerId: string | null = null;
  if (mine) {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    ownerId = session.user.id;
  }

  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(sharedScenes)
      .where(mine ? eq(sharedScenes.ownerId, ownerId as string) : undefined)
      .orderBy(desc(sharedScenes.createdAt))
      .limit(50);

    const scenes = rows.map((r) => {
      const meta = r.metadata as Record<string, string>;
      return {
        id: r.id.slice(0, 8),
        name: meta?.name ?? 'Untitled',
        author: meta?.author ?? 'Anonymous',
        ownerId: r.ownerId,
        createdAt: r.createdAt.toISOString(),
        views: r.viewCount,
      };
    });

    return NextResponse.json({ scenes });
  }

  // Fallback: in-memory
  const list = Array.from(sharedScenesMap.values())
    .filter((s) => (mine ? s.ownerId === ownerId : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)
    .map(({ id, name, author, ownerId: oid, createdAt, views }) => ({
      id,
      name,
      author,
      ownerId: oid,
      createdAt,
      views,
    }));

  return NextResponse.json({ scenes: list });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
