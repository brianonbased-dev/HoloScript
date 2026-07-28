import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  sealDecodeReceipt,
  sealDecodeReceiptChain,
  verifyDecodeReceiptChain,
  PAYLOAD_FIELDS,
  type QecDecodePayload,
} from '../decode-receipt';

function payload(over: Partial<QecDecodePayload> = {}): QecDecodePayload {
  return {
    schema: 'qec-decode-receipt/v0',
    code: '[[9,1,3]] rotated surface',
    x_syndrome: '0000',
    z_syndrome: '0000',
    x_correction: '000000000',
    z_correction: '000000000',
    logical_error: false,
    ...over,
  };
}

describe('QEC decode receipts (tamper-evident chain, @decode_receipt sealer)', () => {
  it('seals a payload with prev_hash + a sha256 content hash; no physical-qubit state', () => {
    const r = sealDecodeReceipt(payload(), null);
    expect(r.prev_hash).toBeNull();
    expect(r.receipt_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // only syndromes/corrections/flag survive — no membrane/qubit state fields
    expect(Object.keys(r).sort()).toEqual(
      [
        'code',
        'logical_error',
        'prev_hash',
        'receipt_hash',
        'schema',
        'x_correction',
        'x_syndrome',
        'z_correction',
        'z_syndrome',
      ].sort()
    );
  });

  it('verifies an intact chain', () => {
    const chain = sealDecodeReceiptChain([
      payload({ x_syndrome: '1000', x_correction: '100000000' }),
      payload({ z_syndrome: '0100', z_correction: '000010000' }),
      payload({ x_syndrome: '0010', z_syndrome: '0001', logical_error: false }),
    ]);
    expect(verifyDecodeReceiptChain(chain)).toEqual({ ok: true, brokenAt: null });
    expect(chain[0].prev_hash).toBeNull();
    for (let i = 1; i < chain.length; i++)
      expect(chain[i].prev_hash).toBe(chain[i - 1].receipt_hash);
  });

  it('detects a tampered field (flipped logical_error => stale receipt_hash)', () => {
    const chain = sealDecodeReceiptChain([
      payload(),
      payload({ x_syndrome: '1000' }),
      payload({ z_syndrome: '0100' }),
    ]);
    const tampered = chain.map((r) => ({ ...r }));
    tampered[1] = { ...tampered[1], logical_error: !tampered[1].logical_error };
    const v = verifyDecodeReceiptChain(tampered);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
    expect(v.reason).toMatch(/payload hash mismatch/);
  });

  it('detects a deleted receipt and a reorder (chain link breaks)', () => {
    const c = sealDecodeReceiptChain([
      payload(),
      payload({ x_syndrome: '1000' }),
      payload({ x_syndrome: '0100' }),
      payload({ x_syndrome: '0010' }),
    ]);
    expect(verifyDecodeReceiptChain([c[0], c[1], c[3]]).ok).toBe(false); // deletion
    const reordered = verifyDecodeReceiptChain([c[0], c[2], c[1], c[3]]);
    expect(reordered.ok).toBe(false);
    expect(reordered.reason).toMatch(/prev_hash linkage/);
  });

  it('canonical hash covers exactly the qec-decode-receipt/v0 payload fields + prev_hash', () => {
    const p = payload({ x_syndrome: '1010', x_correction: '101000000', logical_error: true });
    const expected =
      'sha256:' +
      createHash('sha256')
        .update(JSON.stringify([...PAYLOAD_FIELDS.map((f) => p[f]), null]))
        .digest('hex');
    expect(sealDecodeReceipt(p, null).receipt_hash).toBe(expected);
    // extra fields outside PAYLOAD_FIELDS must not change the hash (wire-compat with the .mjs sealer)
    const noisy = { ...p, extra: 'ignored', membrane: 42 } as QecDecodePayload;
    expect(sealDecodeReceipt(noisy, null).receipt_hash).toBe(expected);
  });
});
