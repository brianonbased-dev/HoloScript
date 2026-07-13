import { describe, it, expect } from 'vitest';
import { sealHash, verifyReceiptChain, type ChainAccessors } from '../receipt-chain';

// A toy receipt family proving the primitive is generic over ANY canonical + accessors —
// the reuse contract that lets resolve-receipt.ts and decode-receipt.ts (and the next one)
// share one hash-chain instead of copying it.
interface ToyReceipt {
  readonly value: string;
  readonly prev: string | null;
  readonly hash: string;
}
const ACC: ChainAccessors<ToyReceipt> = {
  canonical: (r, prevHash) => JSON.stringify([r.value, prevHash]),
  prevHashOf: (r) => r.prev,
  receiptHashOf: (r) => r.hash,
};
function seal(value: string, prev: string | null): ToyReceipt {
  return { value, prev, hash: sealHash(JSON.stringify([value, prev])) };
}
function chainOf(values: string[]): ToyReceipt[] {
  const out: ToyReceipt[] = [];
  let prev: string | null = null;
  for (const v of values) {
    const r = seal(v, prev);
    out.push(r);
    prev = r.hash;
  }
  return out;
}

describe('sealHash', () => {
  it('is a deterministic sha256:<64hex>', () => {
    expect(sealHash('abc')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sealHash('abc')).toBe(sealHash('abc'));
    expect(sealHash('abc')).not.toBe(sealHash('abd'));
  });
});

describe('verifyReceiptChain (generic over accessors)', () => {
  it('genesis prev is null and each link points at the prior hash', () => {
    const c = chainOf(['a', 'b', 'c']);
    expect(c[0].prev).toBeNull();
    for (let i = 1; i < c.length; i++) expect(c[i].prev).toBe(c[i - 1].hash);
  });
  it('verifies an intact chain', () => {
    expect(verifyReceiptChain(chainOf(['a', 'b', 'c']), ACC)).toEqual({ ok: true, brokenAt: null });
  });
  it('detects a tampered field at its index (stale hash)', () => {
    const c = chainOf(['a', 'b', 'c']).map((r) => ({ ...r }));
    c[1] = { ...c[1], value: 'B' };
    const v = verifyReceiptChain(c, ACC);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
    expect(v.reason).toBe('payload hash mismatch (field tampered)');
  });
  it('detects a reorder / broken linkage', () => {
    const c = chainOf(['a', 'b', 'c']);
    const v = verifyReceiptChain([c[0], c[2], c[1]], ACC);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('prev_hash linkage broken');
  });
  it('a non-genesis first receipt (prev != null) is rejected', () => {
    const c = chainOf(['a', 'b']);
    expect(verifyReceiptChain([c[1]], ACC).ok).toBe(false); // c[1].prev != null
  });
});
