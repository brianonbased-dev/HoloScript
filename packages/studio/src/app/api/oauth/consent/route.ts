/**
 * POST /api/oauth/consent — the signed-in user's decision on an OAuth client.
 *
 * Re-mints the v1 studio_consent assertion for the SAME signed-in user the
 * page minted one for before its GET (sub = session user id; the csrf_token
 * from that GET is bound to the sub, Release F2) and POSTs it, in the body, to mcp-server's
 * /oauth/authorize together with the same client_id / redirect_uri /
 * code_challenge and the csrf_token from the GET. On success the browser is
 * sent to the redirect_uri mcp-server validated, with the code. The assertion
 * and secret never appear in a response or URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isOwnOriginRequest } from '@/lib/studioOrigin';
import {
  buildCallbackUrl,
  parseAuthorizeParams,
  postAuthorizeDecision,
  mintStudioConsentFor,
} from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };


async function readForm(req: NextRequest): Promise<Record<string, string>> {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const fd = await req.formData();
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}

export async function POST(req: NextRequest) {
  // Release N3 / Mapping: Origin must be present and equal the configured
  // Studio URL (#609 helper). Host / X-Forwarded-Host are never trusted.
  if (!isOwnOriginRequest(req)) {
    return NextResponse.json({ error: 'cross_origin_refused' }, { status: 403, headers: NO_STORE });
  }
  const form = await readForm(req);

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    const back = new URLSearchParams();
    for (const k of [
      'client_id',
      'redirect_uri',
      'code_challenge',
      'code_challenge_method',
      'scope',
      'state',
    ]) {
      if (form[k]) back.set(k, form[k]);
    }
    const signin = new URL('/auth/signin', req.nextUrl.origin);
    signin.searchParams.set('callbackUrl', `/oauth/consent?${back.toString()}`);
    return NextResponse.redirect(signin, { status: 303, headers: NO_STORE });
  }

  const params = parseAuthorizeParams((n) => form[n]);
  const csrfToken = form.csrf_token || '';
  if (!params || !csrfToken) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'missing OAuth request fields or csrf_token' },
      { status: 400, headers: NO_STORE }
    );
  }
  const decision = form.decision === 'deny' ? 'deny' : 'approve';

  // Fresh assertion, same sub as the one sent on the page's GET: the GET only
  // peeked at that one, and it may have lapsed while the user read the page.
  let studioConsent: string | undefined;
  if (decision === 'approve') {
    studioConsent = mintStudioConsentFor(userId, params) ?? undefined;
    if (!studioConsent) {
      return NextResponse.json(
        {
          error: 'consent_unavailable',
          error_description: 'Studio consent signing is not configured.',
        },
        { status: 503, headers: NO_STORE }
      );
    }
  }

  const upstream = await postAuthorizeDecision({ params, csrfToken, decision, studioConsent });

  // Redirect only to a redirect_uri mcp-server has validated for this client.
  if (upstream.body?.error === 'access_denied') {
    return NextResponse.redirect(
      buildCallbackUrl(params.redirect_uri, { error: 'access_denied', state: params.state }),
      { status: 303, headers: NO_STORE }
    );
  }
  if (upstream.status === 200 && typeof upstream.body?.code === 'string') {
    return NextResponse.redirect(
      buildCallbackUrl(params.redirect_uri, { code: upstream.body.code, state: params.state }),
      { status: 303, headers: NO_STORE }
    );
  }
  return NextResponse.json(
    {
      error: String(upstream.body?.error || 'authorize_failed'),
      error_description: String(
        upstream.body?.error_description || 'mcp-server refused the approval'
      ),
    },
    { status: upstream.status >= 400 ? upstream.status : 502, headers: NO_STORE }
  );
}
