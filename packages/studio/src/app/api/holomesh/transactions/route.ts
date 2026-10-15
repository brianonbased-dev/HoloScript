export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { noHoloMeshAgentResponse, proxyHoloMeshSelf } from '../../../../lib/holomesh-proxy';
import { getDb } from '../../../../db/client';
import { holomeshTransactions } from '../../../../db/schema';
import { desc } from 'drizzle-orm';

import { corsHeaders } from '../../_lib/cors';
export async function GET(req: NextRequest) {
  // Self route: a keyless caller has no ledger of its own here; refuse before
  // the DB path too (audit 2026-10-15, overlaps #570's per-caller filter).
  if (!req.headers.get('authorization')) return noHoloMeshAgentResponse();
  const db = getDb();
  const { searchParams } = req.nextUrl;

  // Serve from local DB when available (faster, offline-capable)
  if (db) {
    try {
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
      const rows = await db
        .select()
        .from(holomeshTransactions)
        .orderBy(desc(holomeshTransactions.mcpCreatedAt))
        .limit(limit);
      return NextResponse.json({
        success: true,
        transactions: rows,
        count: rows.length,
        source: 'db',
      });
    } catch {
      // fall through to proxy on DB error
    }
  }

  return proxyHoloMeshSelf('/api/holomesh/transactions', req);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
