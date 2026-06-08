import { describe, it, expect } from 'vitest';
import { sealResolveReceipt, verifyResolveReceiptChain, type SecretResolveReceipt } from '../resolve-receipt';
import type { SecretResolveAudit } from '../secret-resolver';

function audit(over: Partial<SecretResolveAudit> = {}): SecretResolveAudit {
  return {
    event: 'secret.resolve',
    ownerId: 'u',
    ref: 'vault:K',
    purpose: null,
    outcome: 'allowed',
    reason: null,
    at: '2026-06-08T00:00:00.000Z',
    ...over,
  };
}

function chainOf(n: number): SecretResolveReceipt[] {
  const out: SecretResolveReceipt[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const r = sealResolveReceipt(audit({ at: `2026-06-08T00:00:0${i}.000Z` }), prev);
    out.push(r);
    prev = r.receiptHash;
  }
  return out;
}

describe('HoloKey resolve receipts (tamper-evident chain)', () => {
  it('seals an audit with prevHash + a content hash; no secret material', () => {
    const r = sealResolveReceipt(audit(), null);
    expect(r.prevHash).toBeNull();
    expect(r.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('verifies an intact chain', () => {
    expect(verifyResolveReceiptChain(chainOf(4))).toEqual({ ok: true, brokenAt: null });
  });

  it('detects a tampered field (stale receiptHash)', () => {
    const c = chainOf(4);
    c[2] = { ...c[2], outcome: 'denied' };
    expect(verifyResolveReceiptChain(c)).toEqual({ ok: false, brokenAt: 2 });
  });

  it('detects a deleted receipt (chain link breaks)', () => {
    const c = chainOf(4);
    expect(verifyResolveReceiptChain([c[0], c[1], c[3]]).ok).toBe(false);
  });

  it('detects a reorder', () => {
    const c = chainOf(4);
    expect(verifyResolveReceiptChain([c[0], c[2], c[1], c[3]]).ok).toBe(false);
  });
});
