export const maxDuration = 300;

/**
 * /api/admin/[...path] — Admin Dashboard Proxy
 *
 * Catch-all route that proxies admin requests from the Studio frontend
 * to the standalone absorb-service /api/admin/* endpoints.
 *
 * Auth: an explicit client Authorization header wins; otherwise the
 * signed-in user's GitHub OAuth token is attached SERVER-SIDE (the session
 * is the truth — founder repro 2026-06-11: the Admin tab 401'd for an
 * OAuth-signed-in founder because the client-side absorbFetch only knew
 * the per-browser connector-store token, which is empty on the OAuth
 * path). absorb-service verifies admin status from the GitHub identity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders, requireFounder } from '@/lib/api-auth';
import { getGitHubToken } from '../../github/_shared';

import { ENDPOINTS } from '@holoscript/config';
import { corsHeaders } from '../../_lib/cors';
const ABSORB_SERVICE_URL = ENDPOINTS.ABSORB_SERVICE;

/**
 * Doors audit 2026-09-15. This route had no gate of any kind, and the token it
 * attached fell back to a SERVER personal access token for a caller who sent
 * none — so outside production (or with STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK
 * set) an unauthenticated stranger reached the absorb admin API carrying our
 * PAT as Bearer. absorb-service verifies admin status from the GitHub identity
 * it is handed, so handing it OURS answered its question with the wrong
 * person's name.
 *
 * Now: the founder gate runs first, and the fallback is `userOnly` — a caller
 * who presented no credential gets none attached on their behalf.
 */
async function resolveAdminAuthHeaders(req: NextRequest): Promise<Record<string, string>> {
  const forwarded = forwardAuthHeaders(req);
  if (forwarded['Authorization']) return forwarded;
  // userOnly: this token stands for WHO is asking. A server token here would
  // act as someone else — the founder, in effect — for whoever reached us.
  const sessionToken = await getGitHubToken(req, { userOnly: true });
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}

function buildUpstreamUrl(req: NextRequest): string {
  // Extract the path segments after /api/admin/
  const url = new URL(req.url);
  const adminPath = url.pathname.replace(/^\/api\/admin/, '');
  const upstream = `${ABSORB_SERVICE_URL}/api/admin${adminPath}`;
  const search = url.search;
  return search ? `${upstream}${search}` : upstream;
}

export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const res = await fetch(buildUpstreamUrl(req), {
      method: 'GET',
      headers: { Accept: 'application/json', ...(await resolveAdminAuthHeaders(req)) },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Admin service error [${res.status}]: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Admin service is offline', details: String(error) },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const bodyText = await req.text();

    const res = await fetch(buildUpstreamUrl(req), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await resolveAdminAuthHeaders(req)) },
      body: bodyText,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Admin service error [${res.status}]: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Admin service is offline', details: String(error) },
      { status: 503 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
