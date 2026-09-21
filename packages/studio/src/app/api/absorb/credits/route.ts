export const maxDuration = 300;

/**
 * GET /api/absorb/credits  -- Check credit balance
 * POST /api/absorb/credits -- Purchase credits (Stripe checkout)
 *
 * Gap 6: Studio API split -- standalone credit management that works
 * without proxying to absorb.holoscript.net. Falls through to the
 * absorb service if available, otherwise returns sensible defaults.
 *
 * Identity: Studio authenticates to absorb with its service key and passes the
 * USER's GitHub token in X-User-Authorization, exactly like the pass-through
 * route /api/absorb/[...path]. Absorb resolves that token to the user whose
 * credits these are, and refuses a purchase without one (403). The user's
 * token is the Authorization header the client sent (absorbFetch), or else the
 * signed-in session's GitHub token. With neither, POST is refused here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { getGitHubToken } from '../../github/_shared';

import { corsHeaders } from '../../_lib/cors';

async function userAuthorization(req?: NextRequest): Promise<string | null> {
  const header = req?.headers.get('authorization')?.trim();
  if (header) return header;
  if (!req) return null;
  try {
    // userOnly: a server-wide GitHub token must never stand in for the buyer.
    const token = await getGitHubToken(req, { userOnly: true });
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

async function proxyToAbsorb(
  path: string,
  method: string,
  userAuth: string | null,
  body?: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ABSORB_API_KEY) headers['Authorization'] = `Bearer ${ABSORB_API_KEY}`;
  if (userAuth) headers['X-User-Authorization'] = userAuth;
  try {
    const res = await fetch(`${ABSORB_BASE}${path}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export async function GET(req: NextRequest) {
  // Try absorb service first. The deployed absorb-service host exposes the
  // balance at /api/credits/balance (NOT /api/credits — that route does not
  // exist and 404s, which is what produced the persistent "showing defaults"
  // banner). See research/2026-06-05_brittney-capability-gaps.md §B2.
  // Without a user, absorb answers with an empty free balance.
  const result = await proxyToAbsorb('/api/credits/balance', 'GET', await userAuthorization(req));
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
  const userAuth = await userAuthorization(req);
  if (!userAuth) {
    return NextResponse.json(
      {
        error: 'Sign-in required',
        message: 'Credits belong to a signed-in user. Sign in with GitHub to buy credits.',
      },
      { status: 401 }
    );
  }

  const body = await req.text();

  // Purchase route on the deployed absorb-service host is /api/credits/purchase
  // (NOT /api/credits). See research/2026-06-05_brittney-capability-gaps.md §B2.
  const result = await proxyToAbsorb('/api/credits/purchase', 'POST', userAuth, body);
  if (result.ok) {
    return NextResponse.json(result.data);
  }

  // Absorb answered with a refusal (e.g. 403 unknown user, 503 payments not
  // configured): pass its own words through instead of calling it "unavailable".
  if (result.status !== 502 && result.data && typeof result.data === 'object') {
    return NextResponse.json(result.data, { status: result.status });
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
