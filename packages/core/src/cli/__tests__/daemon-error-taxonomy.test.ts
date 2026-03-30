/**
 * Tests for daemon-error-taxonomy.ts (G.ARCH.002)
 *
 * Validates TypeScript error code → semantic category mapping,
 * symbol extraction, line parsing, and pattern aggregation.
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeError,
  extractSymbol,
  parseTscErrorLine,
  parseTscOutput,
  aggregatePatterns,
  type SemanticError,
} from '@holoscript/absorb-service/daemon';

describe('categorizeError', () => {
  it('maps TS2304 to missing_symbol', () => {
    expect(categorizeError('TS2304')).toBe('missing_symbol');
  });

  it('maps TS2345 to type_mismatch', () => {
    expect(categorizeError('TS2345')).toBe('type_mismatch');
  });

  it('maps TS2307 to import_resolution', () => {
    expect(categorizeError('TS2307')).toBe('import_resolution');
  });

  it('maps TS2322 to incompatible_types', () => {
    expect(categorizeError('TS2322')).toBe('incompatible_types');
  });

  it('maps TS2339 to missing_property', () => {
    expect(categorizeError('TS2339')).toBe('missing_property');
  });

  it('maps TS2741 to missing_member', () => {
    expect(categorizeError('TS2741')).toBe('missing_member');
  });

  it('maps TS2554 to wrong_arity', () => {
    expect(categorizeError('TS2554')).toBe('wrong_arity');
  });

  it('maps TS18047 to null_safety', () => {
    expect(categorizeError('TS18047')).toBe('null_safety');
  });

  it('maps TS2515 to abstract_incomplete', () => {
    expect(categorizeError('TS2515')).toBe('abstract_incomplete');
  });

  it('maps unknown code to unknown', () => {
    expect(categorizeError('TS9999')).toBe('unknown');
    expect(categorizeError('TS1234')).toBe('unknown');
  });
});

describe('extractSymbol', () => {
  it('extracts from "Cannot find name" message', () => {
    expect(extractSymbol("Cannot find name 'Foo'.")).toBe('Foo');
  });

  it('extracts from "Property does not exist" message', () => {
    expect(extractSymbol("Property 'bar' does not exist on type 'Baz'.")).toBe('bar');
  });

  it('extracts from "Type is not assignable" message', () => {
    expect(extractSymbol("Type 'string' is not assignable to type 'number'.")).toBe('string');
  });

  it('extracts from "no exported member" message', () => {
    expect(extractSymbol("Module '\"./types\"' has no exported member 'Widget'.")).toBe('Widget');
  });

  it('extracts from "Cannot find module" message', () => {
    expect(extractSymbol("Cannot find module './missing-file'.")).toBe('./missing-file');
  });

  it('returns undefined for unrecognized messages', () => {
    expect(extractSymbol('Some random error text')).toBeUndefined();
  });
});

describe('parseTscErrorLine', () => {
  it('parses a standard tsc error line', () => {
    const line =
      "packages/core/src/compiler/IOSCompiler.ts(42,10): error TS2304: Cannot find name 'CompilerBase'.";
    const result = parseTscErrorLine(line);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('TS2304');
    expect(result!.category).toBe('missing_symbol');
    expect(result!.symbol).toBe('CompilerBase');
    expect(result!.file).toBe('packages/core/src/compiler/IOSCompiler.ts');
    expect(result!.line).toBe(42);
  });

  it('parses Windows-style paths', () => {
    const line =
      "packages\\core\\src\\traits\\StateTrait.ts(15,3): error TS2339: Property 'value' does not exist on type 'StateNode'.";
    const result = parseTscErrorLine(line);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('packages/core/src/traits/StateTrait.ts');
    expect(result!.category).toBe('missing_property');
    expect(result!.symbol).toBe('value');
  });

  it('returns null for non-error lines', () => {
    expect(parseTscErrorLine('')).toBeNull();
    expect(parseTscErrorLine('Found 42 errors.')).toBeNull();
    expect(parseTscErrorLine('  npm warn something')).toBeNull();
  });
});

describe('parseTscOutput', () => {
  it('parses multiple error lines from combined output', () => {
    const output = [
      'npm warn something',
      "src/a.ts(1,1): error TS2304: Cannot find name 'X'.",
      '',
      "src/b.ts(5,3): error TS2339: Property 'y' does not exist on type 'Z'.",
      'Found 2 errors.',
    ].join('\n');

    const errors = parseTscOutput(output);
    expect(errors).toHaveLength(2);
    expect(errors[0].code).toBe('TS2304');
    expect(errors[1].code).toBe('TS2339');
  });

  it('returns empty array for clean output', () => {
    expect(parseTscOutput('')).toHaveLength(0);
    expect(parseTscOutput('Found 0 errors.\n')).toHaveLength(0);
  });
});

describe('aggregatePatterns', () => {
  it('groups errors by category and sorts by count', () => {
    const errors: SemanticError[] = [
      {
        code: 'TS2304',
        category: 'missing_symbol',
        symbol: 'A',
        file: 'a.ts',
        line: 1,
        message: 'Cannot find name A',
      },
      {
        code: 'TS2304',
        category: 'missing_symbol',
        symbol: 'B',
        file: 'b.ts',
        line: 2,
        message: 'Cannot find name B',
      },
      {
        code: 'TS2304',
        category: 'missing_symbol',
        symbol: 'A',
        file: 'a.ts',
        line: 3,
        message: 'Cannot find name A',
      },
      {
        code: 'TS2339',
        category: 'missing_property',
        symbol: 'x',
        file: 'c.ts',
        line: 1,
        message: "Property 'x' does not exist",
      },
    ];

    const patterns = aggregatePatterns(errors);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].category).toBe('missing_symbol');
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].files).toContain('a.ts');
    expect(patterns[0].files).toContain('b.ts');
    expect(patterns[0].symbols).toContain('A');
    expect(patterns[0].symbols).toContain('B');

    expect(patterns[1].category).toBe('missing_property');
    expect(patterns[1].count).toBe(1);
  });

  it('returns empty array for no errors', () => {
    expect(aggregatePatterns([])).toHaveLength(0);
  });

  it('deduplicates files and symbols', () => {
    const errors: SemanticError[] = [
      {
        code: 'TS2304',
        category: 'missing_symbol',
        symbol: 'X',
        file: 'same.ts',
        line: 1,
        message: 'm1',
      },
      {
        code: 'TS2304',
        category: 'missing_symbol',
        symbol: 'X',
        file: 'same.ts',
        line: 2,
        message: 'm2',
      },
    ];

    const patterns = aggregatePatterns(errors);
    expect(patterns[0].count).toBe(2);
    expect(patterns[0].files).toHaveLength(1);
    expect(patterns[0].symbols).toHaveLength(1);
  });
});
