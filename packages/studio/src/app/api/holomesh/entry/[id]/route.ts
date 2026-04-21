export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../db/client';
import { holomeshKnowledgeEntries } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

import { corsHeaders } from '../../../_lib/cors';
const BASE =
  process.env.HOLOMESH_API_URL ?? process.env.MCP_SERVER_URL ?? 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY ?? process.env.HOLOMESH_KEY ?? '';

function buildHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (KEY) headers['Authorization'] = `Bearer ${KEY}`;
  const xPayment = req.headers.get('x-payment');
  if (xPayment) headers['X-Payment'] = xPayment;
  const clientAuth = req.headers.get('authorization');
  if (clientAuth) headers['Authorization'] = clientAuth;
  return headers;
}

/**
 * GET /api/holomesh/entry/[id]
 *
 * Fetches a knowledge entry from MCP. On 404 (cold-start cache miss),
 * falls back to the local DB cache populated by marketplace sync.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const upstream = await fetch(`${BASE}/api/holomesh/entry/${id}${req.nextUrl.search}`, {
    headers: buildHeaders(req),
    cache: 'no-store',
  });

  // Happy path: MCP has the entry
  if (upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    });
  }

  // On 404 (cold-start cache miss), attempt DB fallback
  if (upstream.status === 404) {
    const db = getDb();
    if (db) {
      try {
        const [cached] = await db
          .select()
          .from(holomeshKnowledgeEntries)
          .where(eq(holomeshKnowledgeEntries.id, id))
          .limit(1);

        if (cached) {
          return NextResponse.json({
            success: true,
            entry: {
              id: cached.id,
              workspaceId: cached.workspaceId,
              type: cached.type,
              content: cached.content,
              authorId: cached.authorId,
              authorName: cached.authorName,
              domain: cached.domain,
              price: cached.price,
              premium: cached.premium,
              confidence: cached.confidence != null ? cached.confidence / 100 : 0,
              tags: cached.tags ?? [],
              provenanceHash: cached.provenanceHash,
              queryCount: cached.queryCount ?? 0,
              reuseCount: cached.reuseCount ?? 0,
              salesCount: cached.salesCount ?? 0,
              createdAt: cached.mcpCreatedAt ?? cached.syncedAt,
            },
            source: 'db-cache',
          });
        }
      } catch {
        // fall through to original 404
      }
    }
  }

  // Pass through all other upstream responses unchanged
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await fetch(`${BASE}/api/holomesh/entry/${id}${req.nextUrl.search}`, {
    method: 'POST',
    headers: buildHeaders(req),
    body: await req.text(),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
