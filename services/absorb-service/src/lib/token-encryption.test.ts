import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, isEncryptionEnabled, _resetKeyCache } from './token-encryption.js';

// 32-byte test key in hex (64 hex chars)
const TEST_KEY_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
// Same key in base64
const TEST_KEY_B64 = Buffer.from(TEST_KEY_HEX, 'hex').toString('base64');

describe('token-encryption', () => {
  const originalEnv = process.env.ABSORB_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ABSORB_TOKEN_ENCRYPTION_KEY;
    }
    _resetKeyCache();
  });

  describe('with no key configured', () => {
    beforeEach(() => {
      delete process.env.ABSORB_TOKEN_ENCRYPTION_KEY;
      _resetKeyCache();
    });

    it('returns plaintext unchanged when encrypting', () => {
      const token = 'ghp_abc123xyz456';
      expect(encryptToken(token)).toBe(token);
    });

    it('returns stored value unchanged when decrypting', () => {
      const stored = 'ghp_abc123xyz456';
      expect(decryptToken(stored)).toBe(stored);
    });

    it('reports encryption as disabled', () => {
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  describe('with hex key', () => {
    beforeEach(() => {
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX;
      _resetKeyCache();
    });

    it('reports encryption as enabled', () => {
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('encrypts and decrypts a GitHub token', () => {
      const token = 'ghp_abc123xyz456';
      const encrypted = encryptToken(token);

      expect(encrypted).not.toBe(token);
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const token = 'ghp_same_token_twice';
      const a = encryptToken(token);
      const b = encryptToken(token);

      expect(a).not.toBe(b);
      expect(decryptToken(a)).toBe(token);
      expect(decryptToken(b)).toBe(token);
    });

    it('decrypts plaintext tokens transparently (migration)', () => {
      const plaintext = 'ghp_plaintext_from_before_encryption';
      expect(decryptToken(plaintext)).toBe(plaintext);
    });

    it('handles empty string', () => {
      const encrypted = encryptToken('');
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe('');
    });

    it('handles long tokens', () => {
      const longToken = 'ghp_' + 'a'.repeat(1000);
      const encrypted = encryptToken(longToken);
      expect(decryptToken(encrypted)).toBe(longToken);
    });

    it('handles unicode in token values', () => {
      const token = 'token-with-émojis-🔑';
      const encrypted = encryptToken(token);
      expect(decryptToken(encrypted)).toBe(token);
    });
  });

  describe('with base64 key', () => {
    beforeEach(() => {
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = TEST_KEY_B64;
      _resetKeyCache();
    });

    it('encrypts and decrypts with base64 key', () => {
      const token = 'ghp_base64keytest';
      const encrypted = encryptToken(token);
      expect(encrypted).not.toBe(token);
      expect(decryptToken(encrypted)).toBe(token);
    });
  });

  describe('key mismatch', () => {
    it('returns stored value on decryption failure (wrong key)', () => {
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX;
      _resetKeyCache();

      const encrypted = encryptToken('ghp_secret');

      // Switch to a different key
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = 'ff'.repeat(32);
      _resetKeyCache();

      // Should return the encrypted string as-is rather than throwing
      const result = decryptToken(encrypted);
      expect(result).toBe(encrypted);
    });
  });

  describe('encrypted format detection', () => {
    beforeEach(() => {
      process.env.ABSORB_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX;
      _resetKeyCache();
    });

    it('detects plaintext with colons but wrong segment lengths', () => {
      const plaintext = 'not:an:encrypted-value';
      expect(decryptToken(plaintext)).toBe(plaintext);
    });

    it('detects plaintext with no colons', () => {
      const plaintext = 'gho_plaintoken12345';
      expect(decryptToken(plaintext)).toBe(plaintext);
    });
  });
});
