/**
 * Tier 2 Self-Custody Export Package — crypto half (task_1776990890662_jdz1).
 *
 * Sibling foundation: export-session.ts (task_1776990890662_2bpv, commit 0b8deb2cd)
 * provides session state + TTL + idempotency. THIS module is independent of the
 * session model on purpose — the API layer (_ards) wires the two together so
 * crypto can be unit-tested without touching session storage.
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 *
 * Algorithm choice (deviation from spec discriminator strings, recorded inline):
 *
 *   The spec format JSON suggests `kdf: "argon2id"` and `cipher: "xchacha20poly1305"`,
 *   but the format is discriminator-based — `kdf` and `cipher` are STRINGS, so the
 *   on-disk shape carries algorithm names rather than implying a fixed primitive.
 *
 *   Repo currently has NO argon2 / NO libsodium dep (verified 2026-04-23 against
 *   packages/mcp-server/package.json). Adding native crypto deps (@node-rs/argon2,
 *   sodium-native) drags compile-time toolchain risk and breaks parallel-lane peers
 *   per W.082. Instead, this implementation uses Node-built-in primitives and
 *   advertises them in the discriminator fields:
 *
 *     - KDF:    `kdf: "scrypt"`              (Node `crypto.scryptSync`, memory-hard)
 *     - Cipher: `cipher: "chacha20-poly1305"` (Node IETF variant, 12-byte nonce)
 *     - Sign:   Ed25519                       (Node `crypto.createSign('ed25519')`)
 *
 *   This preserves the spec's structural shape (KDF block + cipher block + manifest
 *   hash + signature) and keeps `version: "v3.0"` as a forward-compat anchor. A
 *   future v3.1 can add argon2id/xchacha as additional discriminator values without
 *   breaking existing v3.0 packages — the verification helpers gate on discriminator
 *   strings, not hardcoded primitives.
 *
 * Verification helpers DO NOT throw on bad input — they return boolean / null so the
 * finalize handler can distinguish "wrong password" from "tampered package" and emit
 * the right audit event (per spec acceptance test #4).
 */

import * as crypto from 'crypto';

// --- Format constants -------------------------------------------------------

export const EXPORT_PACKAGE_VERSION = 'v3.0';
export const EXPORT_PACKAGE_KDF = 'scrypt' as const;
export const EXPORT_PACKAGE_CIPHER = 'chacha20-poly1305' as const;
export const EXPORT_PACKAGE_SIG_ALG = 'ed25519' as const;

/** scrypt cost params — N=2^17 ≈ 64MB peak, well above the 16MB OWASP floor. */
const SCRYPT_PARAMS = {
  N: 1 << 17, // 131072
  r: 8,
  p: 1,
  keyLen: 32, // ChaCha20-Poly1305 key length
} as const;

const SALT_BYTES = 16;
const NONCE_BYTES = 12; // IETF ChaCha20-Poly1305
const AUTH_TAG_BYTES = 16;

// --- Type definitions -------------------------------------------------------

export interface ExportPackageKdfParams {
  /** scrypt cost factor N (power of 2). */
  memory: number;
  /** scrypt block size r. */
  iterations: number;
  /** scrypt parallelization p. */
  parallelism: number;
  /** Base64-encoded salt. */
  salt: string;
}

export interface ExportPackageEncryption {
  kdf: typeof EXPORT_PACKAGE_KDF;
  kdf_params: ExportPackageKdfParams;
  cipher: typeof EXPORT_PACKAGE_CIPHER;
  /** Base64-encoded 12-byte nonce. */
  nonce: string;
}

/**
 * The on-disk export package — the JSON shape downloaded by the user and
 * later re-uploaded for finalize verification.
 */
export interface ExportPackage {
  version: typeof EXPORT_PACKAGE_VERSION;
  user_id: string;
  issued_at: string;
  expires_at: string;
  encryption: ExportPackageEncryption;
  /** Base64-encoded ciphertext + auth tag. */
  payload: string;
  /** SHA-256 hash of the canonical manifest, prefixed with "sha256:". */
  manifest_hash: string;
  /** Base64-encoded Ed25519 signature over the manifest hash. */
  signature: string;
}

/** Decrypted recovery secret returned to the wallet import flow. */
export interface DecryptedRecoverySecret {
  /** Raw bytes the user imports into their wallet software. */
  recovery_bytes: Buffer;
  /** Echo of the package metadata for audit binding. */
  user_id: string;
  issued_at: string;
}

/** Inputs to {@link buildExportPackage}. Coupling-free of session model on purpose. */
export interface BuildExportPackageInput {
  user_id: string;
  /** The recovery secret bytes the user must protect — wallet seed, signing key, etc. */
  recovery_bytes: Buffer;
  /** User-chosen recovery password — strength check happens in API layer. */
  password: string;
  /** PEM-encoded Ed25519 private key OR a KeyObject. */
  platform_signing_key: crypto.KeyObject | string;
  /** ISO-8601 issue timestamp. Defaults to now(). */
  issued_at?: string;
  /** ISO-8601 expiry. Defaults to issued_at + 24h. */
  expires_at?: string;
  /** Optional clock for deterministic tests. */
  now?: () => Date;
}

// --- Internal helpers -------------------------------------------------------

const DEFAULT_PACKAGE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeSigningKey(key: crypto.KeyObject | string): crypto.KeyObject {
  if (typeof key === 'string') return crypto.createPrivateKey(key);
  return key;
}

/**
 * Derive an encryption key from password + salt using scrypt. Pure function
 * (KDF determinism gate per acceptance test #5).
 */
export function deriveExportKey(password: string, saltBase64: string): Buffer {
  const salt = Buffer.from(saltBase64, 'base64');
  if (salt.length === 0) {
    throw new Error('export-package: empty salt rejected');
  }
  return crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    // scrypt requires maxmem >= 128 * N * r bytes; bump to fit N=2^17.
    maxmem: 256 * SCRYPT_PARAMS.N * SCRYPT_PARAMS.r,
  });
}

/**
 * Canonical manifest = the package minus payload + signature, JSON-stringified
 * with sorted top-level keys. Manifest hash is computed over THIS string.
 *
 * Sort discipline matters: signature verification must be byte-stable across
 * Node versions, so we hand-roll the field order rather than rely on JS object
 * iteration order.
 */
export function canonicalManifest(pkg: ExportPackage): string {
  const manifest = {
    version: pkg.version,
    user_id: pkg.user_id,
    issued_at: pkg.issued_at,
    expires_at: pkg.expires_at,
    encryption: {
      kdf: pkg.encryption.kdf,
      kdf_params: {
        memory: pkg.encryption.kdf_params.memory,
        iterations: pkg.encryption.kdf_params.iterations,
        parallelism: pkg.encryption.kdf_params.parallelism,
        salt: pkg.encryption.kdf_params.salt,
      },
      cipher: pkg.encryption.cipher,
      nonce: pkg.encryption.nonce,
    },
  };
  return JSON.stringify(manifest);
}

function computeManifestHash(pkg: ExportPackage): string {
  const hex = crypto.createHash('sha256').update(canonicalManifest(pkg)).digest('hex');
  return `sha256:${hex}`;
}

// --- Public API: build ------------------------------------------------------

/**
 * Build a complete encrypted export package. Combines KDF + AEAD encryption +
 * manifest signing in one shot so the API layer can call it atomically.
 *
 * Output shape matches the spec verbatim (modulo the documented kdf/cipher
 * discriminator deviation). Decoupled from {@link export-session.ts} —
 * the API layer holds the session and this function holds the bytes.
 */
export function buildExportPackage(input: BuildExportPackageInput): ExportPackage {
  if (!input.user_id || !input.user_id.trim()) {
    throw new Error('export-package: user_id required');
  }
  if (!input.recovery_bytes || input.recovery_bytes.length === 0) {
    throw new Error('export-package: recovery_bytes required');
  }
  if (!input.password || input.password.length === 0) {
    throw new Error('export-package: password required');
  }

  const now = input.now ? input.now() : new Date();
  const issued_at = input.issued_at ?? now.toISOString();
  const expires_at =
    input.expires_at ?? new Date(now.getTime() + DEFAULT_PACKAGE_TTL_MS).toISOString();

  const salt = crypto.randomBytes(SALT_BYTES);
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const saltBase64 = salt.toString('base64');
  const nonceBase64 = nonce.toString('base64');

  const key = deriveExportKey(input.password, saltBase64);

  // ChaCha20-Poly1305 (IETF, 12-byte nonce). The spec calls for xchacha but
  // node:crypto only ships the IETF variant — see the file-header rationale
  // and the discriminator-based forward-compat path.
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([cipher.update(input.recovery_bytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, authTag]).toString('base64');

  // Build the package WITHOUT manifest_hash + signature, then fill them in.
  // This keeps `canonicalManifest` honest about what fields it covers.
  const partial: ExportPackage = {
    version: EXPORT_PACKAGE_VERSION,
    user_id: input.user_id,
    issued_at,
    expires_at,
    encryption: {
      kdf: EXPORT_PACKAGE_KDF,
      kdf_params: {
        memory: SCRYPT_PARAMS.N,
        iterations: SCRYPT_PARAMS.r,
        parallelism: SCRYPT_PARAMS.p,
        salt: saltBase64,
      },
      cipher: EXPORT_PACKAGE_CIPHER,
      nonce: nonceBase64,
    },
    payload,
    manifest_hash: '', // filled below
    signature: '', // filled below
  };

  const manifestHash = computeManifestHash(partial);

  const signingKey = normalizeSigningKey(input.platform_signing_key);
  // Ed25519 in Node 16+: pass null for the algorithm to crypto.sign().
  const signature = crypto.sign(null, Buffer.from(manifestHash), signingKey).toString('base64');

  partial.manifest_hash = manifestHash;
  partial.signature = signature;
  return partial;
}

// --- Public API: verify -----------------------------------------------------

/**
 * Recompute the manifest hash and compare against the stored one.
 * Returns boolean — does NOT throw — so finalize can audit the failure mode.
 *
 * Tamper of any covered field (version, user_id, timestamps, encryption block)
 * fails this check (acceptance test #2).
 */
export function verifyManifestHash(pkg: ExportPackage): boolean {
  if (!pkg || typeof pkg.manifest_hash !== 'string') return false;
  try {
    const recomputed = computeManifestHash(pkg);
    // Constant-time string comparison.
    const a = Buffer.from(pkg.manifest_hash);
    const b = Buffer.from(recomputed);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify the Ed25519 signature over the manifest hash using the platform's
 * public key. Returns boolean — does NOT throw (acceptance test #3).
 *
 * @param pkg The export package.
 * @param publicKey PEM-encoded Ed25519 public key OR a KeyObject.
 */
export function verifyPlatformSignature(
  pkg: ExportPackage,
  publicKey: crypto.KeyObject | string
): boolean {
  if (!pkg || typeof pkg.signature !== 'string' || typeof pkg.manifest_hash !== 'string') {
    return false;
  }
  try {
    const key = typeof publicKey === 'string' ? crypto.createPublicKey(publicKey) : publicKey;
    const sigBytes = Buffer.from(pkg.signature, 'base64');
    return crypto.verify(null, Buffer.from(pkg.manifest_hash), key, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Decrypt the package payload with the user's password.
 * Returns null on bad password OR malformed payload (acceptance test #4)
 * so the finalize handler can distinguish "wrong password" from "tampered
 * package" by checking {@link verifyManifestHash} / {@link verifyPlatformSignature}
 * separately.
 *
 * Caller is responsible for verifying manifest hash + signature BEFORE
 * trusting the decrypted bytes.
 */
export function decryptPayload(
  pkg: ExportPackage,
  password: string
): DecryptedRecoverySecret | null {
  if (!pkg || !password) return null;

  try {
    const key = deriveExportKey(password, pkg.encryption.kdf_params.salt);
    const nonce = Buffer.from(pkg.encryption.nonce, 'base64');
    const blob = Buffer.from(pkg.payload, 'base64');
    if (blob.length < AUTH_TAG_BYTES) return null;

    const ciphertext = blob.subarray(0, blob.length - AUTH_TAG_BYTES);
    const authTag = blob.subarray(blob.length - AUTH_TAG_BYTES);

    const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return {
      recovery_bytes: plaintext,
      user_id: pkg.user_id,
      issued_at: pkg.issued_at,
    };
  } catch {
    // AEAD auth-tag mismatch (wrong password OR ciphertext tamper) raises here.
    return null;
  }
}

/**
 * Helper for tests + ops tooling — generates an Ed25519 keypair the platform
 * can use as its signing key. NOT called from production paths (signing key
 * is provisioned out-of-band).
 */
export function generatePlatformKeypair(): {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKey, privateKey };
}
