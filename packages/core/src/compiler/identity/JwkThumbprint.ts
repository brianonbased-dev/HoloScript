/**
 * JWK Thumbprint Calculation (RFC 7638)
 *
 * Computes the JWK SHA-256 thumbprint for RSA, EC, and OKP (Ed25519/Ed448)
 * public keys.  Uses only Node.js built-in `crypto` — zero external deps.
 *
 * The thumbprint is the base64url-encoded SHA-256 hash of the canonical
 * (alphabetically-sorted, minimal) JSON representation of the key's required
 * members as defined in RFC 7638 §3.2.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7638
 * @version 1.0.0
 */

import * as crypto from 'crypto';

/**
 * Supported JWK key types for thumbprint calculation.
 */
export type JwkKeyType = 'RSA' | 'EC' | 'OKP';

/**
 * Minimal JWK representation used for thumbprint computation.
 * Only the required members per key type are included (RFC 7638 §3.2).
 */
export interface CanonicalJwk {
  /** Key type */
  kty: JwkKeyType;
  /** RSA modulus (base64url) — required for RSA */
  n?: string;
  /** RSA public exponent (base64url) — required for RSA */
  e?: string;
  /** EC/OKP curve name — required for EC and OKP */
  crv?: string;
  /** EC/OKP x coordinate (base64url) — required for EC and OKP */
  x?: string;
  /** EC y coordinate (base64url) — required for EC */
  y?: string;
}

/**
 * Calculate the JWK thumbprint (RFC 7638) of a public key given in PEM format.
 *
 * Supports:
 *  - RSA (any modulus length)
 *  - EC  (P-256 / P-384 / P-521)
 *  - OKP (Ed25519 / Ed448 / X25519 / X448)
 *
 * @param publicKeyPem  PEM-encoded public key (SPKI format)
 * @returns base64url-encoded SHA-256 thumbprint
 * @throws if the key type is unsupported or the PEM cannot be parsed
 */
export function calculateJwkThumbprint(publicKeyPem: string): string {
  const keyObject = crypto.createPublicKey(publicKeyPem);
  const jwk = keyObject.export({ format: 'jwk' });

  const canonical = buildCanonicalJwk(jwk as Record<string, unknown>);
  const json = JSON.stringify(canonical);

  return crypto.createHash('sha256').update(json).digest('base64url');
}

/**
 * Calculate the JWK thumbprint from a JWK object directly.
 *
 * @param jwk  JWK object with at least `kty` and the required members for
 *             the key type
 * @returns base64url-encoded SHA-256 thumbprint
 * @throws if the key type is unsupported or required members are missing
 */
export function calculateJwkThumbprintFromJwk(jwk: Record<string, unknown>): string {
  const canonical = buildCanonicalJwk(jwk);
  const json = JSON.stringify(canonical);

  return crypto.createHash('sha256').update(json).digest('base64url');
}

/**
 * Verify that a PEM public key matches the expected JWK thumbprint.
 *
 * @param publicKeyPem  PEM-encoded public key
 * @param expectedThumbprint  Expected base64url SHA-256 thumbprint
 * @returns `true` if the computed thumbprint matches
 */
export function verifyJwkThumbprint(
  publicKeyPem: string,
  expectedThumbprint: string
): boolean {
  try {
    const computed = calculateJwkThumbprint(publicKeyPem);
    // Use timing-safe comparison to prevent side-channel leaks
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(expectedThumbprint, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the canonical JWK object for thumbprint computation.
 *
 * RFC 7638 §3.2 specifies the required members per key type, and they must
 * be serialised in lexicographic (alphabetical) order.
 *
 * @internal
 */
function buildCanonicalJwk(jwk: Record<string, unknown>): CanonicalJwk {
  const kty = jwk.kty as string | undefined;

  switch (kty) {
    case 'RSA': {
      const e = jwk.e as string | undefined;
      const n = jwk.n as string | undefined;
      if (!e || !n) {
        throw new Error('RSA JWK missing required members: e, n');
      }
      // Alphabetical: e, kty, n
      return { e, kty: 'RSA', n };
    }

    case 'EC': {
      const crv = jwk.crv as string | undefined;
      const x = jwk.x as string | undefined;
      const y = jwk.y as string | undefined;
      if (!crv || !x || !y) {
        throw new Error('EC JWK missing required members: crv, x, y');
      }
      // Alphabetical: crv, kty, x, y
      return { crv, kty: 'EC', x, y };
    }

    case 'OKP': {
      const crv = jwk.crv as string | undefined;
      const x = jwk.x as string | undefined;
      if (!crv || !x) {
        throw new Error('OKP JWK missing required members: crv, x');
      }
      // Alphabetical: crv, kty, x
      return { crv, kty: 'OKP', x };
    }

    default:
      throw new Error(`Unsupported JWK key type: ${kty ?? '(undefined)'}`);
  }
}
