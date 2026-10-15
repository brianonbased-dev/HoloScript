/**
 * POST /api/oauth/consent — the signed-in user's decision on an OAuth client.
 *
 * Mints the v1 studio_consent assertion (sub = session user id) with
 * STUDIO_CONSENT_SECRET and POSTs it, in the body, to mcp-server's
 * /oauth/authorize together with the same client_id / redirect_uri /
 * code_challenge and the csrf_token from the GET. On success the browser is
 * sent to the redirect_uri mcp-server validated, with the code. The assertion
 * and secret never appear in a response or URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  buildCallbackUrl,
  getStudioConsentSecret,
  newConsentGrantId,
  parseAuthorizeParams,
  postAuthorizeDecision,
  signStudioConsent,
} from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin form posts may omit it; SameSite cookies still apply
  try {
    return new URL(origin).host === (req.headers.get('host') || req.nextUrl.host);
  } catch {
    return false;
  }
}

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
  if (!sameOrigin(req)) {
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

  let studioConsent: string | undefined;
  if (decision === 'approve') {
    const secret = getStudioConsentSecret();
    if (!secret) {
      return NextResponse.json(
        {
          error: 'consent_unavailable',
          error_description: 'Studio consent signing is not configured.',
        },
        { status: 503, headers: NO_STORE }
      );
    }
    studioConsent = signStudioConsent(
      {
        sub: userId,
        cid: params.client_id,
        scp: params.scope.split(' ').filter(Boolean),
        gid: newConsentGrantId(),
      },
      secret
    );
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
