/**
 * Tests for JwkThumbprint (RFC 7638)
 *
 * Verifies thumbprint calculation for RSA, EC (P-256/P-384/P-521),
 * and OKP (Ed25519) key types using Node.js built-in crypto only.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  calculateJwkThumbprint,
  calculateJwkThumbprintFromJwk,
  verifyJwkThumbprint,
} from '../JwkThumbprint';
import { generateAgentKeyPair, AgentRole } from '../AgentIdentity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRsaKeyPem(): string {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return publicKey;
}

function generateEcKeyPem(namedCurve: string): string {
  const { publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return publicKey;
}

function generateEd25519KeyPem(): string {
  const { publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return publicKey;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwkThumbprint', () => {
  describe('calculateJwkThumbprint', () => {
    it('should compute a base64url thumbprint for an Ed25519 key', () => {
      const pem = generateEd25519KeyPem();
      const thumbprint = calculateJwkThumbprint(pem);

      expect(thumbprint).toBeTruthy();
      // SHA-256 → 32 bytes → 43 base64url characters (no padding)
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should compute a deterministic thumbprint (same key → same thumbprint)', () => {
      const pem = generateEd25519KeyPem();
      const t1 = calculateJwkThumbprint(pem);
      const t2 = calculateJwkThumbprint(pem);
      expect(t1).toBe(t2);
    });

    it('should compute different thumbprints for different keys', () => {
      const pem1 = generateEd25519KeyPem();
      const pem2 = generateEd25519KeyPem();
      expect(calculateJwkThumbprint(pem1)).not.toBe(calculateJwkThumbprint(pem2));
    });

    it('should compute a thumbprint for an RSA-2048 key', () => {
      const pem = generateRsaKeyPem();
      const thumbprint = calculateJwkThumbprint(pem);

      expect(thumbprint).toBeTruthy();
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should compute a thumbprint for an EC P-256 key', () => {
      const pem = generateEcKeyPem('P-256');
      const thumbprint = calculateJwkThumbprint(pem);

      expect(thumbprint).toBeTruthy();
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should compute a thumbprint for an EC P-384 key', () => {
      const pem = generateEcKeyPem('P-384');
      const thumbprint = calculateJwkThumbprint(pem);

      expect(thumbprint).toBeTruthy();
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should compute a thumbprint for an EC P-521 key', () => {
      const pem = generateEcKeyPem('P-521');
      const thumbprint = calculateJwkThumbprint(pem);

      expect(thumbprint).toBeTruthy();
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should throw for invalid PEM input', () => {
      expect(() => calculateJwkThumbprint('not-a-pem')).toThrow();
    });
  });

  describe('calculateJwkThumbprintFromJwk', () => {
    it('should compute the same thumbprint as calculateJwkThumbprint for Ed25519', () => {
      const pem = generateEd25519KeyPem();
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      const fromPem = calculateJwkThumbprint(pem);
      const fromJwk = calculateJwkThumbprintFromJwk(jwk);
      expect(fromJwk).toBe(fromPem);
    });

    it('should compute the same thumbprint as calculateJwkThumbprint for RSA', () => {
      const pem = generateRsaKeyPem();
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      const fromPem = calculateJwkThumbprint(pem);
      const fromJwk = calculateJwkThumbprintFromJwk(jwk);
      expect(fromJwk).toBe(fromPem);
    });

    it('should compute the same thumbprint as calculateJwkThumbprint for EC P-256', () => {
      const pem = generateEcKeyPem('P-256');
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      const fromPem = calculateJwkThumbprint(pem);
      const fromJwk = calculateJwkThumbprintFromJwk(jwk);
      expect(fromJwk).toBe(fromPem);
    });

    it('should throw for unsupported key type', () => {
      expect(() => calculateJwkThumbprintFromJwk({ kty: 'oct', k: 'abc' })).toThrow(
        'Unsupported JWK key type: oct'
      );
    });

    it('should throw for missing required RSA members', () => {
      expect(() => calculateJwkThumbprintFromJwk({ kty: 'RSA', n: 'abc' })).toThrow(
        'RSA JWK missing required members'
      );
    });

    it('should throw for missing required EC members', () => {
      expect(() => calculateJwkThumbprintFromJwk({ kty: 'EC', crv: 'P-256', x: 'abc' })).toThrow(
        'EC JWK missing required members'
      );
    });

    it('should throw for missing required OKP members', () => {
      expect(() => calculateJwkThumbprintFromJwk({ kty: 'OKP', crv: 'Ed25519' })).toThrow(
        'OKP JWK missing required members'
      );
    });
  });

  describe('verifyJwkThumbprint', () => {
    it('should return true for a matching thumbprint', () => {
      const pem = generateEd25519KeyPem();
      const thumbprint = calculateJwkThumbprint(pem);
      expect(verifyJwkThumbprint(pem, thumbprint)).toBe(true);
    });

    it('should return false for a non-matching thumbprint', () => {
      const pem = generateEd25519KeyPem();
      expect(verifyJwkThumbprint(pem, 'wrong-thumbprint-value-xxxxxxxxxx')).toBe(false);
    });

    it('should return false for invalid PEM', () => {
      expect(verifyJwkThumbprint('bad-pem', 'some-thumbprint')).toBe(false);
    });

    it('should work for RSA keys', () => {
      const pem = generateRsaKeyPem();
      const thumbprint = calculateJwkThumbprint(pem);
      expect(verifyJwkThumbprint(pem, thumbprint)).toBe(true);
    });

    it('should work for EC keys', () => {
      const pem = generateEcKeyPem('P-256');
      const thumbprint = calculateJwkThumbprint(pem);
      expect(verifyJwkThumbprint(pem, thumbprint)).toBe(true);
    });
  });

  describe('integration with AgentIdentity', () => {
    it('should produce matching thumbprints with generateAgentKeyPair', async () => {
      const keyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);

      // The keyPair.thumbprint was calculated by the refactored code
      // Verify it matches a fresh calculation
      const freshThumbprint = calculateJwkThumbprint(keyPair.publicKey);
      expect(keyPair.thumbprint).toBe(freshThumbprint);
    });

    it('should verify keyPair thumbprint with verifyJwkThumbprint', async () => {
      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      expect(verifyJwkThumbprint(keyPair.publicKey, keyPair.thumbprint)).toBe(true);
    });
  });

  describe('RFC 7638 canonical ordering', () => {
    it('should use alphabetical key order for OKP (crv, kty, x)', () => {
      // Verify the canonical JSON has keys in alphabetical order
      const pem = generateEd25519KeyPem();
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      // Build expected canonical manually
      const canonical = JSON.stringify({
        crv: jwk.crv,
        kty: 'OKP',
        x: jwk.x,
      });
      const expectedThumbprint = crypto.createHash('sha256').update(canonical).digest('base64url');

      expect(calculateJwkThumbprint(pem)).toBe(expectedThumbprint);
    });

    it('should use alphabetical key order for RSA (e, kty, n)', () => {
      const pem = generateRsaKeyPem();
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      const canonical = JSON.stringify({
        e: jwk.e,
        kty: 'RSA',
        n: jwk.n,
      });
      const expectedThumbprint = crypto.createHash('sha256').update(canonical).digest('base64url');

      expect(calculateJwkThumbprint(pem)).toBe(expectedThumbprint);
    });

    it('should use alphabetical key order for EC (crv, kty, x, y)', () => {
      const pem = generateEcKeyPem('P-256');
      const keyObject = crypto.createPublicKey(pem);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;

      const canonical = JSON.stringify({
        crv: jwk.crv,
        kty: 'EC',
        x: jwk.x,
        y: jwk.y,
      });
      const expectedThumbprint = crypto.createHash('sha256').update(canonical).digest('base64url');

      expect(calculateJwkThumbprint(pem)).toBe(expectedThumbprint);
    });
  });
});
