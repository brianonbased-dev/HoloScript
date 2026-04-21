export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../db/client';
import { holomeshTransactions } from '../../../../../db/schema';

import { corsHeaders } from '../../../_lib/cors';
const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

interface McpTransaction {
  id: string;
  type?: string;
  fromAgentId?: string;
  fromAgentName?: string;
  toAgentId?: string;
  toAgentName?: string;
  entryId?: string;
  amount?: number;
  currency?: string;
  txHash?: string;
  status?: string;
  teamId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * POST /api/holomesh/transactions/sync
 * Fetches all transactions from the HoloMesh MCP server and upserts them
 * into the local PostgreSQL ledger table.
 */
export async function POST(_req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: 'DATABASE_URL not configured' },
      { status: 503 }
    );
  }

  let cursor: string | null = null;
  let synced = 0;
  let page = 0;
  const MAX_PAGES = 20;

  try {
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`${BASE}/api/holomesh/transactions?${params}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        cache: 'no-store',
      });
      if (!res.ok) break;

      const data = await res.json();
      const transactions: McpTransaction[] = data.transactions ?? [];
      if (transactions.length === 0) break;

      // Upsert all transactions (ignore conflicts on duplicate IDs)
      const rows = transactions.map((t) => ({
        id: t.id,
        type: t.type ?? 'unknown',
        fromAgentId: t.fromAgentId ?? null,
        fromAgentName: t.fromAgentName ?? null,
        toAgentId: t.toAgentId ?? null,
        toAgentName: t.toAgentName ?? null,
        entryId: t.entryId ?? null,
        amount: typeof t.amount === 'number' ? t.amount : 0,
        currency: t.currency ?? 'USD',
        txHash: t.txHash ?? null,
        status: t.status ?? 'confirmed',
        teamId: t.teamId ?? null,
        metadata: (({
          id: _id,
          type: _t,
          fromAgentId: _f,
          toAgentId: _to,
          entryId: _e,
          amount: _a,
          currency: _c,
          txHash: _tx,
          status: _s,
          teamId: _tm,
          createdAt: _cr,
          fromAgentName: _fn,
          toAgentName: _tn,
          ...rest
        }) => rest)(t),
        mcpCreatedAt: t.createdAt ? new Date(t.createdAt) : null,
      }));

      await db
        .insert(holomeshTransactions)
        .values(rows)
        .onConflictDoNothing({ target: holomeshTransactions.id });

      synced += rows.length;
      cursor = data.cursor_next ?? null;
      page++;
    } while (cursor && page < MAX_PAGES);

    return NextResponse.json({ success: true, synced });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
