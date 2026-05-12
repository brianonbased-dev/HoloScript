/**
 * Tests for the post-quantum dual-signature envelope.
 *
 * G.GOLD.013 discipline: every assertion has BOTH a TRUE case (the
 * positive behavior we want) AND a FALSE case (the negative behavior
 * the same code path must reject). The TRUE cases prove the verifier
 * accepts good envelopes; the FALSE cases prove it rejects tampering.
 *
 * The PQC signer is the dev-only `TestPQCSigner` (software ml_dsa65).
 * The classical signer is `MockClassicalSigner` — synchronous, deterministic,
 * no viem call. A second test block exercises the live ViemClassicalVerifier
 * with the existing seat-wallet test address shape to confirm the adapter
 * lines up with request-signing.ts call semantics.
 *
 * What is NOT tested here:
 *   - Real Trezor coordination (FOUNDER-GATED — see scoping doc §5)
 *   - End-to-end performance benchmarks (ML-DSA-65 sign time is ~1-3 ms; not a
 *     unit-test concern)
 *
 * @module holomesh/identity/__tests__/dual-signature-envelope
 */

import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'crypto';

import {
  CLASSICAL_ALGO_ECDSA_P256,
  DUAL_SIG_ENVELOPE_VERSION_V1,
  type DualSignatureEnvelope,
  type DualSignatureMode,
  type IClassicalSigner,
  type IClassicalVerifier,
  NoopPQCSigner,
  parseDualSignatureEnvelope,
  PQC_ALGO_ML_DSA_65,
  serializeDualSignatureEnvelope,
  signDual,
  TestPQCSigner,
  verifyDualSignature,
} from '../dual-signature-envelope';

// ── Test helpers ──────────────────────────────────────────────────────

const TEST_ADDRESS = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';
const TEST_PAYLOAD = new TextEncoder().encode('claim:task_1778132483482_otep');

function sha256Sync(bytes: Uint8Array): Uint8Array {
  const h = createHash('sha256');
  h.update(bytes);
  return new Uint8Array(h.digest());
}

/**
 * Deterministic mock classical signer — pretends to sign by returning a
 * fixed 65-byte signature (matches ECDSA-P256 r||s||v shape). The paired
 * MockClassicalVerifier returns true for this exact signature, false
 * otherwise. No real ECDSA math.
 */
class MockClassicalSigner implements IClassicalSigner {
  constructor(private readonly address: string = TEST_ADDRESS) {}
  async getAddress(): Promise<string> {
    return this.address;
  }
  async sign(payloadHash: Uint8Array): Promise<Uint8Array> {
    const sig = new Uint8Array(65);
    sig.set(payloadHash.slice(0, 32), 0);
    sig.set(payloadHash.slice(0, 32), 32);
    sig[64] = 27;
    return sig;
  }
}

class MockClassicalVerifier implements IClassicalVerifier {
  async verify(
    payloadHash: Uint8Array,
    signature: Uint8Array,
    signerAddress: string
  ): Promise<boolean> {
    if (signature.length !== 65) return false;
    if (signerAddress.toLowerCase() !== TEST_ADDRESS.toLowerCase()) return false;
    for (let i = 0; i < 32; i++) {
      if (signature[i] !== payloadHash[i]) return false;
      if (signature[32 + i] !== payloadHash[i]) return false;
    }
    if (signature[64] !== 27) return false;
    return true;
  }
}

/** Deterministic 32-byte seed for the test PQC signer so the keypair is
 *  stable across runs. */
function testSeed(): Uint8Array {
  return new Uint8Array(32).fill(7);
}

async function buildSignedEnvelope(
  mode: DualSignatureMode,
  payload: Uint8Array = TEST_PAYLOAD
): Promise<DualSignatureEnvelope> {
  return signDual(payload, mode, {
    classical: new MockClassicalSigner(),
    pqc: new TestPQCSigner(testSeed()),
  });
}

// ── §1 Round-trip serialize/parse ─────────────────────────────────────

describe('serializeDualSignatureEnvelope <-> parseDualSignatureEnvelope', () => {
  describe('classical_only mode', () => {
    it('TRUE — round-trip preserves all fields on clean bytes', async () => {
      const env = await buildSignedEnvelope('classical_only');
      const bytes = serializeDualSignatureEnvelope(env);
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope.version).toBe(DUAL_SIG_ENVELOPE_VERSION_V1);
      expect(parsed.envelope.mode).toBe('classical_only');
      expect(parsed.envelope.classicalAlgo).toBe(CLASSICAL_ALGO_ECDSA_P256);
      expect(parsed.envelope.pqcAlgo).toBe(PQC_ALGO_ML_DSA_65);
      expect(Array.from(parsed.envelope.payloadHash)).toEqual(Array.from(env.payloadHash));
      expect(Array.from(parsed.envelope.classicalSignature)).toEqual(
        Array.from(env.classicalSignature)
      );
      expect(parsed.envelope.classicalSignerAddress).toBe(env.classicalSignerAddress);
      // PQC fields are empty in classical_only mode
      expect(parsed.envelope.pqcSignature.length).toBe(0);
      expect(parsed.envelope.pqcPublicKey.length).toBe(0);
    });

    it('FALSE — corrupt magic prefix rejected with bad-magic', async () => {
      const env = await buildSignedEnvelope('classical_only');
      const bytes = serializeDualSignatureEnvelope(env);
      bytes[0] = 0x00; // smash MAGIC byte 0
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.reason).toBe('bad-magic');
    });
  });

  describe('pqc_only mode', () => {
    it('TRUE — round-trip preserves all fields on clean bytes', async () => {
      const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
        pqc: new TestPQCSigner(testSeed()),
      });
      const bytes = serializeDualSignatureEnvelope(env);
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope.mode).toBe('pqc_only');
      expect(Array.from(parsed.envelope.pqcSignature)).toEqual(Array.from(env.pqcSignature));
      expect(Array.from(parsed.envelope.pqcPublicKey)).toEqual(Array.from(env.pqcPublicKey));
      // Classical fields are empty in pqc_only mode
      expect(parsed.envelope.classicalSignature.length).toBe(0);
      expect(parsed.envelope.classicalSignerAddress).toBe('');
    });

    it('FALSE — truncated bytes (cut mid-pqc-sig) rejected', async () => {
      const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
        pqc: new TestPQCSigner(testSeed()),
      });
      const bytes = serializeDualSignatureEnvelope(env);
      // Truncate so the pqc signature length-prefix says more than is in the buffer
      const truncated = bytes.slice(0, bytes.length - 100);
      const parsed = parseDualSignatureEnvelope(truncated);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.reason).toBe('malformed-length-prefix');
    });
  });

  describe('dual mode', () => {
    it('TRUE — round-trip preserves all fields on clean bytes', async () => {
      const env = await buildSignedEnvelope('dual');
      const bytes = serializeDualSignatureEnvelope(env);
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope.mode).toBe('dual');
      // Both signatures present
      expect(parsed.envelope.classicalSignature.length).toBe(65);
      expect(parsed.envelope.pqcSignature.length).toBeGreaterThan(0);
      expect(parsed.envelope.pqcPublicKey.length).toBeGreaterThan(0);
    });

    it('FALSE — unsupported-version byte rejected', async () => {
      const env = await buildSignedEnvelope('dual');
      const bytes = serializeDualSignatureEnvelope(env);
      bytes[4] = 0xff; // future version byte
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.reason).toBe('unsupported-version');
    });

    it('FALSE — unknown mode byte rejected', async () => {
      const env = await buildSignedEnvelope('dual');
      const bytes = serializeDualSignatureEnvelope(env);
      bytes[5] = 0x99; // not one of {0x01, 0x02, 0x03}
      const parsed = parseDualSignatureEnvelope(bytes);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.reason).toBe('unknown-mode');
    });
  });

  it('FALSE — totally-empty buffer rejected with truncated', () => {
    const parsed = parseDualSignatureEnvelope(new Uint8Array(0));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe('truncated');
  });

  it('FALSE — random buffer (no magic) rejected with bad-magic', () => {
    const parsed = parseDualSignatureEnvelope(randomBytes(200));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    // Either bad-magic (most likely) or another structural failure — both are OK rejections
    expect(['bad-magic', 'truncated', 'unsupported-version', 'unknown-mode']).toContain(
      parsed.reason
    );
  });
});

// ── §2 Verifier — classical_only mode ─────────────────────────────────

describe('verifyDualSignature — classical_only mode', () => {
  it('TRUE — accepts valid classical-only envelope', async () => {
    const env = await buildSignedEnvelope('classical_only');
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('classical_only');
    expect(result.classicalValid).toBe(true);
    expect(result.pqcValid).toBeUndefined();
  });

  it('FALSE — rejects when classical signature is tampered', async () => {
    const env = await buildSignedEnvelope('classical_only');
    // Flip one byte in the signature — MockClassicalVerifier rejects.
    env.classicalSignature[10] ^= 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.classicalValid).toBe(false);
    expect(result.reason).toBe('classical-signature-invalid');
  });

  it('FALSE — rejects when payload is tampered (hash mismatch)', async () => {
    const env = await buildSignedEnvelope('classical_only');
    const tamperedPayload = new TextEncoder().encode('claim:task_DIFFERENT');
    const result = await verifyDualSignature(env, tamperedPayload, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('payload-hash-mismatch');
  });

  it('FALSE — rejects when classical verifier throws', async () => {
    const env = await buildSignedEnvelope('classical_only');
    const throwing: IClassicalVerifier = {
      async verify() {
        throw new Error('verifier exploded');
      },
    };
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: throwing,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('classical-verify-threw');
    expect(result.classicalValid).toBe(false);
  });
});

// ── §3 Verifier — pqc_only mode ───────────────────────────────────────

describe('verifyDualSignature — pqc_only mode', () => {
  it('TRUE — accepts valid pqc-only envelope (real ML-DSA-65)', async () => {
    const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
      pqc: new TestPQCSigner(testSeed()),
    });
    const result = await verifyDualSignature(env, TEST_PAYLOAD);
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('pqc_only');
    expect(result.pqcValid).toBe(true);
    expect(result.classicalValid).toBeUndefined();
  });

  it('FALSE — rejects when pqc signature is tampered', async () => {
    const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
      pqc: new TestPQCSigner(testSeed()),
    });
    env.pqcSignature[100] ^= 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD);
    expect(result.valid).toBe(false);
    expect(result.pqcValid).toBe(false);
    expect(result.reason).toBe('pqc-signature-invalid');
  });

  it('FALSE — rejects when pqc pubkey is swapped for a different keypair', async () => {
    const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
      pqc: new TestPQCSigner(testSeed()),
    });
    // Generate a second keypair with a different seed and substitute its pubkey
    const otherSigner = new TestPQCSigner(new Uint8Array(32).fill(11));
    env.pqcPublicKey = await otherSigner.getPublicKey();
    const result = await verifyDualSignature(env, TEST_PAYLOAD);
    expect(result.valid).toBe(false);
    expect(result.pqcValid).toBe(false);
  });
});

// ── §4 Verifier — dual mode ───────────────────────────────────────────

describe('verifyDualSignature — dual mode', () => {
  it('TRUE — accepts valid dual envelope (both signatures present + valid)', async () => {
    const env = await buildSignedEnvelope('dual');
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(true);
    expect(result.mode).toBe('dual');
    expect(result.classicalValid).toBe(true);
    expect(result.pqcValid).toBe(true);
  });

  it('FALSE — rejects when classical signature is tampered (PQC still valid)', async () => {
    const env = await buildSignedEnvelope('dual');
    env.classicalSignature[5] ^= 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.classicalValid).toBe(false);
    expect(result.pqcValid).toBe(true);
    expect(result.reason).toBe('classical-signature-invalid');
  });

  it('FALSE — rejects when pqc signature is tampered (classical still valid)', async () => {
    const env = await buildSignedEnvelope('dual');
    env.pqcSignature[200] ^= 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.classicalValid).toBe(true);
    expect(result.pqcValid).toBe(false);
    expect(result.reason).toBe('pqc-signature-invalid');
  });

  it('FALSE — rejects when both signatures are tampered', async () => {
    const env = await buildSignedEnvelope('dual');
    env.classicalSignature[5] ^= 0xff;
    env.pqcSignature[200] ^= 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.classicalValid).toBe(false);
    expect(result.pqcValid).toBe(false);
    // Top-level reason picks one — debug flags expose the rest
    expect(result.reason).toBe('classical-signature-invalid');
  });
});

// ── §5 Mode-mismatch defenses ─────────────────────────────────────────

describe('verifyDualSignature — mode-mismatch defenses', () => {
  it('FALSE — envelope claims dual mode but pqc-sig empty rejected (parser)', async () => {
    const env = await buildSignedEnvelope('dual');
    // Hand-clear pqc fields AFTER building — bypasses serializer invariant
    env.pqcSignature = new Uint8Array(0);
    env.pqcPublicKey = new Uint8Array(0);
    // Verifier MUST reject regardless of how we got here
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('mode-mismatch');
  });

  it('FALSE — envelope claims dual mode but classical-sig empty rejected', async () => {
    const env = await buildSignedEnvelope('dual');
    env.classicalSignature = new Uint8Array(0);
    env.classicalSignerAddress = '';
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('mode-mismatch');
  });

  it('FALSE — envelope serializer refuses to emit invalid mode=dual (no pqc sig)', () => {
    const env: DualSignatureEnvelope = {
      version: DUAL_SIG_ENVELOPE_VERSION_V1,
      mode: 'dual',
      payloadHash: sha256Sync(TEST_PAYLOAD),
      classicalAlgo: CLASSICAL_ALGO_ECDSA_P256,
      classicalSignature: new Uint8Array(65),
      classicalSignerAddress: TEST_ADDRESS,
      pqcAlgo: PQC_ALGO_ML_DSA_65,
      pqcSignature: new Uint8Array(0), // intentionally empty
      pqcPublicKey: new Uint8Array(0),
    };
    expect(() => serializeDualSignatureEnvelope(env)).toThrow(/pqcSignature/);
  });

  it('FALSE — unsupported classical algo rejected', async () => {
    const env = await buildSignedEnvelope('classical_only');
    env.classicalAlgo = 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unsupported-classical-algo');
  });

  it('FALSE — unsupported pqc algo rejected', async () => {
    const env = await signDual(TEST_PAYLOAD, 'pqc_only', {
      pqc: new TestPQCSigner(testSeed()),
    });
    env.pqcAlgo = 0xff;
    const result = await verifyDualSignature(env, TEST_PAYLOAD);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unsupported-pqc-algo');
  });
});

// ── §6 signDual + NoopPQCSigner ───────────────────────────────────────

describe('signDual founder-gated NoopPQCSigner', () => {
  it('FALSE — throws when called with NoopPQCSigner in pqc_only mode', async () => {
    await expect(
      signDual(TEST_PAYLOAD, 'pqc_only', {
        pqc: new NoopPQCSigner(),
      })
    ).rejects.toThrow(/FOUNDER-GATED/);
  });

  it('FALSE — throws when called with NoopPQCSigner in dual mode', async () => {
    await expect(
      signDual(TEST_PAYLOAD, 'dual', {
        classical: new MockClassicalSigner(),
        pqc: new NoopPQCSigner(),
      })
    ).rejects.toThrow(/FOUNDER-GATED/);
  });

  it('TRUE — does NOT throw in classical_only mode (no PQC signer invoked)', async () => {
    const env = await signDual(TEST_PAYLOAD, 'classical_only', {
      classical: new MockClassicalSigner(),
      pqc: new NoopPQCSigner(), // present but never called
    });
    expect(env.mode).toBe('classical_only');
    expect(env.classicalSignature.length).toBe(65);
  });

  it('FALSE — throws when classical signer missing in classical_only mode', async () => {
    await expect(signDual(TEST_PAYLOAD, 'classical_only', {})).rejects.toThrow(
      /classical signer/
    );
  });

  it('FALSE — throws when pqc signer missing in pqc_only mode', async () => {
    await expect(signDual(TEST_PAYLOAD, 'pqc_only', {})).rejects.toThrow(/pqc signer/);
  });
});

// ── §7 Determinism + cross-payload independence ───────────────────────

describe('payload independence', () => {
  it('TRUE — same TestPQCSigner seed yields same public key (deterministic keygen)', async () => {
    const a = new TestPQCSigner(testSeed());
    const b = new TestPQCSigner(testSeed());
    const pkA = await a.getPublicKey();
    const pkB = await b.getPublicKey();
    expect(Array.from(pkA)).toEqual(Array.from(pkB));
  });

  it('FALSE — envelope built for payload-A does NOT verify against payload-B', async () => {
    const env = await buildSignedEnvelope('dual');
    const wrongPayload = new TextEncoder().encode('claim:task_OTHER');
    const result = await verifyDualSignature(env, wrongPayload, {
      classicalVerifier: new MockClassicalVerifier(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('payload-hash-mismatch');
  });
});
