/**
 * AdvancedTypeSystem Tests
 *
 * Tests for TypeInferenceEngine, ExhaustivenessChecker, and AdvancedTypeChecker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TypeInferenceEngine,
  ExhaustivenessChecker,
  AdvancedTypeChecker,
  HoloScriptType,
  PrimitiveType,
  ArrayType,
  UnionType,
  IntersectionType,
  GenericType,
  LiteralType,
  CustomType,
} from '../AdvancedTypeSystem';

// ============================================================================
// TypeInferenceEngine Tests
// ============================================================================

describe('TypeInferenceEngine', () => {
  let engine: TypeInferenceEngine;

  beforeEach(() => {
    engine = new TypeInferenceEngine();
  });

  describe('inferType()', () => {
    it('should infer number type', () => {
      const result = engine.inferType(42);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('number');
    });

    it('should infer string type', () => {
      const result = engine.inferType('hello');
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('string');
    });

    it('should infer boolean type', () => {
      const result = engine.inferType(true);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('boolean');
    });

    it('should infer boolean false', () => {
      const result = engine.inferType(false);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('boolean');
    });

    it('should infer array type with elements', () => {
      const result = engine.inferType([1, 2, 3]);
      expect(result.kind).toBe('array');
      expect((result as ArrayType).elementType.kind).toBe('primitive');
      expect(((result as ArrayType).elementType as PrimitiveType).name).toBe('number');
    });

    it('should infer empty array as void[]', () => {
      const result = engine.inferType([]);
      expect(result.kind).toBe('array');
      expect(((result as ArrayType).elementType as PrimitiveType).name).toBe('void');
    });

    it('should infer string array', () => {
      const result = engine.inferType(['a', 'b', 'c']);
      expect(result.kind).toBe('array');
      expect(((result as ArrayType).elementType as PrimitiveType).name).toBe('string');
    });

    it('should infer void for null', () => {
      const result = engine.inferType(null);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('void');
    });

    it('should infer void for undefined', () => {
      const result = engine.inferType(undefined);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('void');
    });

    it('should infer void for objects', () => {
      const result = engine.inferType({ foo: 'bar' });
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('void');
    });
  });

  describe('isAssignableTo()', () => {
    it('should return true for same primitive types', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      expect(engine.isAssignableTo(num, num)).toBe(true);
    });

    it('should return false for different primitive types', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const str: PrimitiveType = { kind: 'primitive', name: 'string' };
      expect(engine.isAssignableTo(num, str)).toBe(false);
    });

    it('should allow assignment to union type', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'primitive', name: 'number' },
          { kind: 'primitive', name: 'string' },
        ],
      };
      expect(engine.isAssignableTo(num, union)).toBe(true);
    });

    it('should reject type not in union', () => {
      const bool: PrimitiveType = { kind: 'primitive', name: 'boolean' };
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'primitive', name: 'number' },
          { kind: 'primitive', name: 'string' },
        ],
      };
      expect(engine.isAssignableTo(bool, union)).toBe(false);
    });

    it('should allow intersection member to target', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const intersection: IntersectionType = {
        kind: 'intersection',
        members: [{ kind: 'primitive', name: 'number' }],
      };
      expect(engine.isAssignableTo(intersection, num)).toBe(true);
    });

    it('should check array covariance', () => {
      const numArray: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'number' },
      };
      const numArray2: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'number' },
      };
      expect(engine.isAssignableTo(numArray, numArray2)).toBe(true);
    });

    it('should reject incompatible array types', () => {
      const numArray: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'number' },
      };
      const strArray: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'string' },
      };
      expect(engine.isAssignableTo(numArray, strArray)).toBe(false);
    });
  });

  describe('unify()', () => {
    it('should unify type variable with concrete type', () => {
      const typeVar: CustomType = {
        kind: 'custom',
        name: 'T',
        properties: new Map(),
        methods: new Map(),
      };
      const concrete: PrimitiveType = { kind: 'primitive', name: 'number' };

      const subs = engine.unify(typeVar, concrete);
      expect(subs.get('T')).toEqual(concrete);
    });

    it('should unify arrays by element type', () => {
      const typeVar: CustomType = {
        kind: 'custom',
        name: 'T',
        properties: new Map(),
        methods: new Map(),
      };
      const arr1: ArrayType = { kind: 'array', elementType: typeVar };
      const arr2: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'string' },
      };

      const subs = engine.unify(arr1, arr2);
      expect(subs.get('T')).toEqual({ kind: 'primitive', name: 'string' });
    });

    it('should unify generics with same name', () => {
      const generic1: GenericType = {
        kind: 'generic',
        name: 'Container',
        typeArgs: [{ kind: 'custom', name: 'T', properties: new Map(), methods: new Map() }],
      };
      const generic2: GenericType = {
        kind: 'generic',
        name: 'Container',
        typeArgs: [{ kind: 'primitive', name: 'number' }],
      };

      const subs = engine.unify(generic1, generic2);
      expect(subs.get('T')).toEqual({ kind: 'primitive', name: 'number' });
    });

    it('should return empty map for incompatible types', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const str: PrimitiveType = { kind: 'primitive', name: 'string' };

      const subs = engine.unify(num, str);
      expect(subs.size).toBe(0);
    });
  });

  describe('resolveGeneric()', () => {
    it('should resolve generic with concrete types', () => {
      const typeVar: CustomType = {
        kind: 'custom',
        name: 'T',
        properties: new Map(),
        methods: new Map(),
      };
      const generic: GenericType = {
        kind: 'generic',
        name: 'Container',
        typeArgs: [typeVar],
      };
      const concrete: PrimitiveType = { kind: 'primitive', name: 'number' };

      const result = engine.resolveGeneric(generic, [concrete]);
      expect(result.kind).toBe('generic');
    });
  });
});

// ============================================================================
// ExhaustivenessChecker Tests
// ============================================================================

describe('ExhaustivenessChecker', () => {
  let checker: ExhaustivenessChecker;

  beforeEach(() => {
    checker = new ExhaustivenessChecker();
  });

  describe('checkMatch()', () => {
    it('should detect exhaustive match', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'idle' },
          { kind: 'literal', value: 'moving' },
          { kind: 'literal', value: 'jumping' },
        ],
      };

      const result = checker.checkMatch(union, ['idle', 'moving', 'jumping']);
      expect(result.isExhaustive).toBe(true);
      expect(result.uncoveredCases).toHaveLength(0);
    });

    it('should detect non-exhaustive match', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'idle' },
          { kind: 'literal', value: 'moving' },
          { kind: 'literal', value: 'jumping' },
        ],
      };

      const result = checker.checkMatch(union, ['idle', 'moving']);
      expect(result.isExhaustive).toBe(false);
      expect(result.uncoveredCases).toContain('jumping');
    });

    it('should treat wildcard _ as exhaustive', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'idle' },
          { kind: 'literal', value: 'moving' },
        ],
      };

      const result = checker.checkMatch(union, ['idle', '_']);
      expect(result.isExhaustive).toBe(true);
    });

    it('should be case insensitive', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'IDLE' },
          { kind: 'literal', value: 'Moving' },
        ],
      };

      const result = checker.checkMatch(union, ['idle', 'moving']);
      expect(result.isExhaustive).toBe(true);
    });

    it('should handle custom types', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'custom', name: 'Player', properties: new Map(), methods: new Map() },
          { kind: 'custom', name: 'Enemy', properties: new Map(), methods: new Map() },
        ],
      };

      const result = checker.checkMatch(union, ['Player', 'Enemy']);
      expect(result.isExhaustive).toBe(true);
    });

    it('should report multiple uncovered cases', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'a' },
          { kind: 'literal', value: 'b' },
          { kind: 'literal', value: 'c' },
          { kind: 'literal', value: 'd' },
        ],
      };

      const result = checker.checkMatch(union, ['a']);
      expect(result.uncoveredCases).toHaveLength(3);
      expect(result.uncoveredCases).toContain('b');
      expect(result.uncoveredCases).toContain('c');
      expect(result.uncoveredCases).toContain('d');
    });

    it('should handle empty union', () => {
      const union: UnionType = { kind: 'union', members: [] };
      const result = checker.checkMatch(union, []);
      expect(result.isExhaustive).toBe(true);
    });

    it('should handle primitive kind fallback', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'primitive', name: 'number' },
          { kind: 'primitive', name: 'string' },
        ],
      };

      const result = checker.checkMatch(union, ['primitive', 'primitive']);
      expect(result.isExhaustive).toBe(true);
    });
  });
});

// ============================================================================
// AdvancedTypeChecker Tests
// ============================================================================

describe('AdvancedTypeChecker', () => {
  let checker: AdvancedTypeChecker;

  beforeEach(() => {
    checker = new AdvancedTypeChecker();
  });

  describe('constructor', () => {
    it('should register built-in Vector3 type', () => {
      const vec3 = checker.getType('Vector3');
      expect(vec3).toBeDefined();
      expect(vec3?.kind).toBe('custom');
    });

    it('should register built-in Transform type', () => {
      const transform = checker.getType('Transform');
      expect(transform).toBeDefined();
      expect(transform?.kind).toBe('custom');
    });
  });

  describe('inferType()', () => {
    it('should infer number type', () => {
      const result = checker.inferType(42);
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('number');
    });

    it('should infer string type', () => {
      const result = checker.inferType('test');
      expect(result.kind).toBe('primitive');
      expect((result as PrimitiveType).name).toBe('string');
    });

    it('should infer array type', () => {
      const result = checker.inferType([1, 2]);
      expect(result.kind).toBe('array');
    });
  });

  describe('isAssignableTo()', () => {
    it('should allow same type assignment', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      expect(checker.isAssignableTo(num, num)).toBe(true);
    });

    it('should reject different type assignment', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const str: PrimitiveType = { kind: 'primitive', name: 'string' };
      expect(checker.isAssignableTo(num, str)).toBe(false);
    });
  });

  describe('registerType() / getType()', () => {
    it('should register and retrieve custom type', () => {
      const myType: CustomType = {
        kind: 'custom',
        name: 'MyType',
        properties: new Map([['value', { kind: 'primitive', name: 'number' }]]),
        methods: new Map(),
      };

      checker.registerType('MyType', myType);
      expect(checker.getType('MyType')).toEqual(myType);
    });

    it('should return undefined for unknown type', () => {
      expect(checker.getType('UnknownType')).toBeUndefined();
    });

    it('should override existing type', () => {
      const type1: PrimitiveType = { kind: 'primitive', name: 'number' };
      const type2: PrimitiveType = { kind: 'primitive', name: 'string' };

      checker.registerType('Test', type1);
      checker.registerType('Test', type2);
      expect(checker.getType('Test')).toEqual(type2);
    });
  });

  describe('checkUnionExhaustiveness()', () => {
    it('should check exhaustive union', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'a' },
          { kind: 'literal', value: 'b' },
        ],
      };

      const result = checker.checkUnionExhaustiveness(union, ['a', 'b']);
      expect(result.isExhaustive).toBe(true);
    });

    it('should report uncovered cases', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'literal', value: 'a' },
          { kind: 'literal', value: 'b' },
        ],
      };

      const result = checker.checkUnionExhaustiveness(union, ['a']);
      expect(result.isExhaustive).toBe(false);
      expect(result.uncoveredCases).toContain('b');
    });
  });

  describe('checkAssignment()', () => {
    it('should return valid for compatible types', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const result = checker.checkAssignment(num, num);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error for incompatible types', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      const str: PrimitiveType = { kind: 'primitive', name: 'string' };

      const result = checker.checkAssignment(num, str);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('number');
      expect(result.error).toContain('string');
    });
  });

  describe('formatType()', () => {
    it('should format primitive type', () => {
      const num: PrimitiveType = { kind: 'primitive', name: 'number' };
      expect(checker.formatType(num)).toBe('number');
    });

    it('should format array type', () => {
      const arr: ArrayType = {
        kind: 'array',
        elementType: { kind: 'primitive', name: 'string' },
      };
      expect(checker.formatType(arr)).toBe('string[]');
    });

    it('should format union type', () => {
      const union: UnionType = {
        kind: 'union',
        members: [
          { kind: 'primitive', name: 'number' },
          { kind: 'primitive', name: 'string' },
        ],
      };
      expect(checker.formatType(union)).toBe('number | string');
    });

    it('should format intersection type', () => {
      const intersection: IntersectionType = {
        kind: 'intersection',
        members: [
          { kind: 'primitive', name: 'number' },
          { kind: 'primitive', name: 'string' },
        ],
      };
      expect(checker.formatType(intersection)).toBe('number & string');
    });

    it('should format custom type', () => {
      const custom: CustomType = {
        kind: 'custom',
        name: 'MyType',
        properties: new Map(),
        methods: new Map(),
      };
      expect(checker.formatType(custom)).toBe('MyType');
    });

    it('should format literal string type', () => {
      const literal: LiteralType = { kind: 'literal', value: 'hello' };
      expect(checker.formatType(literal)).toBe('"hello"');
    });

    it('should format literal number type', () => {
      const literal: LiteralType = { kind: 'literal', value: 42 };
      expect(checker.formatType(literal)).toBe('42');
    });

    it('should format literal boolean type', () => {
      const literal: LiteralType = { kind: 'literal', value: true };
      expect(checker.formatType(literal)).toBe('true');
    });

    it('should format nested array type', () => {
      const nested: ArrayType = {
        kind: 'array',
        elementType: {
          kind: 'array',
          elementType: { kind: 'primitive', name: 'number' },
        },
      };
      expect(checker.formatType(nested)).toBe('number[][]');
    });
  });
});
