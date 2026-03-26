/**
 * Token Encryption at Rest
 *
 * AES-256-GCM encryption for OAuth tokens stored in the database.
 * Uses ABSORB_TOKEN_ENCRYPTION_KEY env var (32-byte hex or base64).
 *
 * Format: <iv-hex>:<auth-tag-hex>:<ciphertext-hex>
 * This format is deterministic in structure but non-deterministic in value
 * (random IV per encryption), making it safe for column storage.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

let _keyBuffer: Buffer | null = null;

function getEncryptionKey(): Buffer | null {
  if (_keyBuffer) return _keyBuffer;

  const raw = process.env.ABSORB_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  try {
    // Try hex first (64 chars = 32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      _keyBuffer = Buffer.from(raw, 'hex');
      return _keyBuffer;
    }
    // Try base64 (44 chars = 32 bytes)
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) {
      _keyBuffer = buf;
      return _keyBuffer;
    }
    // Try raw UTF-8 if exactly 32 bytes
    const utf8 = Buffer.from(raw, 'utf8');
    if (utf8.length === 32) {
      _keyBuffer = utf8;
      return _keyBuffer;
    }
  } catch {
    // Fall through
  }

  console.warn('[token-encryption] ABSORB_TOKEN_ENCRYPTION_KEY is set but invalid (need 32 bytes as hex/base64/utf8)');
  return null;
}

/**
 * Encrypt a plaintext token for database storage.
 * Returns the encrypted string in `iv:tag:ciphertext` hex format.
 * If no encryption key is configured, returns plaintext unchanged (graceful degradation).
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a stored token back to plaintext.
 * Detects whether the value is encrypted (has `iv:tag:ciphertext` format) or plaintext.
 * This enables transparent migration — existing plaintext tokens still work.
 */
export function decryptToken(stored: string): string {
  const key = getEncryptionKey();
  if (!key) return stored;

  // Detect encrypted format: three hex segments separated by colons
  const parts = stored.split(':');
  if (parts.length !== 3) return stored; // Plaintext — not encrypted

  const [ivHex, tagHex, ciphertextHex] = parts;

  // Validate hex format (IV = 24 hex chars, tag = 32 hex chars)
  if (ivHex.length !== IV_LENGTH * 2 || tagHex.length !== AUTH_TAG_LENGTH * 2) {
    return stored; // Not our format, return as-is
  }

  if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(tagHex) || !/^[0-9a-fA-F]*$/.test(ciphertextHex)) {
    return stored; // Contains non-hex chars, must be plaintext
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Decryption failed — possibly plaintext that happened to match format, or wrong key
    return stored;
  }
}

/**
 * Check whether token encryption is enabled (key is configured and valid).
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

/** Reset cached key — for testing only */
export function _resetKeyCache(): void {
  _keyBuffer = null;
}
