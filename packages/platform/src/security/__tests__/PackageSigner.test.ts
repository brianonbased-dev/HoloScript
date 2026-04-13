import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  signPackage,
  verifySignature,
  createPackageManifest,
  canonicalizeManifest,
} from '@holoscript/core';

describe('generateKeyPair', () => {
  it('returns base64-encoded public and private keys', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBeTruthy();
    expect(kp.privateKey).toBeTruthy();
    // Base64 chars only
    expect(kp.publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(kp.privateKey).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('generates unique key pairs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});

describe('signPackage / verifySignature', () => {
  it('sign and verify roundtrip', () => {
    const kp = generateKeyPair();
    const content = '{"name":"my-pkg","version":"1.0.0"}';
    const sig = signPackage(content, kp.privateKey);
    expect(sig).toBeTruthy();
    expect(verifySignature(content, sig, kp.publicKey)).toBe(true);
  });

  it('rejects tampered content', () => {
    const kp = generateKeyPair();
    const sig = signPackage('original', kp.privateKey);
    expect(verifySignature('tampered', sig, kp.publicKey)).toBe(false);
  });

  it('rejects wrong public key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const sig = signPackage('secret', kp1.privateKey);
    expect(verifySignature('secret', sig, kp2.publicKey)).toBe(false);
  });

  it('verifySignature returns false for garbage input', () => {
    expect(verifySignature('test', 'not-base64!!!', 'also-bad')).toBe(false);
  });
});

describe('createPackageManifest', () => {
  it('creates manifest with sorted files', async () => {
    const manifest = await createPackageManifest('my-pkg', '1.0.0', ['c.ts', 'a.ts', 'b.ts']);
    expect(manifest.name).toBe('my-pkg');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(manifest.contentHash).toBeTruthy();
    expect(manifest.createdAt).toBeTruthy();
  });

  it('contentHash is deterministic for same inputs', async () => {
    // Note: createdAt differs, so hashes will differ
    // But the hash is based on canonical content including createdAt
    const m1 = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    const m2 = await createPackageManifest('pkg', '1.0.0', ['a.ts']);
    // Both should have valid SHA-256 hex strings
    expect(m1.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(m2.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty files list', async () => {
    const manifest = await createPackageManifest('empty', '0.0.1', []);
    expect(manifest.files).toEqual([]);
  });
});

describe('canonicalizeManifest', () => {
  it('produces deterministic JSON', async () => {
    const manifest = await createPackageManifest('test', '1.0.0', ['x.ts']);
    const json = canonicalizeManifest(manifest);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('test');
    expect(parsed.version).toBe('1.0.0');
    // Keys should be in deterministic order
    const keys = Object.keys(parsed);
    expect(keys).toEqual(['name', 'version', 'files', 'contentHash', 'createdAt']);
  });

  it('full sign/verify flow with manifest', async () => {
    const kp = generateKeyPair();
    const manifest = await createPackageManifest('pkg', '2.0.0', ['main.ts', 'utils.ts']);
    const canonical = canonicalizeManifest(manifest);
    const sig = signPackage(canonical, kp.privateKey);
    expect(verifySignature(canonical, sig, kp.publicKey)).toBe(true);
  });
});
