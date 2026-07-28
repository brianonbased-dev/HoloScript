import { describe, it, expect } from 'vitest';
import { AttestationRegistry, type Attestation } from '../attestation-registry';
import { encodeSnapshot, decodeSnapshot } from '../attestation-persistence';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const FOUNDER = '0x0c574397150ad8d9f7fef83fe86a2cbdf4a660e3';

function att(publicKey: string, extra: Partial<Attestation> = {}): Attestation {
  return {
    publicKey,
    seatId: `seat-${publicKey.slice(2, 8)}`,
    authorizedBy: FOUNDER,
    role: 'agent',
    issuedAt: '2026-07-11T00:00:00.000Z',
    expiresAt: null,
    ...extra,
  };
}

describe('AttestationRegistry snapshot/restore', () => {
  it('round-trips attested + retired + expiring state', () => {
    const src = new AttestationRegistry();
    src.attest(att(ADDR_A));
    src.attest(att(ADDR_B, { expiresAt: '2099-01-01T00:00:00.000Z' }));
    src.retire(ADDR_B, 'rotation');

    const dst = new AttestationRegistry();
    dst.restore(src.snapshot());

    expect(dst.isAttested(ADDR_A)).toBe(true);
    expect(dst.isRetired(ADDR_A)).toBe(false);
    // B was retired — still known, but not attested and flagged retired.
    expect(dst.lookup(ADDR_B)).toBeTruthy();
    expect(dst.isAttested(ADDR_B)).toBe(false);
    expect(dst.isRetired(ADDR_B)).toBe(true);
    expect(dst.size()).toBe(2);
    expect(dst.retiredCount()).toBe(1);
  });

  it('rebuilds the PQC secondary index on restore', () => {
    const pqc = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253]);
    const src = new AttestationRegistry();
    src.attest(att(ADDR_A, { pqcPublicKey: pqc }));

    const dst = new AttestationRegistry();
    dst.restore(src.snapshot());

    expect(dst.isPqcAttested(pqc)).toBe(true);
    expect(dst.lookupByPqcKey(pqc)?.publicKey).toBe(ADDR_A);
  });

  it('restore(null) is a no-op and restore skips malformed rows', () => {
    const reg = new AttestationRegistry();
    reg.attest(att(ADDR_A));
    reg.restore(null);
    expect(reg.isAttested(ADDR_A)).toBe(true); // untouched

    const fresh = new AttestationRegistry();
    fresh.restore({
      attestations: [
        att(ADDR_A),
        {
          seatId: 'no-pubkey',
          authorizedBy: FOUNDER,
          issuedAt: 'x',
          expiresAt: null,
        } as Attestation,
      ],
      retired: [],
    });
    expect(fresh.size()).toBe(1); // malformed row dropped
    expect(fresh.isAttested(ADDR_A)).toBe(true);
  });
});

describe('onChange persistence hook', () => {
  it('fires on attest and retire, not on restore', () => {
    let changes = 0;
    const reg = new AttestationRegistry({
      onChange: () => {
        changes += 1;
      },
    });
    reg.attest(att(ADDR_A));
    expect(changes).toBe(1);
    reg.retire(ADDR_A, 'compromise');
    expect(changes).toBe(2);

    // restore must NOT fire onChange (loading from the store isn't a new write).
    const snap = reg.snapshot();
    changes = 0;
    reg.restore(snap);
    expect(changes).toBe(0);
  });

  it('a throwing onChange never breaks the mutation', () => {
    const reg = new AttestationRegistry({
      onChange: () => {
        throw new Error('disk full');
      },
    });
    expect(() => reg.attest(att(ADDR_A))).not.toThrow();
    expect(reg.isAttested(ADDR_A)).toBe(true);
  });
});

describe('encodeSnapshot / decodeSnapshot (wire round-trip through JSON)', () => {
  it('preserves attested + retired + PQC bytes across a JSON serialization', () => {
    const pqc = new Uint8Array([0, 127, 128, 255, 42]);
    const src = new AttestationRegistry();
    src.attest(att(ADDR_A, { pqcPublicKey: pqc }));
    src.attest(att(ADDR_B));
    src.retire(ADDR_B, 'rotation');

    // encode -> JSON string -> parse -> decode -> restore (simulates the disk hop).
    const onWire = JSON.parse(JSON.stringify(encodeSnapshot(src, '2026-07-11T12:00:00.000Z')));
    const decoded = decodeSnapshot(onWire);
    expect(decoded).not.toBeNull();

    const dst = new AttestationRegistry();
    dst.restore(decoded);

    expect(dst.isAttested(ADDR_A)).toBe(true);
    expect(dst.isRetired(ADDR_B)).toBe(true);
    expect(dst.lookupByPqcKey(pqc)?.publicKey).toBe(ADDR_A);
    expect(Array.from(dst.lookup(ADDR_A)!.pqcPublicKey!)).toEqual(Array.from(pqc));
  });

  it('decodeSnapshot(null) and malformed input return null', () => {
    expect(decodeSnapshot(null)).toBeNull();
    // Missing attestations array.
    expect(decodeSnapshot({ version: 1, savedAt: 'x' } as never)).toBeNull();
  });
});
