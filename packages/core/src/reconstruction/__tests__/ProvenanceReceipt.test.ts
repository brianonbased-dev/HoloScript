/**
 * ProvenanceReceipt tests — the provenance-axis attestation over delivered bytes.
 * @see ../ProvenanceReceipt.ts
 */
import { describe, it, expect } from 'vitest';
import { buildProvenanceReceipt, PROVENANCE_RECEIPT_VERSION } from '../ProvenanceReceipt';

describe('ProvenanceReceipt', () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]);

  it('builds a receipt with histogram, delivered-bytes hash, and receipt hash', () => {
    const codes = Uint8Array.from([0, 0, 2]); // 2 observed, 1 generative-extended
    const r = buildProvenanceReceipt(codes, bytes, 'artifixer-14b');
    expect(r.version).toBe(PROVENANCE_RECEIPT_VERSION);
    expect(r.source).toBe('artifixer-14b');
    expect(r.histogram.observed).toBe(2);
    expect(r.histogram['generative-extended']).toBe(1);
    expect(r.histogram.observedFraction).toBeCloseTo(2 / 3, 5);
    expect(r.deliveredBytesHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for identical inputs', () => {
    const codes = Uint8Array.from([0, 1, 2]);
    const a = buildProvenanceReceipt(codes, bytes, 's');
    const b = buildProvenanceReceipt(codes, bytes, 's');
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.deliveredBytesHash).toBe(b.deliveredBytesHash);
  });

  it('receiptHash changes when delivered bytes change (forgery resistance)', () => {
    const codes = Uint8Array.from([0, 0, 0]);
    const a = buildProvenanceReceipt(codes, Uint8Array.from([1, 2, 3]), null);
    const b = buildProvenanceReceipt(codes, Uint8Array.from([1, 2, 9]), null);
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  it('receiptHash changes when the provenance composition changes', () => {
    const a = buildProvenanceReceipt(Uint8Array.from([0, 0, 0]), bytes, null);
    const b = buildProvenanceReceipt(Uint8Array.from([0, 0, 2]), bytes, null);
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  it('defaults source to null', () => {
    const r = buildProvenanceReceipt(Uint8Array.from([0]), bytes);
    expect(r.source).toBeNull();
  });
});
