/**
 * Sprint 3 Acceptance Tests
 *
 * Covers:
 * 1. Trait bounds/constraints (requires, conflicts, oneof, config file, suggestions)
 * 2. Better type inference (primitives, vec2/3/4, color, functions, bidirectional)
 * 3. Type aliases (simple, union, generic, recursive detection)
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { TypeAliasRegistry } from '../types/TypeAliasRegistry';
import { loadConstraintsFromConfig } from '../traits/constraintConfig';
import type { ASTNode } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrb(traits: string[], extraProps: Record<string, unknown> = {}): ASTNode {
  const traitsMap = new Map(traits.map((t) => [t, {}]));
  return {
    type: 'orb',
    name: 'TestOrb',
    traits: traitsMap,
    properties: new Map(Object.entries(extraProps)),
    line: 1,
    column: 1,
  } as unknown as ASTNode;
}

// ---------------------------------------------------------------------------
// 1. Trait Constraints
// ---------------------------------------------------------------------------

describe('Sprint 3 - Trait Constraints', () => {
  let checker: HoloScriptTypeChecker;

  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  describe('requires constraints enforced', () => {
    test('@grabbable requires @physics', () => {
      const orb = makeOrb(['grabbable']); // missing physics
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('physics'))).toBe(true);
    });

    test('no error when required trait is present', () => {
      const orb = makeOrb(['grabbable', 'physics', 'collidable']);
      const result = checker.check([orb]);
      const constraintErrors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.code === 'HSP014'
      );
      expect(constraintErrors).toHaveLength(0);
    });

    test('@throwable requires @grabbable (chained)', () => {
      const orb = makeOrb(['throwable', 'physics', 'collidable']); // missing grabbable
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.some((e) => e.message.includes('grabbable'))).toBe(true);
    });
  });

  describe('conflicts constraints enforced', () => {
    test('@static conflicts with @physics', () => {
      const orb = makeOrb(['static', 'physics']);
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some(
          (e) =>
            e.message.toLowerCase().includes('conflict') ||
            e.message.toLowerCase().includes('static')
        )
      ).toBe(true);
    });

    test('@static conflicts with @grabbable', () => {
      const orb = makeOrb(['static', 'grabbable']);
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.length).toBeGreaterThan(0);
    });

    test('no conflict when traits are compatible', () => {
      const orb = makeOrb(['physics', 'collidable', 'grabbable']);
      const result = checker.check([orb]);
      const constraintErrors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(constraintErrors).toHaveLength(0);
    });
  });

  describe('oneof groups enforced', () => {
    test('using two oneof traits triggers error', () => {
      // Find a oneof constraint and use two of its targets
      // Based on BUILTIN_CONSTRAINTS - vr_only and ar_only conflict via 'conflicts'
      // For oneof, we'd need a custom config constraint
      const orb = makeOrb(['grabbable', 'physics', 'collidable']);
      checker.loadConfig({
        traitConstraints: [
          {
            type: 'oneof',
            source: 'interaction',
            targets: ['grabbable', 'clickable', 'hoverable'],
            message: 'Only one interaction mode allowed.',
            suggestion: 'Remove either @grabbable or @clickable.',
          },
        ],
      });
      const orb2 = makeOrb(['grabbable', 'clickable']);
      const result = checker.check([orb2]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.some((e) => e.message.includes('Only one'))).toBe(true);
    });

    test('using one of the oneof traits is fine', () => {
      checker.loadConfig({
        traitConstraints: [
          {
            type: 'oneof',
            source: 'interaction',
            targets: ['grabbable', 'clickable', 'hoverable'],
          },
        ],
      });
      const orb = makeOrb(['grabbable', 'physics', 'collidable']); // satisfy builtin requires
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors).toHaveLength(0);
    });
  });

  describe('custom constraints from config file', () => {
    test('loadConstraintsFromConfig parses valid config', () => {
      const config = {
        traitConstraints: [
          {
            type: 'requires',
            source: 'myCustomTrait',
            targets: ['physics'],
            message: 'myCustomTrait needs physics.',
            suggestion: 'Add @physics to the orb.',
          },
        ],
      };
      const constraints = loadConstraintsFromConfig(config);
      expect(constraints).toHaveLength(1);
      expect(constraints[0].source).toBe('myCustomTrait');
      expect(constraints[0].suggestion).toBe('Add @physics to the orb.');
    });

    test('loadConstraintsFromConfig ignores invalid entries', () => {
      const config = {
        traitConstraints: [
          { type: 'requires', source: 'foo' }, // missing targets
          null,
          { type: 'unknown', source: 'bar', targets: ['baz'] }, // invalid type
          { type: 'conflicts', source: 'a', targets: ['b'], message: 'valid' },
        ],
      };
      const constraints = loadConstraintsFromConfig(config as unknown as object);
      expect(constraints).toHaveLength(1);
      expect(constraints[0].source).toBe('a');
    });

    test('checker.loadConfig merges custom constraints', () => {
      checker.loadConfig({
        traitConstraints: [{ type: 'requires', source: 'fancy', targets: ['collidable'] }],
      });
      const orb = makeOrb(['fancy']); // missing collidable
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.some((e) => e.message.includes('collidable'))).toBe(true);
    });
  });

  describe('error messages include fix suggestions', () => {
    test('requires violation includes suggestion', () => {
      const orb = makeOrb(['grabbable']); // needs physics
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.length).toBeGreaterThan(0);
      const hassuggestion = errors.some((e) => e.suggestions && e.suggestions.length > 0);
      expect(hassuggestion).toBe(true);
    });

    test('conflicts violation includes suggestion', () => {
      const orb = makeOrb(['static', 'physics']);
      const result = checker.check([orb]);
      const errors = result.diagnostics.filter((d) => d.code === 'HSP014');
      expect(errors.length).toBeGreaterThan(0);
      const hasSuggestion = errors.some((e) => e.suggestions && e.suggestions.length > 0);
      expect(hasSuggestion).toBe(true);
    });

    test('custom suggestion from config appears in diagnostic', () => {
      checker.loadConfig({
        traitConstraints: [
          {
            type: 'requires',
            source: 'cloth',
            targets: ['mesh'],
            message: 'cloth requires mesh.',
            suggestion: 'Add @mesh to the same orb as @cloth.',
          },
        ],
      });
      const orb = makeOrb(['cloth']); // missing mesh
      const result = checker.check([orb]);
      const error = result.diagnostics.find(
        (d) => d.code === 'HSP014' && d.suggestions?.some((s) => s.includes('@mesh'))
      );
      expect(error).toBeDefined();
      expect(error!.suggestions![0]).toContain('@mesh');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Type Inference
// ---------------------------------------------------------------------------

describe('Sprint 3 - Type Inference', () => {
  let checker: HoloScriptTypeChecker;

  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  describe('primitive literals inferred correctly', () => {
    test('number literal → number', () => {
      expect(checker.inferType(42).type).toBe('number');
      expect(checker.inferType(-3.14).type).toBe('number');
      expect(checker.inferType(0).type).toBe('number');
    });

    test('string literal → string', () => {
      expect(checker.inferType('hello').type).toBe('string');
      expect(checker.inferType('').type).toBe('string');
    });

    test('boolean → boolean', () => {
      expect(checker.inferType(true).type).toBe('boolean');
      expect(checker.inferType(false).type).toBe('boolean');
    });

    test('null/undefined → any (nullable)', () => {
      const t = checker.inferType(null);
      expect(t.nullable).toBe(true);
    });
  });

  describe('array literals inferred (vec2, vec3, vec4)', () => {
    test('[x, y] → vec2', () => {
      expect(checker.inferType([1, 2]).type).toBe('vec2');
    });

    test('[x, y, z] → vec3', () => {
      expect(checker.inferType([0, 1, -2]).type).toBe('vec3');
    });

    test('[x, y, z, w] → vec4', () => {
      expect(checker.inferType([0, 0, 0, 1]).type).toBe('vec4');
    });

    test('[a, b, c, d, e] → array (5 numbers is not vec)', () => {
      expect(checker.inferType([1, 2, 3, 4, 5]).type).toBe('array');
    });

    test('mixed array → array', () => {
      expect(checker.inferType(['a', 'b', 'c']).type).toBe('array');
    });
  });

  describe('color inference from strings', () => {
    test('hex string → color', () => {
      expect(checker.inferType('#ff0000').type).toBe('color');
      expect(checker.inferType('#fff').type).toBe('color');
    });

    test('rgb() string → color', () => {
      expect(checker.inferType('rgb(255, 0, 0)').type).toBe('color');
      expect(checker.inferType('rgba(0,0,0,0.5)').type).toBe('color');
    });

    test('non-color string → string', () => {
      expect(checker.inferType('hello world').type).toBe('string');
      expect(checker.inferType('blue').type).toBe('string'); // named colors not inferred as color
    });
  });

  describe('function type inference', () => {
    test('JS function object → function type', () => {
      const fn = () => {};
      const t = checker.inferType(fn as unknown as import('../types').HoloScriptValue);
      expect(t.type).toBe('function');
    });

    test('arrow function string → function type', () => {
      const t = checker.inferType('() => {}');
      expect(t.type).toBe('function');
    });

    test('arrow function with number return → function returning number', () => {
      const t = checker.inferType('() => 42');
      expect(t.type).toBe('function');
      expect(t.returnType).toBe('number');
    });

    test('arrow function with string return → function returning string', () => {
      const t = checker.inferType('() => "hello"');
      expect(t.type).toBe('function');
      expect(t.returnType).toBe('string');
    });

    test('parameterized arrow function → function type', () => {
      const t = checker.inferType('(x) => x + 1');
      expect(t.type).toBe('function');
    });
  });

  describe('bidirectional inference from context', () => {
    test('number array in euler context → euler', () => {
      const t = checker.inferTypeWithContext([0, 45, 0], { type: 'euler' });
      expect(t.type).toBe('euler');
    });

    test('number array in quat context → quat', () => {
      const t = checker.inferTypeWithContext([0, 0, 0, 1], { type: 'quat' });
      expect(t.type).toBe('quat');
    });

    test('string in color context → color', () => {
      const t = checker.inferTypeWithContext('blue', { type: 'color' });
      expect(t.type).toBe('color');
    });

    test('3-element array in vec3 context → vec3', () => {
      const t = checker.inferTypeWithContext([1, 2, 3], { type: 'vec3' });
      expect(t.type).toBe('vec3');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Type Aliases
// ---------------------------------------------------------------------------

describe('Sprint 3 - Type Aliases', () => {
  let registry: TypeAliasRegistry;

  beforeEach(() => {
    registry = new TypeAliasRegistry();
  });

  describe('simple type aliases work', () => {
    test('parse and resolve simple alias', () => {
      const decl = TypeAliasRegistry.parse('type Position = [number, number, number]');
      expect(decl).not.toBeNull();
      expect(decl!.name).toBe('Position');
      expect(decl!.kind).toBe('simple');
      registry.register(decl!);
      expect(registry.has('Position')).toBe(true);
      const resolved = registry.resolve('Position');
      expect(resolved).toContain('number');
    });

    test('parse extracts name, kind, and definition', () => {
      const decl = TypeAliasRegistry.parse('type Handler = () => void');
      expect(decl!.name).toBe('Handler');
      expect(decl!.definition).toBe('() => void');
      expect(decl!.kind).toBe('simple');
    });

    test('resolve returns null for unknown alias', () => {
      expect(registry.resolve('Unknown')).toBeNull();
    });
  });

  describe('union type aliases work', () => {
    test('union alias detected as kind: union', () => {
      const decl = TypeAliasRegistry.parse('type State = "idle" | "loading" | "error"');
      expect(decl!.kind).toBe('union');
      expect(decl!.definition).toBe('"idle" | "loading" | "error"');
    });

    test('resolve union alias returns definition', () => {
      const decl = TypeAliasRegistry.parse('type Color = string | number[]')!;
      registry.register(decl);
      const resolved = registry.resolve('Color');
      expect(resolved).toContain('string');
      expect(resolved).toContain('number');
    });
  });

  describe('generic type aliases work', () => {
    test('parse generic alias with type params', () => {
      const decl = TypeAliasRegistry.parse('type List<T> = T[]');
      expect(decl!.name).toBe('List');
      expect(decl!.kind).toBe('generic');
      expect(decl!.typeParams).toEqual(['T']);
    });

    test('resolve generic alias with type argument', () => {
      const decl = TypeAliasRegistry.parse('type Optional<T> = T | null')!;
      registry.register(decl);
      const resolved = registry.resolve('Optional', ['string']);
      expect(resolved).toContain('string');
      expect(resolved).toContain('null');
    });

    test('multi-param generic alias', () => {
      const decl = TypeAliasRegistry.parse('type Pair<A, B> = [A, B]')!;
      registry.register(decl);
      const resolved = registry.resolve('Pair', ['string', 'number']);
      expect(resolved).toContain('string');
      expect(resolved).toContain('number');
    });

    test('unresolved type param falls back to any', () => {
      const decl = TypeAliasRegistry.parse('type Box<T> = { value: T }')!;
      registry.register(decl);
      const resolved = registry.resolve('Box', []); // no args
      expect(resolved).toContain('any');
    });
  });

  describe('recursive types detected and error', () => {
    test('self-referential alias detected as recursive', () => {
      const decl = TypeAliasRegistry.parse('type Tree = { left: Tree | null }')!;
      registry.register(decl);
      expect(registry.isRecursive('Tree')).toBe(true);
    });

    test('non-recursive alias is not flagged', () => {
      const decl = TypeAliasRegistry.parse('type Color = string | number[]')!;
      registry.register(decl);
      expect(registry.isRecursive('Color')).toBe(false);
    });

    test('checker.registerTypeAlias reports error for recursive type', () => {
      const checker = new HoloScriptTypeChecker();
      // First register the alias so isRecursive check works
      checker.typeAliasRegistry.register({
        name: 'Cycle',
        kind: 'simple',
        definition: 'Cycle | null',
      });
      // Now try to register it via the checker (which checks recursion)
      checker.registerTypeAlias({
        name: 'Cycle',
        kind: 'simple',
        definition: 'Cycle | null',
      });
      // The checker should have recorded a diagnostic
      const result = checker.check([]);
      expect(result.diagnostics.some((d) => d.code === 'HSP020')).toBe(true);
    });

    test('resolve returns null for recursive alias (cycle guard)', () => {
      const decl = TypeAliasRegistry.parse('type Loop = Loop[]')!;
      registry.register(decl);
      // Should not infinite-loop; returns null
      const resolved = registry.resolve('Loop');
      expect(resolved).toBeNull();
    });
  });

  describe('TypeAliasRegistry.parse edge cases', () => {
    test('returns null for non-type declarations', () => {
      expect(TypeAliasRegistry.parse('orb "Foo" {}')).toBeNull();
      expect(TypeAliasRegistry.parse('// comment')).toBeNull();
      expect(TypeAliasRegistry.parse('')).toBeNull();
    });

    test('type with lowercase name is rejected (must start uppercase)', () => {
      const decl = TypeAliasRegistry.parse('type color = string');
      expect(decl).toBeNull();
    });

    test('captures line number when provided', () => {
      const decl = TypeAliasRegistry.parse('type Foo = string', 42);
      expect(decl!.line).toBe(42);
    });
  });
});
