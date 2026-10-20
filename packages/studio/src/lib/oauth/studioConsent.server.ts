/**
 * Studio side of the mcp-server OAuth consent contract (HoloScript #578,
 * packages/mcp-server/src/security/studio-consent.ts). SERVER ONLY: this module
 * reads STUDIO_CONSENT_SECRET and must never be imported by a client component.
 *
 * mcp-server cannot read a Studio (NextAuth) session, so Studio vouches for the
 * signed-in user with a short-lived assertion signed with the shared secret:
 *
 *   v1.<base64url(JSON {sub, cid, scp, iat, exp, gid?})>.<base64url(HMAC-SHA256("v1.<payload>"))>
 *
 * sub = Studio user id, cid = OAuth client_id, scp = approved scopes,
 * exp - iat <= 300 s. It never travels in a URL (Release F3) and never reaches
 * the browser. Contract at #578 89a487f0 (Release F2):
 *   1. GET /oauth/authorize with `X-Studio-Consent: <assertion>` and
 *      Accept: application/json. mcp verifies it WITHOUT consuming it (peek)
 *      and returns a csrf_token bound to the assertion's sub.
 *   2. POST /oauth/authorize (JSON) with that csrf_token and an assertion for
 *      the SAME sub as `studio_consent` in the body; this one is consumed.
 * Studio re-mints the assertion for the POST (same sub), so an assertion that
 * lapsed while the user read the page (default TTL 120 s, CSRF TTL 600 s) does
 * not break approval, and the assertion never has to round-trip the browser.
 */
import 'server-only';
import { createHmac, randomUUID } from 'crypto';

export const CONSENT_MAX_TTL_S = 300;
export const CONSENT_DEFAULT_TTL_S = 120;
export const CONSENT_SECRET_MIN_LENGTH = 32;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** The shared secret, or null when unset/too short (fail closed: no assertion). */
export function getStudioConsentSecret(): string | null {
  const secret = process.env.STUDIO_CONSENT_SECRET;
  if (!secret || secret.length < CONSENT_SECRET_MIN_LENGTH) return null;
  return secret;
}

/** Byte-for-byte the format mcp-server's verifyStudioConsent accepts. */
export function signStudioConsent(
  claims: { sub: string; cid: string; scp: string[]; gid?: string; ttlS?: number },
  secret: string,
  nowMs: number = Date.now()
): string {
  const iat = Math.floor(nowMs / 1000);
  const body = {
    sub: claims.sub,
    cid: claims.cid,
    scp: claims.scp,
    iat,
    exp: iat + Math.min(claims.ttlS ?? CONSENT_DEFAULT_TTL_S, CONSENT_MAX_TTL_S),
    ...(claims.gid ? { gid: claims.gid } : {}),
  };
  const payload = b64url(Buffer.from(JSON.stringify(body)));
  const sig = b64url(createHmac('sha256', secret).update(`v1.${payload}`).digest());
  return `v1.${payload}.${sig}`;
}

/**
 * Mint the assertion for this signed-in user and request, or null when the
 * secret is not configured (fail closed). Used before the GET and again for
 * the POST (same sub, so the sub-bound csrf_token still verifies).
 */
export function mintStudioConsentFor(
  userId: string,
  params: { client_id: string; scope: string },
  nowMs: number = Date.now()
): string | null {
  const secret = getStudioConsentSecret();
  if (!secret || !userId) return null;
  return signStudioConsent(
    {
      sub: userId,
      cid: params.client_id,
      scp: params.scope.split(' ').filter(Boolean),
      gid: newConsentGrantId(),
    },
    secret,
    nowMs
  );
}

export function newConsentGrantId(): string {
  return `grant_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Connected apps (Settings): the audience mcp-server's GET/DELETE /oauth/grants
 * accept instead of a client_id (packages/mcp-server/src/security/studio-consent.ts
 * STUDIO_GRANTS_AUDIENCE). Never a valid client id, so it cannot approve an app.
 */
export const STUDIO_GRANTS_AUDIENCE = 'studio:connected-apps';

/** A single-use, 60 s session assertion for one Connected-apps call, or null without the secret. */
export function mintStudioGrantsSession(userId: string, nowMs: number = Date.now()): string | null {
  const secret = getStudioConsentSecret();
  if (!secret || !userId) return null;
  return signStudioConsent(
    { sub: userId, cid: STUDIO_GRANTS_AUDIENCE, scp: [], gid: newConsentGrantId(), ttlS: 60 },
    secret,
    nowMs
  );
}
export function mcpOAuthBaseUrl(): string {
  const raw =
    process.env.MCP_OAUTH_ISSUER_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
  return raw.replace(/\/+$/, '');
}

/** The OAuth request fields that must be identical on GET and POST. */
export interface AuthorizeRequestParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  scope: string;
  state?: string;
  response_type: 'code';
}

export function parseAuthorizeParams(
  get: (name: string) => string | null | undefined
): AuthorizeRequestParams | null {
  const client_id = get('client_id') || '';
  const redirect_uri = get('redirect_uri') || '';
  const code_challenge = get('code_challenge') || '';
  const method = get('code_challenge_method') || 'S256';
  if (!client_id || !redirect_uri || !code_challenge || method !== 'S256') return null;
  const state = get('state') || undefined;
  return {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method: 'S256',
    scope: (get('scope') || 'tools:read').trim(),
    response_type: 'code',
    ...(state ? { state } : {}),
  };
}

export interface AuthorizeRequestInfo {
  client_id: string;
  client_name?: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge: string;
  csrf_token: string;
}

/**
 * GET /oauth/authorize (JSON variant) for the signed-in user: the assertion goes
 * in the X-Studio-Consent header (never the query string). Yields a csrf_token
 * bound to the assertion's sub; without a valid assertion mcp sends
 * login_required and no csrf_token, which is reported as a failure.
 */
export async function fetchAuthorizeRequest(
  params: AuthorizeRequestParams,
  studioConsent: string,
  fetchImpl: typeof fetch = fetch
): Promise<
  { ok: true; info: AuthorizeRequestInfo } | { ok: false; status: number; error: string }
> {
  const qs = new URLSearchParams(params as unknown as Record<string, string>);
  const res = await fetchImpl(`${mcpOAuthBaseUrl()}/oauth/authorize?${qs.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Studio-Consent': studioConsent },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  const req = json?.authorization_request;
  if (!res.ok || !req || typeof req.csrf_token !== 'string') {
    return {
      ok: false,
      status: res.status,
      error: String(
        json?.error_description ||
          json?.error ||
          (req?.login_required
            ? 'mcp-server did not accept the Studio sign-in (check STUDIO_CONSENT_SECRET on both sides)'
            : 'authorize request rejected')
      ),
    };
  }
  return { ok: true, info: req as AuthorizeRequestInfo };
}

/**
 * POST /oauth/authorize as JSON. Same client_id / redirect_uri / code_challenge
 * as the GET, plus csrf_token and the studio_consent assertion in the BODY.
 */
export async function postAuthorizeDecision(
  input: {
    params: AuthorizeRequestParams;
    csrfToken: string;
    decision: 'approve' | 'deny';
    studioConsent?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number; body: Record<string, any> }> {
  const body: Record<string, string> = {
    client_id: input.params.client_id,
    redirect_uri: input.params.redirect_uri,
    code_challenge: input.params.code_challenge,
    code_challenge_method: 'S256',
    scope: input.params.scope,
    csrf_token: input.csrfToken,
    decision: input.decision,
    ...(input.params.state ? { state: input.params.state } : {}),
    ...(input.studioConsent ? { studio_consent: input.studioConsent } : {}),
  };
  const res = await fetchImpl(`${mcpOAuthBaseUrl()}/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, body: json };
}

/** Append OAuth callback params to a redirect_uri mcp-server already validated. */
export function buildCallbackUrl(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}
