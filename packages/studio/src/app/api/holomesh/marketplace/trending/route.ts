export const maxDuration = 300;

/**
 * GET /api/holomesh/marketplace/trending
 *
 * Returns knowledge marketplace entries that gained the most purchases
 * in the last 24 h (or a custom window via ?window=Nh). Distinct from the
 * main feed which sorts by all-time salesCount.
 *
 * Strategy:
 *  1. Query DB holomeshTransactions for purchase counts grouped by entryId
 *     within the requested window.
 *  2. Fetch marketplace catalogue from MCP (up to 200 entries).
 *  3. Enrich each matching entry with purchaseCount24h and sort descending.
 *  4. Tiebreaker: salesCount + reuseCount (all-time cumulative from MCP).
 *  5. If the DB has no transaction data (cold start), fall back to MCP
 *     all-time sorting so the response is never empty.
 *
 * Query params:
 *  limit   – max entries to return (default 20, max 100)
 *  window  – look-back in hours (default 24, max 168 / 7 days)
 *  domain  – optional domain filter applied to MCP fetch
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, isNotNull, desc, sql } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { holomeshTransactions } from '../../../../../db/schema';
import { rateLimit } from '../../../../../lib/rate-limiter';

const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';

const MCP_KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 168; // 7 days
/** How many entries to fetch from the MCP marketplace catalogue. */
const MCP_CATALOGUE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketplaceEntry {
  id: string;
  type: string;
  content: string;
  domain?: string;
  tags?: string[];
  price?: number;
  salesCount?: number;
  reuseCount?: number;
  queryCount?: number;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
  confidence?: number;
  [key: string]: unknown;
}

interface TrendingEntry extends MarketplaceEntry {
  purchaseCount24h: number;
  allTimeScore: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIntClamped(raw: string | null, def: number, min: number, max: number): number {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

async function fetchMcpCatalogue(domain?: string): Promise<MarketplaceEntry[]> {
  const params = new URLSearchParams({ limit: String(MCP_CATALOGUE_LIMIT) });
  if (domain) params.set('domain', domain);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MCP_KEY) headers['Authorization'] = `Bearer ${MCP_KEY}`;

  const res = await fetch(`${BASE}/api/holomesh/marketplace?${params.toString()}`, {
    headers,
    next: { revalidate: 60 }, // Cache-safe: stale up to 60 s
  });

  if (!res.ok) return [];

  const json = (await res.json()) as { entries?: MarketplaceEntry[] };
  return Array.isArray(json.entries) ? json.entries : [];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Rate limit: 120 reads/min shared with board reads
  const rl = rateLimit(
    req,
    { max: 120, windowMs: 60_000, label: 'Too many trending requests.' },
    'marketplace-trending'
  );
  if (!rl.ok) return rl.response;

  const { searchParams } = req.nextUrl;
  const limit = parseIntClamped(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const windowHours = parseIntClamped(
    searchParams.get('window'),
    DEFAULT_WINDOW_HOURS,
    1,
    MAX_WINDOW_HOURS
  );
  const domain = searchParams.get('domain') ?? undefined;

  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs);

  // -------------------------------------------------------------------------
  // 1. Query DB for trending entryIds within window
  // -------------------------------------------------------------------------
  type TxRow = { entryId: string | null; count: number };
  let txRows: TxRow[] = [];
  const db = getDb();

  if (db) {
    try {
      txRows = (await db
        .select({
          entryId: holomeshTransactions.entryId,
          count: sql<number>`count(*)`.as('count'),
        })
        .from(holomeshTransactions)
        .where(
          and(
            eq(holomeshTransactions.type, 'purchase'),
            gte(holomeshTransactions.mcpCreatedAt, cutoff),
            isNotNull(holomeshTransactions.entryId)
          )
        )
        .groupBy(holomeshTransactions.entryId)
        .orderBy(desc(sql`count(*)`))
        .limit(MAX_LIMIT)) as TxRow[];
    } catch {
      // DB unavailable — continue with fallback
      txRows = [];
    }
  }

  // Build a lookup: entryId → purchase count in window
  const purchaseMap = new Map<string, number>();
  for (const row of txRows) {
    if (row.entryId) purchaseMap.set(row.entryId, Number(row.count));
  }

  // -------------------------------------------------------------------------
  // 2. Fetch MCP marketplace catalogue
  // -------------------------------------------------------------------------
  const catalogue = await fetchMcpCatalogue(domain);

  if (catalogue.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Upstream catalogue unavailable',
      },
      { status: 502 }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Enrich entries and sort
  // -------------------------------------------------------------------------
  const hasTxData = purchaseMap.size > 0;

  const enriched: TrendingEntry[] = catalogue.map((entry) => ({
    ...entry,
    purchaseCount24h: purchaseMap.get(entry.id) ?? 0,
    allTimeScore: (entry.salesCount ?? 0) + (entry.reuseCount ?? 0),
  }));

  // If we have DB data: primary sort = purchaseCount24h (last 24h) desc,
  // tiebreaker = allTimeScore. If cold start: sort by allTimeScore only.
  const sorted = enriched.sort((a, b) => {
    if (hasTxData) {
      const diff = b.purchaseCount24h - a.purchaseCount24h;
      if (diff !== 0) return diff;
    }
    return b.allTimeScore - a.allTimeScore;
  });

  const results = sorted.slice(0, limit);

  return NextResponse.json({
    success: true,
    window: `${windowHours}h`,
    source: hasTxData ? 'db-tx-window' : 'mcp-alltime-fallback',
    total: results.length,
    entries: results,
  });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
