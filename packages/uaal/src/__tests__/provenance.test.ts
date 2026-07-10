import { describe, expect, it } from 'vitest';
import {
  attachProvenance,
  effectiveTrust,
  validateEnvelope,
  validateIdentity,
  validateProvenance,
  type UAALProvenance,
} from '../provenance';

const GOOD: UAALProvenance = {
  asserted_by: 'claude3',
  asserted_at: '2026-07-10T07:00:00Z',
  source_kind: 'observed',
};

describe('validateProvenance', () => {
  it('accepts a minimal valid envelope', () => {
    expect(validateProvenance(GOOD)).toEqual([]);
  });

  it('accepts every optional field when well-formed', () => {
    expect(
      validateProvenance({
        ...GOOD,
        causal_parents: ['uaal:doc/test/parent-1', 'req-abc'],
        signature: '0xdeadbeef',
        corroboration: 3,
        expires_at: '2027-01-01T00:00:00Z',
      })
    ).toEqual([]);
  });

  it('fails closed on each malformed field', () => {
    expect(validateProvenance({ ...GOOD, asserted_by: '' })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, asserted_at: 'yesterday' })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, source_kind: 'vibes' })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, causal_parents: ['ok', ''] })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, corroboration: -1 })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, corroboration: 1.5 })).toHaveLength(1);
    expect(validateProvenance({ ...GOOD, expires_at: 'soon' })).toHaveLength(1);
    expect(validateProvenance('not-an-object')).toHaveLength(1);
  });

  it('allows expires_at: null (no decay)', () => {
    expect(validateProvenance({ ...GOOD, expires_at: null })).toEqual([]);
  });
});

describe('validateIdentity', () => {
  it('accepts well-formed doc and entity URIs', () => {
    expect(
      validateIdentity({
        instance_id: 'uaal:doc/hololand/scene-042',
        entity_uris: { e_mara: 'uaal:entity/hololand/mara' },
      })
    ).toEqual([]);
  });

  it('rejects malformed URIs and cross-kind confusion', () => {
    expect(validateIdentity({ instance_id: 'doc-42' })).toHaveLength(1);
    expect(validateIdentity({ instance_id: 'uaal:entity/x/y' })).toHaveLength(1);
    expect(
      validateIdentity({
        instance_id: 'uaal:doc/x/y',
        entity_uris: { e1: 'uaal:doc/x/z' },
      })
    ).toHaveLength(1);
    expect(
      validateIdentity({ instance_id: 'uaal:doc/x/y', entity_uris: { e1: 'mara' } })
    ).toHaveLength(1);
  });
});

describe('validateEnvelope', () => {
  it('legacy documents without envelope are valid by default', () => {
    const r = validateEnvelope({ propositions: [] });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('requireProvenance makes absence an error (CAEL write-admission mode)', () => {
    const r = validateEnvelope({ propositions: [] }, { requireProvenance: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('provenance: required'))).toBe(true);
    expect(r.errors.some((e) => e.includes('instance_id: required'))).toBe(true);
  });

  it('a present-but-malformed envelope fails closed even in default mode', () => {
    const r = validateEnvelope({ provenance: { asserted_by: 'x' } });
    expect(r.valid).toBe(false);
  });

  it('expiry is a trust signal, not a well-formedness failure', () => {
    const r = validateEnvelope(
      {
        provenance: { ...GOOD, expires_at: '2026-01-01T00:00:00Z' },
        instance_id: 'uaal:doc/test/expired-1',
      },
      { nowMs: Date.parse('2026-07-10T00:00:00Z') }
    );
    expect(r.valid).toBe(true);
    expect(r.expired).toBe(true);
  });

  it('warns when provenance exists without instance_id (not graph-addressable)', () => {
    const r = validateEnvelope({ provenance: GOOD });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('not graph-addressable'))).toBe(true);
  });

  it('rejects non-object documents', () => {
    expect(validateEnvelope(null).valid).toBe(false);
    expect(validateEnvelope([1, 2]).valid).toBe(false);
  });
});

describe('attachProvenance', () => {
  it('returns a new object carrying the envelope; input untouched', () => {
    const ir = { propositions: [{ id: 'p1' }] };
    const out = attachProvenance(ir, GOOD, {
      instance_id: 'uaal:doc/test/attach-1',
      entity_uris: { e1: 'uaal:entity/test/thing' },
    });
    expect(out.provenance).toEqual(GOOD);
    expect(out.instance_id).toBe('uaal:doc/test/attach-1');
    expect(out.propositions).toEqual([{ id: 'p1' }]);
    expect((ir as Record<string, unknown>).provenance).toBeUndefined();
  });

  it('throws on malformed envelope or identity (never attaches bad provenance)', () => {
    expect(() => attachProvenance({}, { ...GOOD, source_kind: 'vibes' } as never)).toThrow(
      /invalid envelope/
    );
    expect(() => attachProvenance({}, GOOD, { instance_id: 'nope' })).toThrow(/invalid identity/);
  });
});

describe('effectiveTrust', () => {
  const NOW = Date.parse('2026-07-10T00:00:00Z');

  it('scores 0 for unattributed or malformed documents', () => {
    expect(effectiveTrust({}, NOW)).toBe(0);
    expect(effectiveTrust({ provenance: { asserted_by: 'x' } as never }, NOW)).toBe(0);
  });

  it('orders source kinds observed > derived > reported > synthetic', () => {
    const t = (source_kind: UAALProvenance['source_kind']) =>
      effectiveTrust({ provenance: { ...GOOD, source_kind } }, NOW);
    expect(t('observed')).toBeGreaterThan(t('derived'));
    expect(t('derived')).toBeGreaterThan(t('reported'));
    expect(t('reported')).toBeGreaterThan(t('synthetic'));
  });

  it('corroboration adds capped bonus', () => {
    const base = effectiveTrust({ provenance: GOOD }, NOW);
    const boosted = effectiveTrust({ provenance: { ...GOOD, corroboration: 2 } }, NOW);
    const capped = effectiveTrust({ provenance: { ...GOOD, corroboration: 50 } }, NOW);
    expect(boosted).toBeCloseTo(base + 0.1, 10);
    expect(capped).toBeLessThanOrEqual(1);
    expect(capped).toBeCloseTo(Math.min(1, base + 0.2), 10);
  });

  it('expired envelopes earn zero trust', () => {
    expect(
      effectiveTrust({ provenance: { ...GOOD, expires_at: '2026-01-01T00:00:00Z' } }, NOW)
    ).toBe(0);
  });
});
