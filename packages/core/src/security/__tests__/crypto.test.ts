/**
 * Security Crypto Tests
 *
 * Tests for cryptographic utilities including hashing, encryption, and validation.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sha256,
  sha512,
  hmacSha256,
  verifyHmacSha256,
  encrypt,
  decrypt,
  generateEncryptionKey,
  exportKey,
  importKey,
  randomBytes,
  randomHex,
  randomUUID,
  deriveKey,
  validateWalletAddress,
  validateApiKey,
  sanitizeInput,
  checkRateLimit,
  resetRateLimits,
} from '../crypto';

describe('Hashing Functions', () => {
  describe('sha256', () => {
    it('should generate SHA-256 hash of string', async () => {
      const hash = await sha256('hello world');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // 256 bits = 32 bytes = 64 hex chars
    });

    it('should produce consistent hashes', async () => {
      const hash1 = await sha256('test data');
      const hash2 = await sha256('test data');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', async () => {
      const hash1 = await sha256('data1');
      const hash2 = await sha256('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should hash empty string', async () => {
      const hash = await sha256('');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should hash special characters', async () => {
      const hash = await sha256('こんにちは世界 🌍 !@#$%');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should hash long strings', async () => {
      const longString = 'a'.repeat(100000);
      const hash = await sha256(longString);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  describe('sha512', () => {
    it('should generate SHA-512 hash', async () => {
      const hash = await sha512('hello world');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(128); // 512 bits = 64 bytes = 128 hex chars
    });

    it('should produce consistent hashes', async () => {
      const hash1 = await sha512('test data');
      const hash2 = await sha512('test data');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', async () => {
      const hash1 = await sha512('data1');
      const hash2 = await sha512('data2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hmacSha256', () => {
    it('should generate HMAC-SHA256 signature', async () => {
      const signature = await hmacSha256('hello world', 'secret-key');

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64);
    });

    it('should produce consistent signatures', async () => {
      const sig1 = await hmacSha256('data', 'key');
      const sig2 = await hmacSha256('data', 'key');

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures with different keys', async () => {
      const sig1 = await hmacSha256('data', 'key1');
      const sig2 = await hmacSha256('data', 'key2');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures with different data', async () => {
      const sig1 = await hmacSha256('data1', 'key');
      const sig2 = await hmacSha256('data2', 'key');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyHmacSha256', () => {
    it('should verify valid signature', async () => {
      const signature = await hmacSha256('hello world', 'secret-key');
      const isValid = await verifyHmacSha256('hello world', signature, 'secret-key');

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const isValid = await verifyHmacSha256('hello world', 'invalid-signature', 'secret-key');

      expect(isValid).toBe(false);
    });

    it('should reject tampered data', async () => {
      const signature = await hmacSha256('original data', 'secret-key');
      const isValid = await verifyHmacSha256('tampered data', signature, 'secret-key');

      expect(isValid).toBe(false);
    });

    it('should reject wrong key', async () => {
      const signature = await hmacSha256('data', 'correct-key');
      const isValid = await verifyHmacSha256('data', signature, 'wrong-key');

      expect(isValid).toBe(false);
    });
  });
});

describe('Encryption Functions', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Hello, World!';

      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Same data';

      const result1 = await encrypt(plaintext, key);
      const result2 = await encrypt(plaintext, key);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should handle empty string', async () => {
      const key = await generateEncryptionKey();
      const plaintext = '';

      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'a'.repeat(10000);

      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'こんにちは世界 🌍 {JSON: "test"} <html>';

      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail with wrong key', async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();
      const plaintext = 'Secret data';

      const { ciphertext, iv } = await encrypt(plaintext, key1);

      await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
    });

    it('should fail with wrong IV', async () => {
      const key = await generateEncryptionKey();
      const plaintext = 'Secret data';

      const { ciphertext } = await encrypt(plaintext, key);
      const wrongIv = btoa(String.fromCharCode(...randomBytes(12)));

      await expect(decrypt(ciphertext, wrongIv, key)).rejects.toThrow();
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate valid AES-256 key', async () => {
      const key = await generateEncryptionKey();

      expect(key).toBeDefined();
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should generate unique keys', async () => {
      const key1 = await generateEncryptionKey();
      const key2 = await generateEncryptionKey();

      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);

      expect(exported1).not.toBe(exported2);
    });
  });

  describe('exportKey/importKey', () => {
    it('should export and import key', async () => {
      const key = await generateEncryptionKey();
      const exported = await exportKey(key);
      const imported = await importKey(exported);

      // Verify imported key works
      const plaintext = 'Test data';
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, imported);

      expect(decrypted).toBe(plaintext);
    });

    it('should export as base64 string', async () => {
      const key = await generateEncryptionKey();
      const exported = await exportKey(key);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
    });
  });
});

describe('Random Functions', () => {
  describe('randomBytes', () => {
    it('should generate random bytes', () => {
      const bytes = randomBytes(16);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('should generate different values each time', () => {
      const bytes1 = randomBytes(16);
      const bytes2 = randomBytes(16);

      expect(bytes1).not.toEqual(bytes2);
    });

    it('should respect length parameter', () => {
      const lengths = [8, 16, 32, 64, 128];

      for (const length of lengths) {
        const bytes = randomBytes(length);
        expect(bytes.length).toBe(length);
      }
    });
  });

  describe('randomHex', () => {
    it('should generate hex string', () => {
      const hex = randomHex(16);

      expect(typeof hex).toBe('string');
      expect(hex.length).toBe(32); // 16 bytes = 32 hex chars
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it('should generate different values each time', () => {
      const hex1 = randomHex(16);
      const hex2 = randomHex(16);

      expect(hex1).not.toBe(hex2);
    });
  });

  describe('randomUUID', () => {
    it('should generate valid UUID', () => {
      const uuid = randomUUID();

      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBe(36);
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)).toBe(
        true
      );
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set();

      for (let i = 0; i < 100; i++) {
        uuids.add(randomUUID());
      }

      expect(uuids.size).toBe(100);
    });
  });
});

describe('Key Derivation', () => {
  describe('deriveKey', () => {
    it('should derive key from password', async () => {
      const key = await deriveKey('password123', 'random-salt');

      expect(key).toBeDefined();
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should produce consistent keys with same inputs', async () => {
      const key1 = await deriveKey('password', 'salt');
      const key2 = await deriveKey('password', 'salt');

      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);

      expect(exported1).toBe(exported2);
    });

    it('should produce different keys with different passwords', async () => {
      const key1 = await deriveKey('password1', 'salt');
      const key2 = await deriveKey('password2', 'salt');

      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);

      expect(exported1).not.toBe(exported2);
    });

    it('should produce different keys with different salts', async () => {
      const key1 = await deriveKey('password', 'salt1');
      const key2 = await deriveKey('password', 'salt2');

      const exported1 = await exportKey(key1);
      const exported2 = await exportKey(key2);

      expect(exported1).not.toBe(exported2);
    });

    it('should work with derived key for encryption', async () => {
      const key = await deriveKey('my-password', 'my-salt');
      const plaintext = 'Secret message';

      const { ciphertext, iv } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('Validation Functions', () => {
  describe('validateWalletAddress', () => {
    it('should validate Ethereum addresses', () => {
      expect(validateWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f8fB3d', 'ethereum')).toBe(
        true
      );
      expect(validateWalletAddress('0x1234567890abcdef1234567890abcdef12345678', 'ethereum')).toBe(
        true
      );
    });

    it('should reject invalid Ethereum addresses', () => {
      expect(validateWalletAddress('0x123', 'ethereum')).toBe(false);
      expect(validateWalletAddress('invalid', 'ethereum')).toBe(false);
      expect(validateWalletAddress('742d35Cc6634C0532925a3b844Bc9e7595f8fB3d', 'ethereum')).toBe(
        false
      );
    });

    it('should validate Solana addresses', () => {
      expect(validateWalletAddress('7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs', 'solana')).toBe(
        true
      );
    });

    it('should reject invalid Solana addresses', () => {
      expect(validateWalletAddress('short', 'solana')).toBe(false);
      expect(validateWalletAddress('0x1234567890abcdef1234567890abcdef12345678', 'solana')).toBe(
        false
      );
    });

    it('should reject unknown chain types', () => {
      expect(
        validateWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f8fB3d', 'unknown' as any)
      ).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    it('should validate proper API key format', () => {
      expect(validateApiKey('hs_live_abcd1234567890abcd1234567890ab')).toBe(true);
      expect(validateApiKey('hs_test_1234567890123456789012345678')).toBe(true);
    });

    it('should reject short API keys', () => {
      expect(validateApiKey('hs_live_short')).toBe(false);
    });

    it('should reject keys with invalid prefix', () => {
      expect(validateApiKey('invalid_prefix_1234567890123456')).toBe(false);
    });

    it('should reject empty keys', () => {
      expect(validateApiKey('')).toBe(false);
    });
  });
});

describe('Sanitization Functions', () => {
  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<script>');
    });

    it('should escape special characters', () => {
      const result = sanitizeInput('<div onclick="evil()">content</div>');

      expect(result).not.toContain('<div');
      expect(result).not.toContain('onclick');
    });

    it('should preserve safe text', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle SQL injection attempts', () => {
      const result = sanitizeInput("'; DROP TABLE users; --");

      expect(result).not.toContain('DROP TABLE');
    });
  });
});

describe('Rate Limiting', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit('user-1', 10, 60000).allowed).toBe(true);
      }
    });

    it('should block requests over limit', () => {
      const key = 'user-limited';

      for (let i = 0; i < 5; i++) {
        checkRateLimit(key, 5, 60000);
      }

      // 6th request should be blocked
      expect(checkRateLimit(key, 5, 60000).allowed).toBe(false);
    });

    it('should track different keys separately', () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit('user-a', 5, 60000);
      }

      // User A is at limit
      expect(checkRateLimit('user-a', 5, 60000).allowed).toBe(false);

      // User B should still have quota
      expect(checkRateLimit('user-b', 5, 60000).allowed).toBe(true);
    });

    it('should reset after window expires', async () => {
      const key = 'user-expire';

      for (let i = 0; i < 3; i++) {
        checkRateLimit(key, 3, 100); // 100ms window
      }

      expect(checkRateLimit(key, 3, 100).allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(checkRateLimit(key, 3, 100).allowed).toBe(true);
    });
  });

  describe('resetRateLimits', () => {
    it('should clear all rate limit data', () => {
      // Fill up some limits
      for (let i = 0; i < 10; i++) {
        checkRateLimit('user-1', 10, 60000);
        checkRateLimit('user-2', 10, 60000);
      }

      resetRateLimits();

      // Both should be allowed again
      expect(checkRateLimit('user-1', 10, 60000).allowed).toBe(true);
      expect(checkRateLimit('user-2', 10, 60000).allowed).toBe(true);
    });
  });
});
