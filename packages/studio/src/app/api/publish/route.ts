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
import { requireAuth } from '@/lib/api-auth';
import {
  buildNoAppWebxrPublishReceipt,
  type ProtocolPublishResult,
} from '@/lib/publish/noAppWebxrPublish';

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

/** The one header the protocol registry reads a key from. */
const MESH_KEY_HEADER = 'x-mcp-api-key';

/** What a locked-out caller is told to do, in the form that actually works. */
const OWN_KEY_HINT = `Send your own mesh API key as "${MESH_KEY_HEADER}: <your key>" to publish as yourself.`;

/**
 * The caller's OWN upstream credential, if they sent one.
 *
 * Both spellings are accepted FROM the caller — `x-mcp-api-key: <key>` and
 * `Authorization: Bearer <key>` — because agents arrive with both habits. The
 * key is then forwarded in the single form the registry reads.
 *
 * A `bk_` bearer is deliberately NOT treated as a mesh key: those are Studio's
 * own API keys. Presenting one upstream would hand a Studio credential to a
 * different service, which records the presented key when validation fails.
 */
function callerMeshKey(request: Request): string | null {
  const meshKey = request.headers.get(MESH_KEY_HEADER)?.trim();
  if (meshKey) return meshKey;

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (bearer && !bearer.startsWith('bk_')) return bearer;

  return null;
}

async function ensurePublishDir() {
  if (!existsSync(PUBLISH_DIR)) {
    await mkdir(PUBLISH_DIR, { recursive: true });
  }
}

async function publishResponseFields(
  body: Record<string, unknown>,
  protocol: ProtocolPublishResult | null,
  baseUrl: string,
  id: string
) {
  return buildNoAppWebxrPublishReceipt({
    body,
    protocol,
    baseUrl,
    id,
  });
}

function requestBaseUrl(req: Request): string {
  return req.headers.get('origin') ?? new URL(req.url).origin;
}

/**
 * Exactly one credential goes upstream, and it is the one the registry reads.
 *
 * The old version forwarded the caller's raw `Authorization` header AND
 * attached our key beside it, which is two promises at once: the caller's
 * header was never looked at, and ours was spent on their behalf.
 */
function protocolHeaders(meshKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    [MESH_KEY_HEADER]: meshKey,
  };
}

/**
 * The protocol leg's outcome. `conflict` is set when the registry answered 409: it accepted the
 * key (it checks the key and its scope before anything else) and refused only because another
 * account already owns this exact code.
 */
interface ProtocolLeg {
  protocol: ProtocolPublishResult | null;
  conflict?: AlreadyPublished;
}

/** The registry's 409 body (mcp-server security/protocol-records.ts alreadyPublishedBody). */
interface AlreadyPublished {
  error: 'already_published';
  contentHash: string;
  existingUrl: string | null;
  message: string;
}

/** The registry's own 409 answer, keeping only its known fields, whatever text it arrived as. */
function alreadyPublishedFrom(text: string, contentHash: string): AlreadyPublished {
  let parsed: Record<string, unknown> = {};
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      parsed = json as Record<string, unknown>;
    }
  } catch {
    // Not JSON: keep the text as the message below.
  }
  return {
    error: 'already_published',
    contentHash: typeof parsed.contentHash === 'string' ? parsed.contentHash : contentHash,
    existingUrl: typeof parsed.existingUrl === 'string' ? parsed.existingUrl : null,
    message:
      typeof parsed.message === 'string'
        ? parsed.message
        : text || 'This code is already published by another account.',
  };
}

async function publishToProtocol(
  meshKey: string | null,
  body: Record<string, unknown>
): Promise<ProtocolLeg> {
  if (typeof body.code !== 'string' || body.code.trim().length === 0) return { protocol: null };

  const serverUrl = (
    process.env.HOLOSCRIPT_PROTOCOL_URL ||
    process.env.HOLOSCRIPT_SERVER_URL ||
    'https://mcp.holoscript.net'
  ).replace(/\/$/, '');
  const contentHash = createHash('sha256').update(body.code).digest('hex');

  // A signed-in caller with no key of their own publishes under Studio's
  // server key. When that key is absent the scene is still stored locally and
  // the receipt says plainly that the registry leg did not happen, rather than
  // failing the whole publish or silently pretending it succeeded.
  if (!meshKey) {
    return {
      protocol: {
        contentHash,
        publish: null,
        revenue: null,
        error:
          'Studio is not configured to publish to the protocol registry for a signed-in caller.',
      },
    };
  }

  const author = typeof body.author === 'string' && body.author ? body.author : 'anonymous';
  const license = typeof body.license === 'string' && body.license ? body.license : 'free';
  const price = typeof body.price === 'string' && body.price ? body.price : '0';

  try {
    const publishRes = await fetch(`${serverUrl}/api/protocol`, {
      method: 'POST',
      headers: protocolHeaders(meshKey),
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
      const text = await publishRes.text();
      return {
        protocol: {
          contentHash,
          publish: null,
          revenue: null,
          error: `protocol publish failed (${publishRes.status}): ${text}`,
        },
        ...(publishRes.status === 409 ? { conflict: alreadyPublishedFrom(text, contentHash) } : {}),
      };
    }

    const publish = (await publishRes.json()) as Record<string, unknown>;
    const revenueRes = await fetch(`${serverUrl}/api/protocol/revenue/${contentHash}`, {
      headers: protocolHeaders(meshKey),
    });
    const revenue = revenueRes.ok ? ((await revenueRes.json()) as Record<string, unknown>) : null;

    return { protocol: { contentHash, publish, revenue } };
  } catch (err) {
    return {
      protocol: {
        contentHash,
        publish: null,
        revenue: null,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * POST /api/publish — register a scene and, when it carries source, publish it
 * to the protocol registry.
 *
 * Doors audit 2026-09-15. This route had no guard of any kind: it attached
 * Studio's own server key to whatever body arrived and posted it to a real
 * upstream registry, so anyone on the internet could publish as us — and fill
 * our scene table while doing it. `src/proxy.ts` cannot help: its matcher
 * skips `/api` entirely.
 *
 * Now:
 *  - a caller who sends their own mesh key runs as themselves: exactly that
 *    key is forwarded and nothing of ours is attached;
 *  - a caller who sends no key must be signed in to Studio;
 *  - the browser-visible NEXT_PUBLIC_* key is no longer a fallback.
 *
 * GET stays open on purpose: it serves published scenes to the share viewer
 * and to `/api/share/[id]`, which is the whole point of publishing one.
 */
export async function POST(req: Request) {
  const callerKey = callerMeshKey(req);
  let upstreamKey: string | null = callerKey;
  let signedIn = false;

  if (!callerKey) {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) {
      return NextResponse.json(
        {
          error: `Sign in to HoloScript Studio to publish a scene. ${OWN_KEY_HINT}`,
          signInRequired: true,
        },
        { status: 401 }
      );
    }
    signedIn = true;
    // Server-only key. NEXT_PUBLIC_* is deliberately not a fallback: Next
    // inlines those into the browser bundle, so one would be readable by every
    // visitor and could never be a server credential.
    upstreamKey = process.env.HOLOSCRIPT_API_KEY ?? null;
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid scene data' }, { status: 400 });
    }
    const { protocol, conflict } = await publishToProtocol(
      upstreamKey,
      body as Record<string, unknown>
    );

    // An unvalidated caller key may authorize the UPSTREAM leg and nothing else.
    //
    // Nobody here checked that key: the registry does, by accepting or refusing
    // the publish. So a caller who presented one has proved who they are only
    // if that leg actually succeeded. Without it, the key is an arbitrary
    // string — and the first version of this guard let such a string skip
    // requireAuth entirely, after which a body carrying no `code` made
    // publishToProtocol return null early while the insert below ran anyway:
    // 200, a persisted scene id, and zero upstream calls. A door that writes to
    // our table for anyone who types a header is the door it was closing.
    //
    // A signed-in caller is exempt: Studio itself vouched for them, which is
    // why a session still publishes when the registry leg is skipped.
    const upstreamAccepted = protocol !== null && protocol.publish !== null;
    if (!signedIn && !upstreamAccepted) {
      // A 409 is not a bad key: the registry checks the key and its scope first, and refuses
      // only because another account owns this exact code. Pass its answer on (the existing
      // scene's link, and that nothing changed) instead of blaming the key. Nothing is stored
      // here either, as for any refused own-key publish. A signed-in caller's receipt still
      // reports the 409 in protocol.error.
      if (conflict) {
        return NextResponse.json(conflict, { status: 409 });
      }
      const reason =
        protocol === null
          ? 'A scene published with a key of your own must carry "code" — the registry is what vouches for that key.'
          : 'The protocol registry did not accept that key, so nothing was stored.';
      return NextResponse.json(
        { error: `${reason} Sign in to HoloScript Studio to store a scene without one.`, signInRequired: true },
        { status: 401 }
      );
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
      const baseUrl = requestBaseUrl(req);
      return NextResponse.json(
        await publishResponseFields(body as Record<string, unknown>, protocol, baseUrl, id)
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

    const baseUrl = requestBaseUrl(req);
    return NextResponse.json(
      await publishResponseFields(body as Record<string, unknown>, protocol, baseUrl, id)
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
