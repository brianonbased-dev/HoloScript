export const maxDuration = 300;

/**
 * GET /api/absorb/credits  -- Check credit balance
 * POST /api/absorb/credits -- Purchase credits (Stripe checkout)
 *
 * Gap 6: Studio API split -- standalone credit management that works
 * without proxying to absorb.holoscript.net. Falls through to the
 * absorb service if available, otherwise returns sensible defaults.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';

import { corsHeaders } from '../../_lib/cors';
async function proxyToAbsorb(
  path: string,
  method: string,
  body?: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${ABSORB_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: body || undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export async function GET() {
  // Try absorb service first
  const result = await proxyToAbsorb('/api/credits', 'GET');
  if (result.ok) {
    return NextResponse.json(result.data);
  }

  // Return defaults for standalone mode (e.g., local development)
  return NextResponse.json({
    balance: 0,
    tier: process.env.ABSORB_API_KEY ? 'enterprise' : 'free',
    currency: 'cents',
    note: 'Credit service unavailable -- showing defaults',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Try absorb service
  const result = await proxyToAbsorb('/api/credits', 'POST', body);
  if (result.ok) {
    return NextResponse.json(result.data);
  }

  return NextResponse.json(
    {
      error: 'Credit purchase service unavailable',
      hint: 'Stripe checkout requires the absorb service to be running. Set ABSORB_SERVICE_URL.',
    },
    { status: 503 }
  );
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
