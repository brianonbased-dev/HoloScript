/**
 * @fileoverview Digital signature verification service for HoloScript plugin packages
 *
 * Implements Ed25519 digital signature creation and verification for plugin packages.
 * This ensures package integrity and author authentication throughout the
 * publish -> distribute -> install pipeline.
 *
 * Signing flow:
 *   1. Author generates Ed25519 keypair locally (e.g., via `holoscript keygen`)
 *   2. Author registers public key with marketplace via POST /api/keys
 *   3. On publish, author signs package contentHash with private key
 *   4. Marketplace verifies signature against registered public key
 *   5. On install, Studio client re-verifies signature for end-to-end integrity
 *
 * @module marketplace-api/PluginSignatureService
 */

import { createHash, sign, verify, generateKeyPairSync, randomBytes } from 'crypto';
import type {
  PluginSignature,
  SignatureVerificationResult,
} from './PluginPackageSpec.js';

// =============================================================================
// KEY STORAGE TYPES
// =============================================================================

/**
 * A registered signing key record
 */
export interface RegisteredSigningKey {
  /** Unique key ID */
  keyId: string;
  /** The user/author who registered this key */
  ownerId: string;
  /** Base64-encoded Ed25519 public key */
  publicKey: string;
  /** SHA-256 fingerprint of the public key (first 16 hex chars) */
  fingerprint: string;
  /** Human-readable label for the key */
  label?: string;
  /** When the key was registered */
  registeredAt: Date;
  /** When the key was last used to sign a package */
  lastUsedAt?: Date;
  /** Whether the key has been revoked */
  revoked: boolean;
  /** When the key was revoked (if revoked) */
  revokedAt?: Date;
  /** Reason for revocation */
  revokedReason?: string;
}

// =============================================================================
// PLUGIN SIGNATURE SERVICE
// =============================================================================

/**
 * Service for managing plugin digital signatures.
 *
 * Provides:
 * - Signing key registration and revocation
 * - Package content hashing
 * - Signature creation (for CLI tooling)
 * - Signature verification (for marketplace and client)
 *
 * @example
 * ```typescript
 * const sigService = new PluginSignatureService();
 *
 * // Register a signing key
 * const { keyId, fingerprint } = await sigService.registerKey('author-1', publicKeyBase64);
 *
 * // Verify a package signature
 * const result = await sigService.verifySignature(contentHash, {
 *   algorithm: 'Ed25519',
 *   signature: signatureBase64,
 *   publicKey: publicKeyBase64,
 *   keyFingerprint: fingerprint,
 *   signedAt: new Date().toISOString(),
 * });
 *
 * if (result.valid && result.trusted) {
 *   console.log('Package is authentic and signed by:', result.author);
 * }
 * ```
 */
export class PluginSignatureService {
  /** Map of keyId -> RegisteredSigningKey */
  private keys: Map<string, RegisteredSigningKey> = new Map();
  /** Map of fingerprint -> keyId for fast lookup */
  private fingerprintIndex: Map<string, string> = new Map();
  /** Map of ownerId -> keyId[] for listing an author's keys */
  private ownerIndex: Map<string, string[]> = new Map();

  // ── Key Management ──────────────────────────────────────────────────────

  /**
   * Registers a new Ed25519 public signing key for an author.
   *
   * @param ownerId - The author/user ID registering the key
   * @param publicKeyBase64 - Base64-encoded Ed25519 public key (32 bytes)
   * @param label - Optional human-readable label (e.g., "laptop-2026")
   * @returns The key ID and fingerprint
   * @throws If the key format is invalid or already registered
   */
  async registerKey(
    ownerId: string,
    publicKeyBase64: string,
    label?: string,
  ): Promise<{ keyId: string; fingerprint: string }> {
    // Validate public key format
    const keyBuffer = Buffer.from(publicKeyBase64, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid Ed25519 public key: expected 32 bytes, got ${keyBuffer.length}`,
      );
    }

    // Compute fingerprint
    const fingerprint = this.computeFingerprint(publicKeyBase64);

    // Check for duplicate
    if (this.fingerprintIndex.has(fingerprint)) {
      const existingKeyId = this.fingerprintIndex.get(fingerprint)!;
      const existingKey = this.keys.get(existingKeyId)!;
      if (!existingKey.revoked) {
        throw new Error(
          `A key with fingerprint ${fingerprint} is already registered`,
        );
      }
      // If the existing key was revoked, allow re-registration with a new keyId
    }

    // Generate key ID
    const keyId = `key_${randomBytes(12).toString('hex')}`;

    // Store
    const record: RegisteredSigningKey = {
      keyId,
      ownerId,
      publicKey: publicKeyBase64,
      fingerprint,
      label,
      registeredAt: new Date(),
      revoked: false,
    };

    this.keys.set(keyId, record);
    this.fingerprintIndex.set(fingerprint, keyId);

    const ownerKeys = this.ownerIndex.get(ownerId) ?? [];
    ownerKeys.push(keyId);
    this.ownerIndex.set(ownerId, ownerKeys);

    return { keyId, fingerprint };
  }

  /**
   * Revokes a signing key. Packages signed with revoked keys will fail verification.
   *
   * @param keyId - The key ID to revoke
   * @param requesterId - The user requesting revocation (must be the owner)
   * @param reason - Reason for revocation
   */
  async revokeKey(keyId: string, requesterId: string, reason?: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }

    if (key.ownerId !== requesterId) {
      throw new Error('Only the key owner can revoke their key');
    }

    if (key.revoked) {
      throw new Error(`Key ${keyId} is already revoked`);
    }

    key.revoked = true;
    key.revokedAt = new Date();
    key.revokedReason = reason;
  }

  /**
   * Lists all signing keys for an author.
   */
  async getKeysForAuthor(ownerId: string): Promise<RegisteredSigningKey[]> {
    const keyIds = this.ownerIndex.get(ownerId) ?? [];
    return keyIds
      .map((id) => this.keys.get(id))
      .filter((k): k is RegisteredSigningKey => k !== undefined);
  }

  /**
   * Gets a key by its ID.
   */
  async getKey(keyId: string): Promise<RegisteredSigningKey | null> {
    return this.keys.get(keyId) ?? null;
  }

  /**
   * Gets a key by its fingerprint.
   */
  async getKeyByFingerprint(fingerprint: string): Promise<RegisteredSigningKey | null> {
    const keyId = this.fingerprintIndex.get(fingerprint);
    if (!keyId) return null;
    return this.keys.get(keyId) ?? null;
  }

  // ── Content Hashing ─────────────────────────────────────────────────────

  /**
   * Computes the SHA-256 hash of package contents for signing.
   * The hash covers all files in the archive excluding the .signature file itself.
   *
   * @param content - The package content as a Buffer or string
   * @returns Hex-encoded SHA-256 hash
   */
  computeContentHash(content: Buffer | string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Computes the fingerprint of a public key.
   * Fingerprint = first 16 hex characters of SHA-256(publicKey).
   */
  computeFingerprint(publicKeyBase64: string): string {
    return createHash('sha256')
      .update(Buffer.from(publicKeyBase64, 'base64'))
      .digest('hex')
      .slice(0, 16);
  }

  // ── Signature Creation ──────────────────────────────────────────────────

  /**
   * Creates an Ed25519 signature for package content.
   * This is typically used by the CLI tooling, not the server.
   *
   * @param contentHash - The SHA-256 hash of the package contents
   * @param privateKeyPem - PEM-encoded Ed25519 private key
   * @param publicKeyBase64 - Base64-encoded Ed25519 public key
   * @param keyId - Optional key ID registered with marketplace
   * @returns The PluginSignature object
   */
  createSignature(
    contentHash: string,
    privateKeyPem: string,
    publicKeyBase64: string,
    keyId?: string,
  ): PluginSignature {
    // Ed25519 uses crypto.sign() with null algorithm (Ed25519 does its own hashing)
    const signatureBuffer = sign(null, Buffer.from(contentHash), privateKeyPem);

    return {
      algorithm: 'Ed25519',
      signature: signatureBuffer.toString('base64'),
      publicKey: publicKeyBase64,
      keyFingerprint: this.computeFingerprint(publicKeyBase64),
      signedAt: new Date().toISOString(),
      keyId,
    };
  }

  /**
   * Generates a new Ed25519 keypair for plugin signing.
   * Used by the CLI's `holoscript keygen` command.
   *
   * @returns Object with PEM-encoded private key and base64-encoded public key
   */
  static generateKeypair(): {
    privateKeyPem: string;
    publicKeyBase64: string;
    fingerprint: string;
  } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Extract raw 32-byte public key from SPKI PEM
    // SPKI DER for Ed25519 is: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
    const derBuffer = Buffer.from(
      publicKey
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/\s/g, ''),
      'base64',
    );
    // The raw key starts at offset 12 in the DER encoding
    const rawPublicKey = derBuffer.subarray(12);
    const publicKeyBase64 = rawPublicKey.toString('base64');

    const fingerprint = createHash('sha256')
      .update(rawPublicKey)
      .digest('hex')
      .slice(0, 16);

    return {
      privateKeyPem: privateKey,
      publicKeyBase64,
      fingerprint,
    };
  }

  // ── Signature Verification ──────────────────────────────────────────────

  /**
   * Verifies an Ed25519 signature against a content hash.
   *
   * Verification checks:
   *   1. Cryptographic validity (signature matches contentHash with publicKey)
   *   2. Trust status (is the publicKey registered and not revoked?)
   *   3. Author identity (who owns the registered key?)
   *
   * @param contentHash - The SHA-256 hash of the package contents
   * @param signature - The PluginSignature to verify
   * @returns Detailed verification result
   */
  async verifySignature(
    contentHash: string,
    signature: PluginSignature,
  ): Promise<SignatureVerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check algorithm
    if (signature.algorithm !== 'Ed25519') {
      return {
        valid: false,
        trusted: false,
        keyFingerprint: signature.keyFingerprint,
        errors: [`Unsupported algorithm: ${signature.algorithm}. Only Ed25519 is supported.`],
        warnings: [],
      };
    }

    // 2. Verify cryptographic signature
    let cryptoValid = false;
    try {
      // Reconstruct SPKI PEM from raw public key
      const rawPubKey = Buffer.from(signature.publicKey, 'base64');
      if (rawPubKey.length !== 32) {
        errors.push(`Invalid public key length: expected 32 bytes, got ${rawPubKey.length}`);
      } else {
        // Build SPKI DER: 30 2a 30 05 06 03 2b 65 70 03 21 00 + <32 bytes>
        const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
        const spkiDer = Buffer.concat([spkiPrefix, rawPubKey]);
        const spkiPem =
          '-----BEGIN PUBLIC KEY-----\n' +
          spkiDer.toString('base64') +
          '\n-----END PUBLIC KEY-----';

        // Ed25519 uses crypto.verify() with null algorithm (Ed25519 does its own hashing)
        cryptoValid = verify(
          null,
          Buffer.from(contentHash),
          spkiPem,
          Buffer.from(signature.signature, 'base64'),
        );

        if (!cryptoValid) {
          errors.push('Cryptographic signature verification failed: signature does not match content');
        }
      }
    } catch (err) {
      errors.push(`Signature verification error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // 3. Verify fingerprint consistency
    const expectedFingerprint = this.computeFingerprint(signature.publicKey);
    if (signature.keyFingerprint !== expectedFingerprint) {
      errors.push(
        `Key fingerprint mismatch: expected ${expectedFingerprint}, got ${signature.keyFingerprint}`,
      );
      cryptoValid = false;
    }

    // 4. Check trust (is the key registered?)
    let trusted = false;
    let author: string | undefined;

    const registeredKey = await this.getKeyByFingerprint(signature.keyFingerprint);
    if (registeredKey) {
      if (registeredKey.revoked) {
        errors.push(
          `Signing key ${signature.keyFingerprint} has been revoked` +
          (registeredKey.revokedAt
            ? ` on ${registeredKey.revokedAt.toISOString()}`
            : '') +
          (registeredKey.revokedReason
            ? `: ${registeredKey.revokedReason}`
            : ''),
        );
      } else {
        trusted = true;
        author = registeredKey.ownerId;

        // Update last used timestamp
        registeredKey.lastUsedAt = new Date();
      }

      // Verify public key matches registered key
      if (registeredKey.publicKey !== signature.publicKey) {
        errors.push(
          'Public key in signature does not match the registered key for this fingerprint',
        );
        trusted = false;
      }
    } else {
      warnings.push(
        `Signing key ${signature.keyFingerprint} is not registered with the marketplace. ` +
        'The signature is cryptographically valid but the author cannot be verified.',
      );
    }

    // 5. Check signature timestamp
    if (signature.signedAt) {
      const signedDate = new Date(signature.signedAt);
      const now = new Date();
      const ageMs = now.getTime() - signedDate.getTime();
      const oneYear = 365 * 24 * 60 * 60 * 1000;

      if (ageMs > oneYear) {
        warnings.push(
          'Signature is older than 1 year. Consider re-signing with a fresh timestamp.',
        );
      }

      if (signedDate.getTime() > now.getTime() + 60000) {
        // Allow 1 minute clock skew
        warnings.push('Signature timestamp is in the future.');
      }
    }

    return {
      valid: cryptoValid && errors.length === 0,
      trusted,
      author,
      keyFingerprint: signature.keyFingerprint,
      errors,
      warnings,
    };
  }

  /**
   * Performs a full integrity check on a package:
   *   1. Recomputes content hash from the package data
   *   2. Compares against the declared content hash
   *   3. Verifies the signature (if present)
   *
   * @param packageContent - The raw package content (Buffer)
   * @param declaredContentHash - The content hash declared in the package
   * @param signature - The package signature (if any)
   * @returns Verification result
   */
  async verifyPackageIntegrity(
    packageContent: Buffer | string,
    declaredContentHash: string,
    signature?: PluginSignature,
  ): Promise<SignatureVerificationResult> {
    // Step 1: Verify content hash
    const computedHash = this.computeContentHash(packageContent);
    if (computedHash !== declaredContentHash) {
      return {
        valid: false,
        trusted: false,
        keyFingerprint: signature?.keyFingerprint ?? '',
        errors: [
          `Content hash mismatch: computed ${computedHash}, declared ${declaredContentHash}. ` +
          'The package may have been tampered with.',
        ],
        warnings: [],
      };
    }

    // Step 2: If no signature, return unsigned status
    if (!signature) {
      return {
        valid: true, // Content hash matches, but unsigned
        trusted: false,
        keyFingerprint: '',
        errors: [],
        warnings: ['Package is not signed. Cannot verify author identity.'],
      };
    }

    // Step 3: Verify signature
    return this.verifySignature(declaredContentHash, signature);
  }
}
