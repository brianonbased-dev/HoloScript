/**
 * SecurityFramework — production test suite
 *
 * Tests: PBKDF2 token hashing/verification, AES-256-GCM encryption,
 * token generation, RBAC permission checks, and token-bucket rate limiting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  secureHashToken,
  verifyToken,
  generateRandomToken,
  encryptData,
  decryptData,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  RateLimiter,
  Permission,
} from '../SecurityFramework';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SecurityFramework: production', () => {
  // ─── Token Hashing ──────────────────────────────────────────────────────
  describe('secureHashToken', () => {
    it('returns a hash and salt', () => {
      const { hash, salt } = secureHashToken('mySecret', undefined, 1000);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      expect(typeof salt).toBe('string');
      expect(salt.length).toBeGreaterThan(0);
    });

    it('two calls with different salts produce different hashes', () => {
      const r1 = secureHashToken('sameToken', undefined, 1000);
      const r2 = secureHashToken('sameToken', undefined, 1000);
      // Salts should differ
      expect(r1.salt).not.toBe(r2.salt);
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('same token + same salt produces same hash', () => {
      const { hash, salt } = secureHashToken('stable', undefined, 1000);
      const saltBuf = Buffer.from(salt, 'hex');
      const { hash: hash2 } = secureHashToken('stable', saltBuf, 1000);
      expect(hash).toBe(hash2);
    });
  });

  // ─── Token Verification ──────────────────────────────────────────────────
  describe('verifyToken', () => {
    it('returns true for a matching token', () => {
      const { hash, salt } = secureHashToken('correctPassword', undefined, 1000);
      expect(verifyToken('correctPassword', hash, salt, 1000)).toBe(true);
    });

    it('returns false for wrong token', () => {
      const { hash, salt } = secureHashToken('realPassword', undefined, 1000);
      expect(verifyToken('wrongPassword', hash, salt, 1000)).toBe(false);
    });

    it('returns false for tampered hash', () => {
      const { salt } = secureHashToken('pass', undefined, 1000);
      expect(verifyToken('pass', 'deadbeef'.repeat(8), salt, 1000)).toBe(false);
    });
  });

  // ─── Random Token Generation ─────────────────────────────────────────────
  describe('generateRandomToken', () => {
    it('generates a hex string', () => {
      const token = generateRandomToken(32);
      expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
    });

    it('default length produces a long-enough token', () => {
      const token = generateRandomToken();
      expect(token.length).toBeGreaterThanOrEqual(32);
    });

    it('two calls produce different tokens', () => {
      expect(generateRandomToken(32)).not.toBe(generateRandomToken(32));
    });
  });

  // ─── AES-256-GCM Encryption ──────────────────────────────────────────────
  describe('encryptData / decryptData', () => {
    const KEY = 'a'.repeat(32);

    it('encrypts and decrypts data correctly', () => {
      const plaintext = 'Hello HoloScript!';
      const { encrypted, iv, authTag } = encryptData(plaintext, KEY);
      const result = decryptData(encrypted, KEY, iv, authTag);
      expect(result).toBe(plaintext);
    });

    it('different plaintexts produce different ciphertexts', () => {
      const a = encryptData('aaaa', KEY);
      const b = encryptData('bbbb', KEY);
      expect(a.encrypted).not.toBe(b.encrypted);
    });

    it('two encryptions of same plaintext use different IVs', () => {
      const a = encryptData('same', KEY);
      const b = encryptData('same', KEY);
      expect(a.iv).not.toBe(b.iv);
    });

    it('decryption fails with wrong key', () => {
      const { encrypted, iv, authTag } = encryptData('secret', KEY);
      expect(() => decryptData(encrypted, 'b'.repeat(32), iv, authTag)).toThrow();
    });

    it('decryption fails with tampered ciphertext', () => {
      const { encrypted, iv, authTag } = encryptData('data', KEY);
      const tampered = encrypted.slice(0, -2) + '00';
      expect(() => decryptData(tampered, KEY, iv, authTag)).toThrow();
    });

    it('round-trips unicode data', () => {
      const data = '🌍 HoloScript is 超絶 cool!';
      const { encrypted, iv, authTag } = encryptData(data, KEY);
      expect(decryptData(encrypted, KEY, iv, authTag)).toBe(data);
    });
  });

  // ─── RBAC Permissions ────────────────────────────────────────────────────
  describe('hasPermission', () => {
    it('admin has all permissions', () => {
      expect(hasPermission('admin', Permission.ADMIN_ALL)).toBe(true);
    });

    it('user can view scenes', () => {
      expect(hasPermission('user', Permission.VIEW_SCENE)).toBe(true);
    });

    it('user cannot admin', () => {
      expect(hasPermission('user', Permission.ADMIN_ALL)).toBe(false);
    });

    it('moderator can edit scenes', () => {
      expect(hasPermission('moderator', Permission.EDIT_SCENE)).toBe(true);
    });

    it('unknown role has no permissions', () => {
      expect(hasPermission('hacker', Permission.VIEW_SCENE)).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true when role has all listed permissions', () => {
      expect(hasAllPermissions('moderator', [Permission.VIEW_SCENE, Permission.EDIT_SCENE])).toBe(
        true
      );
    });

    it('returns false when role is missing any permission', () => {
      expect(hasAllPermissions('user', [Permission.VIEW_SCENE, Permission.ADMIN_ALL])).toBe(false);
    });

    it('returns true for empty permission list', () => {
      expect(hasAllPermissions('user', [])).toBe(true);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when role has at least one permission', () => {
      expect(hasAnyPermission('user', [Permission.ADMIN_ALL, Permission.VIEW_SCENE])).toBe(true);
    });

    it('returns false when role has none', () => {
      expect(hasAnyPermission('user', [Permission.ADMIN_ALL])).toBe(false);
    });

    it('returns false for empty list', () => {
      expect(hasAnyPermission('user', [])).toBe(false);
    });
  });

  // ─── Rate Limiter ────────────────────────────────────────────────────────
  describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter({ capacity: 5, refillRate: 1, windowMs: 1000 });
    });

    it('allows requests within capacity', () => {
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('user1')).toBe(true);
      }
    });

    it('blocks requests above capacity', () => {
      for (let i = 0; i < 5; i++) limiter.isAllowed('user1');
      expect(limiter.isAllowed('user1')).toBe(false);
    });

    it('different keys have independent buckets', () => {
      for (let i = 0; i < 5; i++) limiter.isAllowed('user1');
      expect(limiter.isAllowed('user2')).toBe(true);
    });

    it('getRemainingTokens decreases as requests are made', () => {
      const initial = limiter.getRemainingTokens('user1');
      limiter.isAllowed('user1');
      limiter.isAllowed('user1');
      expect(limiter.getRemainingTokens('user1')).toBeLessThan(initial);
    });

    it('reset restores bucket to full capacity', () => {
      for (let i = 0; i < 5; i++) limiter.isAllowed('user1');
      limiter.reset('user1');
      expect(limiter.isAllowed('user1')).toBe(true);
    });

    it('clearAll removes all tracked keys', () => {
      limiter.isAllowed('a');
      limiter.isAllowed('b');
      limiter.clearAll();
      // Both can now make full requests again
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('a')).toBe(true);
        expect(limiter.isAllowed('b')).toBe(true);
      }
    });
  });
});
