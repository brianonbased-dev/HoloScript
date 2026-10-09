import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { questProofGuardReason } from './lib/questProofGuards';
import { callerCredentialRuleFor, classifyApiPath, publicRuleFor } from './lib/api-public-paths';
import { SESSION_COOKIE_NAMES } from './lib/session-cookie-names';
import { INVITE_ONLY_PATH, isInviteAllowlistedToken } from './lib/inviteAllowlist';

/** The header the mesh reads a caller key from. */
const MESH_KEY_HEADER = 'x-mcp-api-key';

/**
 * Did the caller present a credential of their OWN?
 *
 * This deliberately does not judge whether the credential is real — it cannot,
 * here, without the upstream that issued it. It answers one question: did
 * somebody arrive claiming to be someone, or did nobody arrive at all. The
 * route the request is heading for does the judging.
 *
 * An entry may name further headers its own route judges (`credentialHeaders`,
 * e.g. the fleet tick's `x-fleet-service-token`); those count on that entry
 * only, so a header one route checks never opens a route that ignores it.
 */
function hasCallerCredential(request: NextRequest, pathname: string, method: string): boolean {
  if (request.headers.get(MESH_KEY_HEADER)?.trim()) return true;
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (/^Bearer\s+\S+$/i.test(authorization)) return true;
  const extra = callerCredentialRuleFor(pathname, method)?.credentialHeaders ?? [];
  return extra.some((header) => Boolean(request.headers.get(header)?.trim()));
}

/**
 * The paths the benchmark bypass is FOR.
 *
 * It mirrors the opt-in bypass `requireAuth` already honours (lib/api-auth.ts:77-90)
 * so that a door in front of a door is never STRICTER than the one behind it —
 * a gate that refuses a caller the route would have accepted is a silent
 * lockout, and it presents as a broken key rather than as a new gate.
 *
 * But the route-level bypass only hands a synthetic user to routes that call
 * `requireAuth`, whereas an unscoped check HERE is a master key for all 236
 * routes, 164 of which have no guard of their own. Mirroring a door is not the
 * same as opening every door beside it.
 *
 * Scoped to what the benchmark actually calls, measured rather than assumed:
 * the only caller that ever sends `x-benchmark-key` is the harness runner at
 * src/__benchmarks__/brittney-vs-baselines/configs/brittney-prod.ts:77, which
 * POSTs to one endpoint — `/api/brittney` (harness.test.ts:467). Nothing else
 * in the repository sends that header.
 */
const BENCHMARK_BYPASS_PREFIX = '/api/brittney';

function isBenchmarkRunner(request: NextRequest, pathname: string): boolean {
  if (pathname !== BENCHMARK_BYPASS_PREFIX && !pathname.startsWith(`${BENCHMARK_BYPASS_PREFIX}/`)) {
    return false;
  }
  // `BRITTNEY_BENCHMARK_KEY` is unset by default, so this is inert unless
  // someone deliberately configured it.
  const configured = process.env.BRITTNEY_BENCHMARK_KEY?.trim();
  if (!configured) return false;
  return request.headers.get('x-benchmark-key')?.trim() === configured;
}

/**
 * none:          no verifiable session.
 * allowed:       a verified session on the invite allowlist.
 * invite-denied: a verified session NOT on the allowlist. It is treated as
 *                signed out and its cookies are cleared.
 */
type StudioSessionState = 'none' | 'allowed' | 'invite-denied';

/**
 * A real, signature-verified Studio session — not merely a cookie that exists.
 *
 * BOTH cookie names are tried, and that is the point. `getToken` picks exactly
 * ONE name from the environment: `__Secure-next-auth.session-token` when
 * NEXTAUTH_URL starts with `https://`, and `next-auth.session-token` otherwise
 * (next-auth 4.24.15, jwt/index.js:65-66). The browser's cookie name was chosen
 * by the same setting at sign-in. So the moment NEXTAUTH_URL is absent, http,
 * or simply different from the origin somebody actually signed in on, the two
 * disagree — and then EVERY signed-in caller is refused here, with a 401 that
 * reads like a broken login rather than like a gate. This lane's whole job is
 * to avoid exactly that, so the env is taken out of the decision.
 *
 * Reading both names is not a weakening. The token still has to carry a valid
 * signature under our own NEXTAUTH_SECRET, which is the entire check either
 * way; only the name of the container changes. A cookie that fails to verify
 * under one name must not stop the other name from being tried.
 */
async function studioSessionState(request: NextRequest): Promise<StudioSessionState> {
  const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  // With no secret no session can be verified, so none is trusted. That refuses
  // a misconfigured deploy rather than waving it through, and the refusal says
  // which variable is missing instead of looking like a login bug.
  if (!secret) return 'none';
  for (const cookieName of SESSION_COOKIE_NAMES) {
    try {
      const token = await getToken({ req: request, secret, cookieName });
      if (token !== null) {
        // Invite-only (lib/inviteAllowlist.ts). A correctly signed token that
        // is not on the allowlist, including one issued before the allowlist
        // existed, counts as NO session here.
        return isInviteAllowlistedToken(token) ? 'allowed' : 'invite-denied';
      }
    } catch {
      // Malformed under this name; the other name still gets its turn.
    }
  }
  return 'none';
}

/** Does the request carry a NextAuth session cookie at all (including chunked `.0`, `.1`)? */
function sessionCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) =>
      SESSION_COOKIE_NAMES.some((base) => name === base || name.startsWith(`${base}.`))
    );
}

/** Expire every session cookie the request carried, so a refused token is signed out. */
function clearSessionCookies(request: NextRequest, response: NextResponse): NextResponse {
  for (const name of sessionCookieNames(request)) {
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      // A `__Secure-` cookie is only replaced by a Set-Cookie that is Secure too.
      secure: name.startsWith('__Secure-'),
    });
  }
  return response;
}

/**
 * The pathname with its percent-escapes decoded.
 *
 * Why the gate looks at this spelling at all: a DYNAMIC segment reaches its
 * handler decoded, so `/api/holomesh/agent/%73elf` is the `[id]` handler asked
 * about "self". Classifying only the raw spelling would let that form walk past
 * an `except` carve-out written as a literal — the carve-out would fail to match
 * and the wildcard above it would answer instead, which is precisely the
 * substitution the `self` carve-outs exist to prevent.
 *
 * Why it cannot be the ONLY spelling: Next matches a FIXED segment against the
 * spelling as typed. `/api/agents/fleet/%73cheduler-tick` is therefore not the
 * tick's route at all; Next serves the sibling `[id]` route and hands it
 * "scheduler-tick" decoded. The gate used to read only the decoded path and so
 * admitted that request as the tick (reproduced on a real `next start` 16.3.3
 * in the review of PR #445; an earlier version of this comment claimed Next
 * resolves every route on the decoded path, which is true of dynamic segments
 * and false of fixed ones).
 *
 * A malformed escape cannot be decoded; it is then classified exactly as it
 * arrived rather than waved through.
 */
function decodedPathname(rawPathname: string): string {
  try {
    return decodeURIComponent(rawPathname);
  } catch {
    return rawPathname;
  }
}

/**
 * Do the typed and the decoded spelling of this path land on the same rules?
 *
 * For an escaped path the gate cannot know which handler Next will pick (see
 * `decodedPathname`), so it must not let the escape choose the tier. A declared
 * rule applies only when BOTH spellings resolve to it. Comparing the rule, not
 * just its tier, also keeps `credentialHeaders` honest: a header one entry
 * judges can never be borrowed through a spelling that matched a different one.
 * A path with nothing escaped trivially agrees with itself.
 */
function spellingsAgree(rawPathname: string, pathname: string, method: string): boolean {
  if (rawPathname === pathname) return true;
  return (
    publicRuleFor(rawPathname, method) === publicRuleFor(pathname, method) &&
    callerCredentialRuleFor(rawPathname, method) === callerCredentialRuleFor(pathname, method)
  );
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
  const rawPathname = request.nextUrl.pathname;
  const pathname = decodedPathname(rawPathname);
  const method = request.method.toUpperCase();

  // A CORS preflight carries no cookies and no credentials by design — that is
  // what makes it a preflight. Refusing it breaks every cross-origin call from
  // a browser before the real, credentialed request is ever sent.
  if (method === 'OPTIONS') return null;

  // When the two spellings disagree the request is classified `session`: the
  // safe default, and what a path that matched no rule gets anyway.
  const access = spellingsAgree(rawPathname, pathname, method)
    ? classifyApiPath(pathname, method)
    : 'session';
  if (access === 'public') return null;
  if (access === 'caller-credential' && hasCallerCredential(request, pathname, method)) return null;
  // The benchmark bypass is a declared admission too, scoped by path prefix, so
  // it gets the same rule: BOTH spellings must sit under the prefix, or an
  // escape (`/api/%62rittney`) would read as the benchmark's path to one reader
  // and as a different route to the other.
  if (isBenchmarkRunner(request, rawPathname) && isBenchmarkRunner(request, pathname)) return null;
  const session = await studioSessionState(request);
  if (session === 'allowed') return null;

  const refusal = NextResponse.json(
    {
      error:
        'This endpoint needs a caller. Sign in to HoloScript Studio, or send your own API key as "x-mcp-api-key: <your key>".',
      signInRequired: true,
      ...(session === 'invite-denied' ? { inviteOnly: true } : {}),
    },
    { status: 401 }
  );
  return session === 'invite-denied' ? clearSessionCookies(request, refusal) : refusal;
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

  // Invite-only (lib/inviteAllowlist.ts). A signed-in visitor whose token is
  // not on the allowlist is signed out and sent to INVITE_ONLY_PATH. That page
  // needs no session, and visitors without a session cookie skip this check.
  if (pathname !== INVITE_ONLY_PATH && sessionCookieNames(request).length > 0) {
    if ((await studioSessionState(request)) === 'invite-denied') {
      const url = request.nextUrl.clone();
      url.pathname = INVITE_ONLY_PATH;
      url.search = '';
      return applySecurityHeaders(
        clearSessionCookies(request, NextResponse.redirect(url)),
        cspHeader,
        permissionsPolicy
      );
    }
  }

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
