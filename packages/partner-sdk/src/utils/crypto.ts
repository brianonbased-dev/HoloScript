/**
 * Cryptographic utilities for HoloScript Partner SDK
 *
 * Uses Web Crypto API (available in Node.js 15+ and all modern browsers)
 * Falls back to Node.js crypto module for older Node.js versions.
 */

/**
 * Convert string to Uint8Array
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get the crypto implementation (Web Crypto or Node.js crypto)
 */
function getCrypto(): Crypto | null {
  // Browser or Node.js 15+
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  return null;
}

/**
 * Get Node.js crypto module (dynamic import for compatibility)
 */
async function getNodeCrypto(): Promise<typeof import('crypto') | null> {
  try {
    // Use dynamic import for ESM compatibility
    return await import('crypto');
  } catch {
    return null;
  }
}

/**
 * Compute HMAC-SHA256 signature
 *
 * @param message - The message to sign
 * @param secret - The secret key
 * @returns Promise<string> - Hex-encoded signature
 */
export async function hmacSha256(message: string, secret: string): Promise<string> {
  const crypto = getCrypto();

  if (crypto?.subtle) {
    // Use Web Crypto API
    const keyData = stringToBytes(secret);
    const messageData = stringToBytes(message);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData as unknown as BufferSource);
    return bufferToHex(signature);
  }

  // Fallback: Use Node.js crypto module
  const nodeCrypto = await getNodeCrypto();
  if (nodeCrypto) {
    const hmac = nodeCrypto.createHmac('sha256', secret);
    hmac.update(message);
    return hmac.digest('hex');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Compute SHA-256 hash
 *
 * @param message - The message to hash
 * @returns Promise<string> - Hex-encoded hash
 */
export async function sha256(message: string): Promise<string> {
  const crypto = getCrypto();

  if (crypto?.subtle) {
    const messageData = stringToBytes(message);
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      messageData as unknown as BufferSource
    );
    return bufferToHex(hashBuffer);
  }

  // Fallback: Use Node.js crypto module
  const nodeCrypto = await getNodeCrypto();
  if (nodeCrypto) {
    const hash = nodeCrypto.createHash('sha256');
    hash.update(message);
    return hash.digest('hex');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Timing-safe string comparison
 *
 * Prevents timing attacks by ensuring comparison takes constant time
 * regardless of where strings differ.
 *
 * @param a - First string
 * @param b - Second string
 * @returns boolean - True if strings are equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time for same-length case
    // but we'll return false regardless
    const dummy = a.length > b.length ? a : b;
    let result = 1; // Force false
    for (let i = 0; i < dummy.length; i++) {
      result |= 0;
    }
    return result === 0;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a cryptographically secure random string
 *
 * @param length - Number of bytes (output will be hex, so 2x length)
 * @returns Promise<string> - Hex-encoded random bytes
 */
export async function randomHex(length: number = 16): Promise<string> {
  const crypto = getCrypto();

  if (crypto) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bufferToHex(bytes.buffer);
  }

  // Fallback: Use Node.js crypto module
  const nodeCrypto = await getNodeCrypto();
  if (nodeCrypto) {
    return nodeCrypto.randomBytes(length).toString('hex');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Verify HMAC signature with timing-safe comparison
 *
 * @param message - The original message
 * @param signature - The signature to verify (hex-encoded)
 * @param secret - The secret key
 * @returns Promise<boolean> - True if signature is valid
 */
export async function verifyHmacSha256(
  message: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSha256(message, secret);
  return timingSafeEqual(signature, expected);
}
