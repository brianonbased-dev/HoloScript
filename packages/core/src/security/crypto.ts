/**
 * Security Utilities
 *
 * Production-grade cryptographic utilities using Web Crypto API.
 * Replaces placeholder security implementations with proper crypto.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

// =============================================================================
// HASHING
// =============================================================================

/**
 * Generate SHA-256 hash of data
 */
export async function sha256(data: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = typeof data === 'string' ? encoder.encode(data) : data;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hashBuffer);
  }

  // Fallback for environments without crypto.subtle
  throw new Error('crypto.subtle not available');
}

/**
 * Generate SHA-512 hash of data
 */
export async function sha512(data: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = typeof data === 'string' ? encoder.encode(data) : data;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-512', buffer);
    return bufferToHex(hashBuffer);
  }

  throw new Error('crypto.subtle not available');
}

/**
 * Generate HMAC-SHA256 signature
 */
export async function hmacSha256(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return bufferToHex(signature);
  }

  throw new Error('crypto.subtle not available');
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHmacSha256(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSha256(data, secret);
  return timingSafeEqual(expected, signature);
}

// =============================================================================
// ENCRYPTION
// =============================================================================

/**
 * Encrypt data using AES-GCM
 */
export async function encrypt(
  data: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypt data using AES-GCM
 */
export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext)
  );

  return decoder.decode(plaintext);
}

/**
 * Generate AES-256 key for encryption
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Export encryption key to base64
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(exported);
}

/**
 * Import encryption key from base64
 */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const keyBuffer = base64ToBuffer(base64Key);
  return crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

// =============================================================================
// RANDOM
// =============================================================================

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate cryptographically secure random hex string
 * @param length - Number of bytes to generate (resulting hex string will be length*2 chars)
 */
export function randomHex(length: number): string {
  return bufferToHex(randomBytes(length));
}

/**
 * Generate cryptographically secure UUID v4
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = randomBytes(16);
  // Set version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant RFC4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bufferToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// =============================================================================
// KEY DERIVATION
// =============================================================================

/**
 * Derive key from password using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string | Uint8Array,
  iterations: number = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltBytes = typeof salt === 'string' ? encoder.encode(salt) : salt;
  // Create a new ArrayBuffer copy to ensure compatibility
  const saltBuffer = new Uint8Array(saltBytes).buffer as ArrayBuffer;

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate wallet address format
 * @param address - The wallet address to validate
 * @param chain - The blockchain type ('ethereum' or 'solana')
 */
export function validateWalletAddress(
  address: string,
  chain: 'ethereum' | 'solana' = 'ethereum'
): boolean {
  switch (chain) {
    case 'ethereum':
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'solana':
      // Solana addresses are base58 encoded, 32-44 characters
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
}

/**
 * Validate API key format
 */
export function validateApiKey(key: string): boolean {
  // At least 32 characters, alphanumeric with optional - and _
  return /^[a-zA-Z0-9_-]{32,}$/.test(key);
}

/**
 * Sanitize user input to prevent XSS - strips all HTML tags and dangerous patterns
 */
export function sanitizeInput(input: string): string {
  // Remove all HTML tags including their contents for script/style
  let sanitized = input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/data:/gi, '');

  // Remove SQL injection patterns
  sanitized = sanitized
    .replace(/;\s*DROP\s+TABLE/gi, '')
    .replace(/;\s*DELETE\s+FROM/gi, '')
    .replace(/;\s*INSERT\s+INTO/gi, '')
    .replace(/;\s*UPDATE\s+/gi, '')
    .replace(/--/g, '');

  return sanitized.trim();
}

/**
 * Validate and sanitize URL
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['https', 'wss']): boolean {
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

/**
 * Check rate limit for a key
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
  }

  const allowed = entry.count < maxRequests;
  if (allowed) {
    entry.count++;
  }

  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for a key
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Reset all rate limits
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}

// =============================================================================
// HELPERS
// =============================================================================

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
