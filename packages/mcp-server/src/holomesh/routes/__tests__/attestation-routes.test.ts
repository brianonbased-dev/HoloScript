/**
 * Tests for attestation-routes — Phase 2 founder-side approval (task _nk25)
 * plus delegated attestation authority (founder directive 2026-07-10).
 *
 * Mocks viem.verifyTypedData (the EIP-712 verifier) so envelope validation,
 * authority resolution, and registry side-effects can be isolated from the
 * cryptographic recovery. The rest of the viem module stays REAL (spread of
 * importOriginal): hashTypedData powers the via-tx tests, and the delegated
 * authority tests point the mock back at the real verifyTypedData to exercise
 * genuine privateKeyToAccount + signTypedData signatures end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type http from 'node:http';

const mockVerifyTypedData = vi.fn();
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    verifyTypedData: (...args: unknown[]) => mockVerifyTypedData(...args),
  };
});

import { hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ATTESTATION_TYPES,
  handleAttestationRoutes,
  processAttestation,
  processAttestationViaTx,
  processRevocation,
  resolveAttestationAuthority,
  type AttestationEnvelope,
  type AttestationViaTxEnvelope,
  type BaseRpcFetcher,
  type RevocationEnvelope,
} from '../attestation-routes';
import { AttestationRegistry, type Attestation } from '../../identity/attestation-registry';
import {
  resetAttestationRegistry,
  setAttestationRegistry,
} from '../../identity/signing-middleware';
import { keyRegistry } from '../../state';
import type { KeyRecord } from '../../types';

const FOUNDER_ANCHOR = '0x0c574397150ad8d9f7fef83fe86a2cbdf4a660e3';
const SEAT_PUBKEY = '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE';
const VALID_SIG = '0x' + 'a'.repeat(130);
const DOMAIN = { name: 'HoloMesh', version: '1', chainId: 8453 };
const originalHolomeshApiKey = process.env.HOLOMESH_API_KEY;

function seedKey(key: string, agentId: string, isFounder = false): void {
  const record: KeyRecord = {
    key,
    walletAddress: isFounder
      ? '0x0000000000000000000000000000000000000001'
      : '0x0000000000000000000000000000000000000002',
    agentId,
    agentName: isFounder ? 'Founder' : 'Agent',
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder,
  };
  keyRegistry.set(key, record);
}

function buildAttestationEnvelope(
  overrides: Partial<AttestationEnvelope> = {}
): AttestationEnvelope {
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
  seedKey('test-founder-key', 'agent_founder', true);
});

afterEach(() => {
  resetAttestationRegistry();
  keyRegistry.delete('test-founder-key');
  if (originalHolomeshApiKey === undefined) {
    delete process.env.HOLOMESH_API_KEY;
  } else {
    process.env.HOLOMESH_API_KEY = originalHolomeshApiKey;
  }
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
    const r = await processAttestation(
      buildAttestationEnvelope({ seat_pubkey: 'not-an-address' }),
      {
        founderAnchor: FOUNDER_ANCHOR,
        domain: DOMAIN,
      }
    );
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-seat-pubkey');
  });

  it('rejects when authorized_by is malformed', async () => {
    const r = await processAttestation(buildAttestationEnvelope({ authorized_by: 'short' }), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-authorized-by');
  });

  it('rejects when signature is malformed (too short)', async () => {
    const r = await processAttestation(buildAttestationEnvelope({ signature: '0xabcd' }), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('malformed-signature');
  });

  it('rejects when verifyTypedData returns false', async () => {
    mockVerifyTypedData.mockResolvedValue(false);
    const r = await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('signature-mismatch');
  });

  it('rejects with reason=verify-threw when viem rejects', async () => {
    mockVerifyTypedData.mockRejectedValue(new Error('viem boom'));
    const r = await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('verify-threw');
  });

  it('does not write to registry on any rejection path', async () => {
    mockVerifyTypedData.mockResolvedValue(false);
    const registry = new AttestationRegistry();
    await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(registry.size()).toBe(0);
  });
});

describe('processAttestation — verifyTypedData call shape', () => {
  it('passes the canonical EIP-712 typed data + signature to viem', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    await processAttestation(buildAttestationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
    });
    expect(mockVerifyTypedData).toHaveBeenCalledTimes(1);
    const call = mockVerifyTypedData.mock.calls[0][0];
    expect(call.address).toBe(FOUNDER_ANCHOR);
    expect(call.domain).toEqual(DOMAIN);
    expect(call.primaryType).toBe('Attestation');
    expect(call.signature).toBe(VALID_SIG);
    // Message should be the envelope minus signature, with all 8 typed fields.
    expect(Object.keys(call.message).sort()).toEqual(
      [
        'authorized_by',
        'expires_at',
        'issued_at',
        'role',
        'seat_id',
        'seat_pubkey',
        'surface',
        'model',
      ].sort()
    );
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
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(r.status).toBe('retired');
    expect(registry.isRetired(SEAT_PUBKEY)).toBe(true);
  });

  it('returns reason=unknown-pubkey when retire targets a key not in the registry', async () => {
    mockVerifyTypedData.mockResolvedValue(true);
    const registry = new AttestationRegistry();
    const r = await processRevocation(buildRevocationEnvelope(), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
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
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
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
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(mockVerifyTypedData.mock.calls[0][0].address).toBe(FOUNDER_ANCHOR);
    expect(mockVerifyTypedData.mock.calls[0][0].primaryType).toBe('Revocation');
  });
});

// ── handleAttestationRoutes ──────────────────────────────────────────

function makeJsonReq(body: unknown): http.IncomingMessage {
  const req = Readable.from([JSON.stringify(body)]) as http.IncomingMessage;
  req.headers = { authorization: 'Bearer test-founder-key' };
  return req;
}

function makeJsonRes(): http.ServerResponse & {
  statusCodeSeen?: number;
  payload?: unknown;
} {
  const res = {
    writeHead(statusCode: number): void {
      this.statusCodeSeen = statusCode;
    },
    end(body: string): void {
      this.payload = JSON.parse(body);
    },
  };
  return res as http.ServerResponse & { statusCodeSeen?: number; payload?: unknown };
}

// ── delegated attestation authority (founder directive 2026-07-10) ──
//
// One Trezor via-tx click attests a hot wallet with role
// 'attestation-authority'; that wallet then signs seat attestations
// programmatically through /approve (clean viem signatures — no W.GOLD.514
// Trezor canonicalization problem). Depth-1: it may only attest 'agent'.

/** Deterministic test keys (well-known hardhat dev keys — never used on-chain). */
const AUTHORITY_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const authorityAccount = privateKeyToAccount(AUTHORITY_PRIVATE_KEY);
const INTRUDER_PRIVATE_KEY =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;
const intruderAccount = privateKeyToAccount(INTRUDER_PRIVATE_KEY);

const VIA_TX_HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

interface AttestationMessage {
  seat_id: string;
  seat_pubkey: `0x${string}`;
  role: string;
  surface: string;
  model: string;
  authorized_by: `0x${string}`;
  issued_at: string;
  expires_at: string;
}

function buildMessage(overrides: Partial<AttestationMessage> = {}): AttestationMessage {
  return {
    seat_id: 'claude-claudecode-def-default-x402',
    // Lowercased: the legacy SEAT_PUBKEY fixture has an invalid EIP-55
    // checksum, which the REAL viem hashTypedData/signTypedData reject.
    // Uniform-case is accepted as unchecksummed; the registry lowercases
    // keys anyway, so lookups with the mixed-case constant still resolve.
    seat_pubkey: SEAT_PUBKEY.toLowerCase() as `0x${string}`,
    role: 'agent',
    surface: 'claudecode',
    model: 'claude',
    authorized_by: authorityAccount.address,
    issued_at: '2026-07-10T08:00:00.000Z',
    expires_at: '',
    ...overrides,
  };
}

/** Real EIP-712 signature over an attestation envelope with the given account. */
async function signEnvelope(
  account: ReturnType<typeof privateKeyToAccount>,
  overrides: Partial<AttestationMessage> = {}
): Promise<AttestationEnvelope> {
  const message = buildMessage({ authorized_by: account.address, ...overrides });
  const signature = await account.signTypedData({
    domain: DOMAIN,
    types: ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message,
  });
  return { ...message, signature };
}

/** Via-tx envelope with a REAL recomputable eip712_hash + matching rpc fixture. */
function buildViaTxEnvelope(overrides: Partial<AttestationMessage> = {}): {
  envelope: AttestationViaTxEnvelope;
  rpcFetcher: BaseRpcFetcher;
} {
  const message = buildMessage(overrides);
  const eip712Hash = hashTypedData({
    domain: DOMAIN,
    types: ATTESTATION_TYPES,
    primaryType: 'Attestation',
    message,
  }).toLowerCase();
  const envelope: AttestationViaTxEnvelope = {
    typedData: {
      domain: DOMAIN,
      types: ATTESTATION_TYPES,
      primaryType: 'Attestation',
      message,
    },
    eip712_hash: eip712Hash,
    tx_hash: VIA_TX_HASH,
    chain_id: 8453,
  };
  const rpcFetcher: BaseRpcFetcher = async () => ({
    tx: {
      from: message.authorized_by,
      to: message.authorized_by,
      input: eip712Hash,
      blockNumber: '0x10',
    },
    receipt: { status: '0x1', blockNumber: '0x10' },
  });
  return { envelope, rpcFetcher };
}

/** Seed the registry with a founder-minted authority attestation directly. */
function attestAuthority(
  registry: AttestationRegistry,
  overrides: Partial<Attestation> = {}
): void {
  registry.attest({
    publicKey: authorityAccount.address,
    seatId: 'attestation-authority-hot-wallet',
    role: 'attestation-authority',
    authorizedBy: FOUNDER_ANCHOR,
    issuedAt: '2026-07-10T00:00:00.000Z',
    expiresAt: null,
    ...overrides,
  });
}

/** Point the verifyTypedData mock back at the REAL viem implementation. */
async function useRealVerifyTypedData(): Promise<void> {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  const realVerify = actual.verifyTypedData as unknown as (params: unknown) => Promise<boolean>;
  mockVerifyTypedData.mockImplementation((params: unknown) => realVerify(params));
}

describe('delegated attestation authority', () => {
  it('resolver treats the founder anchor as founder, case-insensitively', () => {
    const registry = new AttestationRegistry();
    const r = resolveAttestationAuthority(
      '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3', // checksummed casing
      registry,
      FOUNDER_ANCHOR
    );
    expect(r).toEqual({ ok: true, kind: 'founder' });
  });

  it('founder via-tx attests an attestation-authority envelope and persists role', async () => {
    const registry = new AttestationRegistry();
    const { envelope, rpcFetcher } = buildViaTxEnvelope({
      seat_id: 'attestation-authority-hot-wallet',
      seat_pubkey: authorityAccount.address,
      role: 'attestation-authority',
      authorized_by: FOUNDER_ANCHOR as `0x${string}`,
    });
    const r = await processAttestationViaTx(envelope, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
      rpcFetcher,
    });
    expect(r.status).toBe('attested');
    expect(r.tx_hash).toBe(VIA_TX_HASH);
    const stored = registry.lookup(authorityAccount.address);
    expect(stored?.role).toBe('attestation-authority');
    expect(stored?.authorizedBy.toLowerCase()).toBe(FOUNDER_ANCHOR);
    expect(resolveAttestationAuthority(authorityAccount.address, registry, FOUNDER_ANCHOR)).toEqual(
      { ok: true, kind: 'delegated' }
    );
  });

  it('end-to-end: via-tx-minted authority signs an agent seat; /approve path accepts (real viem sig)', async () => {
    const registry = new AttestationRegistry();
    // Step 1 — the single founder Trezor click: via-tx attest of the hot wallet.
    const { envelope, rpcFetcher } = buildViaTxEnvelope({
      seat_id: 'attestation-authority-hot-wallet',
      seat_pubkey: authorityAccount.address,
      role: 'attestation-authority',
      authorized_by: FOUNDER_ANCHOR as `0x${string}`,
    });
    const minted = await processAttestationViaTx(envelope, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
      rpcFetcher,
    });
    expect(minted.status).toBe('attested');

    // Step 2 — the hot wallet programmatically signs a seat attestation.
    await useRealVerifyTypedData();
    const seatEnvelope = await signEnvelope(authorityAccount, { role: 'agent' });
    const r = await processAttestation(seatEnvelope, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(r.status).toBe('attested');
    expect(mockVerifyTypedData).toHaveBeenCalledTimes(1); // real recovery actually ran
    const seat = registry.lookup(SEAT_PUBKEY);
    expect(seat?.role).toBe('agent');
    expect(seat?.authorizedBy.toLowerCase()).toBe(authorityAccount.address.toLowerCase());
  });

  it('delegated authority flows through POST /api/identity/attestation/approve', async () => {
    process.env.HOLOMESH_API_KEY = 'test-founder-key';
    const prevAnchor = process.env.HOLOMESH_FOUNDER_ANCHOR_ADDRESS;
    const prevChain = process.env.HOLOMESH_ATTESTATION_CHAIN_ID;
    process.env.HOLOMESH_FOUNDER_ANCHOR_ADDRESS = FOUNDER_ANCHOR;
    delete process.env.HOLOMESH_ATTESTATION_CHAIN_ID;
    try {
      const registry = new AttestationRegistry();
      setAttestationRegistry(registry);
      attestAuthority(registry);
      await useRealVerifyTypedData();
      const req = makeJsonReq({ attestations: [await signEnvelope(authorityAccount)] });
      const res = makeJsonRes();
      const handled = await handleAttestationRoutes(
        req,
        res,
        '/api/identity/attestation/approve',
        'POST',
        '/api/identity/attestation/approve'
      );
      expect(handled).toBe(true);
      expect(res.statusCodeSeen).toBe(200);
      expect(res.payload).toMatchObject({ success: true, attested: 1, rejected: 0 });
      expect(registry.lookup(SEAT_PUBKEY)?.role).toBe('agent');
    } finally {
      if (prevAnchor === undefined) delete process.env.HOLOMESH_FOUNDER_ANCHOR_ADDRESS;
      else process.env.HOLOMESH_FOUNDER_ANCHOR_ADDRESS = prevAnchor;
      if (prevChain === undefined) delete process.env.HOLOMESH_ATTESTATION_CHAIN_ID;
      else process.env.HOLOMESH_ATTESTATION_CHAIN_ID = prevChain;
    }
  });

  it('depth-1: a delegated authority cannot mint another authority via /approve', async () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry);
    mockVerifyTypedData.mockResolvedValue(true); // must not even be consulted
    const env = await signEnvelope(authorityAccount, { role: 'attestation-authority' });
    const r = await processAttestation(env, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('delegated-authority-cannot-mint-authority');
    expect(mockVerifyTypedData).not.toHaveBeenCalled();
    expect(registry.size()).toBe(1); // only the authority itself; nothing new landed
  });

  it('depth-1 is enforced on the via-tx path too', async () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry);
    const { envelope, rpcFetcher } = buildViaTxEnvelope({
      seat_pubkey: intruderAccount.address,
      role: 'attestation-authority',
      authorized_by: authorityAccount.address,
    });
    const r = await processAttestationViaTx(envelope, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
      rpcFetcher,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('delegated-authority-cannot-mint-authority');
  });

  it('rejects a random un-delegated wallet even with a cryptographically valid signature', async () => {
    const registry = new AttestationRegistry();
    await useRealVerifyTypedData();
    const env = await signEnvelope(intruderAccount); // authorized_by = intruder itself
    const r = await processAttestation(env, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('authorized-by-not-founder-anchor');
    expect(registry.size()).toBe(0);
  });

  it('an intruder claiming the founder anchor fails real signature recovery', async () => {
    const registry = new AttestationRegistry();
    await useRealVerifyTypedData();
    const message = buildMessage({ authorized_by: FOUNDER_ANCHOR as `0x${string}` });
    const signature = await intruderAccount.signTypedData({
      domain: DOMAIN,
      types: ATTESTATION_TYPES,
      primaryType: 'Attestation',
      message,
    });
    const r = await processAttestation(
      { ...message, signature },
      { founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry }
    );
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('signature-mismatch');
    expect(registry.size()).toBe(0);
  });

  it('founder revocation of the authority disables subsequent delegated approvals', async () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry);

    // Sanity: delegation works before revocation.
    await useRealVerifyTypedData();
    const before = await processAttestation(await signEnvelope(authorityAccount), {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
    });
    expect(before.status).toBe('attested');

    // Founder-only /revoke retires the authority's own attestation — the lever.
    mockVerifyTypedData.mockReset();
    mockVerifyTypedData.mockResolvedValue(true);
    const revoked = await processRevocation(
      buildRevocationEnvelope({
        seat_pubkey: authorityAccount.address,
        reason: 'rotate-authority',
      }),
      { founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry }
    );
    expect(revoked.status).toBe('retired');

    // The authority's signatures are now rejected before any recovery runs.
    mockVerifyTypedData.mockReset();
    const after = await processAttestation(
      await signEnvelope(authorityAccount, {
        seat_id: 'another-seat',
        seat_pubkey: ('0x' + '9'.repeat(40)) as `0x${string}`,
      }),
      { founderAnchor: FOUNDER_ANCHOR, domain: DOMAIN, registry }
    );
    expect(after.status).toBe('rejected');
    expect(after.reason).toBe('delegated-authority-revoked-or-expired');
    expect(mockVerifyTypedData).not.toHaveBeenCalled();
  });

  it('an expired authority attestation no longer resolves as delegated', () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry, { expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(resolveAttestationAuthority(authorityAccount.address, registry, FOUNDER_ANCHOR)).toEqual(
      { ok: false, reason: 'delegated-authority-revoked-or-expired' }
    );
  });

  it('an attested plain agent seat cannot act as an authority', () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry, { role: 'agent', seatId: 'just-an-agent' });
    expect(resolveAttestationAuthority(authorityAccount.address, registry, FOUNDER_ANCHOR)).toEqual(
      { ok: false, reason: 'authorized-by-not-attestation-authority' }
    );
  });

  it('an authority record not minted by the founder is rejected', () => {
    const registry = new AttestationRegistry();
    attestAuthority(registry, { authorizedBy: intruderAccount.address });
    expect(resolveAttestationAuthority(authorityAccount.address, registry, FOUNDER_ANCHOR)).toEqual(
      { ok: false, reason: 'delegated-authority-not-founder-minted' }
    );
  });

  it('regression: founder-anchor via-tx agent attestation is unchanged', async () => {
    const registry = new AttestationRegistry();
    const { envelope, rpcFetcher } = buildViaTxEnvelope({
      authorized_by: FOUNDER_ANCHOR as `0x${string}`,
    });
    const r = await processAttestationViaTx(envelope, {
      founderAnchor: FOUNDER_ANCHOR,
      domain: DOMAIN,
      registry,
      rpcFetcher,
    });
    expect(r.status).toBe('attested');
    expect(registry.lookup(SEAT_PUBKEY)?.role).toBe('agent');
  });
});

describe('handleAttestationRoutes — approve-via-tx', () => {
  it('rejects overlarge via-tx batches before any per-envelope RPC work', async () => {
    process.env.HOLOMESH_API_KEY = 'test-founder-key';
    const req = makeJsonReq({
      attestations_via_tx: Array.from({ length: 51 }, () => ({})),
    });
    const res = makeJsonRes();

    const handled = await handleAttestationRoutes(
      req,
      res,
      '/api/identity/attestation/approve-via-tx',
      'POST',
      '/api/identity/attestation/approve-via-tx'
    );

    expect(handled).toBe(true);
    expect(res.statusCodeSeen).toBe(400);
    expect(res.payload).toEqual({ error: 'batch too large (max 50, got 51)' });
  });
});
