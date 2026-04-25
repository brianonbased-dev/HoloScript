/**
 * Tests for signing-middleware — Phase 1.5 wiring helper (task _wfrt).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyMessage = vi.fn();
vi.mock('viem', () => ({
  verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args),
}));

import { AttestationRegistry } from '../attestation-registry';
import {
  extractAndVerifySigning,
  getAttestationRegistry,
  isStrictMode,
  resetAttestationRegistry,
  setAttestationRegistry,
} from '../signing-middleware';

const VALID_ADDR = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';
const VALID_SIG = '0x' + 'a'.repeat(130);

const FRESH_TS = '2026-04-25T00:00:00.000Z';
const FRESH_NOW = Date.parse(FRESH_TS);

function buildEnvelope(overrides = {}) {
  return {
    body: { team: 'core', op: 'claim', taskId: 'abc' },
    signature: VALID_SIG,
    signer_address: VALID_ADDR,
    nonce: 'n1',
    timestamp: FRESH_TS,
    ...overrides,
  };
}

function attestKey(registry: AttestationRegistry, address = VALID_ADDR) {
  registry.attest({
    publicKey: address,
    seatId: 'claude-claudecode-abc-default-x402',
    authorizedBy: 'ecosystem-root',
    issuedAt: FRESH_TS,
    expiresAt: null,
  });
}

beforeEach(() => {
  mockVerifyMessage.mockReset();
  resetAttestationRegistry();
});

afterEach(() => {
  resetAttestationRegistry();
});

// ── Singleton management ───────────────────────────────────────────

describe('getAttestationRegistry / setAttestationRegistry / reset', () => {
  it('returns the same registry instance across calls', () => {
    const a = getAttestationRegistry();
    const b = getAttestationRegistry();
    expect(a).toBe(b);
  });

  it('setAttestationRegistry replaces the singleton', () => {
    const custom = new AttestationRegistry();
    setAttestationRegistry(custom);
    expect(getAttestationRegistry()).toBe(custom);
  });

  it('resetAttestationRegistry forces a fresh instance on next get', () => {
    const a = getAttestationRegistry();
    resetAttestationRegistry();
    const b = getAttestationRegistry();
    expect(b).not.toBe(a);
  });
});

// ── Strict-mode env var ─────────────────────────────────────────────

describe('isStrictMode', () => {
  it('returns false by default (Phase 1 grace period)', () => {
    expect(isStrictMode({})).toBe(false);
  });

  it('returns true when HOLOMESH_SIGNING_MIGRATION_ACK=1 (per-machine opt-in)', () => {
    expect(isStrictMode({ HOLOMESH_SIGNING_MIGRATION_ACK: '1' })).toBe(true);
  });

  it('returns false for any other value (must be exactly "1")', () => {
    expect(isStrictMode({ HOLOMESH_SIGNING_MIGRATION_ACK: 'true' })).toBe(false);
    expect(isStrictMode({ HOLOMESH_SIGNING_MIGRATION_ACK: '0' })).toBe(false);
    expect(isStrictMode({ HOLOMESH_SIGNING_MIGRATION_ACK: '' })).toBe(false);
  });
});

// ── extractAndVerifySigning — unsigned bodies ─────────────────────

describe('extractAndVerifySigning — unsigned (legacy) bodies', () => {
  it('passes through legacy bodies as effectiveBody in dual-mode', async () => {
    const legacy = { team: 'core', op: 'claim', taskId: 'abc' };
    const r = await extractAndVerifySigning(legacy);
    expect(r.effectiveBody).toBe(legacy);
    expect(r.ctx.signedRequest).toBe(false);
    expect(r.ctx.signingValid).toBe(true);
    expect(r.ctx.signer).toBeNull();
    expect(r.ctx.signingReason).toBe('unsigned-grace');
  });

  it('rejects legacy bodies with unsigned-rejected when strict-mode is on', async () => {
    const legacy = { team: 'core', op: 'claim' };
    const r = await extractAndVerifySigning(legacy, { strictMode: true });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('unsigned-rejected');
  });

  it('strict mode is detected via env when not explicitly set', async () => {
    const legacy = { foo: 1 };
    const r = await extractAndVerifySigning(legacy, {
      env: { HOLOMESH_SIGNING_MIGRATION_ACK: '1' },
    });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('unsigned-rejected');
  });

  it('null and primitive bodies are treated as unsigned', async () => {
    const r1 = await extractAndVerifySigning(null);
    expect(r1.ctx.signedRequest).toBe(false);
    expect(r1.ctx.signingReason).toBe('unsigned-grace');
    const r2 = await extractAndVerifySigning('a-string-body');
    expect(r2.ctx.signedRequest).toBe(false);
  });
});

// ── extractAndVerifySigning — signed envelopes (registry empty) ──

describe('extractAndVerifySigning — signed envelopes with empty registry', () => {
  it('verifies cryptographically without consulting the empty registry', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const env = buildEnvelope();
    const r = await extractAndVerifySigning(env, { nowMs: FRESH_NOW });
    expect(r.effectiveBody).toEqual(env.body);
    expect(r.ctx.signedRequest).toBe(true);
    expect(r.ctx.signingValid).toBe(true);
    expect(r.ctx.signer).toBe(VALID_ADDR);
  });

  it('rejects with signature-mismatch when verifyMessage returns false', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('signature-mismatch');
  });

  it('rejects with timestamp-stale for old signed envelopes', async () => {
    const r = await extractAndVerifySigning(
      buildEnvelope({ timestamp: '2025-01-01T00:00:00.000Z' }),
      { nowMs: FRESH_NOW }
    );
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('timestamp-stale');
  });
});

// ── extractAndVerifySigning — signed envelopes (registry populated) ─

describe('extractAndVerifySigning — registry consulted when populated', () => {
  it('passes when signer is attested', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    attestKey(registry);
    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW, registry });
    expect(r.ctx.signingValid).toBe(true);
    expect(r.ctx.signer).toBe(VALID_ADDR);
  });

  it('rejects with signer-retired when registry retired the signer', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    attestKey(registry);
    registry.retire(VALID_ADDR, 'compromise');
    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW, registry });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('signer-retired');
  });

  it('rejects with signer-not-attested when registry has entries but not this signer', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    // Attest a different address — registry is non-empty but VALID_ADDR is unknown.
    attestKey(registry, '0x' + '1'.repeat(40));
    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW, registry });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('signer-not-attested');
  });

  it('does not consult the registry when it is empty (early Phase 1.5 safe-default)', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    // Registry is empty; signed envelope should still pass cryptographically.
    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW, registry });
    expect(r.ctx.signingValid).toBe(true);
    expect(r.ctx.signingReason).toBeUndefined();
  });
});

// ── extractAndVerifySigning — singleton integration ─────────────────

describe('extractAndVerifySigning — singleton integration', () => {
  it('uses the module singleton when registry option is not provided', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const custom = new AttestationRegistry();
    attestKey(custom);
    custom.retire(VALID_ADDR, 'compromise');
    setAttestationRegistry(custom);

    const r = await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW });
    expect(r.ctx.signingValid).toBe(false);
    expect(r.ctx.signingReason).toBe('signer-retired');
  });
});

// ── ctx shape — handler-recipe contract ─────────────────────────────

describe('SigningContext shape — call-site recipe', () => {
  it('every code path returns the same SigningContext keys', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const expected = ['signedRequest', 'signingValid', 'signer'].sort();
    const cases = [
      await extractAndVerifySigning({ legacy: 1 }),                                  // unsigned-grace
      await extractAndVerifySigning({ legacy: 1 }, { strictMode: true }),            // unsigned-rejected
      await extractAndVerifySigning(buildEnvelope(), { nowMs: FRESH_NOW }),          // signed-valid
      await extractAndVerifySigning(buildEnvelope({ timestamp: 'bad' }), { nowMs: FRESH_NOW }), // signed-stale
    ];
    for (const c of cases) {
      const keys = Object.keys(c.ctx).filter((k) => k !== 'signingReason').sort();
      expect(keys).toEqual(expected);
    }
  });
});
