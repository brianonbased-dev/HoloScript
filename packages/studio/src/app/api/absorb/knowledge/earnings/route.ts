export const maxDuration = 300;

/**
 * GET /api/absorb/knowledge/earnings
 *
 * Standalone knowledge earnings endpoint. Returns revenue earned from
 * premium knowledge entries for the current user.
 *
 * Gap 6: Studio API split -- standalone route for knowledge earnings,
 * works without proxying to absorb.holoscript.net.
 */

import { NextRequest, NextResponse } from 'next/server';
import { MCP_SERVER_URL, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';

import { corsHeaders } from '../../../_lib/cors';
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const walletAddress = url.searchParams.get('wallet') || '';

  // Strategy 1: Call knowledge_earnings MCP tool
  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'knowledge_earnings',
          arguments: { wallet_address: walletAddress },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json();
      const textContent = json.result?.content?.[0]?.text;
      if (textContent) {
        try {
          return NextResponse.json(JSON.parse(textContent));
        } catch {
          return NextResponse.json({ text: textContent });
        }
      }
      return NextResponse.json(json.result || {});
    }
  } catch {
    // Fall through to strategy 2
  }

  // Strategy 2: Try absorb service REST API
  try {
    const queryParam = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
    const res = await fetch(`${ABSORB_BASE}/api/knowledge/earnings${queryParam}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Fall through to default
  }

  // Default: Return zero earnings structure
  return NextResponse.json({
    wallet_address: walletAddress || 'unknown',
    total_entries: 0,
    premium_entries: 0,
    total_accesses: 0,
    total_revenue_cents: 0,
    total_revenue_usd: '$0.00',
    note: 'Earnings data unavailable -- showing defaults',
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
