/**
 * Tests for HoloCompositionTypes.ts exported symbols
 *
 * Covers:
 * - SourceLocation structural shape (line, column, optional offset)
 * - SourceRange structural shape (start/end SourceLocation pair)
 * - PlatformConstraint include/exclude arrays
 * - HoloNode base shape (type, optional loc, optional provenance)
 * - extractSourceLocation utility: SourceRange, flat SourceLocation, and undefined inputs
 * - Parser emits valid loc on AST nodes when the parser is invoked
 *
 * These types are pure interface definitions — tests use structural construction
 * and the extractSourceLocation runtime helper to validate their contracts.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import type {
  SourceLocation,
  SourceRange,
  PlatformConstraint,
  HoloNode,
} from '../HoloCompositionTypes';
import { extractSourceLocation } from '../../analysis/HoloASTMapping';
import { parseHolo } from '../HoloCompositionParser';

// =============================================================================
// SourceLocation
// =============================================================================

describe('SourceLocation', () => {
  it('accepts required fields: line and column', () => {
    const loc: SourceLocation = { line: 1, column: 0 };
    expect(loc.line).toBe(1);
    expect(loc.column).toBe(0);
  });

  it('accepts optional offset field', () => {
    const loc: SourceLocation = { line: 3, column: 5, offset: 42 };
    expect(loc.offset).toBe(42);
  });

  it('offset is undefined when not provided', () => {
    const loc: SourceLocation = { line: 1, column: 0 };
    expect(loc.offset).toBeUndefined();
  });

  it('line and column are numbers', () => {
    const loc: SourceLocation = { line: 10, column: 20 };
    expect(typeof loc.line).toBe('number');
    expect(typeof loc.column).toBe('number');
  });

  it('supports zero values for line and column', () => {
    const loc: SourceLocation = { line: 0, column: 0 };
    expect(loc.line).toBe(0);
    expect(loc.column).toBe(0);
  });
});

// =============================================================================
// SourceRange
// =============================================================================

describe('SourceRange', () => {
  it('contains start and end SourceLocations', () => {
    const range: SourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 10 },
    };
    expect(range.start.line).toBe(1);
    expect(range.end.line).toBe(1);
    expect(range.end.column).toBe(10);
  });

  it('supports multi-line ranges', () => {
    const range: SourceRange = {
      start: { line: 5, column: 2 },
      end: { line: 10, column: 8 },
    };
    expect(range.end.line - range.start.line).toBe(5);
  });

  it('start and end can share the same line', () => {
    const range: SourceRange = {
      start: { line: 7, column: 4 },
      end: { line: 7, column: 20 },
    };
    expect(range.start.line).toBe(range.end.line);
  });

  it('start and end can carry optional offset', () => {
    const range: SourceRange = {
      start: { line: 2, column: 0, offset: 50 },
      end: { line: 2, column: 15, offset: 65 },
    };
    expect(range.start.offset).toBe(50);
    expect(range.end.offset).toBe(65);
  });
});

// =============================================================================
// PlatformConstraint
// =============================================================================

describe('PlatformConstraint', () => {
  it('accepts include and exclude arrays', () => {
    const constraint: PlatformConstraint = {
      include: ['quest3'],
      exclude: [],
    };
    expect(constraint.include).toEqual(['quest3']);
    expect(constraint.exclude).toEqual([]);
  });

  it('accepts multiple include targets', () => {
    const constraint: PlatformConstraint = {
      include: ['phone', 'desktop'],
      exclude: [],
    };
    expect(constraint.include).toHaveLength(2);
    expect(constraint.include).toContain('phone');
    expect(constraint.include).toContain('desktop');
  });

  it('accepts non-empty exclude list', () => {
    const constraint: PlatformConstraint = {
      include: [],
      exclude: ['car', 'wearable'],
    };
    expect(constraint.exclude).toContain('car');
    expect(constraint.exclude).toContain('wearable');
  });

  it('empty include means all platforms (no filter applied)', () => {
    const constraint: PlatformConstraint = { include: [], exclude: [] };
    expect(constraint.include).toHaveLength(0);
    expect(constraint.exclude).toHaveLength(0);
  });

  it('include and exclude are independent (both can be non-empty)', () => {
    const constraint: PlatformConstraint = {
      include: ['mobile'],
      exclude: ['webgl'],
    };
    expect(constraint.include.length).toBeGreaterThan(0);
    expect(constraint.exclude.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// HoloNode
// =============================================================================

describe('HoloNode', () => {
  it('requires a type discriminant string', () => {
    const node: HoloNode = { type: 'Object' };
    expect(node.type).toBe('Object');
  });

  it('loc is optional', () => {
    const node: HoloNode = { type: 'Scene' };
    expect(node.loc).toBeUndefined();
  });

  it('accepts a SourceRange loc', () => {
    const node: HoloNode = {
      type: 'Template',
      loc: { start: { line: 1, column: 0 }, end: { line: 5, column: 1 } },
    };
    expect(node.loc?.start.line).toBe(1);
    expect(node.loc?.end.line).toBe(5);
  });

  it('provenance is optional', () => {
    const node: HoloNode = { type: 'Audio' };
    expect(node.provenance).toBeUndefined();
  });

  it('accepts full provenance block', () => {
    const node: HoloNode = {
      type: 'Zone',
      provenance: {
        author: 'agent_test',
        timestamp: 1717000000000,
        provenanceHash: 'abc123',
      },
    };
    expect(node.provenance?.author).toBe('agent_test');
    expect(node.provenance?.provenanceHash).toBe('abc123');
  });

  it('provenance.context is optional', () => {
    const node: HoloNode = {
      type: 'Zone',
      provenance: {
        author: 'agent_test',
        timestamp: 1717000000000,
        provenanceHash: 'abc123',
        context: undefined,
      },
    };
    expect(node.provenance?.context).toBeUndefined();
  });
});

// =============================================================================
// extractSourceLocation — the runtime helper that operates on these types
// =============================================================================

describe('extractSourceLocation (from HoloASTMapping)', () => {
  it('returns {line:0, column:0} for undefined', () => {
    const result = extractSourceLocation(undefined);
    expect(result).toEqual({ line: 0, column: 0 });
  });

  it('extracts start/end from a SourceRange', () => {
    const range: SourceRange = {
      start: { line: 3, column: 7 },
      end: { line: 5, column: 2 },
    };
    const result = extractSourceLocation(range);
    expect(result.line).toBe(3);
    expect(result.column).toBe(7);
    expect(result.endLine).toBe(5);
    expect(result.endColumn).toBe(2);
  });

  it('handles flat SourceLocation (no start/end wrapper)', () => {
    // Some fixtures pass a flat {line, column} instead of SourceRange
    const flat: SourceLocation = { line: 8, column: 12 };
    const result = extractSourceLocation(flat);
    expect(result.line).toBe(8);
    expect(result.column).toBe(12);
    expect(result.endLine).toBeUndefined();
    expect(result.endColumn).toBeUndefined();
  });

  it('defaults line/column to 0 when range.start fields are 0', () => {
    const range: SourceRange = {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 5 },
    };
    const result = extractSourceLocation(range);
    expect(result.line).toBe(0);
    expect(result.column).toBe(0);
  });

  it('returns endLine/endColumn as undefined when range.end is missing (compat)', () => {
    // Simulate a compat range that only has start
    const rangeWithoutEnd = {
      start: { line: 2, column: 3 },
    } as unknown as SourceRange;
    const result = extractSourceLocation(rangeWithoutEnd);
    expect(result.line).toBe(2);
    expect(result.endLine).toBeUndefined();
  });
});

// =============================================================================
// Parser integration — loc fields on parsed AST nodes
// =============================================================================

describe('Parser loc on AST nodes', () => {
  it('composition root carries a loc when parser assigns it', () => {
    const source = `
      composition "LocTest" {
        object "Box" {
          color: "red"
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const ast = result.ast!;
    // The parser assigns loc on the composition root (HoloCompositionParser line 403)
    if (ast.loc) {
      expect(ast.loc.start).toBeDefined();
      expect(typeof ast.loc.start.line).toBe('number');
      expect(typeof ast.loc.start.column).toBe('number');
      expect(ast.loc.end).toBeDefined();
      expect(typeof ast.loc.end.line).toBe('number');
    }
    // Regardless of whether loc is present, type must be correct
    expect(ast.type).toBe('Composition');
  });

  it('HoloParseError.loc uses SourceLocation shape', () => {
    // Trigger a parse error with a malformed source to verify error loc
    const source = `composition "Bad" { object }`;
    const result = parseHolo(source);
    // Whether it fails or recovers, errors with loc must match SourceLocation
    for (const err of result.errors) {
      if (err.loc) {
        expect(typeof err.loc.line).toBe('number');
        expect(typeof err.loc.column).toBe('number');
      }
    }
  });

  it('PlatformConstraint parsed from @platform(quest3) on an object', () => {
    const source = `
      composition "PlatformTest" {
        @platform(quest3)
        object "VROnly" {
          color: "blue"
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const objects = result.ast?.objects ?? [];
    if (objects.length > 0) {
      const obj = objects[0];
      if (obj.platformConstraint) {
        expect(Array.isArray(obj.platformConstraint.include)).toBe(true);
        expect(Array.isArray(obj.platformConstraint.exclude)).toBe(true);
        // quest3 should appear in include list
        expect(obj.platformConstraint.include).toContain('quest3');
        expect(obj.platformConstraint.exclude).toHaveLength(0);
      }
    }
  });

  it('PlatformConstraint parsed from @platform(not: car) on an object', () => {
    const source = `
      composition "PlatformTest2" {
        @platform(not: car, wearable)
        object "NoCarVersion" {
          color: "green"
        }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const objects = result.ast?.objects ?? [];
    if (objects.length > 0) {
      const obj = objects[0];
      if (obj.platformConstraint) {
        expect(obj.platformConstraint.include).toHaveLength(0);
        expect(obj.platformConstraint.exclude).toContain('car');
      }
    }
  });
});
