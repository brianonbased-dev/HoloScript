/**
 * HybridCryptoProvider -- Post-quantum cryptography wrapper for HoloScript.
 *
 * Wraps existing classical crypto (ECDSA, X25519) with post-quantum algorithms
 * (ML-KEM/Kyber for key encapsulation, ML-DSA/Dilithium for signatures)
 * using the @noble/post-quantum library.
 *
 * The hybrid approach provides defense-in-depth: if either the classical or
 * post-quantum algorithm is broken, the other still provides security.
 *
 * TARGET: packages/core/src/compiler/identity/HybridCryptoProvider.ts
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported classical algorithms.
 */
export type ClassicalAlgorithm = 'ecdsa-p256' | 'ecdsa-p384' | 'ed25519' | 'x25519';

/**
 * Supported post-quantum algorithms.
 */
export type PQAlgorithm = 'ml-kem-768' | 'ml-kem-1024' | 'ml-dsa-65' | 'ml-dsa-87';

/**
 * Hybrid key pair combining classical and post-quantum keys.
 */
export interface HybridKeyPair {
  /** Unique identifier for this key pair */
  id: string;
  /** Classical public key (base64-encoded) */
  classicalPublicKey: string;
  /** Classical private key (base64-encoded) */
  classicalPrivateKey: string;
  /** Post-quantum public key (base64-encoded) */
  pqPublicKey: string;
  /** Post-quantum private key (base64-encoded) */
  pqPrivateKey: string;
  /** Classical algorithm used */
  classicalAlgorithm: ClassicalAlgorithm;
  /** Post-quantum algorithm used */
  pqAlgorithm: PQAlgorithm;
  /** When the key was generated */
  createdAt: string;
}

/**
 * Hybrid signature combining classical and post-quantum signatures.
 */
export interface HybridSignature {
  /** Classical signature (base64-encoded) */
  classicalSignature: string;
  /** Post-quantum signature (base64-encoded) */
  pqSignature: string;
  /** Classical algorithm used */
  classicalAlgorithm: ClassicalAlgorithm;
  /** Post-quantum algorithm used */
  pqAlgorithm: PQAlgorithm;
  /** Combined signature bytes (base64-encoded) */
  combined: string;
}

/**
 * Hybrid encapsulated key (for key exchange).
 */
export interface HybridEncapsulation {
  /** Classical ciphertext (base64-encoded) */
  classicalCiphertext: string;
  /** Post-quantum ciphertext (base64-encoded) */
  pqCiphertext: string;
  /** Combined shared secret (base64-encoded, derived from both) */
  sharedSecret: string;
}

/**
 * Result of hybrid signature verification.
 */
export interface HybridVerificationResult {
  /** Whether BOTH signatures verified */
  valid: boolean;
  /** Classical signature verification result */
  classicalValid: boolean;
  /** Post-quantum signature verification result */
  pqValid: boolean;
  /** If either failed, the error message */
  error?: string;
}

/**
 * Configuration for the HybridCryptoProvider.
 */
export interface HybridCryptoConfig {
  /** Classical algorithm for signatures (default: 'ed25519') */
  signatureAlgorithm?: ClassicalAlgorithm;
  /** Post-quantum algorithm for signatures (default: 'ml-dsa-65') */
  pqSignatureAlgorithm?: PQAlgorithm;
  /** Classical algorithm for key exchange (default: 'x25519') */
  keyExchangeAlgorithm?: ClassicalAlgorithm;
  /** Post-quantum algorithm for key exchange (default: 'ml-kem-768') */
  pqKeyExchangeAlgorithm?: PQAlgorithm;
  /** Whether to require both algorithms to pass (default: true) */
  requireBoth?: boolean;
  /** Logging function for audit trail */
  logger?: (message: string) => void;
}

// =============================================================================
// NODE CRYPTO HELPERS (classical operations)
// =============================================================================

/**
 * Lazily imported Node.js crypto module.
 * Kept at module scope so it's loaded once and shared.
 */
let _nodeCrypto: typeof import('crypto') | null = null;

async function getNodeCrypto(): Promise<typeof import('crypto')> {
  if (_nodeCrypto) return _nodeCrypto;
  _nodeCrypto = await import('crypto');
  return _nodeCrypto;
}

/**
 * Generate an Ed25519 key pair via Node.js crypto.
 * Returns raw 32-byte public key and PKCS8-encoded private key.
 */
async function generateEd25519KeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyObj: import('crypto').KeyObject;
  privateKeyObj: import('crypto').KeyObject;
}> {
  const nc = await getNodeCrypto();
  const { publicKey, privateKey } = nc.generateKeyPairSync('ed25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' });
  const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' });
  return {
    publicKey: new Uint8Array(pubRaw),
    privateKey: new Uint8Array(privRaw),
    publicKeyObj: publicKey,
    privateKeyObj: privateKey,
  };
}

/**
 * Sign a message with Ed25519 using a DER-encoded private key.
 */
async function ed25519Sign(message: Uint8Array, derPrivateKey: Uint8Array): Promise<Uint8Array> {
  const nc = await getNodeCrypto();
  const keyObj = nc.createPrivateKey({
    key: Buffer.from(derPrivateKey),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = nc.sign(null, message, keyObj);
  return new Uint8Array(sig);
}

/**
 * Verify an Ed25519 signature using a DER-encoded public key.
 */
async function ed25519Verify(
  message: Uint8Array,
  signature: Uint8Array,
  derPublicKey: Uint8Array
): Promise<boolean> {
  const nc = await getNodeCrypto();
  const keyObj = nc.createPublicKey({
    key: Buffer.from(derPublicKey),
    format: 'der',
    type: 'spki',
  });
  return nc.verify(null, message, keyObj, signature);
}

/**
 * Generate an X25519 key pair via Node.js crypto.
 * Returns raw public and PKCS8-encoded private key bytes.
 */
async function generateX25519KeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const nc = await getNodeCrypto();
  const { publicKey, privateKey } = nc.generateKeyPairSync('x25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' });
  const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' });
  return {
    publicKey: new Uint8Array(pubRaw),
    privateKey: new Uint8Array(privRaw),
  };
}

/**
 * Perform X25519 Diffie-Hellman: derive shared secret from our private key
 * and the recipient's public key.
 */
async function x25519DeriveSecret(
  ourPrivateKeyDer: Uint8Array,
  theirPublicKeyDer: Uint8Array
): Promise<Uint8Array> {
  const nc = await getNodeCrypto();
  const privObj = nc.createPrivateKey({
    key: Buffer.from(ourPrivateKeyDer),
    format: 'der',
    type: 'pkcs8',
  });
  const pubObj = nc.createPublicKey({
    key: Buffer.from(theirPublicKeyDer),
    format: 'der',
    type: 'spki',
  });
  const secret = nc.diffieHellman({ privateKey: privObj, publicKey: pubObj });
  return new Uint8Array(secret);
}

/**
 * Encrypt plaintext with AES-256-GCM using a 32-byte key.
 * Returns iv (12 bytes) || authTag (16 bytes) || ciphertext.
 */
async function aes256GcmEncrypt(plaintext: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const nc = await getNodeCrypto();
  const iv = nc.randomBytes(12);
  const cipher = nc.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const result = new Uint8Array(12 + 16 + encrypted.length);
  result.set(iv, 0);
  result.set(authTag, 12);
  result.set(new Uint8Array(encrypted), 28);
  return result;
}

/**
 * Decrypt AES-256-GCM ciphertext (iv || authTag || ciphertext) with a 32-byte key.
 */
async function aes256GcmDecrypt(packed: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const nc = await getNodeCrypto();
  const iv = packed.slice(0, 12);
  const authTag = packed.slice(12, 28);
  const ciphertext = packed.slice(28);
  const decipher = nc.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return new Uint8Array(decrypted);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Utility: convert Uint8Array to base64 string.
 */
function toBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Utility: convert base64 string to Uint8Array.
 */
function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  // Browser fallback
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Utility: combine two byte arrays into one shared secret via XOR + hash.
 * This ensures the combined secret is only as strong as the stronger input.
 */
async function combineSecrets(secret1: Uint8Array, secret2: Uint8Array): Promise<Uint8Array> {
  // Concatenate both secrets
  const combined = new Uint8Array(secret1.length + secret2.length);
  combined.set(secret1, 0);
  combined.set(secret2, secret1.length);

  // Hash with SHA-256 to produce a fixed-length combined secret
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', combined);
    return new Uint8Array(hash);
  }

  // Node.js fallback
  const nodeCrypto = await import('crypto');
  const hash = nodeCrypto.createHash('sha256').update(combined).digest();
  return new Uint8Array(hash);
}

/**
 * Generate a random ID.
 */
function generateId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * HybridCryptoProvider -- Main class for hybrid classical+PQ cryptography.
 *
 * This provider implements the "hybrid" approach recommended by NIST for
 * the transition to post-quantum cryptography:
 * - Key exchange: X25519 + ML-KEM-768 (Kyber)
 * - Signatures: Ed25519 + ML-DSA-65 (Dilithium)
 *
 * Both algorithms must verify for the operation to succeed, providing
 * defense-in-depth against compromise of either algorithm family.
 */
export class HybridCryptoProvider {
  private config: Required<HybridCryptoConfig>;
  private pqModule: unknown = null;
  private classicalModule: unknown = null;

  constructor(config: HybridCryptoConfig = {}) {
    this.config = {
      signatureAlgorithm: config.signatureAlgorithm ?? 'ed25519',
      pqSignatureAlgorithm: config.pqSignatureAlgorithm ?? 'ml-dsa-65',
      keyExchangeAlgorithm: config.keyExchangeAlgorithm ?? 'x25519',
      pqKeyExchangeAlgorithm: config.pqKeyExchangeAlgorithm ?? 'ml-kem-768',
      requireBoth: config.requireBoth ?? true,
      logger: config.logger ?? (() => {}),
    };
  }

  /**
   * Lazy-load the @noble/post-quantum module.
   * This allows the provider to be instantiated even if the module isn't installed,
   * failing gracefully only when PQ operations are actually attempted.
   */
  private async loadPQModule(): Promise<any> {
    if (this.pqModule) return this.pqModule;

    try {
      // Dynamic import for tree-shaking and optional dependency
      const pq = await import('@noble/post-quantum' as string);
      this.pqModule = pq;
      this.config.logger('[HybridCrypto] @noble/post-quantum loaded successfully');
      return pq;
    } catch (e) {
      throw new Error(
        'Post-quantum cryptography requires @noble/post-quantum. ' +
          'Install with: npm install @noble/post-quantum'
      );
    }
  }

  /**
   * Generate a hybrid key pair for digital signatures.
   *
   * Produces both a classical Ed25519 key pair and a post-quantum ML-DSA
   * key pair. Both are needed for signing and verification.
   */
  async generateSigningKeyPair(): Promise<HybridKeyPair> {
    const pq = await this.loadPQModule();

    // Generate classical Ed25519 key pair via Node.js crypto
    const ed25519Pair = await generateEd25519KeyPair();
    const classicalPubKey = ed25519Pair.publicKey;
    const classicalPrivKey = ed25519Pair.privateKey;

    // Generate post-quantum ML-DSA key pair
    let pqKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };

    switch (this.config.pqSignatureAlgorithm) {
      case 'ml-dsa-65':
        pqKeyPair = pq.ml_dsa65.keygen();
        break;
      case 'ml-dsa-87':
        pqKeyPair = pq.ml_dsa87.keygen();
        break;
      default:
        throw new Error(`Unsupported PQ signature algorithm: ${this.config.pqSignatureAlgorithm}`);
    }

    const keyPair: HybridKeyPair = {
      id: generateId(),
      classicalPublicKey: toBase64(classicalPubKey),
      classicalPrivateKey: toBase64(classicalPrivKey),
      pqPublicKey: toBase64(pqKeyPair.publicKey),
      pqPrivateKey: toBase64(pqKeyPair.secretKey),
      classicalAlgorithm: this.config.signatureAlgorithm,
      pqAlgorithm: this.config.pqSignatureAlgorithm,
      createdAt: new Date().toISOString(),
    };

    this.config.logger(
      `[HybridCrypto] Generated signing key pair: ${keyPair.id} ` +
        `(${keyPair.classicalAlgorithm} + ${keyPair.pqAlgorithm})`
    );

    return keyPair;
  }

  /**
   * Generate a hybrid key pair for key encapsulation (key exchange).
   */
  async generateKEMKeyPair(): Promise<HybridKeyPair> {
    const pq = await this.loadPQModule();

    // Generate classical X25519 key pair via Node.js crypto
    const x25519Pair = await generateX25519KeyPair();
    const classicalPubKey = x25519Pair.publicKey;
    const classicalPrivKey = x25519Pair.privateKey;

    // Generate post-quantum ML-KEM key pair
    let pqKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };

    switch (this.config.pqKeyExchangeAlgorithm) {
      case 'ml-kem-768':
        pqKeyPair = pq.ml_kem768.keygen();
        break;
      case 'ml-kem-1024':
        pqKeyPair = pq.ml_kem1024.keygen();
        break;
      default:
        throw new Error(`Unsupported PQ KEM algorithm: ${this.config.pqKeyExchangeAlgorithm}`);
    }

    return {
      id: generateId(),
      classicalPublicKey: toBase64(classicalPubKey),
      classicalPrivateKey: toBase64(classicalPrivKey),
      pqPublicKey: toBase64(pqKeyPair.publicKey),
      pqPrivateKey: toBase64(pqKeyPair.secretKey),
      classicalAlgorithm: this.config.keyExchangeAlgorithm,
      pqAlgorithm: this.config.pqKeyExchangeAlgorithm,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Sign a message with hybrid (classical + PQ) signatures.
   */
  async sign(message: Uint8Array, keyPair: HybridKeyPair): Promise<HybridSignature> {
    const pq = await this.loadPQModule();

    // Classical Ed25519 signature via Node.js crypto
    const classicalPrivKey = fromBase64(keyPair.classicalPrivateKey);
    const classicalSig = await ed25519Sign(message, classicalPrivKey);

    // Post-quantum signature
    const pqPrivKey = fromBase64(keyPair.pqPrivateKey);
    let pqSig: Uint8Array;

    switch (keyPair.pqAlgorithm) {
      case 'ml-dsa-65':
        pqSig = pq.ml_dsa65.sign(pqPrivKey, message);
        break;
      case 'ml-dsa-87':
        pqSig = pq.ml_dsa87.sign(pqPrivKey, message);
        break;
      default:
        throw new Error(`Unsupported PQ algorithm: ${keyPair.pqAlgorithm}`);
    }

    // Combine both signatures
    const combined = new Uint8Array(classicalSig.length + pqSig.length);
    combined.set(classicalSig, 0);
    combined.set(pqSig, classicalSig.length);

    this.config.logger(`[HybridCrypto] Signed ${message.length} bytes with hybrid signature`);

    return {
      classicalSignature: toBase64(classicalSig),
      pqSignature: toBase64(pqSig),
      classicalAlgorithm: keyPair.classicalAlgorithm,
      pqAlgorithm: keyPair.pqAlgorithm,
      combined: toBase64(combined),
    };
  }

  /**
   * Verify a hybrid signature.
   * Both classical and post-quantum signatures must verify.
   */
  async verify(
    message: Uint8Array,
    signature: HybridSignature,
    publicKeys: { classicalPublicKey: string; pqPublicKey: string }
  ): Promise<HybridVerificationResult> {
    const pq = await this.loadPQModule();

    // Verify classical Ed25519 signature via Node.js crypto
    let classicalValid = false;
    try {
      const classicalSig = fromBase64(signature.classicalSignature);
      const classicalPubKey = fromBase64(publicKeys.classicalPublicKey);
      classicalValid = await ed25519Verify(message, classicalSig, classicalPubKey);
    } catch (e) {
      classicalValid = false;
    }

    // Verify post-quantum signature
    let pqValid = false;
    try {
      const pqSig = fromBase64(signature.pqSignature);
      const pqPubKey = fromBase64(publicKeys.pqPublicKey);

      switch (signature.pqAlgorithm) {
        case 'ml-dsa-65':
          pqValid = pq.ml_dsa65.verify(pqPubKey, message, pqSig);
          break;
        case 'ml-dsa-87':
          pqValid = pq.ml_dsa87.verify(pqPubKey, message, pqSig);
          break;
      }
    } catch (e) {
      pqValid = false;
    }

    const valid = this.config.requireBoth ? classicalValid && pqValid : classicalValid || pqValid;

    return {
      valid,
      classicalValid,
      pqValid,
      error: !valid ? `Verification failed: classical=${classicalValid}, pq=${pqValid}` : undefined,
    };
  }

  /**
   * Perform hybrid key encapsulation (key exchange).
   * Generates a shared secret using both classical and PQ key exchange.
   */
  async encapsulate(recipientPublicKeys: {
    classicalPublicKey: string;
    pqPublicKey: string;
  }): Promise<HybridEncapsulation> {
    const pq = await this.loadPQModule();

    // Classical X25519 Diffie-Hellman key exchange via Node.js crypto
    // Generate an ephemeral X25519 key pair for this encapsulation
    const ephemeral = await generateX25519KeyPair();
    const recipientClassicalPubKey = fromBase64(recipientPublicKeys.classicalPublicKey);
    // The "ciphertext" in KEM terms is our ephemeral public key
    const classicalCiphertext = ephemeral.publicKey;
    // Derive shared secret: ephemeral private + recipient public
    const classicalSecret = await x25519DeriveSecret(
      ephemeral.privateKey,
      recipientClassicalPubKey
    );

    // Post-quantum key encapsulation
    const pqPubKey = fromBase64(recipientPublicKeys.pqPublicKey);
    let pqResult: { cipherText: Uint8Array; sharedSecret: Uint8Array };

    switch (this.config.pqKeyExchangeAlgorithm) {
      case 'ml-kem-768':
        pqResult = pq.ml_kem768.encapsulate(pqPubKey);
        break;
      case 'ml-kem-1024':
        pqResult = pq.ml_kem1024.encapsulate(pqPubKey);
        break;
      default:
        throw new Error(`Unsupported PQ KEM: ${this.config.pqKeyExchangeAlgorithm}`);
    }

    // Combine secrets
    const combinedSecret = await combineSecrets(classicalSecret, pqResult.sharedSecret);

    this.config.logger('[HybridCrypto] Hybrid key encapsulation completed');

    return {
      classicalCiphertext: toBase64(classicalCiphertext),
      pqCiphertext: toBase64(pqResult.cipherText),
      sharedSecret: toBase64(combinedSecret),
    };
  }

  /**
   * Decapsulate -- recover the shared secret from encapsulation ciphertexts
   * using the recipient's private KEM key pair.
   */
  async decapsulate(
    encapsulation: HybridEncapsulation,
    recipientKeyPair: HybridKeyPair
  ): Promise<Uint8Array> {
    const pq = await this.loadPQModule();

    // Classical: derive shared secret from sender's ephemeral public key
    const senderEphemeralPub = fromBase64(encapsulation.classicalCiphertext);
    const ourPrivKey = fromBase64(recipientKeyPair.classicalPrivateKey);
    const classicalSecret = await x25519DeriveSecret(ourPrivKey, senderEphemeralPub);

    // Post-quantum decapsulation
    const pqCiphertext = fromBase64(encapsulation.pqCiphertext);
    const pqSecretKey = fromBase64(recipientKeyPair.pqPrivateKey);
    let pqSecret: Uint8Array;

    switch (this.config.pqKeyExchangeAlgorithm) {
      case 'ml-kem-768':
        pqSecret = pq.ml_kem768.decapsulate(pqCiphertext, pqSecretKey);
        break;
      case 'ml-kem-1024':
        pqSecret = pq.ml_kem1024.decapsulate(pqCiphertext, pqSecretKey);
        break;
      default:
        throw new Error(`Unsupported PQ KEM: ${this.config.pqKeyExchangeAlgorithm}`);
    }

    const combined = await combineSecrets(classicalSecret, pqSecret);
    this.config.logger('[HybridCrypto] Hybrid key decapsulation completed');
    return combined;
  }

  /**
   * Encrypt plaintext using a hybrid-derived shared secret (AES-256-GCM).
   *
   * The sharedSecret should be the base64-encoded output from encapsulate().
   * Returns base64-encoded ciphertext (iv + authTag + encrypted data).
   */
  async encrypt(plaintext: Uint8Array, sharedSecretB64: string): Promise<string> {
    const key = fromBase64(sharedSecretB64);
    if (key.length !== 32) {
      throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
    }
    const packed = await aes256GcmEncrypt(plaintext, key);
    this.config.logger(`[HybridCrypto] Encrypted ${plaintext.length} bytes`);
    return toBase64(packed);
  }

  /**
   * Decrypt ciphertext using a hybrid-derived shared secret (AES-256-GCM).
   *
   * The ciphertextB64 should be the base64 string returned from encrypt().
   * The sharedSecretB64 should match the key used for encryption.
   */
  async decrypt(ciphertextB64: string, sharedSecretB64: string): Promise<Uint8Array> {
    const key = fromBase64(sharedSecretB64);
    if (key.length !== 32) {
      throw new Error(`Decryption key must be 32 bytes, got ${key.length}`);
    }
    const packed = fromBase64(ciphertextB64);
    if (packed.length < 28) {
      throw new Error('Ciphertext too short (must include IV + authTag)');
    }
    const plaintext = await aes256GcmDecrypt(packed, key);
    this.config.logger(`[HybridCrypto] Decrypted ${plaintext.length} bytes`);
    return plaintext;
  }

  /**
   * Get the provider's configuration.
   */
  getConfig(): Readonly<Required<HybridCryptoConfig>> {
    return { ...this.config };
  }

  /**
   * Check if @noble/post-quantum is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.loadPQModule();
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _globalProvider: HybridCryptoProvider | null = null;

export function getHybridCryptoProvider(config?: HybridCryptoConfig): HybridCryptoProvider {
  if (!_globalProvider) {
    _globalProvider = new HybridCryptoProvider(config);
  }
  return _globalProvider;
}

export function resetHybridCryptoProvider(): void {
  _globalProvider = null;
}
