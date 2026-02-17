import { describe, it, expect } from 'vitest';
import { TypoDetector } from '../TypoDetector';

describe('TypoDetector', () => {
  const candidates = ['object', 'light', 'camera', 'environment', 'composition', 'spatial_group'];

  // ===========================================================================
  // Levenshtein Distance
  // ===========================================================================
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(TypoDetector.levenshteinDistance('abc', 'abc')).toBe(0);
    });

    it('returns correct distance for single substitution', () => {
      expect(TypoDetector.levenshteinDistance('cat', 'bat')).toBe(1);
    });

    it('returns correct distance for insertion', () => {
      expect(TypoDetector.levenshteinDistance('abc', 'abcd')).toBe(1);
    });

    it('returns correct distance for deletion', () => {
      expect(TypoDetector.levenshteinDistance('abcd', 'abc')).toBe(1);
    });

    it('handles empty strings', () => {
      expect(TypoDetector.levenshteinDistance('', 'abc')).toBe(3);
      expect(TypoDetector.levenshteinDistance('abc', '')).toBe(3);
      expect(TypoDetector.levenshteinDistance('', '')).toBe(0);
    });

    it('correctly handles completely different strings', () => {
      expect(TypoDetector.levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('handles longer strings', () => {
      const dist = TypoDetector.levenshteinDistance('kitten', 'sitting');
      expect(dist).toBe(3);
    });
  });

  // ===========================================================================
  // findClosestMatch
  // ===========================================================================
  describe('findClosestMatch', () => {
    it('finds exact match (distance 0)', () => {
      expect(TypoDetector.findClosestMatch('object', candidates)).toBe('object');
    });

    it('finds close typo', () => {
      expect(TypoDetector.findClosestMatch('objct', candidates)).toBe('object');
    });

    it('finds another close typo', () => {
      expect(TypoDetector.findClosestMatch('ligth', candidates)).toBe('light');
    });

    it('returns null when no match within threshold', () => {
      expect(TypoDetector.findClosestMatch('zzzzzzz', candidates)).toBeNull();
    });

    it('returns null for empty candidates', () => {
      expect(TypoDetector.findClosestMatch('test', [])).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(TypoDetector.findClosestMatch('OBJECT', candidates)).toBe('object');
    });

    it('respects custom maxDistance', () => {
      // 'ob' → 'object' = distance 4, default maxDistance=2 → null
      expect(TypoDetector.findClosestMatch('ob', candidates, 2)).toBeNull();
      expect(TypoDetector.findClosestMatch('ob', candidates, 5)).toBe('object');
    });
  });

  // ===========================================================================
  // findAllMatches
  // ===========================================================================
  describe('findAllMatches', () => {
    it('returns all matches within threshold', () => {
      const result = TypoDetector.findAllMatches('ligh', candidates);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].match).toBe('light');
    });

    it('returns sorted by distance', () => {
      const result = TypoDetector.findAllMatches('light', candidates, 5);
      // light itself has distance 0
      expect(result[0].distance).toBe(0);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance);
      }
    });

    it('returns empty when nothing matches', () => {
      expect(TypoDetector.findAllMatches('xyzxyzxyz', candidates, 1)).toEqual([]);
    });
  });

  // ===========================================================================
  // isLikelyTypo
  // ===========================================================================
  describe('isLikelyTypo', () => {
    it('returns true for close match', () => {
      expect(TypoDetector.isLikelyTypo('objct', 'object')).toBe(true);
    });

    it('returns true for exact match', () => {
      expect(TypoDetector.isLikelyTypo('object', 'object')).toBe(true);
    });

    it('returns false for distant match', () => {
      expect(TypoDetector.isLikelyTypo('xyz', 'object')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(TypoDetector.isLikelyTypo('OBJECT', 'object')).toBe(true);
    });
  });
});
