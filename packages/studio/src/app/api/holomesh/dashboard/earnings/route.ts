export const maxDuration = 300;

/**
 * GET /api/holomesh/dashboard/earnings
 *
 * HoloMesh agent earnings for the CURRENT (authenticated) user.
 *
 * SECURITY (task_1780469216849_hpxp): this route blindly proxied to the
 * HoloMesh backend with a shared service key, forwarding any client-supplied
 * `?wallet=`/`?agentId=` query param straight through and with no auth gate —
 * so an unauthenticated or cross-user caller could read another agent's
 * earnings. The fix gates the route with requireAuth, strips every
 * client-supplied identity selector from the query string, and forwards the
 * authenticated session identity out-of-band so the backend resolves the
 * caller's OWN wallet. Mirrors the requireAuth template from /api/projects
 * (c3851dcce) and /api/versions (efb467dce).
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyHoloMesh } from '../../../../../lib/holomesh-proxy';
import { requireAuth } from '@/lib/api-auth';
import {
  AUTHENTICATED_USER_HEADER,
  stripClientIdentityParams,
} from '../../../_lib/earningsIdentity';

import { corsHeaders } from '../../../_lib/cors';
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Strip any client-supplied identity selector so the caller can only ever see
  // their own earnings, then forward the authenticated user id out-of-band.
  const sanitizedSearch = stripClientIdentityParams(new URL(req.url));

  const headers = new Headers(req.headers);
  headers.set(AUTHENTICATED_USER_HEADER, auth.user.id);
  // Remove any client-set value of the trusted header before re-setting it.
  const forwardReq = new NextRequest(
    `${req.nextUrl.origin}${req.nextUrl.pathname}${sanitizedSearch}`,
    {
      method: 'GET',
      headers,
    }
  );

  return proxyHoloMesh('/api/holomesh/dashboard/earnings', forwardReq);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
