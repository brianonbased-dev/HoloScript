export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../db/client';
import { holomeshKnowledgeEntries } from '../../../../../db/schema';
import { rateLimit } from '../../../../../lib/rate-limiter';
import { sql } from 'drizzle-orm';

const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

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
 * Params (body):
 *   limit?   number  — entries to fetch per page (default 200, max 500)
 *   domain?  string  — filter by domain
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { max: 10, label: 'marketplace-sync' }, 'marketplace-sync');
  if (!limited.ok) return limited.response;

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
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
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
    content: e.content ?? '',
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
