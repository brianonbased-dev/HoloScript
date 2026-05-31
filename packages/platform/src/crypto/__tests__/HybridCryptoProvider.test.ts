/**
 * Round-trip tests for the platform HybridCryptoProvider (Ed25519 + ML-DSA
 * signatures, X25519 + ML-KEM key exchange).
 *
 * Previously the entire post-quantum path of this provider was untested. Two
 * latent bugs hid behind that gap, both fixed alongside these tests:
 *   1. `loadPQModule` imported the bare `@noble/post-quantum`, whose root module
 *      throws on import in 0.6.x ("import submodules instead") — so EVERY PQ
 *      operation failed, masked as a misleading "not installed" error.
 *   2. ML-DSA sign/verify used the pre-0.6 argument order.
 * These tests exercise a real sign→verify and encapsulate→decapsulate round
 * trip end-to-end, so a regression in either is caught immediately.
 */

import { describe, it, expect } from 'vitest';
import { HybridCryptoProvider } from '../HybridCryptoProvider';

const enc = (s: string) => new TextEncoder().encode(s);

describe('platform HybridCryptoProvider — signatures', () => {
  it('signs and verifies a hybrid (Ed25519 + ML-DSA-65) signature', async () => {
    const provider = new HybridCryptoProvider();
    const keyPair = await provider.generateSigningKeyPair();
    const message = enc('hybrid signing round-trip');

    const sig = await provider.sign(message, keyPair);
    // Both arms must actually be produced — a non-empty PQ signature proves the
    // ML-DSA path ran (this is what the import/arg-order bugs broke).
    expect(sig.classicalSignature.length).toBeGreaterThan(0);
    expect(sig.pqSignature.length).toBeGreaterThan(0);
    expect(sig.pqAlgorithm).toBe('ml-dsa-65');

    const result = await provider.verify(message, sig, {
      classicalPublicKey: keyPair.classicalPublicKey,
      pqPublicKey: keyPair.pqPublicKey,
    });
    expect(result.classicalValid).toBe(true);
    expect(result.pqValid).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('rejects a signature against a tampered message', async () => {
    const provider = new HybridCryptoProvider();
    const keyPair = await provider.generateSigningKeyPair();

    const sig = await provider.sign(enc('original'), keyPair);
    const result = await provider.verify(enc('tampered'), sig, {
      classicalPublicKey: keyPair.classicalPublicKey,
      pqPublicKey: keyPair.pqPublicKey,
    });
    expect(result.valid).toBe(false);
    expect(result.classicalValid).toBe(false);
    expect(result.pqValid).toBe(false);
  });

  it('rejects a signature verified against the wrong public keys', async () => {
    const provider = new HybridCryptoProvider();
    const signer = await provider.generateSigningKeyPair();
    const other = await provider.generateSigningKeyPair();
    const message = enc('whose key signed this?');

    const sig = await provider.sign(message, signer);
    const result = await provider.verify(message, sig, {
      classicalPublicKey: other.classicalPublicKey,
      pqPublicKey: other.pqPublicKey,
    });
    expect(result.valid).toBe(false);
    expect(result.pqValid).toBe(false);
  });

  it('signs and verifies with ML-DSA-87', async () => {
    const provider = new HybridCryptoProvider({ pqSignatureAlgorithm: 'ml-dsa-87' });
    const keyPair = await provider.generateSigningKeyPair();
    const message = enc('higher security level');

    const sig = await provider.sign(message, keyPair);
    expect(sig.pqAlgorithm).toBe('ml-dsa-87');

    const result = await provider.verify(message, sig, {
      classicalPublicKey: keyPair.classicalPublicKey,
      pqPublicKey: keyPair.pqPublicKey,
    });
    expect(result.valid).toBe(true);
    expect(result.pqValid).toBe(true);
  });
});

describe('platform HybridCryptoProvider — key encapsulation', () => {
  it('derives the same shared secret via encapsulate / decapsulate (X25519 + ML-KEM-768)', async () => {
    const provider = new HybridCryptoProvider();
    const recipient = await provider.generateKEMKeyPair();

    const encapsulation = await provider.encapsulate({
      classicalPublicKey: recipient.classicalPublicKey,
      pqPublicKey: recipient.pqPublicKey,
    });
    expect(encapsulation.pqCiphertext.length).toBeGreaterThan(0);

    const recovered = await provider.decapsulate(encapsulation, recipient);
    // The sender's encapsulated secret and the recipient's decapsulated secret
    // must match — a failed ML-KEM import/round-trip would diverge them.
    expect(Buffer.from(recovered).toString('base64')).toBe(encapsulation.sharedSecret);
  });
});
