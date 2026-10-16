/**
 * /api/oauth/grants -- Connected apps for the signed-in Studio user.
 *
 * GET lists the user's live agent grants; DELETE ?id=<grantId> revokes one.
 * Both forward to mcp-server's /oauth/grants with a fresh single-use Studio
 * session assertion (sub = session user id, audience studio:connected-apps) in
 * the X-Studio-Consent header. The assertion and STUDIO_CONSENT_SECRET never
 * reach the browser or a URL. mcp-server scopes everything to that sub, so a
 * user can only see and revoke their own grants (another user's id is a 404).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { mcpOAuthBaseUrl, mintStudioGrantsSession } from '@/lib/oauth/studioConsent.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const GRANT_ID = /^[A-Za-z0-9_-]{1,128}$/;

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches may omit it; SameSite cookies still apply
  try {
    return new URL(origin).host === (req.headers.get('host') || req.nextUrl.host);
  } catch {
    return false;
  }
}

async function sessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id || null;
}

async function forward(method: 'GET' | 'DELETE', path: string, userId: string) {
  const assertion = mintStudioGrantsSession(userId);
  if (!assertion) {
    return NextResponse.json(
      { error: 'not_configured', error_description: 'STUDIO_CONSENT_SECRET is not set on Studio.' },
      { status: 503, headers: NO_STORE }
    );
  }
  let res: Response;
  try {
    res = await fetch(`${mcpOAuthBaseUrl()}${path}`, {
      method,
      headers: { Accept: 'application/json', 'X-Studio-Consent': assertion },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502, headers: NO_STORE });
  }
  if (res.status === 204) return new NextResponse(null, { status: 204, headers: NO_STORE });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(body, { status: res.status, headers: NO_STORE });
}

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'login_required' }, { status: 401, headers: NO_STORE });
  }
  return forward('GET', '/oauth/grants', userId);
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'cross_origin_refused' }, { status: 403, headers: NO_STORE });
  }
  const userId = await sessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'login_required' }, { status: 401, headers: NO_STORE });
  }
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!GRANT_ID.test(id)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE });
  }
  return forward('DELETE', `/oauth/grants/${encodeURIComponent(id)}`, userId);
}
