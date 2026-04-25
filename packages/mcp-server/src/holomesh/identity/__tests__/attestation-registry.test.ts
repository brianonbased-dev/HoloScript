/**
 * Tests for AttestationRegistry — Phase 1-2 substrate (task _hccm).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AttestationRegistry,
  Attestation,
  createBroadcastingRegistry,
} from '../attestation-registry';

const ROOT = 'ecosystem-root';

function buildAtt(overrides: Partial<Attestation> = {}): Attestation {
  return {
    publicKey: '0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE',
    seatId: 'claude-claudecode-abc-default-x402',
    authorizedBy: ROOT,
    issuedAt: '2026-04-25T00:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('AttestationRegistry — basic CRUD', () => {
  it('attest + lookup round-trips with normalized (lowercased) key', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    const found = r.lookup('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE');
    expect(found).toBeDefined();
    expect(found?.publicKey).toBe('0xcafebabecafebabecafebabecafebabecafebabe');
    // Lookup is case-insensitive
    expect(r.lookup('0xcafebabecafebabecafebabecafebabecafebabe')).toBeDefined();
  });

  it('attest is idempotent on the same key (latest write wins)', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt({ seatId: 'old-seat-id' }));
    r.attest(buildAtt({ seatId: 'new-seat-id' }));
    expect(r.lookup('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')?.seatId).toBe('new-seat-id');
    expect(r.size()).toBe(1);
  });

  it('attest throws on missing required fields', () => {
    const r = new AttestationRegistry();
    expect(() => r.attest({ ...buildAtt(), publicKey: '' })).toThrow(/publicKey required/);
    expect(() => r.attest({ ...buildAtt(), seatId: '' })).toThrow(/seatId required/);
  });

  it('lookup returns undefined for unknown keys', () => {
    const r = new AttestationRegistry();
    expect(r.lookup('0x' + '0'.repeat(40))).toBeUndefined();
  });
});

describe('AttestationRegistry — retire / isRetired / isAttested', () => {
  it('retire flips isRetired and isAttested for the key', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(false);
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'compromise');
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(false);
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
  });

  it('retire returns the (now-retired) attestation with retiredAt + retireReason', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    const retired = r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'rotation');
    expect(retired).not.toBeNull();
    expect(retired?.retireReason).toBe('rotation');
    expect(retired?.retiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('retire returns null for unknown keys (no implicit-create)', () => {
    const r = new AttestationRegistry();
    expect(r.retire('0xunknown00000000000000000000000000000000', 'whatever')).toBeNull();
  });

  it('retire is idempotent — calling twice does not double-fire onRetire', () => {
    const onRetire = vi.fn();
    const r = new AttestationRegistry({ onRetire });
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'reason');
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'reason');
    expect(onRetire).toHaveBeenCalledTimes(1);
  });

  it('re-attest after retire clears the retired flag (key rotation flow)', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'rotation');
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
    r.attest(buildAtt());
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(false);
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
  });

  it('isAttested rejects expired attestations even when not retired', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt({ expiresAt: '2026-04-25T00:00:00.000Z' }));
    const before = Date.parse('2026-04-24T23:59:00.000Z');
    const after = Date.parse('2026-04-25T00:01:00.000Z');
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', before)).toBe(true);
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', after)).toBe(false);
  });
});

describe('AttestationRegistry — onRetire callback (SSE-broadcast hook)', () => {
  it('fires onRetire with the canonical event shape', () => {
    const onRetire = vi.fn();
    const r = new AttestationRegistry({ onRetire });
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'compromise');
    expect(onRetire).toHaveBeenCalledTimes(1);
    const evt = onRetire.mock.calls[0][0];
    expect(evt.publicKey).toBe('0xcafebabecafebabecafebabecafebabecafebabe');
    expect(evt.seatId).toBe('claude-claudecode-abc-default-x402');
    expect(evt.reason).toBe('compromise');
    expect(evt.retiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not throw when the onRetire callback throws (broadcast failure tolerance)', () => {
    const onRetire = vi.fn(() => { throw new Error('SSE down'); });
    const r = new AttestationRegistry({ onRetire });
    r.attest(buildAtt());
    expect(() => r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'reason'))
      .not.toThrow();
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
  });

  it('does not fire onRetire when retire() returns null (unknown key)', () => {
    const onRetire = vi.fn();
    const r = new AttestationRegistry({ onRetire });
    r.retire('0xunknown00000000000000000000000000000000', 'reason');
    expect(onRetire).not.toHaveBeenCalled();
  });
});

describe('AttestationRegistry.toRegistryCheck — request-signing integration', () => {
  it('returns attested:true for a freshly-attested signer', async () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    const check = r.toRegistryCheck();
    const result = await check('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE');
    expect(result.attested).toBe(true);
    expect(result.retired).toBe(false);
  });

  it('returns retired:true with reason after retire', async () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'compromise');
    const check = r.toRegistryCheck();
    const result = await check('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE');
    expect(result.retired).toBe(true);
    expect(result.attested).toBe(false);
    expect(result.reason).toBe('signer-retired');
  });

  it('returns attested:false reason=signer-not-attested for unknown signer', async () => {
    const r = new AttestationRegistry();
    const check = r.toRegistryCheck();
    const result = await check('0xunknown00000000000000000000000000000000');
    expect(result.attested).toBe(false);
    expect(result.retired).toBe(false);
    expect(result.reason).toBe('signer-not-attested');
  });
});

describe('createBroadcastingRegistry — SSE wiring helper', () => {
  it('calls broadcaster with team:retire event in the canonical SSE shape on retire', () => {
    const broadcaster = vi.fn();
    const r = createBroadcastingRegistry('team_xxx', broadcaster, { agent: 'founder' });
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'compromise');
    expect(broadcaster).toHaveBeenCalledTimes(1);
    const [roomId, event] = broadcaster.mock.calls[0];
    expect(roomId).toBe('team_xxx');
    expect(event.type).toBe('attestation:retire');
    expect(event.agent).toBe('founder');
    expect(event.data.publicKey).toBe('0xcafebabecafebabecafebabecafebabecafebabe');
    expect(event.data.reason).toBe('compromise');
  });

  it('does not fire broadcaster for retire of unknown key', () => {
    const broadcaster = vi.fn();
    const r = createBroadcastingRegistry('team_xxx', broadcaster);
    r.retire('0xunknown00000000000000000000000000000000', 'reason');
    expect(broadcaster).not.toHaveBeenCalled();
  });

  it('continues working when broadcaster throws (registry state still authoritative)', () => {
    const broadcaster = vi.fn(() => { throw new Error('SSE refused'); });
    const r = createBroadcastingRegistry('team_xxx', broadcaster);
    r.attest(buildAtt());
    expect(() => r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'reason'))
      .not.toThrow();
    expect(r.isRetired('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(true);
  });
});

describe('AttestationRegistry — counts + clear', () => {
  it('size and retiredCount track separately', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt({ publicKey: '0x' + '1'.repeat(40), seatId: 's1' }));
    r.attest(buildAtt({ publicKey: '0x' + '2'.repeat(40), seatId: 's2' }));
    r.attest(buildAtt({ publicKey: '0x' + '3'.repeat(40), seatId: 's3' }));
    expect(r.size()).toBe(3);
    expect(r.retiredCount()).toBe(0);
    r.retire('0x' + '2'.repeat(40), 'reason');
    expect(r.size()).toBe(3);
    expect(r.retiredCount()).toBe(1);
  });

  it('clear empties everything (test-only escape hatch)', () => {
    const r = new AttestationRegistry();
    r.attest(buildAtt());
    r.retire('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE', 'reason');
    r.clear();
    expect(r.size()).toBe(0);
    expect(r.retiredCount()).toBe(0);
    expect(r.isAttested('0xCAFEBABEcafebabeCAFEBABEcafebabeCAFEBABE')).toBe(false);
  });
});
