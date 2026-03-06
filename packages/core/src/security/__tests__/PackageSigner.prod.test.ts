/**
 * PackageSigner — Production Tests
 *
 * Tests generateKeyPair, signPackage/verifySignature (round-trip, tampering),
 * createPackageManifest (content hash, file sorting, field presence),
 * and canonicalizeManifest (deterministic ordering).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateKeyPair,
  signPackage,
  verifySignature,
  createPackageManifest,
  canonicalizeManifest,
} from '../PackageSigner';

// =============================================================================
// KEY GENERATION
// =============================================================================

describe('generateKeyPair', () => {
  it('returns an object with publicKey and privateKey', () => {
    const kp = generateKeyPair();
    expect(typeof kp.publicKey).toBe('string');
    expect(typeof kp.privateKey).toBe('string');
  });

  it('publicKey is a non-empty base64 string', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey.length).toBeGreaterThan(20);
    expect(() => atob(kp.publicKey)).not.toThrow();
  });

  it('privateKey is a non-empty base64 string', () => {
    const kp = generateKeyPair();
    expect(kp.privateKey.length).toBeGreaterThan(20);
  });

  it('generates unique key pairs each call', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
  });
});

// =============================================================================
// SIGN + VERIFY
// =============================================================================

describe('signPackage / verifySignature', () => {
  it('signature verifies against correct public key', () => {
    const kp = generateKeyPair();
    const sig = signPackage('hello world', kp.privateKey);
    expect(verifySignature('hello world', sig, kp.publicKey)).toBe(true);
  });

  it('tampered content fails verification', () => {
    const kp = generateKeyPair();
    const sig = signPackage('original', kp.privateKey);
    expect(verifySignature('tampered', sig, kp.publicKey)).toBe(false);
  });

  it('wrong public key fails verification', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const sig = signPackage('data', kp1.privateKey);
    expect(verifySignature('data', sig, kp2.publicKey)).toBe(false);
  });

  it('tampered signature fails verification', () => {
    const kp = generateKeyPair();
    const sig = signPackage('data', kp.privateKey);
    const badSig = sig.slice(0, -4) + 'AAAA';
    expect(verifySignature('data', badSig, kp.publicKey)).toBe(false);
  });

  it('verifySignature returns false for garbage signature', () => {
    const kp = generateKeyPair();
    expect(verifySignature('anything', 'notbase64!@#', kp.publicKey)).toBe(false);
  });

  it('sign empty string and verify', () => {
    const kp = generateKeyPair();
    const sig = signPackage('', kp.privateKey);
    expect(verifySignature('', sig, kp.publicKey)).toBe(true);
  });

  it('sign large string and verify', () => {
    const large = 'x'.repeat(100_000);
    const kp = generateKeyPair();
    const sig = signPackage(large, kp.privateKey);
    expect(verifySignature(large, sig, kp.publicKey)).toBe(true);
  });
});

// =============================================================================
// CREATE PACKAGE MANIFEST
// =============================================================================

describe('createPackageManifest', () => {
  it('returns manifest with correct name and version', async () => {
    const m = await createPackageManifest('my-pkg', '1.2.3', []);
    expect(m.name).toBe('my-pkg');
    expect(m.version).toBe('1.2.3');
  });

  it('sorts file list alphabetically', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', ['z.ts', 'a.ts', 'm.ts']);
    expect(m.files).toEqual(['a.ts', 'm.ts', 'z.ts']);
  });

  it('original file array is not mutated', async () => {
    const files = ['z.ts', 'a.ts'];
    await createPackageManifest('pkg', '1.0.0', files);
    expect(files).toEqual(['z.ts', 'a.ts']);
  });

  it('contentHash is a 64-char hex string (SHA-256)', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    expect(m.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('createdAt is a valid ISO 8601 timestamp', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', []);
    expect(new Date(m.createdAt).toISOString()).toBe(m.createdAt);
  });

  it('different file contents produce different contentHash', async () => {
    const m1 = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    const m2 = await createPackageManifest('pkg', '1.0.0', ['b.ts']);
    expect(m1.contentHash).not.toBe(m2.contentHash);
  });

  it('same inputs produce same contentHash when time is frozen', async () => {
    const now = new Date('2025-01-01T00:00:00.000Z').toISOString();
    vi.setSystemTime(new Date(now));
    const m1 = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    const m2 = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    expect(m1.contentHash).toBe(m2.contentHash);
    vi.useRealTimers();
  });
});

// =============================================================================
// CANONICALIZE MANIFEST
// =============================================================================

describe('canonicalizeManifest', () => {
  it('returns a string', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', []);
    expect(typeof canonicalizeManifest(m)).toBe('string');
  });

  it('output is valid JSON', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    expect(() => JSON.parse(canonicalizeManifest(m))).not.toThrow();
  });

  it('parsed output contains all manifest fields', async () => {
    const m = await createPackageManifest('my-pkg', '2.0.0', ['a.ts']);
    const parsed = JSON.parse(canonicalizeManifest(m));
    expect(parsed.name).toBe('my-pkg');
    expect(parsed.version).toBe('2.0.0');
    expect(parsed.files).toEqual(m.files);
    expect(parsed.contentHash).toBe(m.contentHash);
    expect(parsed.createdAt).toBe(m.createdAt);
  });

  it('is deterministic — same manifest always produces same string', async () => {
    const m = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    expect(canonicalizeManifest(m)).toBe(canonicalizeManifest(m));
  });

  it('serialize → sign → verify full round trip', async () => {
    const kp = generateKeyPair();
    const m  = await createPackageManifest('my-pkg', '1.0.0', ['index.ts', 'utils.ts']);
    const canonical = canonicalizeManifest(m);
    const sig = signPackage(canonical, kp.privateKey);
    expect(verifySignature(canonical, sig, kp.publicKey)).toBe(true);
  });
});
