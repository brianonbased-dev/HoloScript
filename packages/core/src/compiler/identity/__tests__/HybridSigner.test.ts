/**
 * Tests for HybridSigner — Ed25519 (+ optional ML-DSA) dual-signing wrapper
 * with batch signing, signature caching, key-rotation grace periods, and
 * serialization.
 *
 * Previously untested (zero references in repo). Signing correctness and the
 * rotation grace-period behavior are security boundaries: a bug that lets a
 * stale or wrong key verify is a trust bypass.
 *
 * Tests default to enablePQ:false for deterministic, fast classical signing;
 * one PQ test is gated on runtime availability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HybridSigner } from '../HybridSigner';
import { isPostQuantumAvailable } from '../HybridCryptoProvider';

describe('HybridSigner', () => {
  let signer: HybridSigner;

  beforeEach(() => {
    signer = new HybridSigner({ enablePQ: false });
  });

  describe('key management', () => {
    it('generates a key pair with a kid', async () => {
      const kp = await signer.generateKeys('test-kid');
      expect(kp.kid).toBe('test-kid');
      expect(kp.classicalKey).toBeTruthy();
      expect(signer.getKeyPair()).toBe(kp);
    });

    it('throws when rotating before any key exists', async () => {
      await expect(signer.rotateKeys()).rejects.toThrow(/no existing key pair/i);
    });

    it('retires the previous key pair on rotation', async () => {
      await signer.generateKeys('k1');
      await signer.rotateKeys('k2');
      const retired = signer.getRetiredKeyPairs();
      expect(retired).toHaveLength(1);
      expect(retired[0].keyPair.kid).toBe('k1');
      expect(signer.getKeyPair()!.kid).toBe('k2');
    });
  });

  describe('sign / verify', () => {
    it('signs and verifies a message round-trip', async () => {
      await signer.generateKeys();
      const sig = await signer.sign('hello world');
      const result = await signer.verify('hello world', sig);
      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
    });

    it('rejects verification of a tampered message', async () => {
      await signer.generateKeys();
      const sig = await signer.sign('original message');
      const result = await signer.verify('tampered message', sig);
      expect(result.valid).toBe(false);
    });

    it('throws when signing before key generation', async () => {
      await expect(signer.sign('x')).rejects.toThrow(/generateKeys/);
    });

    it('signs Uint8Array input as well as strings', async () => {
      await signer.generateKeys();
      const bytes = new TextEncoder().encode('binary payload');
      const sig = await signer.sign(bytes);
      const result = await signer.verify(bytes, sig);
      expect(result.valid).toBe(true);
    });
  });

  describe('signature cache', () => {
    it('serves a repeated signature from cache (records a cache hit)', async () => {
      await signer.generateKeys();
      await signer.sign('cache me');
      await signer.sign('cache me');
      const metrics = signer.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThanOrEqual(1);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    it('clears the cache on demand', async () => {
      await signer.generateKeys();
      await signer.sign('a');
      expect(signer.getMetrics().cacheSize).toBeGreaterThan(0);
      signer.clearCache();
      expect(signer.getMetrics().cacheSize).toBe(0);
    });
  });

  describe('batch signing', () => {
    it('signs every message in a batch', async () => {
      await signer.generateKeys();
      const results = await signer.signBatch(['a', 'b', 'c']);
      expect(results).toHaveLength(3);
      for (let i = 0; i < results.length; i++) {
        expect(results[i].index).toBe(i);
        expect(results[i].signature).not.toBeNull();
      }
    });
  });

  describe('key rotation grace period', () => {
    it('still verifies signatures from a retired key within the grace window', async () => {
      await signer.generateKeys('keyA');
      const sig = await signer.sign('signed with A');

      // Rotate: keyA becomes retired but stays within its grace period.
      await signer.rotateKeys('keyB');

      // Verify with no explicit key — should fall back to the retired keyA.
      const result = await signer.verify('signed with A', sig);
      expect(result.valid).toBe(true);
    });

    it('reports a definitive failure for a signature no key can verify', async () => {
      await signer.generateKeys('keyA');
      const sig = await signer.sign('msg');
      // Different signer / key entirely.
      const other = new HybridSigner({ enablePQ: false });
      await other.generateKeys('keyZ');
      const result = await other.verify('msg', sig);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('serialization', () => {
    it('preserves options and metrics across toJSON / fromJSON', async () => {
      await signer.generateKeys('persist-kid');
      await signer.sign('m1');
      await signer.sign('m2');

      const json = signer.toJSON();
      expect(json.version).toBe(2);
      expect(json.enablePQ).toBe(false);
      expect(json.currentKeyPair!.kid).toBe('persist-kid');

      const restored = HybridSigner.fromJSON(json);
      expect(restored.getMetrics().signCount).toBe(signer.getMetrics().signCount);
      expect(restored.getKeyPair()!.kid).toBe('persist-kid');

      // The restored signer should still verify a freshly produced signature.
      const sig = await restored.sign('m3');
      expect((await restored.verify('m3', sig)).valid).toBe(true);
    });
  });

  describe('metrics', () => {
    it('resets counters', async () => {
      await signer.generateKeys();
      await signer.sign('x');
      signer.resetMetrics();
      const m = signer.getMetrics();
      expect(m.signCount).toBe(0);
      expect(m.lastSignAt).toBeNull();
    });
  });

  describe('post-quantum (availability-gated)', () => {
    it('produces and verifies a composite signature when PQ is available', async () => {
      const available = await isPostQuantumAvailable();
      if (!available) {
        // PQ provider not installed in this environment — nothing to assert.
        return;
      }
      const pqSigner = new HybridSigner({ enablePQ: true });
      await pqSigner.generateKeys();
      const sig = await pqSigner.sign('pq message');
      expect(pqSigner.hasPQ()).toBe(true);
      // Defense-in-depth: both classical and PQ components should be present.
      expect(sig.classicalSignature).toBeTruthy();
      expect(sig.pqSignature).toBeTruthy();
      const result = await pqSigner.verify('pq message', sig);
      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.pqValid).toBe(true);
    });

    it('default signer (PQ enabled) signs and verifies without throwing', async () => {
      // Regression guard: PQ is on by DEFAULT, so a plain new HybridSigner()
      // must be able to sign. A @noble/post-quantum arg-order drift previously
      // made this path throw (ml_dsa65.sign called secretKey-first instead of
      // message-first). If PQ is unavailable, this still exercises the
      // classical-only path.
      const def = new HybridSigner();
      await def.generateKeys();
      const sig = await def.sign('default message');
      const result = await def.verify('default message', sig);
      expect(result.valid).toBe(true);
    });
  });
});
