/**
 * Tests for attestation-routes — Phase 2 founder-side approval (task _nk25).
 *
 * Mocks viem.verifyTypedData (the EIP-712 verifier) to isolate envelope
 * validation, founder-anchor check, and registry side-effects from the
 * actual cryptographic recovery (which is well-covered upstream).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyTypedData = vi.fn();
vi.mock('viem', () => ({
  verifyTypedData: (...args: unknown[]) => mockVerifyTypedData(...args),
}));

import {
  processAttestation,
  processRevocation,
  type AttestationEnvelope,
  type RevocationEnvelope,
} from '../attestation-routes';
import { AttestationRegistry } from '../../identity/attestation-registry';
import {
  resetAttestationRegistry,
  setAttestationRegistry,
} from '../../identity/signing-middleware';

const FOUNDER_ANCHOR = '0x0c574397150ad8d9f7fef83fe86a2cbdf4a660e3';
const SEAT_PUBKEY = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';
const VALID_SIG = '0x' + 'a'.repeat(130);
const DOMAIN = { name: 'HoloMesh', version: '1', chainId: 8453 };

function buildAttestationEnvelope(overrides: Partial<AttestationEnvelope> = {}): AttestationEnvelope {
  return {
    seat_id: 'claude-claudecode-abc-default-x402',
    seat_pubkey: SEAT_PUBKEY,
    role: 'agent',
    surface: 'claudecode',
    model: 'claude',
    authorized_by: FOUNDER_ANCHOR,
    issued_at: '2026-04-25T08:00:00.000Z',
    expires_at: '',
    signature: VALID_SIG,
    ...overrides,
  };
}

function buildRevocationEnvelope(overrides: Partial<RevocationEnvelope> = {}): RevocationEnvelope {
  return {
    seat_pubkey: SEAT_PUBKEY,
    reason: 'compromise',
    revoked_at: '2026-04-25T08:00:00.000Z',
    signature: VALID_SIG,
    ...overrides,
  };
}

beforeEach(() => {
  mockVerifyTypedData.mockReset();
  resetAttestationRegistry();
});

afterEach(() => {
  resetAttestationRegistry();
});

// ── processAttestation ───────────────────────────────────────────────

describe('processAttestation — happy path', () => {
  it('verifies signature and writes to registry on success', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    const r = await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(r.status).toBe('attested');
    expect(r.seat_pubkey).toBe(SEAT_PUBKEY);
    expect(registry.size()).toBe(1);
    expect(registry.lookup(SEAT_PUBKEY)?.seatId).toBe('claude-claudecode-abc-default-x402');
  });

  it('treats empty expires_at string as null', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    await processAttestation(buildAttestationEnvelope({ expires_at: '' }), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(registry.lookup(SEAT_PUBKEY)?.expiresAt).toBeNull();
  });

  it('preserves expires_at when provided as ISO string', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    await processAttestation(buildAttestationEnvelope({ expires_at: '2027-01-01T00:00:00.000Z' }), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(registry.lookup(SEAT_PUBKEY)?.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('uses the singleton registry when no registry option is passed', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const singleton = new AttestationRegistry();
    setAttestationRegistry(singleton);
    await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(singleton.size()).toBe(1);
  });
});

describe('processAttestation — rejection paths', () => {
  it('rejects when authorized_by is not the founder anchor', async () => {
    const r = await processAttestation(
      buildAttestationEnvelope({ authorized_by: '0x' + '1'.repeat(40) }),
      { founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN }
    );
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('authorized-by-not-founder-anchor');
    expect(mockVerifyTypedData).not.toHaveBeenCalled();
  });

  it('rejects when seat_pubkey is malformed', async () => {
    const r = await processAttestation(buildAttestationEnvelope({ seat_pubkey: 'not-an-address' }), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-seat-pubkey');
  });

  it('rejects when authorized_by is malformed', async () => {
    const r = await processAttestation(buildAttestationEnvelope({ authorized_by: 'short' }), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-authorized-by');
  });

  it('rejects when signature is malformed (too short)', async () => {
    const r = await processAttestation(buildAttestationEnvelope({ signature: '0xabcd' }), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-signature');
  });

  it('rejects when verifyTypedData returns false', async () => {
    mockVerifyTypedData.mockResolvedValue(false);
    const r = await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('signature-mismatch');
  });

  it('rejects with reason=verify-threw when viem rejects', async () => {
    mockVerifyTypedData.mockRejectedValue(new Error('viem boom'));
    const r = await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('verify-threw');
  });

  it('does not write to registry on any rejection path', async () => {
    mockVerifyTypedData.mockResolvedValue(false);
    const registry = new AttestationRegistry();
    await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry,
    });
    expect(registry.size()).toBe(0);
  });
});

describe('processAttestation — verifyTypedData call shape', () => {
  it('passes the canonical EIP-712 typed data + signature to viem', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN,
    });
    expect(mockVerifyTypedData).toHaveBeenCalledTimes(1);
    const call = mockVerifyTypedData.mock.calls[0][0];
    expect(call.address).toBe(FOUNDER_ANCHOR);
    expect(call.domain).toEqual(DOMAIN);
    expect(call.primaryType).toBe('Attestation');
    expect(call.signature).toBe(VALID_SIG);
    // Message should be the envelope minus signature, with all 8 typed fields.
    expect(Object.keys(call.message).sort()).toEqual([
      'authorized_by', 'expires_at', 'issued_at', 'role', 'seat_id', 'seat_pubkey', 'surface', 'model',
    ].sort());
  });
});

// ── processRevocation ────────────────────────────────────────────────

describe('processRevocation', () => {
  it('verifies + retires the seat in the registry on success', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    // Pre-attest so retire has something to retire
    registry.attest({
      publicKey: SEAT_PUBKEY,
      seatId: 's',
      authorizedBy: FOUNDER_ANCHOR,
      issuedAt: '2026-04-25T00:00:00.000Z',
      expiresAt: null,
    });
    const r = await processRevocation(buildRevocationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry,
    });
    expect(r.status).toBe('retired');
    expect(registry.isRetired(SEAT_PUBKEY)).toBe(true);
  });

  it('returns reason=unknown-pubkey when retire targets a key not in the registry', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    const r = await processRevocation(buildRevocationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('unknown-pubkey');
  });

  it('rejects revocation with bad signature without touching registry', async () => {
    mockVerifyTypedData.mockResolvedValue(false);
    const registry = new AttestationRegistry();
    registry.attest({
      publicKey: SEAT_PUBKEY,
      seatId: 's',
      authorizedBy: FOUNDER_ANCHOR,
      issuedAt: '2026-04-25T00:00:00.000Z',
      expiresAt: null,
    });
    const r = await processRevocation(buildRevocationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('signature-mismatch');
    expect(registry.isRetired(SEAT_PUBKEY)).toBe(false);
  });

  it('uses the founder-anchor as the verifyTypedData signer (not envelope.authorized_by)', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    registry.attest({
      publicKey: SEAT_PUBKEY,
      seatId: 's',
      authorizedBy: FOUNDER_ANCHOR,
      issuedAt: '2026-04-25T00:00:00.000Z',
      expiresAt: null,
    });
    await processRevocation(buildRevocationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry,
    });
    expect(mockVerifyTypedData.mock.calls[0][0].address).toBe(FOUNDER_ANCHOR);
    expect(mockVerifyTypedData.mock.calls[0][0].primaryType).toBe('Revocation');
  });
});
