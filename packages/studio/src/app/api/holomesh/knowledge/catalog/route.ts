import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../db/client';
import { holomeshKnowledgeEntries } from '../../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { rateLimit } from '../../../../../lib/rate-limiter';

const BASE = process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/holomesh/knowledge/catalog
 *
 * Browse the knowledge marketplace catalog with optional domain filtering.
 * Queries the local DB cache (populated by /marketplace/sync) for fast,
 * filterable lookups. Falls back to proxying MCP when the cache is empty.
 *
 * Query params:
 *   domain?  string  — filter by knowledge domain (e.g. "ai", "economy")
 *   type?    string  — filter by entry type ("wisdom"|"pattern"|"gotcha")
 *   limit?   number  — page size (max 200, default 50)
 *   offset?  number  — pagination offset
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { max: 120, label: 'knowledge-catalog' }, 'knowledge-catalog');
  if (!limited.ok) return limited.response;

  const sp = req.nextUrl.searchParams;
  const domain = sp.get('domain') ?? '';
  const type = sp.get('type') ?? '';
  const limit = Math.min(parseInt(sp.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);

  const db = getDb();

  // ---- DB path -------------------------------------------------------
  if (db) {
    try {
      // Build where clause
      const domainCond = domain ? eq(holomeshKnowledgeEntries.domain, domain) : undefined;
      const typeCond = type ? eq(holomeshKnowledgeEntries.type, type) : undefined;
      const where = domainCond && typeCond ? and(domainCond, typeCond)
                  : domainCond ?? typeCond;

      const [entries, countResult] = await Promise.all([
        where
          ? db.select().from(holomeshKnowledgeEntries).where(where).orderBy(sql`synced_at DESC`).limit(limit).offset(offset)
          : db.select().from(holomeshKnowledgeEntries).orderBy(sql`synced_at DESC`).limit(limit).offset(offset),
        where
          ? db.select({ count: sql<number>`count(*)` }).from(holomeshKnowledgeEntries).where(where)
          : db.select({ count: sql<number>`count(*)` }).from(holomeshKnowledgeEntries),
      ]);

      // If DB is empty (not yet synced), fall through to MCP
      if (entries.length > 0 || offset > 0) {
        const total = Number((countResult[0] as { count: number })?.count ?? 0);
        return NextResponse.json({
          success: true,
          entries: entries.map((e) => ({
            id: e.id,
            workspaceId: e.workspaceId,
            type: e.type,
            content: e.content,
            authorId: e.authorId,
            authorName: e.authorName,
            domain: e.domain,
            price: e.price,
            premium: e.premium,
            confidence: e.confidence != null ? e.confidence / 100 : 0,
            tags: e.tags ?? [],
            queryCount: e.queryCount ?? 0,
            reuseCount: e.reuseCount ?? 0,
            salesCount: e.salesCount ?? 0,
            createdAt: e.mcpCreatedAt ?? e.syncedAt,
            source: 'db-cache',
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + entries.length < total,
          },
          filters: { domain: domain || null, type: type || null },
        });
      }
    } catch {
      // fall through to MCP
    }
  }

  // ---- MCP fallback (cache empty or DB unavailable) ------------------
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (domain) params.set('domain', domain);
  if (type) params.set('type', type);

  const res = await fetch(`${BASE}/api/holomesh/marketplace?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ success: false, error: `Upstream returned ${res.status}` }, { status: res.status });
  }

  const data = await res.json() as { entries?: unknown[]; success?: boolean };
  const all = data.entries ?? [];

  // Client-side domain filter (MCP doesn't support it server-side)
  const filtered = domain
    ? all.filter((e) => typeof e === 'object' && e !== null && (e as Record<string, unknown>).domain === domain)
    : all;
  const typeFiltered = type
    ? filtered.filter((e) => typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === type)
    : filtered;

  const page = typeFiltered.slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    entries: page,
    pagination: {
      total: typeFiltered.length,
      limit,
      offset,
      hasMore: offset + page.length < typeFiltered.length,
    },
    filters: { domain: domain || null, type: type || null },
    source: 'mcp-live',
  });
}
