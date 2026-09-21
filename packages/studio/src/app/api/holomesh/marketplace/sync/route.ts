export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getDb } from '../../../../../db/client';
import { holomeshKnowledgeEntries } from '../../../../../db/schema';
import { rateLimit } from '../../../../../lib/rate-limiter';
import { sql } from 'drizzle-orm';
import { isPremiumRow, premiumTeaser } from '../../../../../lib/premium-view';

import { corsHeaders } from '../../../_lib/cors';
const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';

/**
 * This upstream reads its credential from `Authorization: Bearer`, unlike the
 * gateway routes that read `x-mcp-api-key`. Both spellings are accepted FROM
 * the caller and forwarded in the one form THIS upstream actually reads —
 * accepting a header and then sending it somewhere it is never looked at is a
 * promise that fails silently.
 */
function callerUpstreamKey(request: Request): string | null {
  const meshKey = request.headers.get('x-mcp-api-key')?.trim();
  if (meshKey) return meshKey;

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  // A `bk_` bearer is a Studio API key, not a mesh key: presenting one upstream
  // would hand a Studio credential to a different service.
  if (bearer && !bearer.startsWith('bk_')) return bearer;

  return null;
}

interface McpEntry {
  id: string;
  workspaceId?: string;
  type?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  domain?: string;
  price?: number;
  premium?: boolean;
  confidence?: number;
  tags?: unknown[];
  provenanceHash?: string;
  queryCount?: number;
  reuseCount?: number;
  salesCount?: number;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * POST /api/holomesh/marketplace/sync
 *
 * Bulk-fetches marketplace entries from MCP and upserts them into the local
 * DB cache — used to pre-warm the DB so entry GET can fallback on cold start.
 *
 * Doors audit 2026-09-15. A rate limit is not a door: it caps how fast a
 * stranger may do a thing, not whether they may do it at all. This route spent
 * Studio's own mesh key on an upstream read for anyone who asked, and wrote the
 * result into the cache that `/api/holomesh/knowledge/catalog` and the entry
 * GET fallback then serve — so an anonymous caller could both spend our
 * identity and choose what lands in a cache other visitors read. No Studio UI
 * calls it; it is an operator pre-warm.
 *
 * Now: a caller who sends their own key runs as themselves and nothing of ours
 * is attached; a caller who sends none must be signed in to Studio. The rate
 * limit stays, in front, so a flood is still cheap to refuse.
 *
 * Params (body):
 *   limit?   number  — entries to fetch per page (default 200, max 500)
 *   domain?  string  — filter by domain
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { max: 10, label: 'marketplace-sync' }, 'marketplace-sync');
  if (!limited.ok) return limited.response;

  const callerKey = callerUpstreamKey(req);
  let upstreamKey: string | null = callerKey;

  if (!callerKey) {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Sign in to HoloScript Studio to refresh the marketplace cache, or send your own mesh API key as "x-mcp-api-key: <your key>" to refresh it as yourself.',
          signInRequired: true,
        },
        { status: 401 }
      );
    }
    // Server-only key. NEXT_PUBLIC_* is deliberately not a fallback: Next
    // inlines those into the browser bundle, so one would be readable by every
    // visitor and could never be a server credential.
    upstreamKey = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? null;
    if (!upstreamKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Studio is not configured to refresh the marketplace cache for a signed-in caller.',
        },
        { status: 503 }
      );
    }
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const limit = Math.min(Number.isInteger(body.limit) ? (body.limit as number) : 200, 500);
  const domainFilter = typeof body.domain === 'string' ? body.domain : '';

  const params = new URLSearchParams({ limit: String(limit) });
  if (domainFilter) params.set('domain', domainFilter);

  const res = await fetch(`${BASE}/api/holomesh/marketplace?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${upstreamKey}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json(
      { success: false, error: `MCP returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = (await res.json()) as { entries?: McpEntry[]; success?: boolean };
  const entries: McpEntry[] = data.entries ?? [];

  if (entries.length === 0) {
    return NextResponse.json({ success: true, synced: 0, total: 0 });
  }

  const now = new Date();
  const rows = entries.map((e) => ({
    id: e.id,
    workspaceId: e.workspaceId ?? null,
    type: e.type ?? null,
    // Doors audit 2026-09-15: the cache is served to anyone (catalog, entry
    // fallback), so a premium entry is stored as its teaser, never whole.
    content: isPremiumRow(e) ? premiumTeaser(e.content ?? '') : (e.content ?? ''),
    authorId: e.authorId ?? null,
    authorName: e.authorName ?? null,
    domain: e.domain ?? null,
    price: Number(e.price ?? 0),
    premium: Boolean(e.premium),
    confidence: e.confidence != null ? Math.round(Number(e.confidence) * 100) : null,
    tags: (e.tags ?? []) as unknown[],
    provenanceHash: e.provenanceHash ?? null,
    queryCount: Number(e.queryCount ?? 0),
    reuseCount: Number(e.reuseCount ?? 0),
    salesCount: Number(e.salesCount ?? 0),
    mcpCreatedAt: e.createdAt ? new Date(e.createdAt) : null,
    syncedAt: now,
  }));

  // Upsert in batches of 100
  const BATCH = 100;
  let synced = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db
      .insert(holomeshKnowledgeEntries)
      .values(batch)
      .onConflictDoUpdate({
        target: holomeshKnowledgeEntries.id,
        set: {
          content: sql`excluded.content`,
          authorName: sql`excluded.author_name`,
          domain: sql`excluded.domain`,
          price: sql`excluded.price`,
          premium: sql`excluded.premium`,
          confidence: sql`excluded.confidence`,
          tags: sql`excluded.tags`,
          queryCount: sql`excluded.query_count`,
          reuseCount: sql`excluded.reuse_count`,
          salesCount: sql`excluded.sales_count`,
          mcpCreatedAt: sql`excluded.mcp_created_at`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
    synced += batch.length;
  }

  return NextResponse.json({ success: true, synced, total: entries.length });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
