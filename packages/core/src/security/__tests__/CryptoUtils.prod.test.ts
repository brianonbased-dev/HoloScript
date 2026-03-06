/**
 * Security Crypto Utilities — Production Tests
 *
 * Tests sha256, sha512, hmacSha256/verifyHmacSha256,
 * encrypt/decrypt/generateEncryptionKey/exportKey/importKey,
 * randomBytes, randomHex, randomUUID,
 * validateWalletAddress, validateApiKey, sanitizeInput, validateUrl,
 * checkRateLimit/resetRateLimit/resetRateLimits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

// =============================================================================
// HASHING
// =============================================================================

describe('sha256', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await sha256('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same input produces same hash', async () => {
    expect(await sha256('consistent')).toBe(await sha256('consistent'));
  });

  it('different inputs produce different hashes', async () => {
    const h1 = await sha256('aaa');
    const h2 = await sha256('bbb');
    expect(h1).not.toBe(h2);
  });

  it('empty string produces known SHA-256 hash', async () => {
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('accepts ArrayBuffer input', async () => {
    const buf = new TextEncoder().encode('hello').buffer as ArrayBuffer;
    const hash = await sha256(buf);
    expect(hash).toHaveLength(64);
  });
});

describe('sha512', () => {
  it('returns a 128-char hex string', async () => {
    const hash = await sha512('hello');
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('same input is deterministic', async () => {
    expect(await sha512('x')).toBe(await sha512('x'));
  });

  it('differs from sha256 for same input', async () => {
    const h256 = await sha256('test');
    const h512 = await sha512('test');
    expect(h512).not.toBe(h256);
    expect(h512.length).toBeGreaterThan(h256.length);
  });
});

// =============================================================================
// HMAC
// =============================================================================

describe('hmacSha256 / verifyHmacSha256', () => {
  it('returns a 64-char hex string', async () => {
    const sig = await hmacSha256('data', 'secret');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same data+secret produces same signature', async () => {
    const s1 = await hmacSha256('msg', 'key');
    const s2 = await hmacSha256('msg', 'key');
    expect(s1).toBe(s2);
  });

  it('different secret produces different HMAC', async () => {
    const s1 = await hmacSha256('msg', 'secret1');
    const s2 = await hmacSha256('msg', 'secret2');
    expect(s1).not.toBe(s2);
  });

  it('verifyHmacSha256 returns true for correct signature', async () => {
    const sig = await hmacSha256('hello', 'mySecret');
    expect(await verifyHmacSha256('hello', sig, 'mySecret')).toBe(true);
  });

  it('verifyHmacSha256 returns false for wrong data', async () => {
    const sig = await hmacSha256('hello', 'mySecret');
    expect(await verifyHmacSha256('tampered', sig, 'mySecret')).toBe(false);
  });

  it('verifyHmacSha256 returns false for wrong secret', async () => {
    const sig = await hmacSha256('hello', 'secret1');
    expect(await verifyHmacSha256('hello', sig, 'wrongSecret')).toBe(false);
  });
});

// =============================================================================
// AES-GCM ENCRYPTION
// =============================================================================

describe('encrypt / decrypt / generateEncryptionKey / exportKey / importKey', () => {
  it('generateEncryptionKey returns a CryptoKey', async () => {
    const key = await generateEncryptionKey();
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('exportKey returns a base64 string', async () => {
    const key = await generateEncryptionKey();
    const exported = await exportKey(key);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);
  });

  it('importKey round-trips: export → import produces same key material', async () => {
    const key = await generateEncryptionKey();
    const b64 = await exportKey(key);
    const imported = await importKey(b64);
    // Re-export and compare
    const b64Again = await exportKey(imported);
    expect(b64Again).toBe(b64);
  });

  it('encrypt returns ciphertext and iv', async () => {
    const key = await generateEncryptionKey();
    const result = await encrypt('hello world', key);
    expect(typeof result.ciphertext).toBe('string');
    expect(typeof result.iv).toBe('string');
    expect(result.ciphertext.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
  });

  it('ciphertext differs from plaintext', async () => {
    const key = await generateEncryptionKey();
    const result = await encrypt('secret', key);
    expect(result.ciphertext).not.toBe('secret');
  });

  it('decrypt recovers original plaintext', async () => {
    const key = await generateEncryptionKey();
    const plaintext = 'Hello, encrypted world!';
    const { ciphertext, iv } = await encrypt(plaintext, key);
    const decrypted = await decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypt uses different IV each time (non-deterministic)', async () => {
    const key = await generateEncryptionKey();
    const r1 = await encrypt('msg', key);
    const r2 = await encrypt('msg', key);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it('deriveKey → encrypt → decrypt round trip (different ciphertexts, same plaintext)', async () => {
    const key = await generateEncryptionKey();
    const { ciphertext, iv } = await encrypt('round trip', key);
    expect(await decrypt(ciphertext, iv, key)).toBe('round trip');
  });
});

// =============================================================================
// RANDOM
// =============================================================================

describe('randomBytes', () => {
  it('returns Uint8Array of requested length', () => {
    expect(randomBytes(32)).toHaveLength(32);
    expect(randomBytes(0)).toHaveLength(0);
    expect(randomBytes(100)).toHaveLength(100);
  });

  it('two calls produce different values (with high probability)', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });
});

describe('randomHex', () => {
  it('returns hex string of length*2', () => {
    expect(randomHex(16)).toHaveLength(32);
    expect(randomHex(32)).toHaveLength(64);
  });

  it('result is valid hex', () => {
    expect(randomHex(20)).toMatch(/^[0-9a-f]+$/);
  });

  it('two calls produce different values', () => {
    expect(randomHex(16)).not.toBe(randomHex(16));
  });
});

describe('randomUUID', () => {
  it('returns a string', () => {
    expect(typeof randomUUID()).toBe('string');
  });

  it('matches UUID v4 format', () => {
    const uuid = randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique UUIDs', () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});

// =============================================================================
// VALIDATION
// =============================================================================

describe('validateWalletAddress', () => {
  // Ethereum
  it('accepts valid ethereum address', () => {
    expect(validateWalletAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12')).toBe(true);
  });

  it('rejects ethereum address without 0x prefix', () => {
    expect(validateWalletAddress('AbCdEf1234567890AbCdEf1234567890AbCdEf12')).toBe(false);
  });

  it('rejects ethereum address that is too short', () => {
    expect(validateWalletAddress('0x1234')).toBe(false);
  });

  it('rejects ethereum address with invalid chars', () => {
    expect(validateWalletAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
  });

  // Solana
  it('accepts valid solana address', () => {
    expect(validateWalletAddress('4Nd1mBQtrMJVYVfKf2PX98AgulaHTtbZbqBfCGpp..base58', 'solana')).toBe(false);
    // Real-looking Solana base58
    expect(validateWalletAddress('DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm3d', 'solana')).toBe(true);
  });

  it('rejects solana address that is too short', () => {
    expect(validateWalletAddress('short', 'solana')).toBe(false);
  });
});

describe('validateApiKey', () => {
  it('accepts valid 32-char alphanumeric key', () => {
    expect(validateApiKey('abcdef1234567890ABCDEF1234567890')).toBe(true);
  });

  it('accepts key with hyphens and underscores', () => {
    expect(validateApiKey('valid-key_1234567890abcdefABCDEF12')).toBe(true);
  });

  it('rejects key shorter than 32 chars', () => {
    expect(validateApiKey('short')).toBe(false);
  });

  it('rejects key with spaces', () => {
    expect(validateApiKey('this key has spaces which is bad here!!!')).toBe(false);
  });

  it('rejects key with special chars', () => {
    expect(validateApiKey('key!with@special#chars$here%^&*()1234')).toBe(false);
  });
});

describe('sanitizeInput', () => {
  it('removes script tags and their content', () => {
    expect(sanitizeInput('<script>alert("xss")</script>hello')).toBe('hello');
  });

  it('removes style tags', () => {
    expect(sanitizeInput('<style>body{display:none}</style>text')).toBe('text');
  });

  it('strips all HTML tags', () => {
    expect(sanitizeInput('<p>hello <b>world</b></p>')).toBe('hello world');
  });

  it('removes javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).not.toContain('javascript:');
  });

  it('removes inline event handlers', () => {
    const result = sanitizeInput('<a onclick=alert(1)>click</a>');
    expect(result).not.toContain('onclick');
  });

  it('removes SQL DROP TABLE pattern', () => {
    expect(sanitizeInput("x; DROP TABLE users")).not.toContain('DROP TABLE');
  });

  it('removes SQL DELETE FROM pattern', () => {
    expect(sanitizeInput("'; DELETE FROM accounts")).not.toContain('DELETE FROM');
  });

  it('removes SQL comments (--)', () => {
    expect(sanitizeInput("admin'-- ")).not.toContain('--');
  });

  it('trims whitespace from result', () => {
    expect(sanitizeInput('   hello   ')).toBe('hello');
  });

  it('returns plain string unchanged (no mutation of safe input)', () => {
    expect(sanitizeInput('hello world 123')).toBe('hello world 123');
  });
});

describe('validateUrl', () => {
  it('accepts https URL', () => {
    expect(validateUrl('https://example.com')).toBe(true);
  });

  it('accepts wss URL by default', () => {
    expect(validateUrl('wss://api.example.com/ws')).toBe(true);
  });

  it('rejects http URL (not in defaults)', () => {
    expect(validateUrl('http://insecure.com')).toBe(false);
  });

  it('rejects ftp URL', () => {
    expect(validateUrl('ftp://files.example.com')).toBe(false);
  });

  it('rejects malformed URL', () => {
    expect(validateUrl('not-a-url')).toBe(false);
  });

  it('accepts custom allowed protocol', () => {
    expect(validateUrl('http://example.com', ['http', 'https'])).toBe(true);
  });
});

// =============================================================================
// RATE LIMITING
// =============================================================================

describe('checkRateLimit / resetRateLimit / resetRateLimits', () => {
  beforeEach(() => resetRateLimits());

  it('first request is allowed', () => {
    const r = checkRateLimit('key1', 5, 60000);
    expect(r.allowed).toBe(true);
  });

  it('remaining decrements with each allowed request', () => {
    checkRateLimit('key2', 3, 60000);
    const r = checkRateLimit('key2', 3, 60000);
    expect(r.remaining).toBe(1);
  });

  it('request is denied when max exceeded', () => {
    checkRateLimit('key3', 1, 60000);
    const r = checkRateLimit('key3', 1, 60000);
    expect(r.allowed).toBe(false);
  });

  it('remaining is 0 when denied', () => {
    checkRateLimit('key4', 1, 60000);
    const r = checkRateLimit('key4', 1, 60000);
    expect(r.remaining).toBe(0);
  });

  it('resetAt is in the future', () => {
    const r = checkRateLimit('key5', 10, 60000);
    expect(r.resetAt).toBeGreaterThan(Date.now());
  });

  it('different keys are independent', () => {
    checkRateLimit('alpha', 1, 60000);
    checkRateLimit('alpha', 1, 60000); // exhaust alpha
    const r = checkRateLimit('beta', 1, 60000);
    expect(r.allowed).toBe(true);
  });

  it('resetRateLimit allows new window for that key', () => {
    checkRateLimit('key6', 1, 60000);
    checkRateLimit('key6', 1, 60000); // exhausted
    resetRateLimit('key6');
    const r = checkRateLimit('key6', 1, 60000);
    expect(r.allowed).toBe(true);
  });

  it('resetRateLimits clears all keys', () => {
    checkRateLimit('k1', 1, 60000);
    checkRateLimit('k1', 1, 60000);
    checkRateLimit('k2', 1, 60000);
    checkRateLimit('k2', 1, 60000);
    resetRateLimits();
    expect(checkRateLimit('k1', 1, 60000).allowed).toBe(true);
    expect(checkRateLimit('k2', 1, 60000).allowed).toBe(true);
  });
});
