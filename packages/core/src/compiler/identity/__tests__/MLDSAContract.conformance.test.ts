/**
 * ML-DSA contract conformance — the canonical, single source of truth for how
 * HoloScript must call `@noble/post-quantum` ml_dsa65.
 *
 * WHY THIS EXISTS: HoloScript has three independent ML-DSA call sites —
 *   • core      `packages/core/.../identity/HybridCryptoProvider.ts` (MLDSACryptoProvider)
 *   • platform  `packages/platform/src/crypto/HybridCryptoProvider.ts`
 *   • holomesh  `packages/mcp-server/.../identity/dual-signature-envelope.ts`
 * Two of the three had silently drifted to the pre-0.6 argument order
 * (`sign(secretKey, message)` / `verify(publicKey, message, sig)`), which throws
 * against @noble/post-quantum >=0.6. The core copy was masked by a mock that
 * codified the wrong order; the platform copy had no test at all. See W.670.
 *
 * THE CONTRACT (noble >=0.6, the only correct order):
 *     ml_dsa65.sign(message, secretKey)         -> signature
 *     ml_dsa65.verify(signature, message, publicKey) -> boolean
 *
 * This test (1) pins that contract directly and proves the REVERSED order fails,
 * so a future noble bump or a copy-paste reversal trips immediately, and
 * (2) cross-checks core's MLDSACryptoProvider against raw-noble ground truth in
 * both directions. Each of the three call sites also has its own round-trip
 * test; this file is the shared reference they must agree with.
 */

import { describe, it, expect } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { MLDSACryptoProvider } from '../HybridCryptoProvider';

const enc = (s: string) => new TextEncoder().encode(s);

describe('ML-DSA contract (raw @noble/post-quantum ground truth)', () => {
  // Deterministic key pair from a fixed seed so the contract is reproducible.
  const seed = new Uint8Array(32).fill(7);
  const message = enc('holoscript ml-dsa contract');

  it('honors sign(message, secretKey) / verify(signature, message, publicKey)', () => {
    const kp = ml_dsa65.keygen(seed);
    const sig = ml_dsa65.sign(message, kp.secretKey);
    expect(ml_dsa65.verify(sig, message, kp.publicKey)).toBe(true);
  });

  it('rejects (throws or fails) the reversed verify argument order', () => {
    const kp = ml_dsa65.keygen(seed);
    const sig = ml_dsa65.sign(message, kp.secretKey);
    // The pre-0.6 order verify(publicKey, message, signature) must NOT verify —
    // noble rejects the mis-sized first argument.
    let reversedValid: boolean;
    try {
      reversedValid = ml_dsa65.verify(kp.publicKey, message, sig as unknown as Uint8Array);
    } catch {
      reversedValid = false;
    }
    expect(reversedValid).toBe(false);
  });

  it('throws on the reversed sign argument order', () => {
    const kp = ml_dsa65.keygen(seed);
    // sign(secretKey, message) feeds the short message into the secretKey slot.
    expect(() => ml_dsa65.sign(kp.secretKey, message as unknown as Uint8Array)).toThrow();
  });
});

describe('core MLDSACryptoProvider interops with raw noble (ground-truth cross-check)', () => {
  const message = enc('cross-impl conformance');

  it('produces signatures that raw noble verifies', async () => {
    const provider = new MLDSACryptoProvider();
    const kp = await provider.generateKeyPair('conformance');
    const sigB64 = await provider.sign(message, kp.privateKey);

    const sig = new Uint8Array(Buffer.from(sigB64, 'base64'));
    const pub = new Uint8Array(Buffer.from(kp.publicKey, 'base64'));
    expect(ml_dsa65.verify(sig, message, pub)).toBe(true);
  });

  it('verifies signatures produced by raw noble', async () => {
    const provider = new MLDSACryptoProvider();
    const kp = await provider.generateKeyPair('conformance');

    const sec = new Uint8Array(Buffer.from(kp.privateKey, 'base64'));
    const rawSig = ml_dsa65.sign(message, sec);
    const ok = await provider.verify(
      message,
      Buffer.from(rawSig).toString('base64'),
      kp.publicKey
    );
    expect(ok).toBe(true);
  });
});
