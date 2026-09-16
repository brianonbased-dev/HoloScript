export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { getDb } from '../../../../db/client';
import { sharedScenes } from '../../../../db/schema';
import { corsHeaders } from '../../_lib/cors';

type ShareScene = {
  id: string;
  name: string;
  author: string;
  createdAt: string;
  views: number;
  code?: string;
};

type PublishedScene = {
  code?: string;
  title?: string;
  author?: string;
  metadata?: { name?: string };
};

type PublishedScenePayload = {
  publishedAt?: string;
  scene?: PublishedScene;
};

/**
 * A share token is the first 8 characters of a scene row's uuid.
 *
 * Validated before it reaches the query below, and not only for tidiness: that
 * query matches on `LIKE <id>%`, where `%` and `_` are WILDCARDS. An id of `%`
 * would match every row and hand the most recent scene of any user to anybody
 * who asked. `/api/publish` guards its identical lookup the same way.
 */
const SHARE_TOKEN = /^[a-f0-9-]{8}$/i;

function notFound(id: string): NextResponse {
  return NextResponse.json({ error: `Scene '${id}' not found` }, { status: 404 });
}

/** The bridged shape the share viewer consumes, from a published scene payload. */
function bridgePublished(id: string, payload: PublishedScenePayload): ShareScene | null {
  const scene = payload.scene;
  if (!scene?.code) return null;
  return {
    id,
    name: scene.metadata?.name ?? scene.title ?? `World ${id}`,
    author: scene.author ?? 'Anonymous',
    createdAt: payload.publishedAt ?? new Date().toISOString(),
    views: 0,
    code: scene.code,
  };
}

/**
 * One scene row, as the viewer contract.
 *
 * `shared_scenes` holds both kinds of row: `POST /api/share` stores the source
 * directly, and `POST /api/publish` stores the whole HoloScene JSON in the same
 * `code` column under `metadata.type === 'published'`. The published kind is
 * bridged exactly as the old fallback bridged it.
 *
 * A shared row deliberately answers WITHOUT its source, which is the shape this
 * route already returned for it (it came from the gallery listing, which
 * carries no code). Serving the source here would be a wider answer than the
 * route has ever given, so it is left for the lead rather than slipped in
 * beside a fix — noted in the PR because it is why a share-created scene
 * renders its metadata but no viewer.
 */
function sceneFromRow(
  id: string,
  row: { code: string; metadata: unknown; viewCount: number; createdAt: Date }
): ShareScene | null {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;

  if (metadata.type === 'published') {
    let scene: PublishedScene;
    try {
      scene = JSON.parse(row.code) as PublishedScene;
    } catch {
      return null;
    }
    return bridgePublished(id, { publishedAt: row.createdAt.toISOString(), scene });
  }

  return {
    id,
    name: typeof metadata.name === 'string' ? metadata.name : 'Untitled',
    author: typeof metadata.author === 'string' ? metadata.author : 'Anonymous',
    createdAt: row.createdAt.toISOString(),
    views: row.viewCount,
  };
}

/**
 * Local-dev only: no DATABASE_URL, so the rows live in the in-process Map inside
 * the sibling route module and can only be reached over HTTP.
 *
 * The gallery listing is SESSION-ONLY and must stay that way — bare
 * `GET /api/share` returns the 50 most recent scenes of EVERY user. So a
 * refusal from it is an expected answer here, not a failure: fall through to
 * the published-scene lookup. Answering 502 on `!ok`, as this route used to,
 * meant the public share viewer died before it ever reached that fallback.
 */
async function resolveWithoutDatabase(request: Request, id: string): Promise<NextResponse> {
  const origin = new URL(request.url).origin;

  try {
    const listed = await fetch(`${origin}/api/share`);
    if (listed.ok) {
      const { scenes } = (await listed.json()) as { scenes?: ShareScene[] };
      const scene = scenes?.find((s) => s.id === id);
      if (scene) return NextResponse.json(scene);
    }
  } catch {
    // Unreachable listing is the same situation as a refused one.
  }

  const published = await fetch(`${origin}/api/publish?id=${encodeURIComponent(id)}`);
  if (!published.ok) return notFound(id);

  const bridged = bridgePublished(id, (await published.json()) as PublishedScenePayload);
  if (!bridged) {
    return NextResponse.json({ error: `Scene '${id}' has no HoloScript source` }, { status: 404 });
  }
  return NextResponse.json(bridged);
}

/**
 * GET /api/share/[id] — retrieve a shared scene by its token.
 *
 * Doors audit 2026-09-16. This route used to resolve the token by fetching its
 * OWN bare `GET /api/share` over HTTP with no credential attached. That listing
 * is correctly session-gated now (it lists every user's recent scenes), so the
 * unauthenticated internal call came back 401 and the route answered
 * 502 "Gallery unavailable" — before reaching the `/api/publish` fallback that
 * would have served the scene. The public share viewer
 * (app/shared/[id]/page.tsx:19) goes through the edge, so every shared link was
 * dark.
 *
 * Fixed where the route's own comment always said it should be: the scene is
 * read straight from the database, with no internal HTTP call and therefore no
 * credential to be missing. Bare `GET /api/share` stays closed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!SHARE_TOKEN.test(id)) return notFound(id);

  try {
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(sharedScenes)
        .where(sql`CAST(${sharedScenes.id} AS text) LIKE ${id + '%'}`)
        .limit(1);

      const scene = rows.length > 0 ? sceneFromRow(id, rows[0]) : null;
      return scene ? NextResponse.json(scene) : notFound(id);
    }

    return await resolveWithoutDatabase(request, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
