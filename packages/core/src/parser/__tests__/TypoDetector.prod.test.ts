/**
 * TypoDetector — Production Test Suite
 *
 * Covers: Levenshtein distance algorithm, findClosestMatch,
 * findAllMatches, isLikelyTypo, case-insensitivity, edge cases.
 */
import { describe, it, expect } from 'vitest';
import { TypoDetector } from '../TypoDetector';

describe('TypoDetector — Production', () => {
  // ─── Levenshtein Distance ─────────────────────────────────────────
  it('identical strings → 0', () => {
    expect(TypoDetector.levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('empty vs non-empty → length', () => {
    expect(TypoDetector.levenshteinDistance('', 'abc')).toBe(3);
    expect(TypoDetector.levenshteinDistance('xyz', '')).toBe(3);
  });

  it('both empty → 0', () => {
    expect(TypoDetector.levenshteinDistance('', '')).toBe(0);
  });

  it('single substitution → 1', () => {
    expect(TypoDetector.levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('single insertion → 1', () => {
    expect(TypoDetector.levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('single deletion → 1', () => {
    expect(TypoDetector.levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('multiple edits', () => {
    expect(TypoDetector.levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('completely different → max length', () => {
    expect(TypoDetector.levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  // ─── findClosestMatch ─────────────────────────────────────────────
  it('finds exact match (distance 0)', () => {
    const result = TypoDetector.findClosestMatch('position', ['position', 'rotation', 'scale']);
    expect(result).toBe('position');
  });

  it('finds typo within threshold', () => {
    const result = TypoDetector.findClosestMatch('positon', ['position', 'rotation', 'scale']);
    expect(result).toBe('position');
  });

  it('returns null when no match within threshold', () => {
    const result = TypoDetector.findClosestMatch('xyz', ['position', 'rotation', 'scale']);
    expect(result).toBeNull();
  });

  it('respects custom maxDistance', () => {
    const result = TypoDetector.findClosestMatch('positon', ['position'], 0);
    expect(result).toBeNull(); // distance 1 > maxDistance 0
  });

  it('case-insensitive matching', () => {
    const result = TypoDetector.findClosestMatch('Position', ['position']);
    expect(result).toBe('position');
  });

  it('returns closest when multiple match', () => {
    // 'pos' → 'position' (dist ~5), but 'pop' → 'pos' (dist 1)
    const result = TypoDetector.findClosestMatch('pos', ['pop', 'pot', 'position'], 2);
    expect(result).not.toBeNull();
  });

  // ─── findAllMatches ───────────────────────────────────────────────
  it('returns all matches within threshold', () => {
    const results = TypoDetector.findAllMatches('cat', ['car', 'bat', 'cap', 'dog'], 1);
    expect(results.length).toBe(3); // car, bat, cap all distance 1
    expect(results[0].distance).toBe(1);
  });

  it('results are sorted by distance', () => {
    const results = TypoDetector.findAllMatches('cat', ['cat', 'bat', 'xyz'], 2);
    expect(results[0].distance).toBeLessThanOrEqual(results[results.length - 1].distance);
  });

  it('returns empty when no match', () => {
    const results = TypoDetector.findAllMatches('xyz', ['hello', 'world'], 1);
    expect(results).toEqual([]);
  });

  // ─── isLikelyTypo ─────────────────────────────────────────────────
  it('returns true for close match', () => {
    expect(TypoDetector.isLikelyTypo('positon', 'position')).toBe(true);
  });

  it('returns false for distant strings', () => {
    expect(TypoDetector.isLikelyTypo('abcdef', 'position')).toBe(false);
  });

  it('case-insensitive', () => {
    expect(TypoDetector.isLikelyTypo('POSITION', 'position')).toBe(true);
  });
});
