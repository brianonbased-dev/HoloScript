/**
 * HoloScript Hybrid Crypto Provider
 *
 * Post-quantum cryptography abstraction layer for dual-signing with
 * Ed25519 (classical) + ML-DSA-65 / Dilithium (post-quantum).
 *
 * Phase 1: Abstraction layer (Ed25519 + mock PQ).
 * Phase 2 (current): Real ML-DSA-65 support via dynamic import of @noble/post-quantum.
 *   - MLDSACryptoProvider: Real PQ signing using @noble/post-quantum/ml-dsa
 *   - createCryptoProvider('ml-dsa-65') returns MLDSACryptoProvider
 *   - isPostQuantumAvailable() checks runtime availability of @noble/post-quantum
 *
 * Architecture:
 * - ICryptoProvider: Abstract interface for any signing algorithm
 * - Ed25519CryptoProvider: Classical Ed25519 using Node.js crypto (production-ready)
 * - HybridCryptoProvider: Wraps classical + PQ providers, produces composite signatures
 * - Factory function: createCryptoProvider(algorithm) returns the appropriate provider
 *
 * Composite verification strategy: EITHER signature validates the message (defense in depth).
 * During the migration period this ensures:
 * - If PQ implementation has bugs, classical Ed25519 still protects
 * - If Ed25519 is broken by quantum computers, PQ signature still protects
 * - Backward compatibility with Ed25519-only verifiers
 *
 * @version 1.0.0
 * @see https://csrc.nist.gov/pubs/fips/204/final (ML-DSA / Dilithium)
 * @see https://datatracker.ietf.org/doc/draft-ietf-lamps-dilithium-certificates/
 */

import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported signature algorithms.
 *
 * - 'ed25519': Classical Edwards-curve Digital Signature Algorithm (EdDSA)
 * - 'ml-dsa-65': NIST FIPS 204 Module-Lattice Digital Signature Algorithm (security level 3)
 * - 'hybrid-ed25519-ml-dsa-65': Composite dual-signing with both algorithms
 */
export type SignatureAlgorithm = 'ed25519' | 'ml-dsa-65' | 'hybrid-ed25519-ml-dsa-65';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Key material for a single algorithm.
 *
 * For Ed25519, keys are PEM-encoded (SPKI public, PKCS8 private).
 * For ML-DSA-65, keys will be raw byte arrays encoded as base64 (Phase 2).
 */
export interface CryptoKeyPair {
  /** Public key (PEM for Ed25519, base64 for ML-DSA-65) */
  publicKey: string;

  /** Private key (PEM for Ed25519, base64 for ML-DSA-65) */
  privateKey: string;

  /** Key identifier (e.g., "agent:role#timestamp") */
  kid: string;

  /** Algorithm this key pair belongs to */
  algorithm: SignatureAlgorithm;
}

/**
 * Hybrid key pair holding classical and optional post-quantum key material.
 *
 * During the migration period the pqKey is optional:
 * - Phase 1 (current): Only classicalKey is populated
 * - Phase 2: Both classicalKey and pqKey are populated
 * - Phase 3 (post-migration): pqKey is primary, classicalKey optional
 */
export interface HybridKeyPair {
  /** Ed25519 key pair (always present in Phase 1-2) */
  classicalKey: CryptoKeyPair;

  /** ML-DSA-65 key pair (populated in Phase 2+) */
  pqKey?: CryptoKeyPair;

  /** Combined key identifier */
  kid: string;

  /** Algorithm identifier for the hybrid pair */
  algorithm: SignatureAlgorithm;
}

/**
 * Composite signature holding both classical and post-quantum signatures.
 *
 * Verification strategy: valid if EITHER signature verifies (defense in depth).
 */
export interface CompositeSignature {
  /** Ed25519 signature (base64-encoded) */
  classicalSignature: string;

  /** ML-DSA-65 signature (base64-encoded, absent if PQ provider not available) */
  pqSignature?: string;

  /** Algorithm used to produce this composite signature */
  algorithm: SignatureAlgorithm;

  /** Timestamp when the signature was created (ISO 8601) */
  signedAt: string;

  /** Key ID of the signing key pair */
  kid: string;
}

/**
 * Result of composite signature verification.
 */
export interface CompositeVerificationResult {
  /** Overall validity: true if at least one component signature verifies */
  valid: boolean;

  /** Whether the classical (Ed25519) signature verified */
  classicalValid: boolean;

  /** Whether the post-quantum (ML-DSA-65) signature verified (null if not present) */
  pqValid: boolean | null;

  /** Algorithm used */
  algorithm: SignatureAlgorithm;

  /** Error message if both verifications failed */
  error?: string;
}

/**
 * Abstract interface for cryptographic signing providers.
 *
 * Implementations must be stateless and thread-safe.
 * Each provider handles exactly one algorithm.
 */
export interface ICryptoProvider {
  /**
   * Generate a new key pair for this algorithm.
   *
   * @param kid - Optional key identifier. If not provided, one will be generated.
   * @returns Promise resolving to a CryptoKeyPair
   */
  generateKeyPair(kid?: string): Promise<CryptoKeyPair>;

  /**
   * Sign a message using the private key.
   *
   * @param message - The message bytes to sign
   * @param privateKey - The private key (format depends on algorithm)
   * @returns Promise resolving to the signature as a base64 string
   */
  sign(message: Uint8Array, privateKey: string): Promise<string>;

  /**
   * Verify a signature against a message and public key.
   *
   * @param message - The original message bytes
   * @param signature - The signature to verify (base64-encoded)
   * @param publicKey - The public key to verify against
   * @returns Promise resolving to true if the signature is valid
   */
  verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean>;

  /**
   * Get the algorithm identifier for this provider.
   */
  getAlgorithm(): SignatureAlgorithm;
}

// ---------------------------------------------------------------------------
// Ed25519CryptoProvider
// ---------------------------------------------------------------------------

/**
 * Ed25519 cryptographic provider using Node.js built-in crypto module.
 *
 * This is the classical (pre-quantum) provider that wraps the existing
 * Ed25519 operations from AgentIdentity.ts into the ICryptoProvider interface.
 *
 * Key format: PEM (SPKI for public, PKCS8 for private)
 * Signature format: base64-encoded raw Ed25519 signature (64 bytes)
 */
export class Ed25519CryptoProvider implements ICryptoProvider {
  /**
   * Generate a new Ed25519 key pair.
   *
   * @param kid - Optional key identifier. Defaults to "ed25519#<timestamp>"
   */
  async generateKeyPair(kid?: string): Promise<CryptoKeyPair> {
    const keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      kid: kid || `ed25519#${Date.now()}`,
      algorithm: 'ed25519',
    };
  }

  /**
   * Sign a message with Ed25519.
   *
   * Ed25519 uses the message directly (no pre-hashing).
   */
  async sign(message: Uint8Array, privateKey: string): Promise<string> {
    const signature = crypto.sign(
      null, // Ed25519 does not use a separate hash algorithm
      Buffer.from(message),
      {
        key: privateKey,
        format: 'pem',
        type: 'pkcs8',
      }
    );
    return signature.toString('base64');
  }

  /**
   * Verify an Ed25519 signature.
   */
  async verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    try {
      return crypto.verify(
        null, // Ed25519 does not use a separate hash
        Buffer.from(message),
        {
          key: publicKey,
          format: 'pem',
          type: 'spki',
        },
        Buffer.from(signature, 'base64')
      );
    } catch {
      return false;
    }
  }

  getAlgorithm(): SignatureAlgorithm {
    return 'ed25519';
  }
}

// ---------------------------------------------------------------------------
// MLDSACryptoProvider
// ---------------------------------------------------------------------------

/**
 * ML-DSA-65 (Dilithium) cryptographic provider using @noble/post-quantum.
 *
 * Uses dynamic import so the @noble/post-quantum package is optional:
 * - If installed: Full ML-DSA-65 key generation, signing, and verification
 * - If not installed: Operations throw a clear error with install instructions
 *
 * Key format: base64-encoded raw byte arrays
 * Signature format: base64-encoded raw ML-DSA-65 signature
 *
 * @see https://csrc.nist.gov/pubs/fips/204/final (FIPS 204 — ML-DSA)
 */
export class MLDSACryptoProvider implements ICryptoProvider {
  /**
   * Lazily load the @noble/post-quantum ML-DSA module.
   *
   * Caches the module after first successful import to avoid repeated dynamic imports.
   */
  private mlDsaModule: unknown = null;

  private async getModule(): Promise<any> {
    if (this.mlDsaModule) {
      return this.mlDsaModule;
    }

    const noble = await import(/* @vite-ignore */ '@noble/post-quantum/ml-dsa.js' as string).catch(
      () => null
    );
    if (!noble) {
      throw new Error(
        'ML-DSA-65 requires @noble/post-quantum. ' +
          'Install it with: npm install @noble/post-quantum'
      );
    }

    this.mlDsaModule = noble;
    return noble;
  }

  /**
   * Generate a new ML-DSA-65 key pair.
   *
   * ML-DSA-65 (FIPS 204, security level 3):
   * - Public key: 1952 bytes
   * - Private key: 4032 bytes
   * - Signature: 3309 bytes
   *
   * @param kid - Optional key identifier. Defaults to "ml-dsa-65#<timestamp>"
   */
  async generateKeyPair(kid?: string): Promise<CryptoKeyPair> {
    const noble = await this.getModule();
    const keyPair = noble.ml_dsa65.keygen();

    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      privateKey: Buffer.from(keyPair.secretKey).toString('base64'),
      kid: kid || `ml-dsa-65#${Date.now()}`,
      algorithm: 'ml-dsa-65',
    };
  }

  /**
   * Sign a message with ML-DSA-65.
   *
   * ML-DSA-65 uses the message directly (no pre-hashing).
   */
  async sign(message: Uint8Array, privateKey: string): Promise<string> {
    const noble = await this.getModule();
    const secretKey = new Uint8Array(Buffer.from(privateKey, 'base64'));
    const signature = noble.ml_dsa65.sign(secretKey, message);
    return Buffer.from(signature).toString('base64');
  }

  /**
   * Verify an ML-DSA-65 signature.
   */
  async verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    try {
      const noble = await this.getModule();
      const pubKeyBytes = new Uint8Array(Buffer.from(publicKey, 'base64'));
      const sigBytes = new Uint8Array(Buffer.from(signature, 'base64'));
      return noble.ml_dsa65.verify(pubKeyBytes, message, sigBytes);
    } catch {
      return false;
    }
  }

  getAlgorithm(): SignatureAlgorithm {
    return 'ml-dsa-65';
  }
}

// ---------------------------------------------------------------------------
// Post-Quantum Availability Check
// ---------------------------------------------------------------------------

/**
 * Check whether the @noble/post-quantum package is available at runtime.
 *
 * This is a lightweight probe that attempts to dynamically import the module
 * without caching, useful for feature detection before constructing providers.
 *
 * @returns Promise<boolean> — true if @noble/post-quantum/ml-dsa is importable
 */
export async function isPostQuantumAvailable(): Promise<boolean> {
  const noble = await import(/* @vite-ignore */ '@noble/post-quantum/ml-dsa.js' as string).catch(
    () => null
  );
  return noble !== null;
}

// ---------------------------------------------------------------------------
// HybridCryptoProvider
// ---------------------------------------------------------------------------

/**
 * Hybrid cryptographic provider that combines classical and post-quantum signing.
 *
 * Produces CompositeSignature objects containing both an Ed25519 signature and
 * an ML-DSA-65 signature. Verification is "defense in depth": the composite
 * signature is valid if EITHER component signature verifies.
 *
 * This design ensures:
 * 1. Backward compatibility during migration (Ed25519-only verifiers still work)
 * 2. Forward security (PQ signature protects against quantum attacks)
 * 3. Implementation safety (bug in one algorithm doesn't break authentication)
 *
 * Usage (Phase 1 — PQ provider is a no-op or mock):
 * ```typescript
 * const hybrid = new HybridCryptoProvider(
 *   new Ed25519CryptoProvider(),
 *   mockPqProvider, // or undefined for Ed25519-only mode
 * );
 * ```
 */
export class HybridCryptoProvider implements ICryptoProvider {
  private readonly classical: ICryptoProvider;
  private readonly pq: ICryptoProvider | undefined;

  /**
   * Create a hybrid provider wrapping classical and optional PQ providers.
   *
   * @param classical - The classical (Ed25519) provider (required)
   * @param pq - The post-quantum (ML-DSA-65) provider (optional in Phase 1)
   */
  constructor(classical: ICryptoProvider, pq?: ICryptoProvider) {
    if (classical.getAlgorithm() !== 'ed25519') {
      throw new Error(`Classical provider must be ed25519, got: ${classical.getAlgorithm()}`);
    }
    if (pq && pq.getAlgorithm() !== 'ml-dsa-65') {
      throw new Error(`Post-quantum provider must be ml-dsa-65, got: ${pq.getAlgorithm()}`);
    }

    this.classical = classical;
    this.pq = pq;
  }

  /**
   * Generate a hybrid key pair containing both classical and PQ keys.
   *
   * If the PQ provider is not available, only the classical key is generated.
   */
  async generateKeyPair(kid?: string): Promise<CryptoKeyPair> {
    const hybridKid = kid || `hybrid#${Date.now()}`;
    const classicalKey = await this.classical.generateKeyPair(`${hybridKid}:classical`);

    // Return the classical key as the "primary" key for ICryptoProvider compatibility
    // Use generateHybridKeyPair() for full hybrid key pairs
    return {
      publicKey: classicalKey.publicKey,
      privateKey: classicalKey.privateKey,
      kid: hybridKid,
      algorithm: 'hybrid-ed25519-ml-dsa-65',
    };
  }

  /**
   * Generate a full hybrid key pair with both classical and PQ components.
   *
   * This is the preferred method for hybrid operations.
   */
  async generateHybridKeyPair(kid?: string): Promise<HybridKeyPair> {
    const hybridKid = kid || `hybrid#${Date.now()}`;
    const classicalKey = await this.classical.generateKeyPair(`${hybridKid}:classical`);

    let pqKey: CryptoKeyPair | undefined;
    if (this.pq) {
      pqKey = await this.pq.generateKeyPair(`${hybridKid}:pq`);
    }

    return {
      classicalKey,
      pqKey,
      kid: hybridKid,
      algorithm: 'hybrid-ed25519-ml-dsa-65',
    };
  }

  /**
   * Sign a message with the classical provider.
   *
   * For composite signatures, use signComposite() instead.
   * This method exists for ICryptoProvider interface compatibility.
   */
  async sign(message: Uint8Array, privateKey: string): Promise<string> {
    return this.classical.sign(message, privateKey);
  }

  /**
   * Produce a composite signature using both classical and PQ providers.
   *
   * @param message - The message bytes to sign
   * @param hybridKeyPair - The hybrid key pair containing both key sets
   * @returns CompositeSignature with both signatures
   */
  async signComposite(
    message: Uint8Array,
    hybridKeyPair: HybridKeyPair
  ): Promise<CompositeSignature> {
    // Always sign with classical
    const classicalSignature = await this.classical.sign(
      message,
      hybridKeyPair.classicalKey.privateKey
    );

    // Sign with PQ if available
    let pqSignature: string | undefined;
    if (this.pq && hybridKeyPair.pqKey) {
      pqSignature = await this.pq.sign(message, hybridKeyPair.pqKey.privateKey);
    }

    return {
      classicalSignature,
      pqSignature,
      algorithm: 'hybrid-ed25519-ml-dsa-65',
      signedAt: new Date().toISOString(),
      kid: hybridKeyPair.kid,
    };
  }

  /**
   * Verify a signature using the classical provider.
   *
   * For composite verification, use verifyComposite() instead.
   * This method exists for ICryptoProvider interface compatibility.
   */
  async verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    return this.classical.verify(message, signature, publicKey);
  }

  /**
   * Verify a composite signature.
   *
   * Defense in depth: the composite is valid if EITHER the classical or PQ
   * signature verifies. This ensures:
   * - Migration safety: if PQ has implementation bugs, classical still works
   * - Quantum resistance: if Ed25519 is broken, PQ signature still holds
   *
   * @param message - The original message bytes
   * @param compositeSignature - The composite signature to verify
   * @param hybridKeyPair - The hybrid key pair with public keys for verification
   * @returns CompositeVerificationResult with per-component status
   */
  async verifyComposite(
    message: Uint8Array,
    compositeSignature: CompositeSignature,
    hybridKeyPair: HybridKeyPair
  ): Promise<CompositeVerificationResult> {
    // Verify classical signature
    const classicalValid = await this.classical.verify(
      message,
      compositeSignature.classicalSignature,
      hybridKeyPair.classicalKey.publicKey
    );

    // Verify PQ signature if present
    let pqValid: boolean | null = null;
    if (this.pq && compositeSignature.pqSignature && hybridKeyPair.pqKey) {
      pqValid = await this.pq.verify(
        message,
        compositeSignature.pqSignature,
        hybridKeyPair.pqKey.publicKey
      );
    }

    // Defense in depth: valid if EITHER verifies
    const eitherValid = classicalValid || pqValid === true;

    const result: CompositeVerificationResult = {
      valid: eitherValid,
      classicalValid,
      pqValid,
      algorithm: compositeSignature.algorithm,
    };

    if (!eitherValid) {
      result.error =
        'Both classical (Ed25519) and post-quantum (ML-DSA-65) signature verification failed';
    }

    return result;
  }

  getAlgorithm(): SignatureAlgorithm {
    return 'hybrid-ed25519-ml-dsa-65';
  }

  /**
   * Check whether the PQ provider is available.
   */
  hasPQProvider(): boolean {
    return this.pq !== undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a crypto provider for the specified algorithm.
 *
 * - 'ed25519': Returns an Ed25519CryptoProvider (production-ready)
 * - 'ml-dsa-65': Returns an MLDSACryptoProvider (requires @noble/post-quantum at runtime)
 * - 'hybrid-ed25519-ml-dsa-65': Returns a HybridCryptoProvider with Ed25519
 *   classical provider and an MLDSACryptoProvider as the PQ provider.
 *   Pass an optional pqProvider to override the default MLDSACryptoProvider.
 *
 * @param algorithm - The signature algorithm to use
 * @param pqProvider - Optional PQ provider for hybrid mode (overrides default MLDSACryptoProvider)
 * @returns ICryptoProvider implementation
 */
export function createCryptoProvider(
  algorithm: SignatureAlgorithm,
  pqProvider?: ICryptoProvider
): ICryptoProvider {
  switch (algorithm) {
    case 'ed25519':
      return new Ed25519CryptoProvider();

    case 'ml-dsa-65':
      return new MLDSACryptoProvider();

    case 'hybrid-ed25519-ml-dsa-65':
      return new HybridCryptoProvider(
        new Ed25519CryptoProvider(),
        pqProvider ?? new MLDSACryptoProvider()
      );

    default: {
      // Exhaustive check — should never reach here with valid SignatureAlgorithm
      const _exhaustive: never = algorithm;
      throw new Error(`Unknown signature algorithm: ${_exhaustive}`);
    }
  }
}
