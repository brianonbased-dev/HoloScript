/**
 * Parser Utilities Production Tests — TypoDetector + ChunkDetector
 *
 * Tests Levenshtein distance computation, typo detection/correction,
 * and HoloScript source code chunk boundary detection.
 */

import { describe, it, expect } from 'vitest';
import { TypoDetector } from '../../parser/TypoDetector';
import { ChunkDetector } from '../../parser/ChunkDetector';

// ─── TypoDetector ────────────────────────────────────────────────────────

describe('TypoDetector — Production', () => {
  it('levenshteinDistance: identical strings = 0', () => {
    expect(TypoDetector.levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('levenshteinDistance: single substitution = 1', () => {
    expect(TypoDetector.levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('levenshteinDistance: insertion + deletion', () => {
    expect(TypoDetector.levenshteinDistance('abc', 'ab')).toBe(1); // deletion
    expect(TypoDetector.levenshteinDistance('ab', 'abc')).toBe(1); // insertion
  });

  it('levenshteinDistance: empty string', () => {
    expect(TypoDetector.levenshteinDistance('', 'abc')).toBe(3);
    expect(TypoDetector.levenshteinDistance('abc', '')).toBe(3);
  });

  it('findClosestMatch returns best match', () => {
    const candidates = ['position', 'rotation', 'scale', 'color'];
    expect(TypoDetector.findClosestMatch('positon', candidates)).toBe('position');
    expect(TypoDetector.findClosestMatch('rotatoin', candidates)).toBe('rotation');
  });

  it('findClosestMatch returns null when too distant', () => {
    const candidates = ['position', 'rotation'];
    expect(TypoDetector.findClosestMatch('xxxxxx', candidates)).toBeNull();
  });

  it('findAllMatches returns sorted by distance', () => {
    const candidates = ['ab', 'abc', 'abcd', 'xyz'];
    const matches = TypoDetector.findAllMatches('abc', candidates);
    expect(matches[0].distance).toBeLessThanOrEqual(matches[matches.length - 1].distance);
    expect(matches.some(m => m.match === 'abc')).toBe(true); // exact match
  });

  it('isLikelyTypo detects close strings', () => {
    expect(TypoDetector.isLikelyTypo('positon', 'position')).toBe(true);
    expect(TypoDetector.isLikelyTypo('xyz', 'position')).toBe(false);
  });

  it('isLikelyTypo is case insensitive', () => {
    expect(TypoDetector.isLikelyTypo('Position', 'position')).toBe(true);
  });
});

// ─── ChunkDetector ───────────────────────────────────────────────────────

describe('ChunkDetector — Production', () => {
  it('detects orb chunks', () => {
    const source = `orb Player {
  position: [0, 0, 0]
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('Player');
  });

  it('detects template chunks', () => {
    const source = `template "EnemyBase" {
  health: 100
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('template');
    expect(chunks[0].name).toBe('EnemyBase');
  });

  it('detects environment chunks', () => {
    const source = `environment {
  skybox: "sunset"
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('environment');
  });

  it('detects logic chunks', () => {
    const source = `logic {
  fn update() { }
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('logic');
  });

  it('detects multiple chunks', () => {
    const source = `orb A {
  color: "red"
}

orb B {
  color: "blue"
}

environment {
  fog: true
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(3);
    expect(chunks.map(c => c.type)).toEqual(['orb', 'orb', 'environment']);
  });

  it('detects single-line directives', () => {
    const source = `@version "3.0"`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('directive');
  });

  it('skips comments outside chunks', () => {
    const source = `// This is a comment
orb Player {
  // inside comment
  scale: [1, 1, 1]
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
  });

  it('tracks correct line numbers', () => {
    const source = `
orb A {
  x: 1
}

orb B {
  y: 2
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks[0].startLine).toBe(2);
    expect(chunks[0].endLine).toBe(4);
    expect(chunks[1].startLine).toBe(6);
    expect(chunks[1].endLine).toBe(8);
  });

  it('handles unclosed chunks gracefully', () => {
    const source = `orb Broken {
  missing_close: true`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].endLine).toBe(2);
  });
});
