/**
 * /api/oauth/admin-clients -- a signed-in FOUNDER provisions or rotates a
 * machine OAuth client (mcp-server POST /oauth/admin/clients[/:id/rotate]).
 *
 * requireFounder runs first; only then is a single-use admin-clients assertion
 * (sub = founder's user id, founder-marked) minted and sent in X-Studio-Consent.
 * No API key is sent or accepted. The client secret in mcp-server's reply is
 * returned once to the founder's browser (no-store) and never logged.
 *
 * POST { action: 'create', purpose, scopes, client_name?, expires_in_days?, allow_codebase?, allow_browser? }
 * POST { action: 'rotate', client_id }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { isOwnOriginRequest } from '@/lib/studioOrigin';
import { mcpOAuthBaseUrl, mintStudioAdminClientsSession } from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CLIENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CREATE_FIELDS = [
  'purpose',
  'scopes',
  'client_name',
  'expires_in_days',
  'allow_codebase',
  'allow_browser',
] as const;

export async function POST(req: NextRequest) {
  if (!isOwnOriginRequest(req)) {
    return NextResponse.json({ error: 'cross_origin_refused' }, { status: 403, headers: NO_STORE });
  }
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const founderId = (auth.user as { id?: string } | undefined)?.id;
  if (!founderId) {
    return NextResponse.json({ error: 'login_required' }, { status: 401, headers: NO_STORE });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.action !== 'create' && body.action !== 'rotate')) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE });
  }
  let path = '/oauth/admin/clients';
  let upstreamBody: Record<string, unknown> = {};
  if (body.action === 'rotate') {
    const id = typeof body.client_id === 'string' ? body.client_id : '';
    if (!CLIENT_ID.test(id)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE });
    }
    path = `/oauth/admin/clients/${encodeURIComponent(id)}/rotate`;
  } else {
    for (const k of CREATE_FIELDS) if (k in body) upstreamBody[k] = body[k];
  }
  const assertion = mintStudioAdminClientsSession(founderId);
  if (!assertion) {
    return NextResponse.json(
      { error: 'not_configured', error_description: 'STUDIO_CONSENT_SECRET is not set on Studio.' },
      { status: 503, headers: NO_STORE }
    );
  }
  let res: Response;
  try {
    res = await fetch(`${mcpOAuthBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Studio-Consent': assertion,
      },
      body: JSON.stringify(upstreamBody),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502, headers: NO_STORE });
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(out, { status: res.status, headers: NO_STORE });
}