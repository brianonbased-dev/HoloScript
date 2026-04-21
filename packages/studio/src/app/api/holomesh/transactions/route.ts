export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { proxyHoloMesh } from '../../../../lib/holomesh-proxy';
import { getDb } from '../../../../db/client';
import { holomeshTransactions } from '../../../../db/schema';
import { desc } from 'drizzle-orm';

import { corsHeaders } from '../../_lib/cors';
export async function GET(req: NextRequest) {
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

  return proxyHoloMesh('/api/holomesh/transactions', req);
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
