import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const QUEST_PROOF_GUARDS = new Map<string, string>([
  ['/creator', 'Creator requires an authenticated desktop session before headset proof.'],
  ['/create', 'Create loads the full editor workbench and is not stable enough for Quest proof sweeps yet.'],
  [
    '/playground/locomotion',
    'Locomotion preview is not promoted for headset proof until its first viewport is deterministic.',
  ],
]);

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

export function proxy(request: NextRequest) {
  const isScanRoomMobile = request.nextUrl.pathname.startsWith('/scan-room/mobile/');
  const permissionsPolicy = isScanRoomMobile
    ? 'camera=(self), microphone=(), geolocation=(), accelerometer=(self), gyroscope=(self), magnetometer=(self)'
    : 'camera=(), microphone=(), geolocation=()';

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
    const guardedReason = QUEST_PROOF_GUARDS.get(request.nextUrl.pathname);
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
  matcher: ['/((?!api|_next/|favicon.ico).*)'],
};
