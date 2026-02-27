// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHoloDebugger } from '../useHoloDebugger';
import type { DebuggerResult } from '../useHoloDebugger';

// Mock useSceneStore
let mockCode = '';
vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn((selector) => {
    const store = {
      code: mockCode,
    };
    return selector ? selector(store) : store;
  }),
}));

describe('useHoloDebugger', () => {
  beforeEach(() => {
    mockCode = '';
  });

  describe('Initial State', () => {
    it('should return empty diagnostics for empty code', () => {
      mockCode = '';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toEqual([]);
      expect(result.current.errorCount).toBe(0);
      expect(result.current.warningCount).toBe(0);
      expect(result.current.infoCount).toBe(0);
      expect(result.current.lineCount).toBe(1);
    });

    it('should return zero counts for valid code', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {}\n}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.errorCount).toBe(0);
      expect(result.current.warningCount).toBe(0);
      expect(result.current.infoCount).toBe(0);
    });

    it('should count lines correctly', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {}\n}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.lineCount).toBe(3);
    });
  });

  describe('Syntax Analysis - Brace Matching', () => {
    it('should detect unclosed brace', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toHaveLength(1);
      expect(result.current.diagnostics[0]).toMatchObject({
        id: 'syn-unclosed',
        severity: 'error',
        line: 2, // Line of last opening brace
        message: expect.stringContaining('Unclosed brace'),
        source: 'syntax',
      });
      expect(result.current.errorCount).toBe(1);
    });

    it('should detect extra closing brace', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {}\n}\n}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toHaveLength(1);
      expect(result.current.diagnostics[0]).toMatchObject({
        id: 'syn-extra-brace',
        severity: 'error',
        message: 'Extra closing brace "}" with no matching opener',
        source: 'syntax',
      });
    });

    it('should not flag balanced braces', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {}\n  sphere "Ball" {}\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const syntaxDiags = result.current.diagnostics.filter((d) => d.source === 'syntax');
      expect(syntaxDiags).toHaveLength(0);
    });
  });

  describe('Syntax Analysis - Property Colons', () => {
    it('should warn about missing colon in property assignment', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    position value\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('nocolon'));
      expect(diag).toBeDefined();
      expect(diag).toMatchObject({
        severity: 'warning',
        line: 3,
        message: expect.stringContaining('"position" looks like a property assignment but is missing a colon'),
        source: 'syntax',
        quickFix: 'position: value',
      });
    });

    it('should warn about missing colon with quoted value', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    name "test"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('nocolon'));
      expect(diag).toBeDefined();
      expect(diag!.quickFix).toBe('name: "test"');
    });

    it('should not warn about properties with colons', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    position: [1, 2, 3]\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('nocolon'));
      expect(diag).toBeUndefined();
    });

    it('should not warn about property-like lines outside objects', () => {
      mockCode = 'position value';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toHaveLength(0);
    });

    it('should not warn about comments', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    // position value\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('nocolon'));
      expect(diag).toBeUndefined();
    });

    it('should detect multiple missing colons', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    position value1\n    scale value2\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diags = result.current.diagnostics.filter((d) => d.id.includes('nocolon'));
      expect(diags).toHaveLength(2);
    });
  });

  describe('Trait Analysis - Unknown Traits', () => {
    it('should warn about unknown trait', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @unknown {}\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-unknown'));
      expect(diag).toBeDefined();
      expect(diag).toMatchObject({
        severity: 'info',
        line: 3,
        message: 'Unknown trait @unknown',
        source: 'trait',
      });
    });

    it('should suggest similar known trait', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @phy {}\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-unknown'));
      expect(diag).toBeDefined();
      expect(diag!.message).toContain('did you mean @physics?');
      expect(diag!.quickFix).toBe('@physics');
      expect(diag!.severity).toBe('warning');
    });

    it('should recognize known traits', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics { type: "static" }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-unknown'));
      expect(diag).toBeUndefined();
    });
  });

  describe('Trait Analysis - Duplicate Traits', () => {
    it('should warn about duplicate trait in same object', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics { type: "static" }\n    @physics { type: "dynamic" }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-dup'));
      expect(diag).toBeDefined();
      expect(diag).toMatchObject({
        severity: 'warning',
        line: 4,
        message: expect.stringContaining('Duplicate @physics trait'),
        source: 'trait',
      });
    });

    it('should not warn about same trait in different objects', () => {
      mockCode = 'scene "Main" {\n  box "Cube1" {\n    @physics { type: "static" }\n  }\n  box "Cube2" {\n    @physics { type: "dynamic" }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-dup'));
      expect(diag).toBeUndefined();
    });
  });

  describe('Trait Analysis - Required Parameters', () => {
    it('should error on missing required physics type', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics {\n      mass: 10\n    }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-missing') && d.message.includes('type'));
      expect(diag).toBeDefined();
      expect(diag).toMatchObject({
        severity: 'error',
        message: '@physics is missing required param "type"',
        source: 'trait',
      });
    });

    it('should error on missing required light type', () => {
      mockCode = 'scene "Main" {\n  @light {\n    intensity: 1.0\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('@light is missing required param "type"'));
      expect(diag).toBeDefined();
    });

    it('should error on missing required audio src', () => {
      mockCode = 'scene "Main" {\n  @audio {\n    volume: 0.8\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('@audio is missing required param "src"'));
      expect(diag).toBeDefined();
    });

    it('should not error when required params are present', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics {\n      type: "static"\n    }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-missing'));
      expect(diag).toBeUndefined();
    });
  });

  describe('Trait Analysis - Invalid Enum Values', () => {
    it('should error on invalid physics type', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics {\n      type: "invalid"\n    }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-invalid'));
      expect(diag).toBeDefined();
      expect(diag).toMatchObject({
        severity: 'error',
        line: 4,
        message: 'Invalid value "invalid" for @physics.type — valid: "static", "dynamic", "kinematic"',
        source: 'trait',
      });
    });

    it('should error on invalid light type', () => {
      mockCode = 'scene "Main" {\n  @light {\n    type: "invalid"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('Invalid value "invalid" for @light.type'));
      expect(diag).toBeDefined();
      expect(diag!.message).toContain('"point", "spot", "directional", "area"');
    });

    it('should error on invalid particles type', () => {
      mockCode = 'scene "Main" {\n  @particles {\n    type: "invalid"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('Invalid value "invalid" for @particles.type'));
      expect(diag).toBeDefined();
    });

    it('should error on invalid AI goal', () => {
      mockCode = 'scene "Main" {\n  @ai {\n    goal: "invalid"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('Invalid value "invalid" for @ai.goal'));
      expect(diag).toBeDefined();
    });

    it('should error on invalid environment sky', () => {
      mockCode = 'scene "Main" {\n  @environment {\n    sky: "invalid"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('Invalid value "invalid" for @environment.sky'));
      expect(diag).toBeDefined();
      expect(diag!.message).toContain('"procedural", "hdri", "solid"');
    });

    it('should error on invalid environment fog', () => {
      mockCode = 'scene "Main" {\n  @environment {\n    fog: "invalid"\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.message.includes('Invalid value "invalid" for @environment.fog'));
      expect(diag).toBeDefined();
      expect(diag!.message).toContain('"none", "linear", "exponential"');
    });

    it('should accept valid enum values', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics {\n      type: "dynamic"\n    }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-invalid'));
      expect(diag).toBeUndefined();
    });

    it('should handle quoted enum values', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    @physics {\n      type: "static"\n    }\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const diag = result.current.diagnostics.find((d) => d.id.includes('trait-invalid'));
      expect(diag).toBeUndefined();
    });
  });

  describe('Diagnostic Sorting', () => {
    it('should sort diagnostics by line number', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    position [1, 2, 3]\n    @unknown {}\n    scale [2, 2, 2]\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      const lines = result.current.diagnostics.map((d) => d.line);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
    });

    it('should sort by severity within same line', () => {
      mockCode = 'scene "Main" { box "Cube" { }';
      const { result } = renderHook(() => useHoloDebugger());

      // If multiple diagnostics on same line, errors should come before warnings
      const sameLine = result.current.diagnostics.filter((d) => d.line === 1);
      if (sameLine.length > 1) {
        for (let i = 1; i < sameLine.length; i++) {
          const prev = sameLine[i - 1].severity;
          const curr = sameLine[i].severity;
          expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  describe('Count Aggregation', () => {
    it('should count errors correctly', () => {
      mockCode = 'scene "Main" {\n  @physics {}\n  @light {}\n';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.errorCount).toBeGreaterThan(0);
      expect(result.current.errorCount).toBe(
        result.current.diagnostics.filter((d) => d.severity === 'error').length
      );
    });

    it('should count warnings correctly', () => {
      mockCode = 'scene "Main" {\n  box "Cube" {\n    position value\n  }\n}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.warningCount).toBeGreaterThan(0);
      expect(result.current.warningCount).toBe(
        result.current.diagnostics.filter((d) => d.severity === 'warning').length
      );
    });

    it('should count info diagnostics correctly', () => {
      mockCode = 'scene "Main" {\n  @unknown {}\n}';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.infoCount).toBeGreaterThan(0);
      expect(result.current.infoCount).toBe(
        result.current.diagnostics.filter((d) => d.severity === 'info').length
      );
    });
  });

  describe('Complex Scenarios', () => {
    it('should detect multiple error types in same code', () => {
      mockCode = `scene "Main" {
  box "Cube" {
    position [1, 2, 3]
    @physics { type: "invalid" }
    @physics { type: "static" }
  }
`;
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics.length).toBeGreaterThan(2);
      expect(result.current.diagnostics.some((d) => d.id.includes('nocolon'))).toBe(true);
      expect(result.current.diagnostics.some((d) => d.id.includes('trait-invalid'))).toBe(true);
      expect(result.current.diagnostics.some((d) => d.id.includes('trait-dup'))).toBe(true);
    });

    it('should handle deeply nested objects', () => {
      mockCode = `scene "Main" {
  group "G1" {
    group "G2" {
      box "Cube" {
        @physics { type: "static" }
      }
    }
  }
}`;
      const { result } = renderHook(() => useHoloDebugger());

      // Should not report duplicate trait warnings across nesting
      const dupDiags = result.current.diagnostics.filter((d) => d.id.includes('trait-dup'));
      expect(dupDiags).toHaveLength(0);
    });

    it('should handle multiple scenes', () => {
      mockCode = `scene "Main" {
  box "Cube1" {}
}

scene "Other" {
  box "Cube2" {}
}`;
      const { result } = renderHook(() => useHoloDebugger());

      // Traits in different scenes should not conflict
      expect(result.current.errorCount).toBe(0);
    });
  });

  describe('useMemo Optimization', () => {
    it('should recompute when code changes', () => {
      mockCode = 'scene "Main" {}';
      const { result, rerender } = renderHook(() => useHoloDebugger());

      const firstDiagnostics = result.current.diagnostics;

      mockCode = 'scene "Main" { box "Cube" { }';
      rerender();

      expect(result.current.diagnostics).not.toBe(firstDiagnostics);
    });

    it('should return same reference when code unchanged', () => {
      mockCode = 'scene "Main" {}';
      const { result, rerender } = renderHook(() => useHoloDebugger());

      const firstResult = result.current;
      rerender();

      expect(result.current).toBe(firstResult);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty lines', () => {
      mockCode = '\n\n\nscene "Main" {}\n\n\n';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.lineCount).toBe(7);
      expect(result.current.errorCount).toBe(0);
    });

    it('should handle code with only comments', () => {
      mockCode = '// This is a comment\n// Another comment';
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toHaveLength(0);
    });

    it('should handle very long lines', () => {
      mockCode = `scene "Main" { box "Cube" { position: [${Array(1000).fill('1').join(', ')}] } }`;
      const { result } = renderHook(() => useHoloDebugger());

      expect(() => result.current.diagnostics).not.toThrow();
    });

    it('should handle special characters in code', () => {
      mockCode = 'scene "Main 特殊字符" { box "Cube" {} }';
      const { result } = renderHook(() => useHoloDebugger());

      expect(() => result.current.diagnostics).not.toThrow();
    });

    it('should handle null code', () => {
      mockCode = null as any;
      const { result } = renderHook(() => useHoloDebugger());

      expect(result.current.diagnostics).toEqual([]);
      expect(result.current.lineCount).toBe(1);
    });
  });
});
