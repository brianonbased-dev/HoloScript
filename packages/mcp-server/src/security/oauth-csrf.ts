/**
 * CSRF token for the OAuth consent step (Trust & Consent, part A item 2).
 *
 * GET /oauth/authorize mints a token bound to exactly one authorization
 * request (client_id, redirect_uri, code_challenge) and a short expiry; POST
 * /oauth/authorize mints a code only when the same request comes back with a
 * valid token. A page on another origin cannot read the GET answer, so it
 * cannot forge the POST. Stateless (HMAC), so it works across replicas when
 * the secret is shared (OAUTH_CSRF_SECRET, else STUDIO_CONSENT_SECRET). With
 * neither set, a per-process random secret is used: still safe, single replica.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const OAUTH_CSRF_TTL_S = 600;

const processSecret = randomBytes(32).toString('hex');

function csrfSecret(): string {
  const configured = process.env.OAUTH_CSRF_SECRET || process.env.STUDIO_CONSENT_SECRET;
  return configured && configured.length >= 32 ? configured : processSecret;
}

export interface CsrfBinding {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  /** Signed-in Studio user (studio_consent sub) the token was minted for (Release F2). */
  userId: string;
}

function mac(binding: CsrfBinding, exp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(
      ['oauth-csrf-v2', binding.clientId, binding.redirectUri, binding.codeChallenge, binding.userId, exp].join(
        '\n'
      )
    )
    .digest('base64url');
}

export function issueOAuthCsrfToken(
  binding: CsrfBinding,
  nowMs: number = Date.now(),
  secret: string = csrfSecret()
): string {
  const exp = Math.floor(nowMs / 1000) + OAUTH_CSRF_TTL_S;
  return `c1.${exp}.${mac(binding, exp, secret)}`;
}

export function verifyOAuthCsrfToken(
  token: unknown,
  binding: CsrfBinding,
  nowMs: number = Date.now(),
  secret: string = csrfSecret()
): boolean {
  if (typeof token !== 'string' || token.length > 256) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'c1') return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp)) return false;
  const now = Math.floor(nowMs / 1000);
  if (exp <= now || exp - now > OAUTH_CSRF_TTL_S) return false;
  const expected = Buffer.from(mac(binding, exp, secret));
  const got = Buffer.from(parts[2]);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
