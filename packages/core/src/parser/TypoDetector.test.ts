/**
 * Tests for TypoDetector utility
 *
 * Covers:
 * - Levenshtein distance calculation
 * - Closest match finding
 * - Multiple match finding
 * - Likely typo detection
 * - Edge cases (empty strings, exact matches, no candidates)
 */

import { describe, it, expect } from 'vitest';
import { TypoDetector } from './TypoDetector';

describe('TypoDetector', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(TypoDetector.levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('returns string length for empty vs non-empty', () => {
      expect(TypoDetector.levenshteinDistance('', 'hello')).toBe(5);
      expect(TypoDetector.levenshteinDistance('hello', '')).toBe(5);
    });

    it('returns 0 for two empty strings', () => {
      expect(TypoDetector.levenshteinDistance('', '')).toBe(0);
    });

    it('calculates single substitution', () => {
      expect(TypoDetector.levenshteinDistance('cat', 'bat')).toBe(1);
    });

    it('calculates single insertion', () => {
      expect(TypoDetector.levenshteinDistance('cat', 'cats')).toBe(1);
    });

    it('calculates single deletion', () => {
      expect(TypoDetector.levenshteinDistance('cats', 'cat')).toBe(1);
    });

    it('calculates multiple edits', () => {
      expect(TypoDetector.levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('is symmetric', () => {
      expect(TypoDetector.levenshteinDistance('abc', 'xyz')).toBe(
        TypoDetector.levenshteinDistance('xyz', 'abc')
      );
    });
  });

  describe('findClosestMatch', () => {
    const keywords = ['composition', 'template', 'object', 'environment', 'state', 'logic', 'material', 'sensor'];

    it('finds exact match', () => {
      expect(TypoDetector.findClosestMatch('composition', keywords)).toBe('composition');
    });

    it('finds match with 1 typo', () => {
      expect(TypoDetector.findClosestMatch('compositon', keywords)).toBe('composition');
    });

    it('finds match with 2 typos', () => {
      expect(TypoDetector.findClosestMatch('compisiton', keywords)).toBe('composition');
    });

    it('returns null when no match within threshold', () => {
      expect(TypoDetector.findClosestMatch('xyzzy', keywords)).toBeNull();
    });

    it('returns null for empty candidates', () => {
      expect(TypoDetector.findClosestMatch('test', [])).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(TypoDetector.findClosestMatch('TEMPLATE', keywords)).toBe('template');
    });

    it('respects custom maxDistance', () => {
      // 'obj' is 3 edits from 'object' — should fail with default maxDistance=2
      expect(TypoDetector.findClosestMatch('obj', keywords, 2)).toBeNull();
      expect(TypoDetector.findClosestMatch('obj', keywords, 3)).toBe('object');
    });

    it('picks closest when multiple matches possible', () => {
      expect(TypoDetector.findClosestMatch('stat', ['state', 'static', 'start'])).toBe('state');
    });
  });

  describe('findAllMatches', () => {
    const keywords = ['state', 'stage', 'static', 'start', 'object'];

    it('finds all matches within threshold', () => {
      const matches = TypoDetector.findAllMatches('stat', keywords, 3);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(matches.map(m => m.match)).toContain('state');
      expect(matches.map(m => m.match)).toContain('start');
    });

    it('returns matches sorted by distance', () => {
      const matches = TypoDetector.findAllMatches('state', keywords);
      expect(matches[0].distance).toBeLessThanOrEqual(matches[matches.length - 1].distance);
    });

    it('returns empty array when no matches', () => {
      const matches = TypoDetector.findAllMatches('xyzzy', keywords);
      expect(matches).toEqual([]);
    });
  });

  describe('isLikelyTypo', () => {
    it('returns true for close matches', () => {
      expect(TypoDetector.isLikelyTypo('templete', 'template')).toBe(true);
    });

    it('returns false for distant strings', () => {
      expect(TypoDetector.isLikelyTypo('xyzzy', 'template')).toBe(false);
    });

    it('returns true for exact match', () => {
      expect(TypoDetector.isLikelyTypo('template', 'template')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(TypoDetector.isLikelyTypo('TEMPLATE', 'template')).toBe(true);
    });
  });
});
