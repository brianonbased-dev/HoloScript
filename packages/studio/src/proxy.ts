import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { questProofGuardReason } from './lib/questProofGuards';
import { classifyApiPath } from './lib/api-public-paths';

/** The header the mesh reads a caller key from. */
const MESH_KEY_HEADER = 'x-mcp-api-key';

/**
 * Did the caller present a credential of their OWN?
 *
 * This deliberately does not judge whether the credential is real — it cannot,
 * here, without the upstream that issued it. It answers one question: did
 * somebody arrive claiming to be someone, or did nobody arrive at all. The
 * route the request is heading for does the judging.
 */
function hasCallerCredential(request: NextRequest): boolean {
  if (request.headers.get(MESH_KEY_HEADER)?.trim()) return true;
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  return /^Bearer\s+\S+$/i.test(authorization);
}

/**
 * The same opt-in bypass `requireAuth` already honours (lib/api-auth.ts).
 *
 * A door in front of a door must not be STRICTER than the one behind it, or it
 * locks out a caller the route would have accepted and the failure looks like a
 * broken key rather than a new gate. `BRITTNEY_BENCHMARK_KEY` is unset by
 * default, so this is inert unless someone deliberately configured it.
 */
function isBenchmarkRunner(request: NextRequest): boolean {
  const configured = process.env.BRITTNEY_BENCHMARK_KEY?.trim();
  if (!configured) return false;
  return request.headers.get('x-benchmark-key')?.trim() === configured;
}

/** A real, signature-verified Studio session — not merely a cookie that exists. */
async function hasStudioSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  // With no secret no session can be verified, so none is trusted. That refuses
  // a misconfigured deploy rather than waving it through, and the refusal says
  // which variable is missing instead of looking like a login bug.
  if (!secret) return false;
  try {
    return (await getToken({ req: request, secret })) !== null;
  } catch {
    return false;
  }
}

/**
 * The default for `/api/**`: a caller is required unless the path is declared
 * public in `lib/api-public-paths.ts`.
 *
 * Returns a refusal, or null to let the request through to its route — where
 * every existing per-route guard still runs. This is a floor, not a ceiling:
 * it is what a route gets when its author writes no guard at all, which was the
 * case for 164 of 236 route files when it was written.
 */
async function apiGate(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // A CORS preflight carries no cookies and no credentials by design — that is
  // what makes it a preflight. Refusing it breaks every cross-origin call from
  // a browser before the real, credentialed request is ever sent.
  if (method === 'OPTIONS') return null;

  const access = classifyApiPath(pathname, method);
  if (access === 'public') return null;
  if (access === 'caller-credential' && hasCallerCredential(request)) return null;
  if (isBenchmarkRunner(request)) return null;
  if (await hasStudioSession(request)) return null;

  return NextResponse.json(
    {
      error:
        'This endpoint needs a caller. Sign in to HoloScript Studio, or send your own API key as "x-mcp-api-key: <your key>".',
      signInRequired: true,
    },
    { status: 401 }
  );
}

function hasQuestProofIntent(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  return params.has('visualSweep') || params.has('runId');
}

function applySecurityHeaders(
  response: NextResponse,
  cspHeader: string,
  permissionsPolicy: string
): NextResponse {
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', permissionsPolicy);
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API requests take the gate and nothing else. The page branch below exists
  // to set CSP and permissions headers on HTML; next.config.js already sets the
  // same security headers for /api (added 2026-09-15 precisely because this
  // matcher skipped /api), so re-applying them here would duplicate them.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return (await apiGate(request)) ?? NextResponse.next();
  }

  const isScanRoomMobile = pathname.startsWith('/scan-room/mobile/');
  const isHeadsetProof =
    hasQuestProofIntent(request) ||
    request.nextUrl.pathname.startsWith('/quest-probe') ||
    request.nextUrl.pathname.startsWith('/examples/no-app-webxr') ||
    request.nextUrl.pathname.startsWith('/webcam-gaze-demo');
  const permissionsPolicy = isScanRoomMobile
    ? 'xr-spatial-tracking=*, camera=(self), microphone=(), geolocation=(), accelerometer=(self), gyroscope=(self), magnetometer=(self)'
    : isHeadsetProof
      ? 'xr-spatial-tracking=*, camera=(self), microphone=(self), geolocation=()'
      : 'xr-spatial-tracking=*, camera=(), microphone=(), geolocation=()';

  // Keep this aligned with next.config.js. The app router emits inline RSC
  // bootstrap scripts in production; until nonce propagation covers those
  // scripts, a nonce + strict-dynamic policy blocks the whole client bundle.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    connect-src 'self' ws: wss: https: http:;
    worker-src 'self' blob:;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  if (hasQuestProofIntent(request)) {
    const guardedReason = questProofGuardReason(request.nextUrl.pathname);
    if (guardedReason) {
      const url = request.nextUrl.clone();
      url.pathname = '/quest-proof/unavailable';
      url.searchParams.set('target', request.nextUrl.pathname);
      url.searchParams.set('reason', guardedReason);
      return applySecurityHeaders(
        NextResponse.rewrite(url, {
          request: {
            headers: requestHeaders,
          },
        }),
        cspHeader,
        permissionsPolicy
      );
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applySecurityHeaders(response, cspHeader, permissionsPolicy);
}

export const config = {
  // `api` was excluded here until 2026-09-15, which is WHY every /api guard had
  // to be a hand-patch: there was no default to inherit. Removing it from the
  // exclusion is the whole fix — the gate above now runs for every /api request.
  matcher: ['/((?!_next/|favicon.ico).*)'],
};
