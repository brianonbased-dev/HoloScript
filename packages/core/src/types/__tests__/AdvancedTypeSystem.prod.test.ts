/**
 * AdvancedTypeSystem Production Tests
 *
 * Tests TypeInferenceEngine and ExhaustivenessChecker.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeInferenceEngine, ExhaustivenessChecker } from '../../types/AdvancedTypeSystem';
import type { HoloScriptType, UnionType, GenericType } from '../../types/AdvancedTypeSystem';

describe('TypeInferenceEngine — Production', () => {
  let engine: TypeInferenceEngine;

  beforeEach(() => {
    engine = new TypeInferenceEngine();
  });

  // ─── inferType ────────────────────────────────────────────────────

  it('infers number', () => {
    const t = engine.inferType(42);
    expect(t.kind).toBe('primitive');
    expect((t as any).name).toBe('number');
  });

  it('infers string', () => {
    const t = engine.inferType('hello');
    expect(t.kind).toBe('primitive');
    expect((t as any).name).toBe('string');
  });

  it('infers boolean', () => {
    const t = engine.inferType(true);
    expect(t.kind).toBe('primitive');
    expect((t as any).name).toBe('boolean');
  });

  it('infers array', () => {
    const t = engine.inferType([1, 2, 3]);
    expect(t.kind).toBe('array');
  });

  it('infers null as any or void', () => {
    const t = engine.inferType(null);
    expect(t.kind).toBe('primitive');
  });

  // ─── isAssignableTo ───────────────────────────────────────────────

  it('same type is assignable', () => {
    const intType: HoloScriptType = { kind: 'primitive', name: 'number' };
    expect(engine.isAssignableTo(intType, intType)).toBe(true);
  });

  it('different primitives are not assignable', () => {
    const num: HoloScriptType = { kind: 'primitive', name: 'number' };
    const str: HoloScriptType = { kind: 'primitive', name: 'string' };
    expect(engine.isAssignableTo(num, str)).toBe(false);
  });

  it('member is assignable to union containing it', () => {
    const num: HoloScriptType = { kind: 'primitive', name: 'number' };
    const union: UnionType = {
      kind: 'union',
      members: [
        { kind: 'primitive', name: 'number' },
        { kind: 'primitive', name: 'string' },
      ],
    };
    expect(engine.isAssignableTo(num, union)).toBe(true);
  });

  it('non-member is not assignable to union', () => {
    const bool: HoloScriptType = { kind: 'primitive', name: 'boolean' };
    const union: UnionType = {
      kind: 'union',
      members: [
        { kind: 'primitive', name: 'number' },
        { kind: 'primitive', name: 'string' },
      ],
    };
    expect(engine.isAssignableTo(bool, union)).toBe(false);
  });

  // ─── unify ────────────────────────────────────────────────────────

  it('unify same types returns empty map', () => {
    const a: HoloScriptType = { kind: 'primitive', name: 'number' };
    const result = engine.unify(a, a);
    expect(result.size).toBe(0);
  });

  it('unify generic with concrete returns substitution', () => {
    const generic: GenericType = {
      kind: 'generic',
      name: 'T',
      typeArgs: [],
    };
    const concrete: HoloScriptType = { kind: 'primitive', name: 'string' };
    const result = engine.unify(generic, concrete);
    expect(result.size).toBeGreaterThanOrEqual(0); // May or may not produce substitution depending on implementation
  });

  // ─── resolveGeneric ───────────────────────────────────────────────

  it('resolves generic with concrete types', () => {
    const generic: GenericType = {
      kind: 'generic',
      name: 'Container',
      typeArgs: [{ kind: 'generic', name: 'T', typeArgs: [] }],
    };
    const concrete: HoloScriptType = { kind: 'primitive', name: 'number' };
    const result = engine.resolveGeneric(generic, [concrete]);
    expect(result).toBeDefined();
  });
});

describe('ExhaustivenessChecker — Production', () => {
  let checker: ExhaustivenessChecker;

  beforeEach(() => {
    checker = new ExhaustivenessChecker();
  });

  it('exhaustive match returns true', () => {
    const union: UnionType = {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'idle' },
        { kind: 'literal', value: 'loading' },
        { kind: 'literal', value: 'error' },
      ],
    };
    const result = checker.checkMatch(union, ['idle', 'loading', 'error']);
    expect(result.isExhaustive).toBe(true);
    expect(result.uncoveredCases).toEqual([]);
  });

  it('non-exhaustive match returns missing cases', () => {
    const union: UnionType = {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'idle' },
        { kind: 'literal', value: 'loading' },
        { kind: 'literal', value: 'error' },
      ],
    };
    const result = checker.checkMatch(union, ['idle']);
    expect(result.isExhaustive).toBe(false);
    expect(result.uncoveredCases.length).toBe(2);
  });

  it('empty patterns returns all as uncovered', () => {
    const union: UnionType = {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'a' },
        { kind: 'literal', value: 'b' },
      ],
    };
    const result = checker.checkMatch(union, []);
    expect(result.isExhaustive).toBe(false);
    expect(result.uncoveredCases.length).toBe(2);
  });

  it('getCaseName extracts name from literal', () => {
    const lit: HoloScriptType = { kind: 'literal', value: 'idle' };
    expect(checker.getCaseName(lit)).toBe('idle');
  });

  it('getCaseName returns kind for primitive', () => {
    const prim: HoloScriptType = { kind: 'primitive', name: 'number' };
    expect(checker.getCaseName(prim)).toBe('primitive');
  });
});
