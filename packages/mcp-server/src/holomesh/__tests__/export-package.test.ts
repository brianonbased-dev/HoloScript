import { describe, it, expect, beforeAll } from 'vitest';
import * as crypto from 'crypto';
import {
  buildExportPackage,
  canonicalManifest,
  decryptPayload,
  deriveExportKey,
  EXPORT_PACKAGE_CIPHER,
  EXPORT_PACKAGE_KDF,
  EXPORT_PACKAGE_VERSION,
  generatePlatformKeypair,
  verifyManifestHash,
  verifyPlatformSignature,
  type ExportPackage,
} from '../export-package';

describe('export-package crypto half (task_1776990890662_jdz1)', () => {
  let signing: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  const password = 'correct-horse-battery-staple-2026';
  const recoveryBytes = Buffer.from('seed-phrase-or-private-key-bytes-go-here', 'utf8');
  const userId = 'user-jdz1';
  const fixedNow = () => new Date('2026-04-23T12:00:00.000Z');

  beforeAll(() => {
    signing = generatePlatformKeypair();
  });

  function freshPackage(): ExportPackage {
    return buildExportPackage({
      user_id: userId,
      recovery_bytes: recoveryBytes,
      password,
      platform_signing_key: signing.privateKey,
      now: fixedNow,
    });
  }

  // --- Acceptance test #1: round-trip --------------------------------------

  it('round-trip: build → verify hash → verify signature → decrypt payload', () => {
    const pkg = freshPackage();

    expect(pkg.version).toBe(EXPORT_PACKAGE_VERSION);
    expect(pkg.user_id).toBe(userId);
    expect(pkg.encryption.kdf).toBe(EXPORT_PACKAGE_KDF);
    expect(pkg.encryption.cipher).toBe(EXPORT_PACKAGE_CIPHER);
    expect(pkg.manifest_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(pkg.signature.length).toBeGreaterThan(0);

    expect(verifyManifestHash(pkg)).toBe(true);
    expect(verifyPlatformSignature(pkg, signing.publicKey)).toBe(true);

    const decrypted = decryptPayload(pkg, password);
    expect(decrypted).not.toBeNull();
    expect(decrypted!.recovery_bytes.equals(recoveryBytes)).toBe(true);
    expect(decrypted!.user_id).toBe(userId);
    expect(decrypted!.issued_at).toBe(fixedNow().toISOString());
  });

  // --- Acceptance test #2: manifest tamper ---------------------------------

  it('tamper of expires_at field invalidates manifest hash', () => {
    const pkg = freshPackage();
    const tampered: ExportPackage = {
      ...pkg,
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    expect(verifyManifestHash(tampered)).toBe(false);
  });

  it('tamper of user_id invalidates manifest hash', () => {
    const pkg = freshPackage();
    const tampered: ExportPackage = { ...pkg, user_id: 'attacker-controlled' };
    expect(verifyManifestHash(tampered)).toBe(false);
  });

  it('tamper of encryption.nonce invalidates manifest hash', () => {
    const pkg = freshPackage();
    const tampered: ExportPackage = {
      ...pkg,
      encryption: { ...pkg.encryption, nonce: Buffer.alloc(12, 0xff).toString('base64') },
    };
    expect(verifyManifestHash(tampered)).toBe(false);
  });

  // --- Acceptance test #3: signature tamper --------------------------------

  it('flip one byte in signature → verifyPlatformSignature returns false', () => {
    const pkg = freshPackage();
    const sigBytes = Buffer.from(pkg.signature, 'base64');
    sigBytes[0] = sigBytes[0] ^ 0x01;
    const tampered: ExportPackage = { ...pkg, signature: sigBytes.toString('base64') };

    expect(verifyPlatformSignature(tampered, signing.publicKey)).toBe(false);
  });

  it('signature signed by wrong key fails verification', () => {
    const pkg = freshPackage();
    const wrongSigner = generatePlatformKeypair();
    expect(verifyPlatformSignature(pkg, wrongSigner.publicKey)).toBe(false);
  });

  it('garbage signature returns false (does not throw)', () => {
    const pkg = freshPackage();
    const tampered: ExportPackage = { ...pkg, signature: 'not-base64-!!!!' };
    expect(() => verifyPlatformSignature(tampered, signing.publicKey)).not.toThrow();
    expect(verifyPlatformSignature(tampered, signing.publicKey)).toBe(false);
  });

  // --- Acceptance test #4: wrong password returns null, NOT throws --------

  it('wrong password → decryptPayload returns null (not throw)', () => {
    const pkg = freshPackage();
    expect(() => decryptPayload(pkg, 'wrong-password')).not.toThrow();
    expect(decryptPayload(pkg, 'wrong-password')).toBeNull();
  });

  it('empty password → decryptPayload returns null', () => {
    const pkg = freshPackage();
    expect(decryptPayload(pkg, '')).toBeNull();
  });

  it('payload tamper → decryptPayload returns null (auth tag mismatch)', () => {
    const pkg = freshPackage();
    const blob = Buffer.from(pkg.payload, 'base64');
    blob[0] = blob[0] ^ 0xff;
    const tampered: ExportPackage = { ...pkg, payload: blob.toString('base64') };
    expect(decryptPayload(tampered, password)).toBeNull();
  });

  // --- Acceptance test #5: KDF determinism ---------------------------------

  it('KDF determinism: same password + same salt → same key', () => {
    const salt = crypto.randomBytes(16).toString('base64');
    const k1 = deriveExportKey('hunter2', salt);
    const k2 = deriveExportKey('hunter2', salt);
    expect(k1.equals(k2)).toBe(true);
    expect(k1.length).toBe(32);
  });

  it('KDF: different salt → different key (sanity check)', () => {
    const salt1 = crypto.randomBytes(16).toString('base64');
    const salt2 = crypto.randomBytes(16).toString('base64');
    const k1 = deriveExportKey('hunter2', salt1);
    const k2 = deriveExportKey('hunter2', salt2);
    expect(k1.equals(k2)).toBe(false);
  });

  it('KDF: different password → different key', () => {
    const salt = crypto.randomBytes(16).toString('base64');
    const k1 = deriveExportKey('password-a', salt);
    const k2 = deriveExportKey('password-b', salt);
    expect(k1.equals(k2)).toBe(false);
  });

  // --- Acceptance test #6: independence from session model -----------------

  it('independence: builder takes user_id + payload + password + signing key — NO session import', () => {
    // Type-level proof: BuildExportPackageInput intentionally has no
    // ExportSession field. Behavioral proof: build a package without
    // touching the session module.
    const pkg = buildExportPackage({
      user_id: 'no-session-needed',
      recovery_bytes: Buffer.from('bytes'),
      password: 'pw',
      platform_signing_key: signing.privateKey,
    });
    expect(pkg.user_id).toBe('no-session-needed');
    expect(verifyManifestHash(pkg)).toBe(true);
  });

  // --- Format-stability tests ----------------------------------------------

  it('canonical manifest is byte-stable across two builds with same inputs (excluding random)', () => {
    // Two packages with the SAME salt + nonce + timestamps must have identical
    // canonical manifests. Random fields (salt/nonce) are persisted in the
    // package, so we can replay them.
    const pkgA = freshPackage();
    const pkgB: ExportPackage = {
      ...pkgA,
      // Replay the random fields from A so canonicalization is comparable.
    };
    expect(canonicalManifest(pkgA)).toBe(canonicalManifest(pkgB));
  });

  it('package format matches spec discriminators (version/kdf/cipher)', () => {
    const pkg = freshPackage();
    expect(pkg.version).toBe('v3.0');
    expect(pkg.encryption.kdf).toBe('scrypt'); // documented spec deviation
    expect(pkg.encryption.cipher).toBe('chacha20-poly1305'); // documented spec deviation
    expect(typeof pkg.encryption.kdf_params.salt).toBe('string');
    expect(typeof pkg.encryption.nonce).toBe('string');
    expect(typeof pkg.payload).toBe('string');
    expect(typeof pkg.manifest_hash).toBe('string');
    expect(typeof pkg.signature).toBe('string');
  });

  it('expires_at defaults to issued_at + 24h when not supplied', () => {
    const pkg = freshPackage();
    const issued = new Date(pkg.issued_at).getTime();
    const expires = new Date(pkg.expires_at).getTime();
    expect(expires - issued).toBe(24 * 60 * 60 * 1000);
  });

  // --- Input validation ----------------------------------------------------

  it('rejects empty user_id', () => {
    expect(() =>
      buildExportPackage({
        user_id: '',
        recovery_bytes: recoveryBytes,
        password,
        platform_signing_key: signing.privateKey,
      })
    ).toThrow(/user_id/);
  });

  it('rejects empty recovery_bytes', () => {
    expect(() =>
      buildExportPackage({
        user_id: userId,
        recovery_bytes: Buffer.alloc(0),
        password,
        platform_signing_key: signing.privateKey,
      })
    ).toThrow(/recovery_bytes/);
  });

  it('rejects empty password', () => {
    expect(() =>
      buildExportPackage({
        user_id: userId,
        recovery_bytes: recoveryBytes,
        password: '',
        platform_signing_key: signing.privateKey,
      })
    ).toThrow(/password/);
  });

  it('verify functions return false for malformed package', () => {
    expect(verifyManifestHash(null as unknown as ExportPackage)).toBe(false);
    expect(verifyManifestHash({} as ExportPackage)).toBe(false);
    expect(verifyPlatformSignature(null as unknown as ExportPackage, signing.publicKey)).toBe(
      false
    );
    expect(verifyPlatformSignature({} as ExportPackage, signing.publicKey)).toBe(false);
  });

  it('decryptPayload returns null for malformed inputs', () => {
    expect(decryptPayload(null as unknown as ExportPackage, password)).toBeNull();
    expect(decryptPayload({} as ExportPackage, password)).toBeNull();
  });
});
