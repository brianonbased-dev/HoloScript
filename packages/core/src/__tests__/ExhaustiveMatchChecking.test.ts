/**
 * Exhaustive Match Checking Tests
 *
 * Tests for Sprint 4 Priority 1: Exhaustive match checking
 * Validates that match expressions properly cover all union type cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { HoloScriptTypeChecker, createTypeChecker } from '../HoloScriptTypeChecker';
import { ExhaustivenessChecker } from '../types/AdvancedTypeSystem';
import type { MatchExpression, MatchCase } from '../types';

describe('Exhaustive Match Checking', () => {
  let parser: HoloScriptPlusParser;
  let typeChecker: HoloScriptTypeChecker;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
    typeChecker = createTypeChecker();
  });

  describe('Parser - Match Expression Parsing', () => {
    it('should parse a basic match expression', () => {
      const code = `
composition "status_display" {
  render: match state {
    "idle" => show_placeholder()
    "loading" => show_spinner()
    "success" => show_content()
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      // The orb is either the root or in children
      const orb = result.ast.root || result.ast.children?.[0];
      expect(orb).toBeDefined();
      expect(orb.properties?.render).toBeDefined();
      expect(orb.properties?.render?.type).toBe('match');
    });

    it('should parse match with wildcard (_) pattern', () => {
      const code = `
composition "handler" {
  output: match value {
    "known" => handle_known()
    _ => handle_default()
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const orb = result.ast.root || result.ast.children?.[0];
      const matchExpr = orb.properties?.output;
      expect(matchExpr.hasWildcard).toBe(true);
    });

    it('should parse match with number literal patterns', () => {
      const code = `
composition "counter" {
  display: match count {
    0 => "none"
    1 => "single"
    _ => "multiple"
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const orb = result.ast.root || result.ast.children?.[0];
      const matchExpr = orb.properties?.display;
      expect(matchExpr.cases).toHaveLength(3);
      expect(matchExpr.cases[0].pattern.value).toBe(0);
      expect(matchExpr.cases[1].pattern.value).toBe(1);
    });

    it('should parse match with boolean literal patterns', () => {
      const code = `
composition "toggle" {
  label: match isEnabled {
    true => "Enabled"
    false => "Disabled"
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const orb = result.ast.root || result.ast.children?.[0];
      const matchExpr = orb.properties?.label;
      expect(matchExpr.cases).toHaveLength(2);
      expect(matchExpr.cases[0].pattern.value).toBe(true);
      expect(matchExpr.cases[1].pattern.value).toBe(false);
    });

    it('should parse match with binding pattern', () => {
      const code = `
composition "processor" {
  result: match input {
    "special" => handle_special()
    x => process(x)
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);

      const orb = result.ast.root || result.ast.children?.[0];
      const matchExpr = orb.properties?.result;
      expect(matchExpr.cases[1].pattern.type).toBe('binding-pattern');
      expect(matchExpr.cases[1].pattern.name).toBe('x');
    });

    it('should parse match with block body', () => {
      const code = `
composition "complex" {
  result: match state {
    "start" => {
      init()
      prepare()
      "ready"
    }
    _ => "default"
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    it('should preserve source location information', () => {
      const code = `composition "test" {
  x: match state {
    "a" => 1
  }
}`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
      const orb = result.ast.root || result.ast.children?.[0];
      const matchExpr = orb.properties?.x;
      expect(matchExpr.sourceLocation).toBeDefined();
      expect(matchExpr.sourceLocation.line).toBeGreaterThan(0);
    });
  });

  describe('ExhaustivenessChecker', () => {
    let checker: ExhaustivenessChecker;

    beforeEach(() => {
      checker = new ExhaustivenessChecker();
    });

    it('should detect exhaustive match with all cases covered', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: 'idle' },
          { kind: 'literal' as const, value: 'loading' },
          { kind: 'literal' as const, value: 'success' },
        ],
      };

      const result = checker.checkMatch(unionType, ['idle', 'loading', 'success']);
      expect(result.isExhaustive).toBe(true);
      expect(result.uncoveredCases).toHaveLength(0);
    });

    it('should detect non-exhaustive match with missing cases', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: 'idle' },
          { kind: 'literal' as const, value: 'loading' },
          { kind: 'literal' as const, value: 'success' },
          { kind: 'literal' as const, value: 'error' },
        ],
      };

      const result = checker.checkMatch(unionType, ['idle', 'loading', 'success']);
      expect(result.isExhaustive).toBe(false);
      expect(result.uncoveredCases).toContain('error');
    });

    it('should treat wildcard as covering all remaining cases', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: 'a' },
          { kind: 'literal' as const, value: 'b' },
          { kind: 'literal' as const, value: 'c' },
        ],
      };

      const result = checker.checkMatch(unionType, ['a', '_']);
      expect(result.isExhaustive).toBe(true);
    });

    it('should handle number literal unions', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: 0 },
          { kind: 'literal' as const, value: 1 },
          { kind: 'literal' as const, value: 2 },
        ],
      };

      const result = checker.checkMatch(unionType, ['0', '1']);
      expect(result.isExhaustive).toBe(false);
      expect(result.uncoveredCases).toContain('2');
    });

    it('should handle boolean unions', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: true },
          { kind: 'literal' as const, value: false },
        ],
      };

      const result = checker.checkMatch(unionType, ['true']);
      expect(result.isExhaustive).toBe(false);
      expect(result.uncoveredCases).toContain('false');
    });

    it('should be case-insensitive for string comparisons', () => {
      const unionType = {
        kind: 'union' as const,
        members: [
          { kind: 'literal' as const, value: 'IDLE' },
          { kind: 'literal' as const, value: 'LOADING' },
        ],
      };

      const result = checker.checkMatch(unionType, ['idle', 'loading']);
      expect(result.isExhaustive).toBe(true);
    });
  });

  describe('Type Checker - Match Expression Validation', () => {
    it('should detect non-exhaustive match with registered union type', () => {
      // Register a union type
      typeChecker.registerUnionType('state', ['idle', 'loading', 'success', 'error']);

      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'state' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'idle' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'loading' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'success' },
            body: [],
          },
          // Missing 'error' case!
        ] as MatchCase[],
      };

      const result = typeChecker.check([matchNode as any]);

      const errorDiagnostics = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errorDiagnostics.some((d) => d.message.includes('Non-exhaustive'))).toBe(true);
      expect(errorDiagnostics.some((d) => d.message.includes('error'))).toBe(true);
    });

    it('should pass exhaustive match with all cases', () => {
      typeChecker.registerUnionType('state', ['idle', 'loading', 'success']);

      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'state' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'idle' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'loading' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'success' },
            body: [],
          },
        ] as MatchCase[],
      };

      const result = typeChecker.check([matchNode as any]);

      const errorDiagnostics = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('Non-exhaustive')
      );
      expect(errorDiagnostics).toHaveLength(0);
    });

    it('should pass with wildcard even if cases are missing', () => {
      typeChecker.registerUnionType('state', ['idle', 'loading', 'success', 'error']);

      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'state' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'idle' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'wildcard-pattern', symbol: '_' },
            body: [],
          },
        ] as MatchCase[],
        hasWildcard: true,
      };

      const result = typeChecker.check([matchNode as any]);

      const exhaustivenessErrors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('Non-exhaustive')
      );
      expect(exhaustivenessErrors).toHaveLength(0);
    });

    it('should warn about unreachable patterns after wildcard', () => {
      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'value' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'a' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'wildcard-pattern', symbol: '_' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'b' },
            body: [],
          },
        ] as MatchCase[],
        hasWildcard: true,
      };

      const result = typeChecker.check([matchNode as any]);

      const unreachableWarnings = result.diagnostics.filter(
        (d) => d.severity === 'warning' && d.message.includes('Unreachable')
      );
      expect(unreachableWarnings.length).toBeGreaterThan(0);
    });

    it('should warn about duplicate patterns', () => {
      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'value' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'a' },
            body: [],
          },
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'a' },
            body: [],
          },
        ] as MatchCase[],
      };

      const result = typeChecker.check([matchNode as any]);

      const duplicateWarnings = result.diagnostics.filter(
        (d) => d.severity === 'warning' && d.message.includes('Duplicate')
      );
      expect(duplicateWarnings.length).toBeGreaterThan(0);
    });

    it('should error when match has no cases', () => {
      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'value' } as any,
        cases: [],
      };

      const result = typeChecker.check([matchNode as any]);

      const errors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('no cases')
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should error when match has no subject', () => {
      const matchNode: MatchExpression = {
        type: 'match',
        subject: null as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'a' },
            body: [],
          },
        ] as MatchCase[],
      };

      const result = typeChecker.check([matchNode as any]);

      const errors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('missing subject')
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should provide suggestions for missing cases', () => {
      typeChecker.registerUnionType('state', ['a', 'b', 'c']);

      const matchNode: MatchExpression = {
        type: 'match',
        subject: { __ref: 'state' } as any,
        cases: [
          {
            type: 'match-case',
            pattern: { type: 'literal-pattern', value: 'a' },
            body: [],
          },
        ] as MatchCase[],
      };

      const result = typeChecker.check([matchNode as any]);

      const errorWithSuggestions = result.diagnostics.find(
        (d) => d.severity === 'error' && d.suggestions && d.suggestions.length > 0
      );
      expect(errorWithSuggestions).toBeDefined();
      expect(errorWithSuggestions?.suggestions?.some((s) => s.includes('Add case'))).toBe(true);
    });
  });

  describe('Union Type Registration', () => {
    it('should register and retrieve union types', () => {
      typeChecker.registerUnionType('Status', ['pending', 'active', 'completed']);

      const unionType = typeChecker.getUnionType('Status');
      expect(unionType).toBeDefined();
      expect(unionType?.members).toHaveLength(3);
    });

    it('should support number members in union types', () => {
      typeChecker.registerUnionType('Priority', [1, 2, 3, 4, 5]);

      const unionType = typeChecker.getUnionType('Priority');
      expect(unionType).toBeDefined();
      expect(unionType?.members.map((m: any) => m.value)).toContain(3);
    });

    it('should support boolean members in union types', () => {
      typeChecker.registerUnionType('Toggle', [true, false]);

      const unionType = typeChecker.getUnionType('Toggle');
      expect(unionType).toBeDefined();
      expect(unionType?.members).toHaveLength(2);
    });

    it('should clear union types on reset', () => {
      typeChecker.registerUnionType('Test', ['a', 'b']);
      expect(typeChecker.getUnionType('Test')).toBeDefined();

      typeChecker.reset();
      expect(typeChecker.getUnionType('Test')).toBeUndefined();
    });

    it('should list all registered union types', () => {
      typeChecker.registerUnionType('A', ['a1', 'a2']);
      typeChecker.registerUnionType('B', ['b1', 'b2', 'b3']);

      const allTypes = typeChecker.getAllUnionTypes();
      expect(allTypes.size).toBe(2);
      expect(allTypes.has('A')).toBe(true);
      expect(allTypes.has('B')).toBe(true);
    });
  });

  describe('Integration - Parser + Type Checker', () => {
    it('should parse and validate a complete match expression', () => {
      const code = `
composition "status_display" {
  state: "idle"

  render: match state {
    "idle" => show_placeholder()
    "loading" => show_spinner()
    "success" => show_content()
    "error" => show_error()
  }
}`;
      const parseResult = parser.parse(code);
      expect(parseResult.success).toBe(true);

      // Register the union type for state
      typeChecker.registerUnionType('state', ['idle', 'loading', 'success', 'error']);

      // Get the match expression from the parsed result
      const orb = parseResult.ast.root || parseResult.ast.children?.[0];
      const matchExpr = orb?.properties?.render;

      if (matchExpr && matchExpr.type === 'match') {
        const checkResult = typeChecker.check([matchExpr]);
        const exhaustivenessErrors = checkResult.diagnostics.filter(
          (d) => d.severity === 'error' && d.message.includes('Non-exhaustive')
        );
        expect(exhaustivenessErrors).toHaveLength(0);
      }
    });

    it('should detect missing case in parsed match expression', () => {
      const code = `
composition "status_display" {
  state: "idle"

  render: match state {
    "idle" => show_placeholder()
    "loading" => show_spinner()
    "success" => show_content()
  }
}`;
      const parseResult = parser.parse(code);
      expect(parseResult.success).toBe(true);

      // Register the union type with 4 members but match only has 3
      typeChecker.registerUnionType('state', ['idle', 'loading', 'success', 'error']);

      const orb = parseResult.ast.root || parseResult.ast.children?.[0];
      const matchExpr = orb?.properties?.render;

      if (matchExpr && matchExpr.type === 'match') {
        const checkResult = typeChecker.check([matchExpr]);
        const exhaustivenessErrors = checkResult.diagnostics.filter(
          (d) => d.severity === 'error' && d.message.includes('Non-exhaustive')
        );
        expect(exhaustivenessErrors.length).toBeGreaterThan(0);
        expect(exhaustivenessErrors[0].message).toContain('error');
      }
    });
  });
});
