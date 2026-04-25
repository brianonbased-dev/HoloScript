/**
 * Tests for HoloMesh request-signing verifier (Phase 1, server side).
 *
 * Mirrors the wallet-auth.test.ts mocking pattern (mock viem's verifyMessage)
 * so we can isolate the canonicalization, freshness, and envelope-shape logic
 * without dragging viem into every assertion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyMessage = vi.fn();
vi.mock('viem', () => ({
  verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args),
}));

import {
  buildSigningPayload,
  canonicalizeBody,
  extractEnvelope,
  isFreshTimestamp,
  TIMESTAMP_FRESHNESS_MS,
  verifyEnvelope,
  verifyRequestBody,
} from '../request-signing';

const VALID_ADDR = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';
const VALID_SIG = '0x' + 'a'.repeat(130);

beforeEach(() => {
  mockVerifyMessage.mockReset();
});

// ── canonicalizeBody ─────────────────────────────────────────────────────

describe('canonicalizeBody', () => {
  it('sorts object keys alphabetically', () => {
    expect(canonicalizeBody({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('matches the client output for identical input (cross-repo invariant)', () => {
    // Hard-coded expected — must match client `canonicalizeBody` byte-for-byte.
    // If this changes, ai-ecosystem/hooks/lib/holomesh-signing.mjs must too.
    const out = canonicalizeBody({
      body: { team: 'core', op: 'claim', taskId: 'abc' },
      nonce: 'n1',
      timestamp: '2026-04-25T07:43:05.034Z',
    });
    expect(out).toBe(
      '{"body":{"op":"claim","taskId":"abc","team":"core"},"nonce":"n1","timestamp":"2026-04-25T07:43:05.034Z"}'
    );
  });

  it('preserves array order (does not sort arrays)', () => {
    expect(canonicalizeBody([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles primitives, null, and nested mixes', () => {
    expect(canonicalizeBody(null)).toBe('null');
    expect(canonicalizeBody(42)).toBe('42');
    expect(canonicalizeBody('x')).toBe('"x"');
    expect(canonicalizeBody({ x: [1, { z: 2, a: 3 }] })).toBe('{"x":[1,{"a":3,"z":2}]}');
  });
});

// ── buildSigningPayload ─────────────────────────────────────────────────

describe('buildSigningPayload', () => {
  it('produces the exact canonical string the client signs', () => {
    expect(
      buildSigningPayload({ body: { hello: 'world' }, nonce: 'abc', timestamp: '2026-04-25T00:00:00.000Z' })
    ).toBe('{"body":{"hello":"world"},"nonce":"abc","timestamp":"2026-04-25T00:00:00.000Z"}');
  });
});

// ── extractEnvelope ─────────────────────────────────────────────────────

describe('extractEnvelope', () => {
  const validEnvelope = {
    body: { x: 1 },
    signature: VALID_SIG,
    signer_address: VALID_ADDR,
    nonce: 'n',
    timestamp: '2026-04-25T00:00:00.000Z',
  };

  it('returns the envelope when all required fields are present', () => {
    expect(extractEnvelope(validEnvelope)).toEqual(validEnvelope);
  });

  it('returns null for null / non-object input', () => {
    expect(extractEnvelope(null)).toBeNull();
    expect(extractEnvelope(undefined)).toBeNull();
    expect(extractEnvelope('string')).toBeNull();
    expect(extractEnvelope(42)).toBeNull();
  });

  it('returns null when any envelope field is missing', () => {
    for (const drop of ['signature', 'signer_address', 'nonce', 'timestamp', 'body']) {
      const partial = { ...validEnvelope } as Record<string, unknown>;
      delete partial[drop];
      expect(extractEnvelope(partial)).toBeNull();
    }
  });

  it('accepts a null body (signed empty-mutation)', () => {
    expect(extractEnvelope({ ...validEnvelope, body: null })).not.toBeNull();
  });
});

// ── isFreshTimestamp ───────────────────────────────────────────────────

describe('isFreshTimestamp', () => {
  it('accepts a timestamp within the freshness window', () => {
    const now = Date.parse('2026-04-25T00:00:00.000Z');
    expect(isFreshTimestamp('2026-04-25T00:01:00.000Z', now)).toBe(true);
    expect(isFreshTimestamp('2026-04-24T23:59:00.000Z', now)).toBe(true);
  });

  it('rejects a timestamp older than the freshness window', () => {
    const now = Date.parse('2026-04-25T00:10:00.000Z');
    expect(isFreshTimestamp('2026-04-25T00:00:00.000Z', now)).toBe(false);
  });

  it('rejects a timestamp newer than the freshness window (clock skew)', () => {
    const now = Date.parse('2026-04-25T00:00:00.000Z');
    const future = new Date(now + TIMESTAMP_FRESHNESS_MS + 1000).toISOString();
    expect(isFreshTimestamp(future, now)).toBe(false);
  });

  it('rejects unparseable timestamps', () => {
    expect(isFreshTimestamp('not a date', Date.now())).toBe(false);
  });
});

// ── verifyEnvelope ─────────────────────────────────────────────────────

describe('verifyEnvelope', () => {
  const freshNow = Date.parse('2026-04-25T00:00:00.000Z');
  const freshEnv = {
    body: { op: 'claim' },
    signature: VALID_SIG,
    signer_address: VALID_ADDR,
    nonce: 'n1',
    timestamp: '2026-04-25T00:00:00.000Z',
  };

  it('returns valid:true when viem.verifyMessage resolves true', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow });
    expect(r.valid).toBe(true);
    expect(r.signer).toBe(VALID_ADDR);
  });

  it('returns reason=signature-mismatch when verifyMessage resolves false', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
  });

  it('returns reason=verify-threw when viem import / verify throws', async () => {
    mockVerifyMessage.mockRejectedValue(new Error('viem boom'));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('verify-threw');
  });

  it('rejects stale timestamps without calling verifyMessage', async () => {
    const r = await verifyEnvelope(
      { ...freshEnv, timestamp: '2025-01-01T00:00:00.000Z' },
      { nowMs: freshNow }
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('timestamp-stale');
    expect(mockVerifyMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed signer_address without calling verifyMessage', async () => {
    const r = await verifyEnvelope({ ...freshEnv, signer_address: 'not-an-address' }, { nowMs: freshNow });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('malformed-signer-address');
    expect(mockVerifyMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed signature without calling verifyMessage', async () => {
    const r = await verifyEnvelope({ ...freshEnv, signature: 'not-hex' }, { nowMs: freshNow });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('malformed-signature');
    expect(mockVerifyMessage).not.toHaveBeenCalled();
  });

  it('passes the canonical signing payload to verifyMessage', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    await verifyEnvelope(freshEnv, { nowMs: freshNow });
    const calls = mockVerifyMessage.mock.calls;
    expect(calls.length).toBe(1);
    const call = calls[0][0] as { message: string; address: string; signature: string };
    expect(call.message).toBe(buildSigningPayload(freshEnv));
    expect(call.address).toBe(VALID_ADDR);
    expect(call.signature).toBe(VALID_SIG);
  });
});

// ── verifyEnvelope — registryCheck integration (task _hccm) ──────────

describe('verifyEnvelope — registryCheck branch', () => {
  const freshNow = Date.parse('2026-04-25T00:00:00.000Z');
  const freshEnv = {
    body: { op: 'claim' },
    signature: VALID_SIG,
    signer_address: VALID_ADDR,
    nonce: 'n1',
    timestamp: '2026-04-25T00:00:00.000Z',
  };

  it('passes valid signature through when registryCheck reports attested+not-retired', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registryCheck = vi.fn(async () => ({ attested: true, retired: false }));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.valid).toBe(true);
    expect(registryCheck).toHaveBeenCalledWith(VALID_ADDR);
  });

  it('rejects with reason=signer-retired when registry reports retired (even with valid sig)', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registryCheck = vi.fn(async () => ({ attested: false, retired: true, reason: 'signer-retired' }));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signer-retired');
  });

  it('rejects with reason=signer-not-attested when registry reports unknown signer', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registryCheck = vi.fn(async () => ({ attested: false, retired: false, reason: 'signer-not-attested' }));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signer-not-attested');
  });

  it('does not invoke registryCheck when signature is cryptographically invalid', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const registryCheck = vi.fn(async () => ({ attested: true, retired: false }));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
    expect(registryCheck).not.toHaveBeenCalled();
  });

  it('returns reason=registry-check-threw when registryCheck rejects', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registryCheck = vi.fn(async () => { throw new Error('registry boom'); });
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('registry-check-threw');
  });

  it('grace-period mode (no registryCheck) preserves Phase 1 verifier behavior', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow });
    expect(r.valid).toBe(true);
  });

  it('falls back to default reason when registryCheck omits the reason field', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const registryCheck = vi.fn(async () => ({ attested: false, retired: false }));
    const r = await verifyEnvelope(freshEnv, { nowMs: freshNow, registryCheck });
    expect(r.reason).toBe('signer-not-attested');
  });
});

// ── verifyRequestBody (extract + verify wrapper) ──────────────────────

describe('verifyRequestBody', () => {
  it('returns reason=unsigned for an unwrapped request body', async () => {
    const r = await verifyRequestBody({ team: 'core', op: 'claim' });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('unsigned');
    expect(r.signer).toBeNull();
  });

  it('returns the verification result for a properly-wrapped envelope', async () => {
    mockVerifyMessage.mockResolvedValue(true);
    const r = await verifyRequestBody(
      {
        body: { foo: 1 },
        signature: VALID_SIG,
        signer_address: VALID_ADDR,
        nonce: 'n',
        timestamp: new Date().toISOString(),
      },
      {}
    );
    expect(r.valid).toBe(true);
    expect(r.signer).toBe(VALID_ADDR);
  });

  it('preserves the verifier reason for failed signatures', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const r = await verifyRequestBody(
      {
        body: { foo: 1 },
        signature: VALID_SIG,
        signer_address: VALID_ADDR,
        nonce: 'n',
        timestamp: new Date().toISOString(),
      },
      {}
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
  });
});
