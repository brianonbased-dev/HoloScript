/**
 * Human consent for an OAuth client (Muse Gap 9).
 *
 * HoloMesh self-registration is open on purpose: any agent may register and
 * immediately use the public social scopes (see PUBLIC_SOCIAL_SCOPES). Anything
 * that acts on a human's behalf (credits, private workflows, memory, share
 * links, tools:execute) needs that human's consent, given in a signed-in Studio
 * session at authorize time.
 *
 * This server cannot read a Studio (NextAuth) session cookie, so Studio vouches
 * for the session with a short-lived assertion signed with a secret the two
 * services share (STUDIO_CONSENT_SECRET):
 *
 *   v1.<base64url(JSON {sub, cid, scp, iat, exp, gid?})>.<base64url(HMAC-SHA256)>
 *
 * sub = Studio user id, cid = the OAuth client_id being approved, scp = scopes
 * the human approved, exp = expiry (s). The assertion is bound to one client and
 * is valid for at most CONSENT_MAX_TTL_S. With no secret configured, nothing
 * verifies and authorize can grant public social scopes only (fail closed).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export const CONSENT_MAX_TTL_S = 300;

export interface VerifiedConsent {
  userId: string;
  clientId: string;
  scopes: string[];
  grantId: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(`v1.${payload}`).digest());
}

/** Studio side (and tests): mint an assertion. */
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
    exp: iat + Math.min(claims.ttlS ?? 120, CONSENT_MAX_TTL_S),
    ...(claims.gid ? { gid: claims.gid } : {}),
  };
  const payload = b64url(Buffer.from(JSON.stringify(body)));
  return `v1.${payload}.${sign(payload, secret)}`;
}

/**
 * Verify an assertion for `clientId`. Returns null on any doubt: no secret, bad
 * shape, bad signature, wrong client, expired, too long-lived, or no user.
 */
export function verifyStudioConsent(
  assertion: unknown,
  clientId: string,
  secret: string | undefined = process.env.STUDIO_CONSENT_SECRET,
  nowMs: number = Date.now()
): VerifiedConsent | null {
  if (!secret || secret.length < 32) return null;
  if (typeof assertion !== 'string' || assertion.length > 4096) return null;
  const parts = assertion.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, payload, sig] = parts;
  const expected = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(nowMs / 1000);
  const { sub, cid, scp, iat, exp, gid } = claims as {
    sub?: unknown;
    cid?: unknown;
    scp?: unknown;
    iat?: unknown;
    exp?: unknown;
    gid?: unknown;
  };
  if (typeof sub !== 'string' || !sub.trim()) return null;
  if (cid !== clientId) return null;
  if (!Array.isArray(scp) || !scp.every((s) => typeof s === 'string')) return null;
  if (typeof iat !== 'number' || typeof exp !== 'number') return null;
  if (exp <= now || iat > now + 30 || exp - iat > CONSENT_MAX_TTL_S) return null;
  return {
    userId: sub,
    clientId,
    scopes: scp as string[],
    grantId: typeof gid === 'string' && gid ? gid : `grant_${randomUUID().replace(/-/g, '')}`,
  };
}
