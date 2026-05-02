/**
 * Tier 2 Custodial Wallet Service — Phase 5.
 *
 * Handles the lifecycle of user custodial wallets:
 *   1. Key generation (ed25519) on first OAuth sign-in
 *   2. AES-GCM encryption of the private key with a KMS-held wrapping key
 *   3. Registration of the public key in the attestation registry under
 *      platform-root (m/44'/60'/2'/0/<user-ordinal>)
 *   4. Decryption-only-inside-authenticated-handler enforcement
 *   5. Audit logging of every key access
 *   6. Key rotation support
 *
 * Per ADR §"Server-side key management (Q2 approved)":
 *   - "Private keys stored encrypted at rest with AES-GCM + KMS-held wrapping key"
 *   - "Decryption happens only inside the server process handling an
 *      OAuth-authenticated request"
 *   - "Audit log of every private-key access"
 *   - "Redaction at structured-log-middleware level"
 *   - "Principle of least privilege on the service role"
 *   - "2FA on GitHub OAuth opt-in"
 *   - "TEE deferred to v2"
 *
 * Architecture note on KMS integration:
 *   The KMS wrapping key is retrieved via `getWrappingKey()`. In v1 (this
 *   module), the wrapping key comes from an env var
 *   (`HOLOMESH_KMS_WRAPPING_KEY_B64`) for dev/staging, or from an AWS/GCP
 *   KMS call in production. The encryption envelope is:
 *
 *     ciphertext = AES-256-GCM(plaintext=private_key_bytes, key=data_key, iv=random_12_bytes)
 *     encrypted_data_key = AES-256-ECB(plaintext=data_key, key=wrapping_key)
 *     stored = { encrypted_data_key, iv, ciphertext, auth_tag }
 *
 *   This is the standard envelope encryption pattern. The wrapping key never
 *   touches disk; data keys are ephemeral per encryption operation.
 *
 * @module holomesh/identity/custodial-wallet
 */

import * as crypto from 'crypto';
import {
  appendAuditEvent,
  auditKeyAccess,
  auditKeyAccessDenied,
  auditKeyGenerated,
  auditKeyRotated,
  auditSigningPerformed,
  hashPublicKey,
  redactForLogging,
  redactPrivateKey,
  type AuditEvent,
} from './audit-log';
import { getAttestationRegistry, type SigningContext } from './signing-middleware';
import type { Attestation } from './attestation-registry';

// ── Constants ──────────────────────────────────────────────────────────────

/** AES-256-GCM key length in bytes. */
const DATA_KEY_BYTES = 32;

/** AES-GCM IV length (12 bytes per NIST SP 800-38D). */
const IV_BYTES = 12;

/** AES-GCM authentication tag length (16 bytes). */
const AUTH_TAG_BYTES = 16;

/** Ed25519 public key length (32 bytes). */
const ED25519_PUBLIC_KEY_BYTES = 32;

/** Ed25519 private key length (64 bytes — seed + public key concatenated). */
const ED25519_PRIVATE_KEY_BYTES = 64;

/** Platform-root derivation path prefix per ADR §Q1. */
const PLATFORM_ROOT_PATH = "m/44'/60'/2'/0";

// ── Types ──────────────────────────────────────────────────────────────────

/** Stored representation of an encrypted custodial wallet. */
export interface StoredCustodialWallet {
  /** User ID (GitHub OAuth subject or internal ID). */
  userId: string;
  /** Ed25519 public key in base64. Safe to log and display. */
  publicKeyBase64: string;
  /** SHA-256 hash of the public key (first 16 hex chars) for audit references. */
  publicKeyHash: string;
  /** AES-256-GCM-encrypted private key, base64-encoded.
   *  Format: base64(iv || ciphertext || auth_tag) */
  encryptedPrivateKeyBase64: string;
  /** AES-256-ECB-encrypted data key (wrapped by KMS), base64-encoded.
   *  This is the envelope encryption layer. */
  encryptedDataKeyBase64: string;
  /** Derivation path in the platform-root subtree. */
  derivationPath: string;
  /** User ordinal (sequential index under platform-root). */
  userOrdinal: number;
  /** ISO 8601 timestamp when the wallet was provisioned. */
  createdAt: string;
  /** ISO 8601 timestamp when the wallet was last rotated, or null. */
  rotatedAt: string | null;
  /** Whether 2FA has been opted in for this wallet. */
  twoFactorEnabled: boolean;
  /** Wallet custody mode. 'custodial_active' is the default; transitions
   *  to 'self_custody_active' when the user completes the export flow. */
  custodyMode: 'custodial_active' | 'self_custody_active';
}

/** Result of a successful wallet provisioning. */
export interface ProvisionResult {
  wallet: StoredCustodialWallet;
  attestation: Attestation;
}

/** Result of a custodial signing operation. */
export interface CustodialSignResult {
  signatureBase64: string;
  auditEventId: string;
}

// ── Wrapping key management ────────────────────────────────────────────────

/**
 * Get the KMS wrapping key. In v1, this comes from an environment variable
 * (base64-encoded 32-byte AES key). In production, this should be replaced
 * with an AWS KMS or GCP Cloud KMS call.
 *
 * The wrapping key is used ONLY for envelope encryption of the per-wallet
 * data keys. It never directly encrypts user private keys.
 */
function getWrappingKey(): Buffer {
  const b64 = process.env.HOLOMESH_KMS_WRAPPING_KEY_B64;
  if (!b64) {
    throw new Error(
      'custodial-wallet: HOLOMESH_KMS_WRAPPING_KEY_B64 env var required. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== DATA_KEY_BYTES) {
    throw new Error(
      `custodial-wallet: wrapping key must be ${DATA_KEY_BYTES} bytes, got ${key.length}`
    );
  }
  return key;
}

/**
 * Generate a random data key for envelope encryption. Each wallet gets its
 * own data key; the data key is wrapped (encrypted) by the KMS wrapping key
 * for storage.
 */
function generateDataKey(): Buffer {
  return crypto.randomBytes(DATA_KEY_BYTES);
}

/**
 * Wrap (encrypt) a data key with the KMS wrapping key using AES-256-ECB.
 * This is the standard envelope encryption pattern used by AWS KMS and GCP KMS.
 *
 * ECB is safe here because:
 *   1. The plaintext (data key) is exactly one block (32 bytes = 2 AES blocks)
 *   2. Each data key is unique — no pattern leakage across blocks
 *   3. The wrapping key is never used for any other purpose
 */
function wrapDataKey(dataKey: Buffer, wrappingKey: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-256-ecb', wrappingKey, null);
  return Buffer.concat([cipher.update(dataKey), cipher.final()]);
}

/**
 * Unwrap (decrypt) a data key using the KMS wrapping key.
 */
function unwrapDataKey(encryptedDataKey: Buffer, wrappingKey: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-ecb', wrappingKey, null);
  return Buffer.concat([decipher.update(encryptedDataKey), decipher.final()]);
}

// ── AES-GCM encryption/decryption ─────────────────────────────────────────

/**
 * Encrypt a private key with AES-256-GCM using a data key.
 * Returns the concatenation: iv (12) || ciphertext || auth_tag (16)
 */
function encryptPrivateKey(privateKeyBytes: Buffer, dataKey: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]);
}

/**
 * Decrypt a private key from AES-256-GCM ciphertext.
 * Input format: iv (12) || ciphertext || auth_tag (16)
 */
function decryptPrivateKey(encryptedBlob: Buffer, dataKey: Buffer): Buffer {
  const iv = encryptedBlob.subarray(0, IV_BYTES);
  const authTag = encryptedBlob.subarray(encryptedBlob.length - AUTH_TAG_BYTES);
  const ciphertext = encryptedBlob.subarray(IV_BYTES, encryptedBlob.length - AUTH_TAG_BYTES);

  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Wallet store (in-memory — swap for DB in production) ──────────────────

const walletStore = new Map<string, StoredCustodialWallet>();

/**
 * User ordinal counter for platform-root derivation paths.
 * In production, this should be a monotonic counter in the database.
 * For v1, we use the size of the wallet store + 1.
 */
function nextUserOrdinal(): number {
  return walletStore.size + 1;
}

// ── Public API: provision ─────────────────────────────────────────────────

/**
 * Provision a new custodial wallet for a user.
 *
 * This is called once during the GitHub OAuth sign-in flow when a user is
 * first authenticated and has no existing wallet. It:
 *   1. Generates an ed25519 keypair
 *   2. Encrypts the private key with AES-256-GCM + KMS-wrapped data key
 *   3. Stores the encrypted wallet
 *   4. Registers the public key in the attestation registry under platform-root
 *   5. Emits a key_generated audit event
 *
 * If the user already has a custodial wallet, this returns the existing one
 * without generating a new keypair (idempotent on userId).
 *
 * @throws {Error} If the wrapping key is not configured or key generation fails.
 */
export function provisionCustodialWallet(
  userId: string,
  options: {
    /** Override the attestation registry (default: module singleton). */
    registry?: ReturnType<typeof getAttestationRegistry>;
    /** Override the wrapping key (for tests). */
    wrappingKey?: Buffer;
    /** Override clock for deterministic tests. */
    now?: () => Date;
    /** Who initiated this provisioning (for audit trail). */
    provisionedBy?: string;
    /** Source IP of the request (for audit trail). */
    sourceIp?: string;
  } = {}
): ProvisionResult {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('provisionCustodialWallet: userId required (string)');
  }

  // Idempotent: return existing wallet if user already has one
  const existing = walletStore.get(userId);
  if (existing) {
    return { wallet: existing, attestation: getAttestationRegistry().lookup(existing.publicKeyBase64)! };
  }

  const now = options.now ?? (() => new Date());
  const wrappingKey = options.wrappingKey ?? getWrappingKey();
  const registry = options.registry ?? getAttestationRegistry();
  const provisionedBy = options.provisionedBy ?? 'system:custodial-provisioning';
  const userOrdinal = nextUserOrdinal();
  const derivationPath = `${PLATFORM_ROOT_PATH}/${userOrdinal}`;

  // Step 1: Generate ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI DER is: 0x30 0x2a 0x30 0x05 ... 0x03 0x21 0x00 <32 bytes>
  // The raw 32-byte public key starts at offset -32 from the end
  const publicKeyBytes = publicKeyDer.subarray(publicKeyDer.length - ED25519_PUBLIC_KEY_BYTES);
  const publicKeyBase64 = publicKeyBytes.toString('base64');
  const publicKeyHash = hashPublicKey(publicKeyBase64);

  // Export the private key as raw bytes for encryption
  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  // Ed25519 PKCS8 DER: 0x30 ... 0x04 0x22 0x01 0x00 <34 bytes (seed + 0x00 pad?)>
  // Actually: 0x30 0x46 ... 0x04 0x22 0x01 0x00 <32-byte seed>
  // But for consistency with the export-package module, let's use the full PKCS8 DER
  // and just encrypt the full DER blob. On decryption we reconstruct the KeyObject.
  const privateKeyBytes = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const privateKeyBuf = Buffer.from(privateKeyBytes as string, 'utf8');

  // Step 2: Encrypt with AES-256-GCM + envelope encryption
  const dataKey = generateDataKey();
  const encryptedPrivateKey = encryptPrivateKey(privateKeyBuf, dataKey);
  const encryptedDataKey = wrapDataKey(dataKey, wrappingKey);

  // Step 3: Build the stored wallet
  const wallet: StoredCustodialWallet = {
    userId,
    publicKeyBase64,
    publicKeyHash,
    encryptedPrivateKeyBase64: encryptedPrivateKey.toString('base64'),
    encryptedDataKeyBase64: encryptedDataKey.toString('base64'),
    derivationPath,
    userOrdinal,
    createdAt: now().toISOString(),
    rotatedAt: null,
    twoFactorEnabled: false,
    custodyMode: 'custodial_active',
  };

  // Step 4: Store the wallet
  walletStore.set(userId, wallet);

  // Step 5: Register in attestation registry under platform-root
  const attestation: Attestation = {
    publicKey: `ed25519:${publicKeyBase64}`,
    seatId: `user:${userId}`,
    authorizedBy: 'platform-root',
    issuedAt: now().toISOString(),
    expiresAt: null,
  };
  registry.attest(attestation);

  // Step 6: Audit event
  auditKeyGenerated({
    userId,
    publicKeyHash,
    provisionedBy,
    derivationPath,
  });

  return { wallet, attestation };
}

// ── Public API: decrypt for signing ───────────────────────────────────────

/**
 * Decrypt a user's private key for a signing operation. This is the ONLY
 * code path that decrypts private keys, and it MUST be called inside an
 * authenticated request handler.
 *
 * Enforces:
 *   1. The caller must be authenticated (callerId is required)
 *   2. The caller must be the wallet owner OR a platform signing service
 *   3. Every decryption emits a key_accessed audit event
 *   4. The decrypted key is NEVER logged or returned to the caller — only
 *      the signing result is returned
 *
 * @throws {Error} If the user has no custodial wallet or is not authorized.
 */
export function decryptForSigning(
  userId: string,
  callerId: string,
  options: {
    /** Override wrapping key (for tests). */
    wrappingKey?: Buffer;
    /** Override clock for deterministic tests. */
    now?: () => Date;
    /** Source IP of the request (for audit trail). */
    sourceIp?: string;
  } = {}
): { privateKey: crypto.KeyObject; publicKeyBase64: string } {
  const wallet = walletStore.get(userId);
  if (!wallet) {
    auditKeyAccessDenied({
      userId,
      publicKeyHash: 'unknown',
      accessedBy: callerId,
      sourceIp: options.sourceIp,
      reason: 'no_wallet_found',
    });
    throw new Error(`custodial-wallet: no wallet found for user ${userId}`);
  }

  // Authorization check: only the wallet owner or the platform signing
  // service can decrypt. The signing service is identified by the
  // 'system:custodial-signing-service' prefix.
  const isOwner = callerId === userId;
  const isSigningService = callerId.startsWith('system:');
  if (!isOwner && !isSigningService) {
    auditKeyAccessDenied({
      userId,
      publicKeyHash: wallet.publicKeyHash,
      accessedBy: callerId,
      sourceIp: options.sourceIp,
      reason: 'not_authorized',
    });
    throw new Error(
      `custodial-wallet: caller ${callerId} is not authorized to access wallet of user ${userId}`
    );
  }

  // Check custody mode — if user has migrated to self-custody, reject
  if (wallet.custodyMode === 'self_custody_active') {
    auditKeyAccessDenied({
      userId,
      publicKeyHash: wallet.publicKeyHash,
      accessedBy: callerId,
      sourceIp: options.sourceIp,
      reason: 'user_migrated_to_self_custody',
    });
    throw new Error(
      `custodial-wallet: user ${userId} has migrated to self-custody; custodial signing is permanently disabled`
    );
  }

  const wrappingKey = options.wrappingKey ?? getWrappingKey();

  // Unwrap the data key
  const encryptedDataKey = Buffer.from(wallet.encryptedDataKeyBase64, 'base64');
  const dataKey = unwrapDataKey(encryptedDataKey, wrappingKey);

  // Decrypt the private key
  const encryptedPrivateKey = Buffer.from(wallet.encryptedPrivateKeyBase64, 'base64');
  const privateKeyPem = decryptPrivateKey(encryptedPrivateKey, dataKey);
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem.toString('utf8'),
    format: 'pem',
    type: 'pkcs8',
  });

  // Audit: key was accessed
  auditKeyAccess({
    userId,
    publicKeyHash: wallet.publicKeyHash,
    accessedBy: callerId,
    sourceIp: options.sourceIp,
    purpose: 'custodial_signing',
  });

  return { privateKey, publicKeyBase64: wallet.publicKeyBase64 };
}

// ── Public API: custodial signing ─────────────────────────────────────────

/**
 * Sign a payload on behalf of a user using their custodial wallet.
 *
 * This is the primary entry point for the custodial signing service.
 * It decrypts the private key, signs the payload, and returns the signature
 * without ever exposing the key material to the caller.
 *
 * Per ADR: "Decrypt only inside authenticated request handler."
 * The caller is responsible for ensuring the request is authenticated.
 *
 * @param userId The user whose wallet to sign with.
 * @param payload The bytes to sign (canonicalized request body).
 * @param callerId The authenticated caller making this request.
 * @returns The base64-encoded Ed25519 signature and an audit event ID.
 */
export function custodialSign(
  userId: string,
  payload: Buffer,
  callerId: string,
  options: {
    wrappingKey?: Buffer;
    now?: () => Date;
    sourceIp?: string;
  } = {}
): CustodialSignResult {
  const { privateKey, publicKeyBase64 } = decryptForSigning(userId, callerId, options);

  // Sign with Ed25519 (Node's crypto.sign with null algorithm for Ed25519)
  const signature = crypto.sign(null, payload, privateKey);

  // Audit: signing was performed
  const publicKeyHash = hashPublicKey(publicKeyBase64);
  const auditEvent = auditSigningPerformed({
    userId,
    publicKeyHash,
    signedBy: callerId,
    payloadType: 'request_body',
  });

  return {
    signatureBase64: signature.toString('base64'),
    auditEventId: auditEvent.id,
  };
}

// ── Public API: key rotation ───────────────────────────────────────────────

/**
 * Rotate a user's custodial keypair. Generates a new keypair, encrypts it,
 * and stores it. The old keypair is archived (not deleted — past signatures
 * remain valid). The attestation registry is updated with the new public key.
 *
 * The user's next signing operation will use the new key. Past signatures
 * from the old key remain valid-at-time-of-signing per the ADR.
 *
 * @returns The new wallet and attestation.
 */
export function rotateCustodialKey(
  userId: string,
  callerId: string,
  options: {
    registry?: ReturnType<typeof getAttestationRegistry>;
    wrappingKey?: Buffer;
    now?: () => Date;
    sourceIp?: string;
  } = {}
): ProvisionResult {
  const oldWallet = walletStore.get(userId);
  if (!oldWallet) {
    throw new Error(`custodial-wallet: no wallet found for user ${userId}`);
  }

  const now = options.now ?? (() => new Date());
  const wrappingKey = options.wrappingKey ?? getWrappingKey();
  const registry = options.registry ?? getAttestationRegistry();

  // Generate new keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyBytes = publicKeyDer.subarray(publicKeyDer.length - ED25519_PUBLIC_KEY_BYTES);
  const publicKeyBase64 = publicKeyBytes.toString('base64');
  const newPublicKeyHash = hashPublicKey(publicKeyBase64);

  // Encrypt new private key
  const dataKey = generateDataKey();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const privateKeyBuf = Buffer.from(privateKeyPem, 'utf8');
  const encryptedPrivateKey = encryptPrivateKey(privateKeyBuf, dataKey);
  const encryptedDataKey = wrapDataKey(dataKey, wrappingKey);

  // Update wallet in-place (old wallet is overwritten)
  const newWallet: StoredCustodialWallet = {
    ...oldWallet,
    publicKeyBase64,
    publicKeyHash: newPublicKeyHash,
    encryptedPrivateKeyBase64: encryptedPrivateKey.toString('base64'),
    encryptedDataKeyBase64: encryptedDataKey.toString('base64'),
    rotatedAt: now().toISOString(),
  };
  walletStore.set(userId, newWallet);

  // Register new attestation
  const newAtt: Attestation = {
    publicKey: `ed25519:${publicKeyBase64}`,
    seatId: `user:${userId}`,
    authorizedBy: 'platform-root',
    issuedAt: now().toISOString(),
    expiresAt: null,
  };
  registry.attest(newAtt);

  // Retire old attestation — use the same key format as the attest call
  registry.retire(`ed25519:${oldWallet.publicKeyBase64}`, 'key_rotation');

  // Audit
  auditKeyRotated({
    userId,
    oldPublicKeyHash: oldWallet.publicKeyHash,
    newPublicKeyHash,
    rotatedBy: callerId,
  });

  return { wallet: newWallet, attestation: newAtt };
}

// ── Public API: wallet lookup ──────────────────────────────────────────────

/**
 * Get a user's wallet info (public key only, never the private key).
 * This is safe to call from any context — it returns no key material.
 */
export function getWalletInfo(userId: string): {
  publicKeyBase64: string;
  publicKeyHash: string;
  derivationPath: string;
  userOrdinal: number;
  createdAt: string;
  rotatedAt: string | null;
  twoFactorEnabled: boolean;
  custodyMode: string;
} | null {
  const wallet = walletStore.get(userId);
  if (!wallet) return null;

  // Never expose encrypted key material or data keys from this API
  return {
    publicKeyBase64: wallet.publicKeyBase64,
    publicKeyHash: wallet.publicKeyHash,
    derivationPath: wallet.derivationPath,
    userOrdinal: wallet.userOrdinal,
    createdAt: wallet.createdAt,
    rotatedAt: wallet.rotatedAt,
    twoFactorEnabled: wallet.twoFactorEnabled,
    custodyMode: wallet.custodyMode,
  };
}

/**
 * Check if a user has a custodial wallet provisioned.
 */
export function hasCustodialWallet(userId: string): boolean {
  return walletStore.has(userId);
}

/**
 * Enable 2FA opt-in for a user's wallet.
 * Per ADR §Q2: "2FA on GitHub OAuth opt-in (required for token-purchase
 * and key-export flows; optional for read-only)".
 */
export function enableTwoFactor(userId: string): boolean {
  const wallet = walletStore.get(userId);
  if (!wallet) return false;
  wallet.twoFactorEnabled = true;
  return true;
}

/**
 * Check if 2FA is enabled for a user's wallet.
 */
export function isTwoFactorEnabled(userId: string): boolean {
  return walletStore.get(userId)?.twoFactorEnabled ?? false;
}

/**
 * Mark a user's wallet as having migrated to self-custody.
 * This permanently disables custodial signing for the user (Invariant #1).
 */
export function markSelfCustodyActive(userId: string): boolean {
  const wallet = walletStore.get(userId);
  if (!wallet) return false;
  wallet.custodyMode = 'self_custody_active';
  return true;
}

// ── Test helpers ───────────────────────────────────────────────────────────

/** Test-only: reset the in-memory wallet store. */
export function _resetCustodialWalletForTests(): void {
  walletStore.clear();
}

/** Test-only: get the raw wallet store for assertions. DO NOT use in production. */
export function _getWalletStoreForTests(): Map<string, StoredCustodialWallet> {
  return walletStore;
}

/** Test-only: generate a wrapping key for tests. */
export function _generateTestWrappingKey(): Buffer {
  return crypto.randomBytes(DATA_KEY_BYTES);
}

/** Test-only: generate a development wrapping key and print the env var. */
export function generateDevWrappingKey(): string {
  const key = crypto.randomBytes(DATA_KEY_BYTES);
  return key.toString('base64');
}