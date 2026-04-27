import { describe, it, expect } from 'vitest';
import { patternMatches } from '../pattern-match';

describe('patternMatches', () => {
  describe('wildcard patterns', () => {
    it.each(['_', 'else', 'default'] as const)('"%s" matches any string', (wildcard) => {
      expect(patternMatches(wildcard, 'hello')).toBe(true);
    });

    it.each(['_', 'else', 'default'] as const)('"%s" matches any number', (wildcard) => {
      expect(patternMatches(wildcard, 42)).toBe(true);
    });

    it.each(['_', 'else', 'default'] as const)('"%s" matches null/undefined', (wildcard) => {
      expect(patternMatches(wildcard, null)).toBe(true);
      expect(patternMatches(wildcard, undefined)).toBe(true);
    });

    it.each(['_', 'else', 'default'] as const)('"%s" matches boolean false', (wildcard) => {
      expect(patternMatches(wildcard, false)).toBe(true);
    });
  });

  describe('strict equality', () => {
    it('matches identical string values', () => {
      expect(patternMatches('hello', 'hello')).toBe(true);
    });

    it('does not match different strings', () => {
      expect(patternMatches('hello', 'world')).toBe(false);
    });

    it('matches identical numbers', () => {
      expect(patternMatches(42, 42)).toBe(true);
    });

    it('does not match different numbers', () => {
      expect(patternMatches(42, 43)).toBe(false);
    });

    it('matches true === true', () => {
      expect(patternMatches(true, true)).toBe(true);
    });

    it('does not match true vs false', () => {
      expect(patternMatches(true, false)).toBe(false);
    });

    it('matches null === null', () => {
      expect(patternMatches(null, null)).toBe(true);
    });
  });

  describe('type-name patterns', () => {
    it('"string" matches any string', () => {
      expect(patternMatches('string', 'hello')).toBe(true);
      expect(patternMatches('string', '')).toBe(true);
    });

    it('"string" does not match non-string', () => {
      expect(patternMatches('string', 42)).toBe(false);
      expect(patternMatches('string', true)).toBe(false);
    });

    it('"number" matches any number', () => {
      expect(patternMatches('number', 0)).toBe(true);
      expect(patternMatches('number', -3.14)).toBe(true);
    });

    it('"number" does not match non-number', () => {
      expect(patternMatches('number', '42')).toBe(false);
    });

    it('"boolean" matches true and false', () => {
      expect(patternMatches('boolean', true)).toBe(true);
      expect(patternMatches('boolean', false)).toBe(true);
    });

    it('"boolean" does not match 0 or 1', () => {
      expect(patternMatches('boolean', 0)).toBe(false);
      expect(patternMatches('boolean', 1)).toBe(false);
    });

    it('"array" matches arrays', () => {
      expect(patternMatches('array', [])).toBe(true);
      expect(patternMatches('array', [1, 2, 3])).toBe(true);
    });

    it('"array" does not match plain objects', () => {
      expect(patternMatches('array', {})).toBe(false);
    });

    it('"object" matches plain objects', () => {
      expect(patternMatches('object', {})).toBe(true);
      expect(patternMatches('object', { x: 1 })).toBe(true);
    });

    it('"object" does not match null', () => {
      // typeof null === 'object' but the TYPE_PATTERNS check excludes it
      expect(patternMatches('object', null)).toBe(false);
    });

    it('"object" matches arrays (arrays are objects)', () => {
      // Array.isArray is not checked in the "object" branch — arrays pass typeof check
      expect(patternMatches('object', [1, 2])).toBe(true);
    });
  });

  describe('range patterns', () => {
    it('matches a number within inclusive range [min, max]', () => {
      expect(patternMatches([0, 10], 5)).toBe(true);
      expect(patternMatches([0, 10], 0)).toBe(true);
      expect(patternMatches([0, 10], 10)).toBe(true);
    });

    it('does not match a number outside the range', () => {
      expect(patternMatches([0, 10], -1)).toBe(false);
      expect(patternMatches([0, 10], 11)).toBe(false);
    });

    it('does not match a string against a range', () => {
      expect(patternMatches([0, 10], '5')).toBe(false);
    });

    it('does not treat non-numeric range bounds as valid', () => {
      expect(patternMatches(['a', 'z'], 'b')).toBe(false);
    });
  });

  describe('no match fallback', () => {
    it('returns false for pattern with no rule match', () => {
      expect(patternMatches(42, 'hello')).toBe(false);
      expect(patternMatches({}, 'test')).toBe(false);
    });

    it('returns false for 3-element array pattern (not a range)', () => {
      expect(patternMatches([0, 5, 10], 5)).toBe(false);
    });
  });
});
