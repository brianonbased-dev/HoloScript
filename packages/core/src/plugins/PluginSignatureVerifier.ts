/**
 * PluginSignatureVerifier — Ed25519 signature verification for plugins
 *
 * Extends the existing PackageSigner infrastructure with:
 * - TrustStore: multiple trusted public keys with rotation
 * - Plugin package verification (manifest + content hash)
 * - Verification result with trust chain info
 * - Key revocation support
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 *
 * @version 1.0.0
 */

import {
  verifySignature,
  canonicalizeManifest,
  type PackageManifest,
  type SignedPackage,
} from '../security/PackageSigner';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A trusted public key with metadata.
 */
export interface TrustedKey {
  /** Unique key identifier */
  keyId: string;
  /** Base64-encoded Ed25519 public key (SPKI DER) */
  publicKey: string;
  /** Display label for this key */
  label: string;
  /** When this key was added to the trust store */
  addedAt: string;
  /** Optional expiration date */
  expiresAt?: string;
  /** Whether this key has been revoked */
  revoked: boolean;
}

/**
 * Result of verifying a plugin signature.
 */
export interface VerificationResult {
  /** Whether the signature is valid and trusted */
  verified: boolean;
  /** The key ID that matched (if verified) */
  keyId?: string;
  /** The key label (if verified) */
  keyLabel?: string;
  /** Error message if verification failed */
  error?: string;
  /** Timestamp of verification */
  verifiedAt: string;
  /** Package name from manifest */
  packageName: string;
  /** Package version from manifest */
  packageVersion: string;
}

/**
 * Configuration for the signature verifier.
 */
export interface SignatureVerifierConfig {
  /** Whether to require signatures (reject unsigned packages) */
  requireSignature: boolean;
  /** Whether to reject expired keys */
  rejectExpiredKeys: boolean;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_VERIFIER_CONFIG: SignatureVerifierConfig = {
  requireSignature: true,
  rejectExpiredKeys: true,
};

// =============================================================================
// PLUGIN SIGNATURE VERIFIER
// =============================================================================

export class PluginSignatureVerifier {
  private trustedKeys: Map<string, TrustedKey> = new Map();
  private config: SignatureVerifierConfig;

  constructor(config?: Partial<SignatureVerifierConfig>) {
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
  }

  // ===========================================================================
  // TRUST STORE MANAGEMENT
  // ===========================================================================

  /**
   * Add a trusted public key to the trust store.
   */
  addTrustedKey(keyId: string, publicKey: string, label: string, expiresAt?: string): void {
    if (this.trustedKeys.has(keyId)) {
      throw new Error(`Key "${keyId}" already exists in trust store`);
    }
    this.trustedKeys.set(keyId, {
      keyId,
      publicKey,
      label,
      addedAt: new Date().toISOString(),
      expiresAt,
      revoked: false,
    });
  }

  /**
   * Remove a trusted key from the store.
   */
  removeTrustedKey(keyId: string): boolean {
    return this.trustedKeys.delete(keyId);
  }

  /**
   * Revoke a key without removing it (keeps audit trail).
   */
  revokeKey(keyId: string): boolean {
    const key = this.trustedKeys.get(keyId);
    if (!key) return false;
    key.revoked = true;
    return true;
  }

  /**
   * Rotate a key: revoke old, add new.
   */
  rotateKey(
    oldKeyId: string,
    newKeyId: string,
    newPublicKey: string,
    newLabel: string,
    expiresAt?: string
  ): void {
    if (!this.trustedKeys.has(oldKeyId)) {
      throw new Error(`Cannot rotate: key "${oldKeyId}" not found`);
    }
    this.revokeKey(oldKeyId);
    this.addTrustedKey(newKeyId, newPublicKey, newLabel, expiresAt);
  }

  /**
   * Get all trusted (non-revoked, non-expired) keys.
   */
  getActiveTrustedKeys(): TrustedKey[] {
    const now = new Date().toISOString();
    return [...this.trustedKeys.values()].filter((key) => {
      if (key.revoked) return false;
      if (this.config.rejectExpiredKeys && key.expiresAt && key.expiresAt < now) return false;
      return true;
    });
  }

  /**
   * Get all keys including revoked/expired.
   */
  getAllKeys(): TrustedKey[] {
    return [...this.trustedKeys.values()];
  }

  /**
   * Get trust store size.
   */
  getTrustStoreSize(): number {
    return this.trustedKeys.size;
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * Verify a signed plugin package against the trust store.
   *
   * Tries each active trusted key until one succeeds.
   */
  verifyPlugin(signedPackage: SignedPackage): VerificationResult {
    const baseResult = {
      verifiedAt: new Date().toISOString(),
      packageName: signedPackage.manifest.name,
      packageVersion: signedPackage.manifest.version,
    };

    // Check if signature is present
    if (!signedPackage.signature) {
      if (this.config.requireSignature) {
        return {
          ...baseResult,
          verified: false,
          error: 'Package is unsigned and signatures are required',
        };
      }
      return { ...baseResult, verified: true, keyId: undefined, keyLabel: 'unsigned-allowed' };
    }

    // Get active keys
    const activeKeys = this.getActiveTrustedKeys();
    if (activeKeys.length === 0) {
      return { ...baseResult, verified: false, error: 'No active trusted keys in trust store' };
    }

    // Canonicalize manifest for verification
    const content = canonicalizeManifest(signedPackage.manifest);

    // Try each active key
    for (const key of activeKeys) {
      const isValid = verifySignature(content, signedPackage.signature, key.publicKey);
      if (isValid) {
        return {
          ...baseResult,
          verified: true,
          keyId: key.keyId,
          keyLabel: key.label,
        };
      }
    }

    return {
      ...baseResult,
      verified: false,
      error: `Signature does not match any of ${activeKeys.length} trusted key(s)`,
    };
  }

  /**
   * Verify a manifest's content hash matches expected content.
   */
  verifyContentHash(manifest: PackageManifest, expectedHash: string): boolean {
    return manifest.contentHash === expectedHash;
  }

  /**
   * Quick check: is a package signed by a specific key?
   */
  isSignedBy(signedPackage: SignedPackage, keyId: string): boolean {
    const key = this.trustedKeys.get(keyId);
    if (!key || key.revoked) return false;

    const content = canonicalizeManifest(signedPackage.manifest);
    return verifySignature(content, signedPackage.signature, key.publicKey);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultVerifier: PluginSignatureVerifier | null = null;

export function getPluginSignatureVerifier(
  config?: Partial<SignatureVerifierConfig>
): PluginSignatureVerifier {
  if (!defaultVerifier) {
    defaultVerifier = new PluginSignatureVerifier(config);
  }
  return defaultVerifier;
}

export function resetPluginSignatureVerifier(): void {
  defaultVerifier = null;
}
