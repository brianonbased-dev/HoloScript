/**
 * Package Signer
 *
 * Ed25519 digital signature support for HoloScript packages.
 * Provides key generation, signing, verification, and manifest creation.
 *
 * Uses Node.js crypto module for ed25519 operations with fallback
 * for environments where it is not available.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Ed25519 key pair for package signing.
 */
export interface Ed25519KeyPair {
  /** Base64-encoded public key */
  publicKey: string;
  /** Base64-encoded private key */
  privateKey: string;
}

/**
 * A signed package manifest containing metadata and signature.
 */
export interface PackageManifest {
  /** Package name */
  name: string;
  /** Semver version string */
  version: string;
  /** List of file paths included in the package */
  files: string[];
  /** SHA-256 hash of the canonical manifest content (hex) */
  contentHash: string;
  /** ISO 8601 timestamp of when the manifest was created */
  createdAt: string;
}

/**
 * A signed package: manifest plus its cryptographic signature.
 */
export interface SignedPackage {
  /** The package manifest */
  manifest: PackageManifest;
  /** Base64-encoded ed25519 signature of the canonical manifest JSON */
  signature: string;
}

// =============================================================================
// KEY GENERATION
// =============================================================================

/**
 * Generate an ed25519 key pair for package signing.
 *
 * Uses Node.js crypto.generateKeyPairSync when available.
 * Returns keys as base64-encoded strings.
 *
 * @throws {Error} If ed25519 key generation is not available in the current environment
 */
export function generateKeyPair(): Ed25519KeyPair {
  // Use Node.js crypto module
  try {
    // Dynamic import to avoid bundler issues in browser contexts

    const nodeCrypto = require('crypto') as typeof import('crypto');
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    return {
      publicKey: bufferToBase64(publicKey),
      privateKey: bufferToBase64(privateKey),
    };
  } catch {
    throw new Error(
      'ed25519 key generation requires Node.js crypto module. ' +
        'This operation is not available in browser environments.'
    );
  }
}

// =============================================================================
// SIGNING
// =============================================================================

/**
 * Sign content with an ed25519 private key.
 *
 * @param content - The string content to sign
 * @param privateKeyBase64 - Base64-encoded ed25519 private key (PKCS8 DER format)
 * @returns Base64-encoded signature
 * @throws {Error} If signing fails
 */
export function signPackage(content: string, privateKeyBase64: string): string {
  try {
    const nodeCrypto = require('crypto') as typeof import('crypto');

    const privateKeyDer = base64ToBuffer(privateKeyBase64);
    const privateKeyObject = nodeCrypto.createPrivateKey({
      key: Buffer.from(privateKeyDer),
      format: 'der',
      type: 'pkcs8',
    });

    const signature = nodeCrypto.sign(null, Buffer.from(content, 'utf-8'), privateKeyObject);
    return bufferToBase64(signature);
  } catch (err) {
    throw new Error(`Package signing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Verify an ed25519 signature against content and public key.
 *
 * @param content - The original string content
 * @param signatureBase64 - Base64-encoded signature to verify
 * @param publicKeyBase64 - Base64-encoded ed25519 public key (SPKI DER format)
 * @returns true if the signature is valid, false otherwise
 */
export function verifySignature(
  content: string,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    const nodeCrypto = require('crypto') as typeof import('crypto');

    const publicKeyDer = base64ToBuffer(publicKeyBase64);
    const publicKeyObject = nodeCrypto.createPublicKey({
      key: Buffer.from(publicKeyDer),
      format: 'der',
      type: 'spki',
    });

    const signatureBuffer = base64ToBuffer(signatureBase64);
    return nodeCrypto.verify(
      null,
      Buffer.from(content, 'utf-8'),
      publicKeyObject,
      Buffer.from(signatureBuffer)
    );
  } catch {
    return false;
  }
}

// =============================================================================
// MANIFEST
// =============================================================================

/**
 * Create a package manifest for signing.
 *
 * The manifest includes a SHA-256 content hash of the canonical JSON
 * representation (sorted keys, no extra whitespace) to ensure integrity.
 *
 * @param name - Package name
 * @param version - Semver version string
 * @param files - List of file paths in the package
 * @returns Package manifest with content hash
 */
export async function createPackageManifest(
  name: string,
  version: string,
  files: string[]
): Promise<PackageManifest> {
  const sortedFiles = [...files].sort();
  const createdAt = new Date().toISOString();

  // Create canonical content for hashing
  const canonical = JSON.stringify({ name, version, files: sortedFiles, createdAt });
  const contentHash = await computeSha256(canonical);

  return {
    name,
    version,
    files: sortedFiles,
    contentHash,
    createdAt,
  };
}

/**
 * Serialize a manifest to its canonical JSON string for signing.
 * Uses deterministic key ordering.
 */
export function canonicalizeManifest(manifest: PackageManifest): string {
  return JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    files: manifest.files,
    contentHash: manifest.contentHash,
    createdAt: manifest.createdAt,
  });
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute SHA-256 hash of a string, returning hex.
 * Uses Node.js crypto for consistency.
 */
async function computeSha256(data: string): Promise<string> {
  try {
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const hash = nodeCrypto.createHash('sha256');
    hash.update(data, 'utf-8');
    return hash.digest('hex');
  } catch {
    // Fallback to Web Crypto
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array | Buffer): string {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    return buffer.toString('base64');
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
