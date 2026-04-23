/**
 * Unit tests for pattern-match — AUDIT-mode coverage
 *
 * Covers the pure module extracted in W1-T4 slice 11. The `@match`
 * expression dispatches case bodies based on this function's return
 * value; a bug here routes execution to the wrong branch silently.
 *
 * **See**: packages/core/src/runtime/pattern-match.ts (slice 11)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts
 */

import { describe, it, expect } from 'vitest';
import { patternMatches } from './pattern-match';

describe('patternMatches — wildcard patterns', () => {
  it.each([
    '_',
    'else',
    'default',
  ])('"%s" matches any value', (wildcard) => {
    expect(patternMatches(wildcard, 'anything')).toBe(true);
    expect(patternMatches(wildcard, 42)).toBe(true);
    expect(patternMatches(wildcard, null)).toBe(true);
    expect(patternMatches(wildcard, undefined)).toBe(true);
    expect(patternMatches(wildcard, { foo: 'bar' })).toBe(true);
    expect(patternMatches(wildcard, [1, 2, 3])).toBe(true);
  });

  it('wildcard strings are case-sensitive — "Else" is NOT a wildcard', () => {
    // 'Else' is not in the wildcard set; it becomes an equality check.
    expect(patternMatches('Else', 'anything')).toBe(false);
    expect(patternMatches('Else', 'Else')).toBe(true); // exact equality only
  });
});

describe('patternMatches — direct equality', () => {
  it('matches primitives by strict equality', () => {
    expect(patternMatches(5, 5)).toBe(true);
    expect(patternMatches('hello', 'hello')).toBe(true);
    expect(patternMatches(true, true)).toBe(true);
    expect(patternMatches(null, null)).toBe(true);
  });

  it('does not coerce for equality', () => {
    expect(patternMatches(5, '5')).toBe(false);
    expect(patternMatches(true, 1)).toBe(false);
    expect(patternMatches(null, undefined)).toBe(false);
  });

  it('objects match only by reference', () => {
    const obj = { a: 1 };
    expect(patternMatches(obj, obj)).toBe(true);
    expect(patternMatches({ a: 1 }, { a: 1 })).toBe(false);
  });
});

describe('patternMatches — type-name patterns', () => {
  it('"string" matches any string', () => {
    expect(patternMatches('string', 'hello')).toBe(true);
    expect(patternMatches('string', '')).toBe(true);
    expect(patternMatches('string', 42)).toBe(false);
  });

  it('"number" matches any number', () => {
    expect(patternMatches('number', 42)).toBe(true);
    expect(patternMatches('number', 0)).toBe(true);
    expect(patternMatches('number', -1.5)).toBe(true);
    expect(patternMatches('number', NaN)).toBe(true); // NaN is a number
    expect(patternMatches('number', '42')).toBe(false);
  });

  it('"boolean" matches only true/false', () => {
    expect(patternMatches('boolean', true)).toBe(true);
    expect(patternMatches('boolean', false)).toBe(true);
    expect(patternMatches('boolean', 1)).toBe(false);
    expect(patternMatches('boolean', 'true')).toBe(false);
  });

  it('"array" matches arrays but not array-like objects', () => {
    expect(patternMatches('array', [])).toBe(true);
    expect(patternMatches('array', [1, 2, 3])).toBe(true);
    expect(patternMatches('array', { 0: 'x', length: 1 })).toBe(false);
    expect(patternMatches('array', 'string')).toBe(false);
  });

  it('"object" matches plain objects AND arrays, but not null', () => {
    expect(patternMatches('object', { foo: 'bar' })).toBe(true);
    expect(patternMatches('object', {})).toBe(true);
    // Arrays are objects in JS — "object" pattern is broad
    expect(patternMatches('object', [1, 2, 3])).toBe(true);
    // null is NOT matched despite typeof null === 'object'
    expect(patternMatches('object', null)).toBe(false);
  });

  it('equality wins over type pattern when value equals the type-name string', () => {
    // pattern = "string", value = "string" → equality hits before type-name
    expect(patternMatches('string', 'string')).toBe(true);
  });
});

describe('patternMatches — range patterns', () => {
  it('[min, max] matches values inclusively within range', () => {
    expect(patternMatches([1, 10], 5)).toBe(true);
    expect(patternMatches([1, 10], 1)).toBe(true); // lower bound inclusive
    expect(patternMatches([1, 10], 10)).toBe(true); // upper bound inclusive
    expect(patternMatches([1, 10], 0)).toBe(false);
    expect(patternMatches([1, 10], 11)).toBe(false);
  });

  it('handles negative ranges', () => {
    expect(patternMatches([-5, 5], 0)).toBe(true);
    expect(patternMatches([-5, 5], -5)).toBe(true);
    expect(patternMatches([-5, -1], -3)).toBe(true);
    expect(patternMatches([-5, -1], 0)).toBe(false);
  });

  it('handles float ranges', () => {
    expect(patternMatches([0.5, 1.5], 1.0)).toBe(true);
    expect(patternMatches([0.5, 1.5], 0.4)).toBe(false);
  });

  it('degenerate range [n, n]', () => {
    expect(patternMatches([5, 5], 5)).toBe(true);
    expect(patternMatches([5, 5], 4)).toBe(false);
    expect(patternMatches([5, 5], 6)).toBe(false);
  });

  it('inverted range [max, min] rejects everything', () => {
    // If min > max, no value satisfies min ≤ v ≤ max
    expect(patternMatches([10, 1], 5)).toBe(false);
    expect(patternMatches([10, 1], 10)).toBe(false);
  });

  it('non-numeric tuple falls through to no-match', () => {
    expect(patternMatches(['a', 'z'], 'm')).toBe(false);
    expect(patternMatches([1, 10], 'hello')).toBe(false);
  });

  it('array of length ≠ 2 is NOT treated as a range', () => {
    // Single-element or triple-element arrays fall through the range branch
    expect(patternMatches([5], 5)).toBe(false);
    expect(patternMatches([1, 5, 10], 3)).toBe(false);
  });

  it('array equality (reference) still works for exact match', () => {
    const arr = [1, 10];
    // The same array reference would hit direct equality first
    expect(patternMatches(arr, arr)).toBe(true);
  });
});

describe('patternMatches — no-match fallthrough', () => {
  it('returns false when no pattern rule matches', () => {
    expect(patternMatches('unknown_type_name', 42)).toBe(false);
    expect(patternMatches({ not: 'matchable' }, 'anything')).toBe(false);
    expect(patternMatches(undefined, 'value')).toBe(false);
  });
});
