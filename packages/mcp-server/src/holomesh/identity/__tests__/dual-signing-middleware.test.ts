/**
 * Tests for the dual-signature-envelope path in extractAndVerifySigning().
 *
 * Coverage:
 * - isDualEnvelopeBody discriminator (FALSE shapes + TRUE shapes)
 * - dispatch: dual-shape body routes to verifyDualEnvelopeRequest, classical
 *   shape falls through to legacy path
 * - verifyDualEnvelopeRequest: malformed base64, parse failures, signature
 *   tampering, payload tampering, valid classical_only / pqc_only / dual
 *
 * Discipline: G.GOLD.013 paired FALSE+TRUE for every computed assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import {
  serializeDualSignatureEnvelope,
  type DualSignatureEnvelope,
  type IClassicalVerifier,
  DUAL_SIG_ENVELOPE_VERSION_V1,
  PQC_ALGO_ML_DSA_65,
  CLASSICAL_ALGO_ECDSA_P256,
} from '../dual-signature-envelope';
import {
  extractAndVerifySigning,
  isDualEnvelopeBody,
  resetAttestationRegistry,
} from '../signing-middleware';
import { canonicalizeBody } from '../../request-signing';
import { createHash } from 'node:crypto';

// ── Helpers ───────────────────────────────────────────────────────────

const CLASSICAL_ADDR = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';

function sha256Sync(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

function canonicalPayloadBytes(body: unknown, nonce: string, timestamp: string): Uint8Array {
  return new TextEncoder().encode(canonicalizeBody({ body, nonce, timestamp }));
}

function buildEnvelope(opts: {
  mode: 'classical_only' | 'pqc_only' | 'dual';
  body: unknown;
  nonce: string;
  timestamp: string;
  classicalSig?: Uint8Array;
  pqcKeyPair?: { secretKey: Uint8Array; publicKey: Uint8Array };
  tamperHash?: boolean;
}): DualSignatureEnvelope {
  const payload = canonicalPayloadBytes(opts.body, opts.nonce, opts.timestamp);
  const payloadHash = sha256Sync(payload);
  if (opts.tamperHash) payloadHash[0] ^= 0xff;

  const needsClassical = opts.mode === 'classical_only' || opts.mode === 'dual';
  const needsPqc = opts.mode === 'pqc_only' || opts.mode === 'dual';

  const classicalSig = needsClassical
    ? opts.classicalSig ?? new Uint8Array(65).fill(0xaa)
    : new Uint8Array(0);

  let pqcSig = new Uint8Array(0);
  let pqcPub = new Uint8Array(0);
  if (needsPqc) {
    const seed = new Uint8Array(32).fill(0x42);
    const kp = opts.pqcKeyPair ?? ml_dsa65.keygen(seed);
    pqcSig = ml_dsa65.sign(payloadHash, kp.secretKey);
    pqcPub = kp.publicKey;
  }

  return {
    version: DUAL_SIG_ENVELOPE_VERSION_V1,
    mode: opts.mode,
    payloadHash,
    classicalAlgo: CLASSICAL_ALGO_ECDSA_P256,
    classicalSignature: classicalSig,
    classicalSignerAddress: needsClassical ? CLASSICAL_ADDR : '',
    pqcAlgo: PQC_ALGO_ML_DSA_65,
    pqcSignature: pqcSig,
    pqcPublicKey: pqcPub,
  };
}

function envelopeToRequest(env: DualSignatureEnvelope, body: unknown, nonce: string, timestamp: string) {
  return {
    envelope_type: 'dual' as const,
    envelope_b64: Buffer.from(serializeDualSignatureEnvelope(env)).toString('base64'),
    body,
    nonce,
    timestamp,
  };
}

const ALWAYS_VALID_CLASSICAL: IClassicalVerifier = {
  async verify() {
    return true;
  },
};
const ALWAYS_INVALID_CLASSICAL: IClassicalVerifier = {
  async verify() {
    return false;
  },
};

beforeEach(() => {
  resetAttestationRegistry();
});
afterEach(() => {
  resetAttestationRegistry();
});

// ── isDualEnvelopeBody discriminator ──────────────────────────────────

describe('isDualEnvelopeBody', () => {
  it('FALSE: null', () => {
    expect(isDualEnvelopeBody(null)).toBe(false);
  });
  it('FALSE: primitives', () => {
    expect(isDualEnvelopeBody('dual')).toBe(false);
    expect(isDualEnvelopeBody(42)).toBe(false);
    expect(isDualEnvelopeBody(true)).toBe(false);
  });
  it('FALSE: classical envelope shape', () => {
    expect(
      isDualEnvelopeBody({
        body: {},
        signature: '0x' + 'a'.repeat(130),
        signer_address: CLASSICAL_ADDR,
        nonce: 'n1',
        timestamp: '2026-05-12T00:00:00.000Z',
      })
    ).toBe(false);
  });
  it('FALSE: dual-like shape missing envelope_b64', () => {
    expect(
      isDualEnvelopeBody({
        envelope_type: 'dual',
        body: {},
        nonce: 'n1',
        timestamp: '2026-05-12T00:00:00.000Z',
      })
    ).toBe(false);
  });
  it('FALSE: dual-like shape with wrong envelope_type value', () => {
    expect(
      isDualEnvelopeBody({
        envelope_type: 'classical',
        envelope_b64: 'abc',
        body: {},
        nonce: 'n1',
        timestamp: '2026-05-12T00:00:00.000Z',
      })
    ).toBe(false);
  });
  it('TRUE: minimal dual-envelope body', () => {
    expect(
      isDualEnvelopeBody({
        envelope_type: 'dual',
        envelope_b64: 'AAA=',
        body: { x: 1 },
        nonce: 'n1',
        timestamp: '2026-05-12T00:00:00.000Z',
      })
    ).toBe(true);
  });
});

// ── Dispatch — dual shape routes to dual path; classical falls through ──

describe('extractAndVerifySigning dispatch', () => {
  it('FALSE: classical envelope shape does NOT get marked signingProtocol=dual', async () => {
    const result = await extractAndVerifySigning(
      { plain: 'body' },
      { strictMode: false }
    );
    expect(result.ctx.signingProtocol).toBe('classical');
  });

  it('TRUE: dual-envelope shape routes to dual path (signingProtocol=dual)', async () => {
    const body = { team: 'core', op: 'claim' };
    const nonce = 'n1';
    const timestamp = '2026-05-12T00:00:00.000Z';
    const env = buildEnvelope({ mode: 'pqc_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);

    const result = await extractAndVerifySigning(req);
    expect(result.ctx.signingProtocol).toBe('dual');
    expect(result.ctx.signedRequest).toBe(true);
  });
});

// ── Dual envelope — verifyDualEnvelopeRequest behavior ─────────────────

describe('verifyDualEnvelopeRequest — error paths', () => {
  it('FALSE: malformed base64 → signingValid=false with parse-stage reason', async () => {
    const result = await extractAndVerifySigning({
      envelope_type: 'dual',
      envelope_b64: '!!!not-valid-base64!!!',
      body: {},
      nonce: 'n1',
      timestamp: '2026-05-12T00:00:00.000Z',
    });
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-envelope-base64-malformed');
    expect(result.ctx.signingProtocol).toBe('dual');
    expect(result.ctx.signer).toBeNull();
  });

  it('FALSE: valid base64 but garbage bytes → parse failure', async () => {
    const result = await extractAndVerifySigning({
      envelope_type: 'dual',
      envelope_b64: Buffer.from('not-an-envelope').toString('base64'),
      body: {},
      nonce: 'n1',
      timestamp: '2026-05-12T00:00:00.000Z',
    });
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason?.startsWith('dual-envelope-parse-')).toBe(true);
  });
});

describe('verifyDualEnvelopeRequest — pqc_only mode (no Trezor needed)', () => {
  const body = { team: 'core', op: 'claim', taskId: 't1' };
  const nonce = 'n-pqc';
  const timestamp = '2026-05-12T00:00:00.000Z';

  it('TRUE: valid pqc_only envelope → signingValid=true, signer is pqc:<hex>', async () => {
    const env = buildEnvelope({ mode: 'pqc_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req);
    expect(result.ctx.signingValid).toBe(true);
    expect(result.ctx.dualMode).toBe('pqc_only');
    expect(result.ctx.signer?.startsWith('pqc:')).toBe(true);
    expect(result.ctx.signer?.length).toBe(4 + 16); // 'pqc:' + 16 hex chars (8 bytes)
    expect(result.effectiveBody).toEqual(body);
  });

  it('FALSE: tampered body bytes → payload-hash-mismatch', async () => {
    const env = buildEnvelope({ mode: 'pqc_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    // Tamper: change the body AFTER the envelope was built.
    const tamperedReq = { ...req, body: { ...body, op: 'TAMPERED' } };
    const result = await extractAndVerifySigning(tamperedReq);
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-payload-tampered');
  });

  it('FALSE: pqc signature bytes corrupted → pqc-signature-invalid', async () => {
    const env = buildEnvelope({ mode: 'pqc_only', body, nonce, timestamp });
    env.pqcSignature[0] ^= 0xff;
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req);
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-pqc-invalid');
  });
});

describe('verifyDualEnvelopeRequest — classical_only mode', () => {
  const body = { team: 'core', op: 'send' };
  const nonce = 'n-classical';
  const timestamp = '2026-05-12T00:00:00.000Z';

  it('TRUE: valid classical signature (mock verifier returns true) → signer is the 0x-address', async () => {
    const env = buildEnvelope({ mode: 'classical_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req, {
      classicalVerifier: ALWAYS_VALID_CLASSICAL,
    });
    expect(result.ctx.signingValid).toBe(true);
    expect(result.ctx.dualMode).toBe('classical_only');
    expect(result.ctx.signer).toBe(CLASSICAL_ADDR);
  });

  it('FALSE: classical signature invalid (mock verifier returns false) → classical-signature-invalid', async () => {
    const env = buildEnvelope({ mode: 'classical_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req, {
      classicalVerifier: ALWAYS_INVALID_CLASSICAL,
    });
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-classical-invalid');
    expect(result.ctx.signer).toBeNull();
  });
});

describe('verifyDualEnvelopeRequest — dual mode (both must verify)', () => {
  const body = { team: 'core', op: 'audit' };
  const nonce = 'n-dual';
  const timestamp = '2026-05-12T00:00:00.000Z';

  it('TRUE: both classical AND pqc valid → signingValid=true', async () => {
    const env = buildEnvelope({ mode: 'dual', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req, {
      classicalVerifier: ALWAYS_VALID_CLASSICAL,
    });
    expect(result.ctx.signingValid).toBe(true);
    expect(result.ctx.dualMode).toBe('dual');
    expect(result.ctx.signer).toBe(CLASSICAL_ADDR);
  });

  it('FALSE: classical invalid → dual rejects (one-failure-fails-both)', async () => {
    const env = buildEnvelope({ mode: 'dual', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req, {
      classicalVerifier: ALWAYS_INVALID_CLASSICAL,
    });
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-classical-invalid');
  });

  it('FALSE: pqc tampered → dual rejects even when classical is valid', async () => {
    const env = buildEnvelope({ mode: 'dual', body, nonce, timestamp });
    env.pqcSignature[0] ^= 0xff;
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req, {
      classicalVerifier: ALWAYS_VALID_CLASSICAL,
    });
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('dual-pqc-invalid');
  });
});

// ── Effective body unwrap ──────────────────────────────────────────────

describe('effectiveBody unwrap', () => {
  it('TRUE: handler sees req.body verbatim (signed wrapper stripped)', async () => {
    const body = { team: 'x', op: 'op', taskId: 't42', nested: { k: [1, 2, 3] } };
    const nonce = 'n42';
    const timestamp = '2026-05-12T00:00:00.000Z';
    const env = buildEnvelope({ mode: 'pqc_only', body, nonce, timestamp });
    const req = envelopeToRequest(env, body, nonce, timestamp);
    const result = await extractAndVerifySigning(req);
    expect(result.effectiveBody).toEqual(body);
  });
});
