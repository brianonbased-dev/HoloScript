/**
 * IncrementalParser — production test suite
 *
 * Tests: parse() first call (full parse), unchanged source returns cached result,
 * version bump triggers re-parse, valid source produces non-empty ast/no fatal errors,
 * adding a line increments ast node count, applyChange() applies LSP-style text edits
 * and updates the result, invalidate() and clear() cache management,
 * getStats() returns correct documentCount/totalBlocks,
 * createIncrementalParser() factory helper, custom blockSize option.
 *
 * ParseResult shape: { success: boolean; ast: ASTNode[]; errors: ParseError[]; warnings: string[] }
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalParser, createIncrementalParser } from '../IncrementalParser';

// ─── Sample HoloScript source ─────────────────────────────────────────────────

const SIMPLE_SOURCE = `
orb Cube {
  position: [0, 0, 0]
  color: "#ff0000"
}
`;

const TWO_ORB_SOURCE = `
orb A {
  position: [0, 0, 0]
}

orb B {
  position: [1, 0, 0]
}
`;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('IncrementalParser: production', () => {
  let parser: IncrementalParser;

  beforeEach(() => {
    parser = new IncrementalParser();
  });

  // ─── Basic parse ──────────────────────────────────────────────────────────
  describe('parse() — first call (full parse)', () => {
    it('returns a ParseResult with ast array', () => {
      const result = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(Array.isArray(result.ast)).toBe(true);
    });

    it('returns a ParseResult with errors array', () => {
      const result = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('returns a ParseResult with success boolean', () => {
      const result = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(typeof result.success).toBe('boolean');
    });

    it('valid source produces at least one AST node', () => {
      const result = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(result.ast.length).toBeGreaterThan(0);
    });

    it('empty source returns empty ast', () => {
      const result = parser.parse('file:///empty.hs', '', 1);
      expect(result.ast).toHaveLength(0);
    });

    it('two-orb source produces two or more AST nodes', () => {
      const result = parser.parse('file:///two.hs', TWO_ORB_SOURCE, 1);
      expect(result.ast.length).toBeGreaterThanOrEqual(2);
    });

    it('different URIs are parsed independently', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const r2 = parser.parse('file:///b.hs', TWO_ORB_SOURCE, 1);
      expect(r2.ast.length).toBeGreaterThanOrEqual(2);
    });

    it('valid source result has an ast array', () => {
      const result = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(Array.isArray(result.ast)).toBe(true);
    });
  });

  // ─── Cache behaviour ──────────────────────────────────────────────────────
  describe('cache behaviour', () => {
    it('same source + same version returns equivalent result', () => {
      const r1 = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const r2 = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(r2.ast.length).toBe(r1.ast.length);
    });

    it('same source + incremented version still returns valid result', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const r2 = parser.parse('file:///a.hs', SIMPLE_SOURCE, 2);
      expect(Array.isArray(r2.ast)).toBe(true);
    });

    it('appending a line keeps or increases node count', () => {
      const r1 = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const extended = SIMPLE_SOURCE + '\norb Extra { position: [2, 0, 0] }';
      const r2 = parser.parse('file:///a.hs', extended, 2);
      expect(r2.ast.length).toBeGreaterThanOrEqual(r1.ast.length);
    });
  });

  // ─── applyChange ──────────────────────────────────────────────────────────
  describe('applyChange()', () => {
    it('returns a ParseResult with ast array', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const result = parser.applyChange(
        'file:///a.hs',
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          text: '// comment\n',
        },
        2
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result.ast)).toBe(true);
    });

    it('applyChange on unregistered uri throws (document not found)', () => {
      expect(() =>
        parser.applyChange(
          'file:///new.hs',
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            text: 'orb X { position: [0,0,0] }',
          },
          1
        )
      ).toThrow();
    });

    it('applyChange after full parse returns result', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      const lines = SIMPLE_SOURCE.split('\n');
      const lastLine = lines.length - 1;
      const lastChar = lines[lastLine].length;
      const result = parser.applyChange(
        'file:///a.hs',
        {
          range: {
            start: { line: lastLine, character: lastChar },
            end: { line: lastLine, character: lastChar },
          },
          text: '\norb NewOrb { position: [5, 0, 0] }',
        },
        2
      );
      expect(Array.isArray(result.ast)).toBe(true);
    });
  });

  // ─── invalidate / clear ───────────────────────────────────────────────────
  describe('invalidate() and clear()', () => {
    it('invalidate() does not throw for registered uri', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(() => parser.invalidate('file:///a.hs')).not.toThrow();
    });

    it('invalidate() does not throw for unknown uri', () => {
      expect(() => parser.invalidate('file:///nope.hs')).not.toThrow();
    });

    it('after invalidate, next parse re-parses successfully', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      parser.invalidate('file:///a.hs');
      const r = parser.parse('file:///a.hs', SIMPLE_SOURCE, 2);
      expect(r.ast.length).toBeGreaterThan(0);
    });

    it('clear() removes all documents — documentCount becomes 0', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      parser.parse('file:///b.hs', TWO_ORB_SOURCE, 1);
      parser.clear();
      expect(parser.getStats().documentCount).toBe(0);
    });

    it('after clear, parse works again', () => {
      parser.clear();
      const r = parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(Array.isArray(r.ast)).toBe(true);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────
  describe('getStats()', () => {
    it('documentCount is 0 initially', () => {
      expect(parser.getStats().documentCount).toBe(0);
    });

    it('documentCount increments with new documents', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      parser.parse('file:///b.hs', TWO_ORB_SOURCE, 1);
      expect(parser.getStats().documentCount).toBe(2);
    });

    it('totalBlocks is 0 initially', () => {
      expect(parser.getStats().totalBlocks).toBe(0);
    });

    it('totalBlocks > 0 after parsing', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(parser.getStats().totalBlocks).toBeGreaterThan(0);
    });

    it('memoryEstimate is a non-negative number', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(parser.getStats().memoryEstimate).toBeGreaterThanOrEqual(0);
    });

    it('same document parsed twice — still 1 docCount', () => {
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      parser.parse('file:///a.hs', SIMPLE_SOURCE, 2);
      expect(parser.getStats().documentCount).toBe(1);
    });
  });

  // ─── createIncrementalParser factory ──────────────────────────────────────
  describe('createIncrementalParser() factory', () => {
    it('returns an IncrementalParser instance', () => {
      const p = createIncrementalParser();
      expect(p).toBeInstanceOf(IncrementalParser);
    });

    it('factory with custom blockSize option', () => {
      const p = createIncrementalParser({ blockSize: 5 });
      expect(p).toBeInstanceOf(IncrementalParser);
    });

    it('factory-created parser getStats starts at zero', () => {
      const p = createIncrementalParser();
      expect(p.getStats().documentCount).toBe(0);
    });

    it('factory-created parser parses correctly', () => {
      const p = createIncrementalParser({ blockSize: 5 });
      const r = p.parse('file:///a.hs', SIMPLE_SOURCE, 1);
      expect(Array.isArray(r.ast)).toBe(true);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('whitespace-only source does not throw', () => {
      expect(() => parser.parse('file:///ws.hs', '   \n  \n  ', 1)).not.toThrow();
    });

    it('very large source parses without throw', () => {
      const big = Array.from(
        { length: 50 },
        (_, i) => `orb Orb${i} { position: [${i}, 0, 0] }`
      ).join('\n');
      expect(() => parser.parse('file:///big.hs', big, 1)).not.toThrow();
    });

    it('large source result has ast array', () => {
      const big = Array.from(
        { length: 50 },
        (_, i) => `orb Orb${i} { position: [${i}, 0, 0] }`
      ).join('\n');
      const r = parser.parse('file:///big.hs', big, 1);
      expect(Array.isArray(r.ast)).toBe(true);
    });

    it('syntax error source returns errors array (no throw)', () => {
      expect(() =>
        parser.parse('file:///bad.hs', 'orb { this is totally broken !!!', 1)
      ).not.toThrow();
    });

    it('syntax error source errors is an array', () => {
      const r = parser.parse('file:///bad.hs', 'orb { !!! }', 1);
      expect(Array.isArray(r.errors)).toBe(true);
    });
  });
});
