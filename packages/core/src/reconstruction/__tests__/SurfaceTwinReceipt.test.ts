/**
 * SurfaceTwinReceipt.test.ts — @verified_view v1 (Framing B): a dashboard must faithfully
 * mirror the twin it claims to. The load-bearing test is the RED-FLIP: every contract field is
 * correct and only the DISPLAYED value diverges from the authoritative twin → FALSIFIED (the
 * "dashboard is lying about the twin"). Plus the transform/entity abstention discipline
 * (refuse, don't guess) and hash stability.
 */
import { describe, it, expect } from 'vitest';
import {
  checkSurfaceTwinCorrespondence,
  verifySurfaceTwinLive,
  applyProjectionTransform,
  type SurfaceTwinProjection,
  type SurfaceTwinTransform,
} from '../SurfaceTwinReceipt';

const proj = (
  element: string,
  node: string,
  identity: boolean,
  entity?: string
): SurfaceTwinProjection => ({ element, node, identity, ...(entity ? { entity } : {}) });

describe('checkSurfaceTwinCorrespondence', () => {
  it('CONSENSUS when every entity-bound identity projection matches the twin', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('Temp', 'reactor.temp', true, 'reactor-7')] },
      displayedValues: { 'reactor.temp': 800 },
      authoritativeState: { 'reactor-7': { temp: 800 } },
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
    expect(r.divergences).toEqual([]);
    expect(r.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RED-FLIP: FALSIFIED when the displayed value diverges from the twin (zero contract corruption)', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('Temp', 'reactor.temp', true, 'reactor-7')] },
      displayedValues: { 'reactor.temp': 800 }, // surface shows 800...
      authoritativeState: { 'reactor-7': { temp: 951 } }, // ...but the twin holds 951
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences).toHaveLength(1);
    expect(r.divergences[0]).toMatchObject({
      node: 'reactor.temp',
      entity: 'reactor-7',
      displayed: 800,
      authoritative: 951,
    });
    expect(r.divergences[0].detail).toMatch(/twin "reactor-7" holds 951/);
  });

  it('number and its string form are equal (identity render is DOM text)', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('S', 'sec.sessions', true, 'sec')] },
      displayedValues: { 'sec.sessions': '1240' },
      authoritativeState: { sec: { sessions: 1240 } },
    });
    expect(r.verdict).toBe('CONSENSUS');
  });

  it("ABSTAINS (refuse, don't guess): non-identity/transform projections are never compared", () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('Fmt', 'sec.revenue', false, 'sec')] }, // identity:false
      displayedValues: { 'sec.revenue': '$1.2M' },
      authoritativeState: { sec: { revenue: 1234567 } }, // would false-FALSIFY under equality
    });
    expect(r.verdict).toBe('CONSENSUS'); // NOT falsified — abstained
    expect(r.checked).toBe(0);
    expect(r.abstentions).toEqual([
      { node: 'sec.revenue', entity: 'sec', reason: 'non-identity-transform' },
    ]);
  });

  it('ABSTAINS: a projection with no entity binding is coverage, not a fault', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('Local', 'stats.sessions', true)] }, // no entity
      displayedValues: { 'stats.sessions': 42 },
      authoritativeState: {},
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.abstentions).toEqual([{ node: 'stats.sessions', reason: 'no-entity-binding' }]);
  });

  it('ABSTAINS on missing authority or missing display — never a false FALSIFIED', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: {
        projections: [
          proj('A', 'reactor.temp', true, 'reactor-7'), // authority has no such field
          proj('B', 'reactor.pressure', true, 'reactor-7'), // no displayed value
        ],
      },
      displayedValues: { 'reactor.temp': 800 },
      authoritativeState: { 'reactor-7': { pressure: 10 } },
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(0);
    expect(r.abstentions.map((a) => a.reason).sort()).toEqual([
      'authority-missing',
      'display-missing',
    ]);
  });

  it('resolves a scalar authoritative entity value directly', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [proj('T', 'temp', true, 'reactor-7')] },
      displayedValues: { temp: 42 },
      authoritativeState: { 'reactor-7': 42 }, // scalar entity value
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
  });

  it('receiptHash is canonical — same input, same hash regardless of projection order', () => {
    const input = (order: 'ab' | 'ba') => ({
      contract: {
        projections:
          order === 'ab'
            ? [proj('A', 'x.a', true, 'e'), proj('B', 'x.b', true, 'e')]
            : [proj('B', 'x.b', true, 'e'), proj('A', 'x.a', true, 'e')],
      },
      displayedValues: { 'x.a': 1, 'x.b': 2 },
      authoritativeState: { e: { a: 9, b: 2 } }, // a diverges (1 vs 9)
    });
    const r1 = checkSurfaceTwinCorrespondence(input('ab'));
    const r2 = checkSurfaceTwinCorrespondence(input('ba'));
    expect(r1.verdict).toBe('FALSIFIED');
    expect(r1.receiptHash).toBe(r2.receiptHash);
  });
});

describe('verifySurfaceTwinLive — injected authoritative fetch (production-shaped)', () => {
  const contract = {
    projections: [proj('Temp', 'reactor.temp', true, 'reactor-7')],
  };

  it('CONSENSUS when the fetched authoritative value matches the displayed value', async () => {
    const r = await verifySurfaceTwinLive({
      contract,
      displayedValues: { 'reactor.temp': 800 },
      fetchAuthoritativeState: async (e) => (e === 'reactor-7' ? { temp: 800 } : null),
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
  });

  it('CANARY: FALSIFIED when the live twin value diverges', async () => {
    const r = await verifySurfaceTwinLive({
      contract,
      displayedValues: { 'reactor.temp': 800 },
      fetchAuthoritativeState: async () => ({ temp: 951 }),
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences[0]).toMatchObject({
      entity: 'reactor-7',
      displayed: 800,
      authoritative: 951,
    });
  });

  it('a fetch FAILURE abstains as authority-unavailable — NOT a false FALSIFIED', async () => {
    const thrown = await verifySurfaceTwinLive({
      contract,
      displayedValues: { 'reactor.temp': 800 },
      fetchAuthoritativeState: async () => {
        throw new Error('StateAuthority unreachable');
      },
    });
    expect(thrown.verdict).toBe('CONSENSUS'); // could not reach the twin ≠ the dashboard lied
    expect(thrown.checked).toBe(0);
    expect(thrown.abstentions).toEqual([
      { node: 'reactor.temp', entity: 'reactor-7', reason: 'authority-unavailable' },
    ]);

    const nullResult = await verifySurfaceTwinLive({
      contract,
      displayedValues: { 'reactor.temp': 800 },
      fetchAuthoritativeState: async () => null, // unreachable → null
    });
    expect(nullResult.abstentions[0].reason).toBe('authority-unavailable');
  });

  it('fetches each distinct entity once (dedupes)', async () => {
    const calls: string[] = [];
    await verifySurfaceTwinLive({
      contract: {
        projections: [
          proj('A', 'e.a', true, 'ent'),
          proj('B', 'e.b', true, 'ent'), // same entity
        ],
      },
      displayedValues: { 'e.a': 1, 'e.b': 2 },
      fetchAuthoritativeState: async (e) => {
        calls.push(e);
        return { a: 1, b: 2 };
      },
    });
    expect(calls).toEqual(['ent']); // one fetch, not two
  });
});

// ---------------------------------------------------------------------------------------------
// Slice 3 — the transform algebra. A FORMATTED @bind ($1.20, 42%, 8.0) is no longer a blind
// abstention: the checker RE-APPLIES the compiler-declared transform to the authoritative twin
// value and compares to the DOM text. The load-bearing test is the TRANSFORM-DRIFT CANARY —
// prove the checker re-runs the transform rather than trusting the display.
// ---------------------------------------------------------------------------------------------

const fmt = (
  element: string,
  node: string,
  entity: string,
  transform: SurfaceTwinTransform
): SurfaceTwinProjection => ({ element, node, entity, identity: false, transform });

describe('applyProjectionTransform — mirrors the compiler render path exactly', () => {
  it('precision → toFixed', () => {
    expect(applyProjectionTransform(1.2, { precision: 2 })).toBe('1.20');
    expect(applyProjectionTransform(42, { precision: 0 })).toBe('42');
  });
  it('prefix + suffix wrap the raw value', () => {
    expect(applyProjectionTransform(1.2, { prefix: '$', suffix: 'k' })).toBe('$1.2k');
  });
  it('precision + prefix + suffix compose in render order', () => {
    expect(applyProjectionTransform(42, { precision: 1, prefix: '$', suffix: 'ms' })).toBe(
      '$42.0ms'
    );
  });
  it('null/undefined coerces to 0 (mirrors `(value ?? 0)`)', () => {
    expect(applyProjectionTransform(null, { precision: 2 })).toBe('0.00');
    expect(applyProjectionTransform(null, { prefix: '$', suffix: '%' })).toBe('$0%');
  });
});

describe('checkSurfaceTwinCorrespondence — formatted (non-identity) twin checking', () => {
  it('CONSENSUS: a formatted display matches the transform applied to the twin', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [fmt('Temp', 'reactor.temp', 'reactor-7', { precision: 2 })] },
      displayedValues: { 'reactor.temp': '800.00' }, // rendered (800).toFixed(2)
      authoritativeState: { 'reactor-7': { temp: 800 } },
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1); // no longer abstained — the transform made it checkable
    expect(r.abstentions).toEqual([]);
  });

  it('CONSENSUS: prefix + suffix formatted display matches a pre-scaled twin', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [fmt('Rev', 'sec.revenue', 'sec', { prefix: '$', suffix: 'M' })] },
      displayedValues: { 'sec.revenue': '$1.2M' },
      authoritativeState: { sec: { revenue: 1.2 } }, // twin already in millions
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.checked).toBe(1);
  });

  it('FALSIFIED: the twin diverges from the formatted display (records raw + expected)', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [fmt('Temp', 'reactor.temp', 'reactor-7', { precision: 2 })] },
      displayedValues: { 'reactor.temp': '800.00' }, // surface shows 800.00...
      authoritativeState: { 'reactor-7': { temp: 951 } }, // ...twin holds 951
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences[0]).toMatchObject({
      node: 'reactor.temp',
      entity: 'reactor-7',
      displayed: '800.00',
      authoritative: 951, // the RAW twin value
      expected: '951.00', // what the declared transform says it SHOULD display
    });
    expect(r.divergences[0].detail).toMatch(/formats to "951\.00"/);
  });

  it('TRANSFORM-DRIFT CANARY: surface rendered a DIFFERENT precision than the contract declares → FALSIFIED', () => {
    // The twin and the raw value AGREE (both 8). The only fault is that the surface rendered at
    // precision 1 ("8.0") while the contract's declared transform is precision 2. A verifier that
    // trusted the display would pass; because it RE-APPLIES the transform (→ "8.00") it catches the
    // drift. This is the test that proves the checker is not self-passing.
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [fmt('X', 'm.x', 'ent', { precision: 2 })] },
      displayedValues: { 'm.x': '8.0' }, // rendered at precision 1 (the drift)
      authoritativeState: { ent: { x: 8 } }, // twin agrees on the raw value
    });
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.divergences[0]).toMatchObject({
      displayed: '8.0',
      authoritative: 8,
      expected: '8.00',
    });
  });

  it('still ABSTAINS when there is NO modelable transform (e.g. @chart/@each): identity:false, no transform', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: {
        projections: [{ element: 'Chart', node: 'sec.series', entity: 'sec', identity: false }],
      },
      displayedValues: { 'sec.series': '[1,2,3]' },
      authoritativeState: { sec: { series: [9, 9, 9] } }, // would false-FALSIFY if compared
    });
    expect(r.verdict).toBe('CONSENSUS'); // abstained, not falsified
    expect(r.checked).toBe(0);
    expect(r.abstentions).toEqual([
      { node: 'sec.series', entity: 'sec', reason: 'non-identity-transform' },
    ]);
  });

  it('a formatted projection abstains cleanly when its authority is unavailable (no false FALSIFIED)', () => {
    const r = checkSurfaceTwinCorrespondence({
      contract: { projections: [fmt('Temp', 'reactor.temp', 'reactor-7', { precision: 2 })] },
      displayedValues: { 'reactor.temp': '800.00' },
      authoritativeState: {},
      unavailableEntities: ['reactor-7'],
    });
    expect(r.verdict).toBe('CONSENSUS');
    expect(r.abstentions).toEqual([
      { node: 'reactor.temp', entity: 'reactor-7', reason: 'authority-unavailable' },
    ]);
  });
});
