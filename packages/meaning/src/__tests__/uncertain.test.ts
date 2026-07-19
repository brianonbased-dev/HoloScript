import { describe, expect, it } from 'vitest';
import {
  both,
  flatMap,
  fromResolution,
  isAleatoric,
  isKnown,
  known,
  map,
  orElse,
  requireKnown,
  unknown,
  type Uncertain,
} from '../uncertain';
import { aleatoricGap, structuredGap, type MeaningResolution } from '../contract';

describe('Uncertain<T> — first-class ignorance as a value', () => {
  it('known/unknown constructors and the isKnown guard', () => {
    expect(known(7)).toEqual({ known: true, value: 7 });
    const u = unknown<number>('underdetermined');
    expect(u).toEqual({ known: false, reason: 'underdetermined' });
    expect(isKnown(known(1))).toBe(true);
    expect(isKnown(u)).toBe(false);
  });

  it('unknown carries a family-scoped gap when supplied, and omits the key otherwise', () => {
    const gap = structuredGap('affordance', 'affordance.unstated_precondition', 'missing_precondition');
    const u = unknown<number>('missing_precondition', gap);
    expect(u.known).toBe(false);
    if (!u.known) expect(u.gap?.code).toBe('affordance.unstated_precondition');
    const bare = unknown<number>('underdetermined');
    expect('gap' in bare).toBe(false);
  });

  it('isAleatoric separates the IRREDUCIBLE class from the reducible one', () => {
    const reducible = unknown<number>('underdetermined', structuredGap('temporal', 'temporal.unstated_now', 'underdetermined'));
    const irreducible = unknown<number>('irreducible_stochastic', aleatoricGap('sampling', 'sampling.coin_flip'));
    expect(isAleatoric(reducible)).toBe(false);
    expect(isAleatoric(irreducible)).toBe(true);
    // a KNOWN value is never aleatoric — there is no gap to classify
    expect(isAleatoric(known(1))).toBe(false);
    // an unknown with no structured gap is not assumed irreducible
    expect(isAleatoric(unknown<number>('underdetermined'))).toBe(false);
  });

  it('map transforms a known value and propagates an unknown UNCHANGED (reason + gap preserved)', () => {
    expect(map(known(3), (n) => n * 2)).toEqual({ known: true, value: 6 });
    const gap = structuredGap('temporal', 'temporal.unstated_now', 'underdetermined');
    const u: Uncertain<number> = unknown('underdetermined', gap);
    const mapped = map(u, (n) => n * 2);
    expect(mapped).toBe(u); // same unknown, not recomputed
  });

  it('flatMap chains and short-circuits on the first unknown', () => {
    const safeDiv = (n: number): Uncertain<number> => (n === 0 ? unknown('missing_precondition') : known(100 / n));
    expect(flatMap(known(4), safeDiv)).toEqual({ known: true, value: 25 });
    expect(flatMap(known(0), safeDiv).known).toBe(false);
    expect(flatMap(unknown<number>('cyclic_dependency'), safeDiv)).toEqual({ known: false, reason: 'cyclic_dependency' });
  });

  it('both is known only when BOTH are — a known cannot silently pair with an unknown', () => {
    expect(both(known('a'), known(2))).toEqual({ known: true, value: ['a', 2] });
    expect(both(known('a'), unknown<number>('underdetermined')).known).toBe(false);
    expect(both(unknown<string>('unprioritized_conflict'), known(2))).toEqual({
      known: false,
      reason: 'unprioritized_conflict',
    });
  });

  it('orElse is the safe unwrap — value when known, the explicit fallback when not', () => {
    expect(orElse(known(5), 0)).toBe(5);
    expect(orElse(unknown<number>('underdetermined'), 0)).toBe(0);
  });

  it('requireKnown returns the value or throws with the reason (the named, greppable escape hatch)', () => {
    expect(requireKnown(known(9))).toBe(9);
    expect(() => requireKnown(unknown<number>('missing_precondition'), 'demo')).toThrow(/unknown.*missing_precondition/);
  });

  it('fromResolution bridges the query world: resolved -> known, unresolvable -> unknown with reason/gap', () => {
    const resolved: MeaningResolution<boolean> = { query: 'occluded', status: 'resolved', answer: true };
    expect(fromResolution(resolved)).toEqual({ known: true, value: true });

    const gap = structuredGap('occlusion', 'occlusion.opacity_unstated', 'underdetermined', 'box');
    const abstained: MeaningResolution<boolean> = {
      query: 'occluded',
      status: 'unresolvable',
      reason: 'underdetermined',
      gap,
    };
    const e = fromResolution(abstained);
    expect(e.known).toBe(false);
    if (!e.known) {
      expect(e.reason).toBe('underdetermined');
      expect(e.gap?.code).toBe('occlusion.opacity_unstated');
    }
  });
});
