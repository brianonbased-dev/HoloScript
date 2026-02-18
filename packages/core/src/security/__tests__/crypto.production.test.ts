/**
 * Security Crypto — Production Hardening Test Suite
 *
 * Commence All V — Track 3: Security Hardening
 *
 * Comprehensive tests for all validation and crypto utility functions
 * from security/crypto.ts. Verifies:
 *  - SHA-256/SHA-512 hashing gives stable hex outputs
 *  - HMAC-SHA256 sign + verify
 *  - AES-GCM encrypt/decrypt roundtrip
 *  - Key export/import roundtrip
 *  - Wallet address validation (Ethereum & Solana)
 *  - API key validation
 *  - Input sanitization (XSS, SQL injection, event handlers)
 *  - URL validation (allowed protocols)
 *  - Rate limiting (window, remaining, reset)
 *  - Random utilities (randomBytes, randomHex, randomUUID)
 */

import { describe, it, expect, afterEach } from 'vitest';
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
  validateWalletAddress,
  validateApiKey,
  sanitizeInput,
  validateUrl,
  checkRateLimit,
  resetRateLimit,
  resetRateLimits,
} from '../crypto';

// ===========================================================================
// SHA-256
// ===========================================================================

describe('SHA-256 Hashing', () => {
  it('produces 64-char hex string', async () => {
    const hash = await sha256('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256('test-data');
    const b = await sha256('test-data');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', async () => {
    const a = await sha256('input-a');
    const b = await sha256('input-b');
    expect(a).not.toBe(b);
  });

  it('hashes empty string', async () => {
    const hash = await sha256('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles special characters', async () => {
    const hash = await sha256('🔒<script>alert(1)</script>');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ===========================================================================
// SHA-512
// ===========================================================================

describe('SHA-512 Hashing', () => {
  it('produces 128-char hex string', async () => {
    const hash = await sha512('hello');
    expect(hash).toMatch(/^[a-f0-9]{128}$/);
  });

  it('is deterministic', async () => {
    const a = await sha512('test');
    const b = await sha512('test');
    expect(a).toBe(b);
  });

  it('different from SHA-256 of same input', async () => {
    const h256 = await sha256('same-input');
    const h512 = await sha512('same-input');
    expect(h256).not.toBe(h512);
    expect(h512.length).toBe(128); // vs 64 for SHA-256
  });
});

// ===========================================================================
// HMAC-SHA256
// ===========================================================================

describe('HMAC-SHA256', () => {
  it('produces hex signature', async () => {
    const sig = await hmacSha256('message', 'secret');
    expect(sig).toMatch(/^[a-f0-9]+$/);
  });

  it('different secrets produce different signatures', async () => {
    const a = await hmacSha256('message', 'secret-a');
    const b = await hmacSha256('message', 'secret-b');
    expect(a).not.toBe(b);
  });

  it('verifyHmacSha256 returns true for valid signature', async () => {
    const sig = await hmacSha256('data', 'key');
    const valid = await verifyHmacSha256('data', sig, 'key');
    expect(valid).toBe(true);
  });

  it('verifyHmacSha256 returns false for wrong secret', async () => {
    const sig = await hmacSha256('data', 'correct-key');
    const valid = await verifyHmacSha256('data', sig, 'wrong-key');
    expect(valid).toBe(false);
  });

  it('verifyHmacSha256 returns false for tampered data', async () => {
    const sig = await hmacSha256('original', 'key');
    const valid = await verifyHmacSha256('tampered', sig, 'key');
    expect(valid).toBe(false);
  });
});

// ===========================================================================
// AES-GCM Encryption
// ===========================================================================

describe('AES-GCM Encryption', () => {
  it('encrypt/decrypt roundtrip', async () => {
    const key = await generateEncryptionKey();
    const plaintext = 'sensitive data 🔐';
    const { ciphertext, iv } = await encrypt(plaintext, key);
    const decrypted = await decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  it('ciphertext differs from plaintext', async () => {
    const key = await generateEncryptionKey();
    const { ciphertext } = await encrypt('hello world', key);
    expect(ciphertext).not.toBe('hello world');
  });

  it('different IVs for same plaintext', async () => {
    const key = await generateEncryptionKey();
    const r1 = await encrypt('same-data', key);
    const r2 = await encrypt('same-data', key);
    // IVs should differ (random)
    expect(r1.iv).not.toBe(r2.iv);
  });

  it('wrong key fails decryption', async () => {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();
    const { ciphertext, iv } = await encrypt('secret', key1);
    await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
  });
});

// ===========================================================================
// Key Export/Import
// ===========================================================================

describe('Key Export/Import', () => {
  it('exported key is base64 string', async () => {
    const key = await generateEncryptionKey();
    const exported = await exportKey(key);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);
  });

  it('import/export roundtrip preserves decryption ability', async () => {
    const key = await generateEncryptionKey();
    const exported = await exportKey(key);
    const imported = await importKey(exported);
    const { ciphertext, iv } = await encrypt('roundtrip test', key);
    const decrypted = await decrypt(ciphertext, iv, imported);
    expect(decrypted).toBe('roundtrip test');
  });
});

// ===========================================================================
// Random Utilities
// ===========================================================================

describe('Random Utilities', () => {
  describe('randomBytes', () => {
    it('generates correct length', () => {
      const bytes = randomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('generates different values each time', () => {
      const a = randomBytes(32);
      const b = randomBytes(32);
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe('randomHex', () => {
    it('produces hex string of correct length', () => {
      const hex = randomHex(16);
      expect(hex).toMatch(/^[a-f0-9]{32}$/);
    });

    it('different each time', () => {
      const a = randomHex(16);
      const b = randomHex(16);
      expect(a).not.toBe(b);
    });
  });

  describe('randomUUID', () => {
    it('produces valid UUID v4 format', () => {
      const uuid = randomUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 10 }, () => randomUUID()));
      expect(uuids.size).toBe(10);
    });
  });
});

// ===========================================================================
// Wallet Address Validation
// ===========================================================================

describe('Wallet Address Validation', () => {
  describe('Ethereum', () => {
    it('valid address', () => {
      expect(validateWalletAddress('0x742d35cc6634C0532925a3b844Bc9e7595f2bD68')).toBe(true);
    });

    it('all lowercase', () => {
      expect(validateWalletAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('rejects without 0x prefix', () => {
      expect(validateWalletAddress('742d35cc6634C0532925a3b844Bc9e7595f2bD68')).toBe(false);
    });

    it('rejects too short', () => {
      expect(validateWalletAddress('0x742d35cc')).toBe(false);
    });

    it('rejects too long', () => {
      expect(validateWalletAddress('0x742d35cc6634C0532925a3b844Bc9e7595f2bD6800')).toBe(false);
    });

    it('rejects non-hex characters', () => {
      expect(validateWalletAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validateWalletAddress('')).toBe(false);
    });
  });

  describe('Solana', () => {
    it('valid 44-char address', () => {
      expect(
        validateWalletAddress('5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8', 'solana')
      ).toBe(true);
    });

    it('valid 32-char address', () => {
      expect(validateWalletAddress('11111111111111111111111111111111', 'solana')).toBe(true);
    });

    it('rejects too short', () => {
      expect(validateWalletAddress('abc', 'solana')).toBe(false);
    });

    it('rejects characters not in base58', () => {
      // '0', 'O', 'I', 'l' are not in base58
      expect(
        validateWalletAddress('0YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8', 'solana')
      ).toBe(false);
    });
  });
});

// ===========================================================================
// API Key Validation
// ===========================================================================

describe('API Key Validation', () => {
  it('valid 32-char key', () => {
    expect(validateApiKey('a'.repeat(32))).toBe(true);
  });

  it('valid with dashes and underscores', () => {
    expect(validateApiKey('abc-def_ghi-123-456-789-012-345-6')).toBe(true);
  });

  it('rejects shorter than 32 chars', () => {
    expect(validateApiKey('short')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(validateApiKey('a!@#$%^&*()' + 'a'.repeat(30))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateApiKey('')).toBe(false);
  });
});

// ===========================================================================
// Input Sanitization
// ===========================================================================

describe('Input Sanitization', () => {
  it('strips script tags', () => {
    expect(sanitizeInput('<script>alert("xss")</script>hello')).toBe('hello');
  });

  it('strips style tags', () => {
    expect(sanitizeInput('<style>body{display:none}</style>text')).toBe('text');
  });

  it('strips HTML tags', () => {
    expect(sanitizeInput('<div><b>bold</b></div>')).toBe('bold');
  });

  it('strips javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
  });

  it('strips event handlers', () => {
    const result = sanitizeInput('onclick=alert(1) test');
    expect(result).not.toContain('onclick=');
  });

  it('strips data: URIs', () => {
    expect(sanitizeInput('data:text/html,<h1>hack</h1>')).toBe('text/html,hack');
  });

  it('strips SQL injection patterns', () => {
    const input = '; DROP TABLE users';
    const result = sanitizeInput(input);
    expect(result).not.toContain('DROP TABLE');
  });

  it('strips DELETE FROM', () => {
    expect(sanitizeInput('; DELETE FROM users')).not.toContain('DELETE FROM');
  });

  it('strips SQL comments', () => {
    expect(sanitizeInput('value -- comment')).not.toContain('--');
  });

  it('preserves safe text', () => {
    expect(sanitizeInput('Hello, world!')).toBe('Hello, world!');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });
});

// ===========================================================================
// URL Validation
// ===========================================================================

describe('URL Validation', () => {
  it('accepts HTTPS URLs', () => {
    expect(validateUrl('https://example.com')).toBe(true);
  });

  it('accepts WSS URLs', () => {
    expect(validateUrl('wss://socket.example.com')).toBe(true);
  });

  it('rejects HTTP URLs by default', () => {
    expect(validateUrl('http://example.com')).toBe(false);
  });

  it('rejects WS URLs by default', () => {
    expect(validateUrl('ws://example.com')).toBe(false);
  });

  it('accepts custom protocols', () => {
    expect(validateUrl('http://example.com', ['http', 'https'])).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(validateUrl('not-a-url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateUrl('')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(validateUrl('data:text/html')).toBe(false);
  });
});

// ===========================================================================
// Rate Limiting
// ===========================================================================

describe('Rate Limiting', () => {
  afterEach(() => {
    resetRateLimits();
  });

  it('allows requests within limit', () => {
    const result = checkRateLimit('test-key', 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks usage correctly', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('key2', 5, 60000);
    }
    const result = checkRateLimit('key2', 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('blocks after limit exceeded', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('key3', 5, 60000);
    }
    const result = checkRateLimit('key3', 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resetRateLimit clears specific key', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('key4', 5, 60000);
    }
    resetRateLimit('key4');
    const result = checkRateLimit('key4', 5, 60000);
    expect(result.allowed).toBe(true);
  });

  it('resetRateLimits clears all keys', () => {
    checkRateLimit('keyA', 1, 60000);
    checkRateLimit('keyB', 1, 60000);
    resetRateLimits();
    expect(checkRateLimit('keyA', 1, 60000).allowed).toBe(true);
    expect(checkRateLimit('keyB', 1, 60000).allowed).toBe(true);
  });

  it('result includes resetAt timestamp', () => {
    const before = Date.now();
    const result = checkRateLimit('key5', 5, 60000);
    expect(result.resetAt).toBeGreaterThanOrEqual(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 120000);
  });

  it('independent keys do not interfere', () => {
    checkRateLimit('user-1', 1, 60000);
    const result = checkRateLimit('user-2', 1, 60000);
    expect(result.allowed).toBe(true);
  });
});
