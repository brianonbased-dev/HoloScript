export const maxDuration = 300;

/**
 * GET /api/absorb/knowledge/earnings
 *
 * Knowledge-marketplace earnings for the CURRENT (authenticated) user.
 *
 * SECURITY (task_1780469216849_hpxp): this route previously read the target
 * wallet from a client-supplied `?wallet=` param with no auth gate, so any
 * caller could read any wallet's earnings, and authenticated users saw $0
 * because the studio client never sends a wallet param. The fix gates the route
 * with requireAuth and resolves the caller's identity server-side from
 * session.user.id, forwarding it to the backend out-of-band (the backend
 * resolves the caller's own wallet). Any client-supplied wallet/agent param is
 * ignored. Mirrors the requireAuth template from /api/projects (c3851dcce) and
 * /api/versions (efb467dce).
 */

import { NextRequest, NextResponse } from 'next/server';
import { MCP_SERVER_URL, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { requireAuth } from '@/lib/api-auth';
import { AUTHENTICATED_USER_HEADER, centsToUsd } from '../../../_lib/earningsIdentity';

import { corsHeaders } from '../../../_lib/cors';
export async function GET(req: NextRequest) {
  // Auth gate: only an authenticated caller may read earnings, and only their
  // own. The wallet is resolved server-side from the session — never trusted
  // from a client query param.
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  // Strategy 1: Call knowledge_earnings MCP tool. The authenticated user id is
  // forwarded out-of-band; the backend resolves the caller's wallet. We do NOT
  // pass a client-supplied wallet_address.
  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
        [AUTHENTICATED_USER_HEADER]: userId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'knowledge_earnings',
          arguments: { user_id: userId },
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

  // Strategy 2: Try absorb service REST API, forwarding the authenticated user
  // id as the authoritative identity (out-of-band header). No client wallet.
  try {
    const res = await fetch(`${ABSORB_BASE}/api/knowledge/earnings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
        [AUTHENTICATED_USER_HEADER]: userId,
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

  // Default: Return zero earnings structure scoped to the authenticated user.
  return NextResponse.json({
    user_id: userId,
    total_entries: 0,
    premium_entries: 0,
    total_accesses: 0,
    total_revenue_cents: 0,
    total_revenue_usd: centsToUsd(0),
    note: 'Earnings data unavailable -- showing defaults',
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
