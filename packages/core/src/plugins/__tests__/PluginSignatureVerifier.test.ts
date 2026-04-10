/**
 * PluginSignatureVerifier tests — v5.7 "Open Ecosystem"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginSignatureVerifier,
  getPluginSignatureVerifier,
  resetPluginSignatureVerifier,
} from '../PluginSignatureVerifier';
import {
  generateKeyPair,
  signPackage,
  canonicalizeManifest,
  type PackageManifest,
  type SignedPackage,
} from '../../security/PackageSigner';

function createTestManifest(name = 'test-plugin', version = '1.0.0'): PackageManifest {
  return {
    name,
    version,
    files: ['index.js'],
    contentHash: 'abc123',
    createdAt: new Date().toISOString(),
  };
}

function createSignedPackage(manifest: PackageManifest, privateKey: string): SignedPackage {
  const content = canonicalizeManifest(manifest);
  const signature = signPackage(content, privateKey);
  return { manifest, signature };
}

describe('PluginSignatureVerifier', () => {
  let verifier: PluginSignatureVerifier;
  let keyPair: { publicKey: string; privateKey: string };

  beforeEach(() => {
    verifier = new PluginSignatureVerifier();
    keyPair = generateKeyPair();
    resetPluginSignatureVerifier();
  });

  // ===========================================================================
  // TRUST STORE
  // ===========================================================================

  describe('trust store', () => {
    it('adds and retrieves trusted keys', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Test Key');
      expect(verifier.getTrustStoreSize()).toBe(1);

      const keys = verifier.getActiveTrustedKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].keyId).toBe('key-1');
      expect(keys[0].label).toBe('Test Key');
    });

    it('rejects duplicate key IDs', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key 1');
      expect(() => verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key 1b')).toThrow(
        'already exists'
      );
    });

    it('removes keys', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key 1');
      expect(verifier.removeTrustedKey('key-1')).toBe(true);
      expect(verifier.getTrustStoreSize()).toBe(0);
    });

    it('revokes keys without removing them', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key 1');
      verifier.revokeKey('key-1');

      expect(verifier.getTrustStoreSize()).toBe(1);
      expect(verifier.getActiveTrustedKeys()).toHaveLength(0);

      const all = verifier.getAllKeys();
      expect(all[0].revoked).toBe(true);
    });

    it('filters expired keys', () => {
      const pastDate = '2020-01-01T00:00:00.000Z';
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Expired', pastDate);

      expect(verifier.getActiveTrustedKeys()).toHaveLength(0);
      expect(verifier.getAllKeys()).toHaveLength(1);
    });

    it('keeps non-expired keys', () => {
      const futureDate = '2099-01-01T00:00:00.000Z';
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Valid', futureDate);

      expect(verifier.getActiveTrustedKeys()).toHaveLength(1);
    });
  });

  // ===========================================================================
  // KEY ROTATION
  // ===========================================================================

  describe('key rotation', () => {
    it('rotates: revokes old key and adds new key', () => {
      verifier.addTrustedKey('key-v1', keyPair.publicKey, 'Key v1');

      const newPair = generateKeyPair();
      verifier.rotateKey('key-v1', 'key-v2', newPair.publicKey, 'Key v2');

      const active = verifier.getActiveTrustedKeys();
      expect(active).toHaveLength(1);
      expect(active[0].keyId).toBe('key-v2');

      const all = verifier.getAllKeys();
      expect(all).toHaveLength(2);
      const old = all.find((k) => k.keyId === 'key-v1');
      expect(old!.revoked).toBe(true);
    });

    it('rejects rotation of non-existent key', () => {
      expect(() => verifier.rotateKey('nope', 'new', 'pk', 'New')).toThrow('not found');
    });
  });

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  describe('verifyPlugin', () => {
    it('verifies a correctly signed package', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Trusted');

      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, keyPair.privateKey);

      const result = verifier.verifyPlugin(signed);
      expect(result.verified).toBe(true);
      expect(result.keyId).toBe('key-1');
      expect(result.keyLabel).toBe('Trusted');
      expect(result.packageName).toBe('test-plugin');
    });

    it('rejects package signed with untrusted key', () => {
      const otherPair = generateKeyPair();
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Trusted');

      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, otherPair.privateKey);

      const result = verifier.verifyPlugin(signed);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('rejects unsigned package when signatures required', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Trusted');

      const manifest = createTestManifest();
      const unsigned: SignedPackage = { manifest, signature: '' };

      const result = verifier.verifyPlugin(unsigned);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('unsigned');
    });

    it('allows unsigned when signatures not required', () => {
      const lenient = new PluginSignatureVerifier({ requireSignature: false });

      const manifest = createTestManifest();
      const unsigned: SignedPackage = { manifest, signature: '' };

      const result = lenient.verifyPlugin(unsigned);
      expect(result.verified).toBe(true);
    });

    it('fails when no trusted keys exist', () => {
      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, keyPair.privateKey);

      const result = verifier.verifyPlugin(signed);
      expect(result.verified).toBe(false);
      expect(result.error).toContain('No active trusted keys');
    });

    it('rejects package signed with revoked key', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Revoked');
      verifier.revokeKey('key-1');

      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, keyPair.privateKey);

      const result = verifier.verifyPlugin(signed);
      expect(result.verified).toBe(false);
    });
  });

  // ===========================================================================
  // isSignedBy
  // ===========================================================================

  describe('isSignedBy', () => {
    it('returns true for matching key', () => {
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key');
      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, keyPair.privateKey);

      expect(verifier.isSignedBy(signed, 'key-1')).toBe(true);
    });

    it('returns false for non-matching key', () => {
      const otherPair = generateKeyPair();
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Key');
      const manifest = createTestManifest();
      const signed = createSignedPackage(manifest, otherPair.privateKey);

      expect(verifier.isSignedBy(signed, 'key-1')).toBe(false);
    });
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('singleton', () => {
    it('returns same instance', () => {
      const a = getPluginSignatureVerifier();
      const b = getPluginSignatureVerifier();
      expect(a).toBe(b);
    });

    it('resets on reset call', () => {
      const a = getPluginSignatureVerifier();
      resetPluginSignatureVerifier();
      const b = getPluginSignatureVerifier();
      expect(a).not.toBe(b);
    });
  });
});
