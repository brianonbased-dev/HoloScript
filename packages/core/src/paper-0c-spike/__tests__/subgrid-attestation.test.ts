/**
 * paper-0c subgrid-parameter attestation tests (TODO-05).
 *
 * AUDIT-mode coverage: 4 error-handling cases + positive round-trips +
 * envelope-shape integration.
 *
 *   (1) Missing vector → typed refusal, not silent empty-hash.
 *   (2) Non-deterministic key iteration → canonicalization with shuffled-input fixture.
 *   (3) Collision regression → property test with 1e4 random vectors.
 *   (4) Mode flag mismatch at replay → shape-verification rejection.
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalizeSubgridParams,
  hashSubgridParams,
  attestSubgridParams,
  verifySubgridAttestation,
  verifySubgridAttestationAsync,
  MissingSubgridParamsError,
  InvalidSubgridParamValueError,
  type SubgridAttestation,
  type SubgridParams,
} from '../subgrid-attestation';

describe('subgrid-attestation — AUDIT error handling', () => {
  // ── (1) Missing vector → typed refusal ────────────────────────────────────
  describe('(1) missing vector refusal', () => {
    it('canonicalizeSubgridParams refuses empty object with typed error', () => {
      expect(() => canonicalizeSubgridParams({})).toThrow(MissingSubgridParamsError);
    });

    it('attestSubgridParams refuses empty object (fnv1a) with typed error', () => {
      expect(() => attestSubgridParams({}, 'fnv1a')).toThrow(MissingSubgridParamsError);
    });

    it('hashSubgridParams refuses empty object (fnv1a) with typed error', () => {
      expect(() => hashSubgridParams({}, 'fnv1a')).toThrow(MissingSubgridParamsError);
    });

    it('does NOT silently produce an empty-string or constant hash', () => {
      let caught: unknown = null;
      try {
        attestSubgridParams({}, 'fnv1a');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MissingSubgridParamsError);
    });

    it('SHA-256 path also refuses empty vectors synchronously', () => {
      // Canonicalization throws before the async sha256 call, so this is sync.
      expect(() => attestSubgridParams({}, 'sha256')).toThrow(MissingSubgridParamsError);
    });
  });

  // ── (2) Non-deterministic key iteration → canonicalization ────────────────
  describe('(2) canonicalization defeats key-iteration order drift', () => {
    const VECTOR_A: SubgridParams = { sn_efficiency: 1.2, agn_threshold: 1e8, cooling_floor: 300 };
    const VECTOR_B: SubgridParams = { cooling_floor: 300, sn_efficiency: 1.2, agn_threshold: 1e8 };
    const VECTOR_C: SubgridParams = { agn_threshold: 1e8, cooling_floor: 300, sn_efficiency: 1.2 };

    it('produces identical canonical form regardless of insertion order', () => {
      const a = canonicalizeSubgridParams(VECTOR_A);
      const b = canonicalizeSubgridParams(VECTOR_B);
      const c = canonicalizeSubgridParams(VECTOR_C);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('produces identical FNV-1a hash regardless of insertion order', () => {
      expect(hashSubgridParams(VECTOR_A, 'fnv1a')).toBe(hashSubgridParams(VECTOR_B, 'fnv1a'));
      expect(hashSubgridParams(VECTOR_B, 'fnv1a')).toBe(hashSubgridParams(VECTOR_C, 'fnv1a'));
    });

    it('produces identical SHA-256 hash regardless of insertion order', async () => {
      const [ha, hb, hc] = await Promise.all([
        hashSubgridParams(VECTOR_A, 'sha256'),
        hashSubgridParams(VECTOR_B, 'sha256'),
        hashSubgridParams(VECTOR_C, 'sha256'),
      ]);
      expect(ha).toBe(hb);
      expect(hb).toBe(hc);
    });

    it('refuses non-finite numbers (NaN)', () => {
      expect(() => canonicalizeSubgridParams({ x: Number.NaN })).toThrow(
        InvalidSubgridParamValueError
      );
    });

    it('refuses non-finite numbers (+Infinity, -Infinity)', () => {
      expect(() => canonicalizeSubgridParams({ x: Number.POSITIVE_INFINITY })).toThrow(
        InvalidSubgridParamValueError
      );
      expect(() => canonicalizeSubgridParams({ x: Number.NEGATIVE_INFINITY })).toThrow(
        InvalidSubgridParamValueError
      );
    });

    it('refuses null and undefined values', () => {
      expect(() =>
        canonicalizeSubgridParams({ x: null as unknown as SubgridParams[string] })
      ).toThrow(InvalidSubgridParamValueError);
      expect(() =>
        canonicalizeSubgridParams({ x: undefined as unknown as SubgridParams[string] })
      ).toThrow(InvalidSubgridParamValueError);
    });

    it('refuses nested object values', () => {
      expect(() =>
        canonicalizeSubgridParams({
          x: { nested: 'value' } as unknown as SubgridParams[string],
        })
      ).toThrow(InvalidSubgridParamValueError);
    });

    it('disambiguates string "42" from number 42', () => {
      const asString = canonicalizeSubgridParams({ x: '42' });
      const asNumber = canonicalizeSubgridParams({ x: 42 });
      expect(asString).not.toBe(asNumber);
    });

    it('accepts mixed value types in a single vector', () => {
      const form = canonicalizeSubgridParams({
        sn_efficiency: 1.2,
        use_wind_tunnel: true,
        cooling_model: 'Wiersma2009',
      });
      expect(form).toContain('cooling_model=`Wiersma2009`');
      expect(form).toContain('sn_efficiency=1.2');
      expect(form).toContain('use_wind_tunnel=true');
    });
  });

  // ── (3) Collision regression → 1e4-vector property test ───────────────────
  describe('(3) collision regression (1e4 random vectors)', () => {
    /**
     * Mulberry32 — deterministic PRNG so any failure is reproducible from
     * the seed alone. Not for crypto; we only need uniform-ish floats.
     */
    function mulberry32(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
      };
    }

    it('1e4 distinct vectors produce 1e4 distinct FNV-1a hashes (zero collisions)', () => {
      const rand = mulberry32(0xc0ffee);
      const seen = new Map<string, string>();
      const N = 10_000;
      let collisions = 0;

      for (let i = 0; i < N; i++) {
        const params: Record<string, number> = {
          sn_efficiency: rand() * 10,
          agn_threshold: rand() * 1e9,
          cooling_floor: rand() * 1000,
          isf_clumping: rand(),
          wind_velocity: rand() * 500,
          // Ensure each iteration is unique even if the 5 random values happen
          // to collide under Mulberry32's limited state.
          _index: i,
        };
        const hash = hashSubgridParams(params, 'fnv1a') as string;
        const canonical = canonicalizeSubgridParams(params);
        const prior = seen.get(hash);
        if (prior !== undefined && prior !== canonical) {
          collisions++;
        }
        seen.set(hash, canonical);
      }

      // FNV-1a 64-bit (forward+reverse composition from replayFingerprint)
      // expected collisions at N=1e4 under birthday bound: ~2.7e-12.
      expect(collisions).toBe(0);
    });

    it('hash output shape is always 16 hex chars for fnv1a, 64 for sha256', async () => {
      const params = { sn_efficiency: 1.2, agn_threshold: 1e8 };
      const fnv = hashSubgridParams(params, 'fnv1a') as string;
      const sha = await hashSubgridParams(params, 'sha256');
      expect(fnv).toMatch(/^[0-9a-f]{16}$/);
      expect(sha).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── (4) Mode flag mismatch at replay → shape rejection ────────────────────
  describe('(4) mode-substitution attack detection', () => {
    const PARAMS: SubgridParams = { sn_efficiency: 1.2, agn_threshold: 1e8 };

    it('detects hashMode substitution (fnv1a declared, sha256-length hash planted)', () => {
      const attestation = attestSubgridParams(PARAMS, 'fnv1a');
      // Adversary: keep hashMode='fnv1a' but swap in a 64-hex string.
      const tampered: SubgridAttestation = { ...attestation, hash: 'a'.repeat(64) };
      const result = verifySubgridAttestation(tampered, PARAMS);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('hashMode-mismatch');
      }
    });

    it('detects hashMode substitution (sha256 declared, fnv1a-length hash planted)', async () => {
      const attestation = await attestSubgridParams(PARAMS, 'sha256');
      const tampered: SubgridAttestation = { ...attestation, hash: 'a'.repeat(16) };
      const result = await verifySubgridAttestationAsync(tampered, PARAMS);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('hashMode-mismatch');
      }
    });

    it('detects param-vector tampering (canonical-form mismatch)', () => {
      const attestation = attestSubgridParams(PARAMS, 'fnv1a');
      const tamperedParams = { ...PARAMS, sn_efficiency: 1.3 };
      const result = verifySubgridAttestation(attestation, tamperedParams);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('canonical-form-mismatch');
      }
    });

    it('detects hash-value tampering (same shape, different content)', () => {
      const attestation = attestSubgridParams(PARAMS, 'fnv1a');
      // Adversary swaps in a correctly-shaped but wrong 16-hex hash.
      const tampered: SubgridAttestation = { ...attestation, hash: '0123456789abcdef' };
      const result = verifySubgridAttestation(tampered, PARAMS);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('hash-mismatch');
      }
    });

    it('accepts valid FNV-1a round-trip', () => {
      const attestation = attestSubgridParams(PARAMS, 'fnv1a');
      const result = verifySubgridAttestation(attestation, PARAMS);
      expect(result.valid).toBe(true);
    });

    it('accepts valid SHA-256 round-trip', async () => {
      const attestation = await attestSubgridParams(PARAMS, 'sha256');
      const result = await verifySubgridAttestationAsync(attestation, PARAMS);
      expect(result.valid).toBe(true);
    });

    it('refuses synchronous verification of sha256 attestations (fails loudly)', async () => {
      const attestation = await attestSubgridParams(PARAMS, 'sha256');
      expect(() => verifySubgridAttestation(attestation, PARAMS)).toThrow(/async crypto/);
    });

    it('async verify handles fnv1a attestations transparently', async () => {
      const attestation = attestSubgridParams(PARAMS, 'fnv1a');
      const result = await verifySubgridAttestationAsync(attestation, PARAMS);
      expect(result.valid).toBe(true);
    });
  });

  // ── Envelope integration shape ─────────────────────────────────────────────
  describe('attestation envelope shape', () => {
    it('has exactly three fields: hash, hashMode, canonicalForm', () => {
      const attestation = attestSubgridParams({ sn_efficiency: 1.2 }, 'fnv1a');
      expect(Object.keys(attestation).sort()).toEqual(['canonicalForm', 'hash', 'hashMode']);
    });

    it('is JSON-stable (round-trip equality after stringify/parse)', () => {
      const attestation = attestSubgridParams({ x: 1, y: 2 }, 'fnv1a');
      const roundtripped = JSON.parse(JSON.stringify(attestation));
      expect(roundtripped).toEqual(attestation);
    });

    it('is frozen (tamper-resistant at the object level)', () => {
      const attestation = attestSubgridParams({ x: 1 }, 'fnv1a');
      expect(Object.isFrozen(attestation)).toBe(true);
    });

    it('records the actual hashMode used (fnv1a)', () => {
      const attestation = attestSubgridParams({ x: 1 }, 'fnv1a');
      expect(attestation.hashMode).toBe('fnv1a');
    });

    it('records the actual hashMode used (sha256)', async () => {
      const attestation = await attestSubgridParams({ x: 1 }, 'sha256');
      expect(attestation.hashMode).toBe('sha256');
    });
  });
});
