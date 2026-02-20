/**
 * HoloScriptTypeChecker — production test suite
 *
 * Tests: constructor (built-ins pre-seeded), check() on various AST node types,
 * type inference (number/string/boolean/array/vec2/vec3/color/function),
 * connection E001/E002/W001, gate type narrowing, spread E102/E103,
 * foreach iterable check E006/E007, import registration, export E009,
 * match exhaustiveness (HasWildcard, E203, W200 duplicate wildcard, W201/W202),
 * registerUnionType / getUnionType / getAllUnionTypes,
 * checkExhaustiveMatch (missing cases, wildcard catch-all, unknown type alias),
 * registerTypeAlias (recursive → HSP020), getType / getAllTypes / reset.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import type { ASTNode } from '../types';

// ─── Minimal AST node builders ───────────────────────────────────────────────

function orbNode(name: string, props: Record<string, unknown> = {}, traits: string[] = []): ASTNode {
  return { type: 'orb', name, properties: props, traits, children: [] } as unknown as ASTNode;
}

function varNode(name: string, value: unknown, dataType?: string): ASTNode {
  return { type: 'variable-declaration', name, value, dataType, isExpression: false } as unknown as ASTNode;
}

function methodNode(name: string, params: { name: string; dataType: string }[] = [], returnType?: string): ASTNode {
  return { type: 'method', name, parameters: params, returnType, body: [] } as unknown as ASTNode;
}

function connectionNode(from: string, to: string, dataType = 'any'): ASTNode {
  return { type: 'connection', from, to, dataType } as unknown as ASTNode;
}

function spreadNode(target: string): ASTNode {
  return { type: 'spread', target } as unknown as ASTNode;
}

function importNode(modulePath: string, imports: string[], defaultImport?: string): ASTNode {
  return { type: 'import', modulePath, imports, defaultImport } as unknown as ASTNode;
}

function exportNode(exports: string[]): ASTNode {
  return { type: 'export', exports } as unknown as ASTNode;
}

function forEachNode(variable: string, collection: string): ASTNode {
  return { type: 'foreach-loop', variable, collection, body: [] } as unknown as ASTNode;
}

function matchNode(subject: string, cases: { pattern: unknown; body: ASTNode[] }[]): ASTNode {
  return { type: 'match', subject, cases } as unknown as ASTNode;
}

function wildcardPattern() { return { type: 'wildcard-pattern' }; }
function literalPattern(value: string) { return { type: 'literal-pattern', value }; }

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('HoloScriptTypeChecker: production', () => {
  let tc: HoloScriptTypeChecker;

  beforeEach(() => {
    tc = new HoloScriptTypeChecker();
  });

  // ─── Constructor + built-ins ───────────────────────────────────────────────
  describe('constructor and built-ins', () => {
    it('pre-seeds built-in function "add"', () => {
      const t = tc.getType('add');
      expect(t?.type).toBe('function');
    });

    it('pre-seeds built-in function "log"', () => {
      expect(tc.getType('log')?.type).toBe('function');
    });

    it('pre-seeds built-in function "spawn"', () => {
      expect(tc.getType('spawn')?.returnType).toBe('orb');
    });

    it('getAllTypes returns a non-empty map on init', () => {
      expect(tc.getAllTypes().size).toBeGreaterThan(5);
    });
  });

  // ─── check() — empty AST ──────────────────────────────────────────────────
  describe('check() — empty AST', () => {
    it('empty AST is valid', () => {
      const result = tc.check([]);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('typeMap is returned', () => {
      expect(tc.check([]).typeMap).toBeInstanceOf(Map);
    });
  });

  // ─── Orb declaration ──────────────────────────────────────────────────────
  describe('orb declaration', () => {
    it('registers an orb with type "orb"', () => {
      const result = tc.check([orbNode('myOrb')]);
      expect(result.typeMap.get('myOrb')?.type).toBe('orb');
    });

    it('orb with known position array is valid', () => {
      const result = tc.check([orbNode('o', { position: [1, 2, 3] })]);
      expect(result.valid).toBe(true);
    });
  });

  // ─── Variable declaration + type inference ────────────────────────────────
  describe('variable declaration and inferType', () => {
    it('infers number type for numeric literal', () => {
      const result = tc.check([varNode('x', 42)]);
      expect(result.typeMap.get('x')?.type).toBe('number');
    });

    it('infers string type for string literal', () => {
      const result = tc.check([varNode('name', 'hello')]);
      expect(result.typeMap.get('name')?.type).toBe('string');
    });

    it('infers boolean type for boolean literal', () => {
      const result = tc.check([varNode('flag', true)]);
      expect(result.typeMap.get('flag')?.type).toBe('boolean');
    });

    it('infers vec2 for [x, y] array', () => {
      const result = tc.check([varNode('v2', [1, 2])]);
      expect(result.typeMap.get('v2')?.type).toBe('vec2');
    });

    it('infers vec3 for [x, y, z] array', () => {
      const result = tc.check([varNode('v3', [1, 2, 3])]);
      expect(result.typeMap.get('v3')?.type).toBe('vec3');
    });

    it('infers vec4 for [x, y, z, w] array', () => {
      const result = tc.check([varNode('v4', [1, 2, 3, 4])]);
      expect(result.typeMap.get('v4')?.type).toBe('vec4');
    });

    it('infers color for hex string', () => {
      const result = tc.check([varNode('c', '#ff0000')]);
      expect(result.typeMap.get('c')?.type).toBe('color');
    });

    it('infers color for rgb() string', () => {
      const result = tc.check([varNode('c2', 'rgb(255,0,0)')]);
      expect(result.typeMap.get('c2')?.type).toBe('color');
    });

    it('infers array type for mixed array', () => {
      const result = tc.check([varNode('arr', ['a', 'b', 'c'])]);
      expect(result.typeMap.get('arr')?.type).toBe('array');
    });

    it('explicit dataType overrides inference', () => {
      const result = tc.check([varNode('n', 42, 'string')]);
      // declared as string — type mismatch E102 emitted
      const errors = result.diagnostics.filter(d => d.severity === 'error' && d.code === 'E102');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('direct inferType on null returns nullable any', () => {
      const info = tc.inferType(null as any);
      expect(info.nullable).toBe(true);
    });

    it('inferType on arrow function string returns function type', () => {
      const info = tc.inferType('() => 42');
      expect(info.type).toBe('function');
    });
  });

  // ─── Method declaration ───────────────────────────────────────────────────
  describe('method declaration', () => {
    it('registers method with type "function"', () => {
      const result = tc.check([methodNode('greet', [{ name: 'name', dataType: 'string' }], 'void')]);
      expect(result.typeMap.get('greet')?.type).toBe('function');
    });

    it('method parameters are recorded', () => {
      const result = tc.check([methodNode('add', [{ name: 'a', dataType: 'number' }, { name: 'b', dataType: 'number' }], 'number')]);
      const params = result.typeMap.get('add')?.parameters;
      expect(params).toHaveLength(2);
    });
  });

  // ─── Connection errors ────────────────────────────────────────────────────
  describe('connection type checking', () => {
    it('emits E001 for unknown source', () => {
      const result = tc.check([connectionNode('missingA', 'missingB')]);
      expect(result.diagnostics.some(d => d.code === 'E001')).toBe(true);
    });

    it('emits E002 for unknown target', () => {
      tc.check([orbNode('src')]);
      const result = tc.check([orbNode('src'), connectionNode('src', 'unknownTarget')]);
      expect(result.diagnostics.some(d => d.code === 'E002')).toBe(true);
    });

    it('emits W001 for incompatible types', () => {
      // orb → number: incompatible
      const result = tc.check([
        orbNode('a'),
        varNode('b', 42),
        { type: 'connection', from: 'a', to: 'b', dataType: 'typed' } as unknown as ASTNode,
      ]);
      expect(result.diagnostics.some(d => d.code === 'W001')).toBe(true);
    });

    it('no error for compatible same-type connection', () => {
      const result = tc.check([
        orbNode('src'),
        orbNode('dst'),
        connectionNode('src', 'dst'),
      ]);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });
  });

  // ─── Spread ───────────────────────────────────────────────────────────────
  describe('spread expression', () => {
    it('emits E102 for spread of unknown identifier', () => {
      const result = tc.check([spreadNode('unknownTpl')]);
      expect(result.diagnostics.some(d => d.code === 'E102')).toBe(true);
    });

    it('no error spreading a known orb', () => {
      const result = tc.check([orbNode('myTpl'), spreadNode('myTpl')]);
      expect(result.diagnostics.filter(d => d.severity === 'error' && d.code === 'E102')).toHaveLength(0);
    });

    it('emits E103 spreading a non-object type', () => {
      const result = tc.check([varNode('num', 42), spreadNode('num')]);
      expect(result.diagnostics.some(d => d.code === 'E103')).toBe(true);
    });
  });

  // ─── forEach loop ─────────────────────────────────────────────────────────
  describe('forEach loop', () => {
    it('emits E006 for unknown collection', () => {
      const result = tc.check([forEachNode('item', 'unknownList')]);
      expect(result.diagnostics.some(d => d.code === 'E006')).toBe(true);
    });

    it('emits E007 for non-array collection', () => {
      const result = tc.check([varNode('num', 42), forEachNode('item', 'num')]);
      expect(result.diagnostics.some(d => d.code === 'E007')).toBe(true);
    });

    it('no error for array collection', () => {
      const result = tc.check([varNode('items', ['a', 'b']), forEachNode('item', 'items')]);
      expect(result.diagnostics.filter(d => d.code === 'E007')).toHaveLength(0);
    });
  });

  // ─── Import / Export ──────────────────────────────────────────────────────
  describe('import and export', () => {
    it('import registers names as "any"', () => {
      const result = tc.check([importNode('./module.hs', ['foo', 'bar'])]);
      expect(result.typeMap.get('foo')?.type).toBe('any');
      expect(result.typeMap.get('bar')?.type).toBe('any');
    });

    it('import emits E008 if modulePath is missing', () => {
      const node = { type: 'import', modulePath: '', imports: ['x'], defaultImport: undefined } as unknown as ASTNode;
      const result = tc.check([node]);
      expect(result.diagnostics.some(d => d.code === 'E008')).toBe(true);
    });

    it('export emits E009 for unknown identifier', () => {
      const result = tc.check([exportNode(['unknownFn'])]);
      expect(result.diagnostics.some(d => d.code === 'E009')).toBe(true);
    });

    it('export no error for known identifier', () => {
      const result = tc.check([varNode('myFn', 42), exportNode(['myFn'])]);
      expect(result.diagnostics.filter(d => d.code === 'E009')).toHaveLength(0);
    });
  });

  // ─── Match expression ─────────────────────────────────────────────────────
  describe('match expression', () => {
    it('match with wildcard is valid', () => {
      const result = tc.check([
        matchNode('x', [{ pattern: wildcardPattern(), body: [] }]),
      ]);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });

    it('emits W201 for duplicate literal pattern', () => {
      const result = tc.check([
        matchNode('x', [
          { pattern: literalPattern('a'), body: [] },
          { pattern: literalPattern('a'), body: [] },
        ]),
      ]);
      expect(result.diagnostics.some(d => d.code === 'W201')).toBe(true);
    });

    it('emits W202 for unreachable case after wildcard', () => {
      const result = tc.check([
        matchNode('x', [
          { pattern: wildcardPattern(), body: [] },
          { pattern: literalPattern('a'), body: [] },
        ]),
      ]);
      expect(result.diagnostics.some(d => d.code === 'W202')).toBe(true);
    });

    it('emits E203 for non-exhaustive match on known union', () => {
      tc.registerUnionType('State', ['idle', 'loading', 'done']);
      const result = tc.check([
        matchNode('State', [
          { pattern: literalPattern('idle'), body: [] },
          // missing 'loading' and 'done'
        ]),
      ]);
      expect(result.diagnostics.some(d => d.code === 'E203')).toBe(true);
    });

    it('no E203 when all union cases covered', () => {
      tc.registerUnionType('State', ['idle', 'done']);
      const result = tc.check([
        matchNode('State', [
          { pattern: literalPattern('idle'), body: [] },
          { pattern: literalPattern('done'), body: [] },
        ]),
      ]);
      expect(result.diagnostics.filter(d => d.code === 'E203')).toHaveLength(0);
    });
  });

  // ─── registerUnionType / getUnionType ────────────────────────────────────
  describe('registerUnionType / getUnionType', () => {
    it('registers and retrieves a union type', () => {
      tc.registerUnionType('Color', ['red', 'green', 'blue']);
      const u = tc.getUnionType('Color');
      expect(u?.kind).toBe('union');
      expect(u?.members).toHaveLength(3);
    });

    it('getAllUnionTypes includes registered type', () => {
      tc.registerUnionType('Phase', ['a', 'b']);
      expect(tc.getAllUnionTypes().has('Phase')).toBe(true);
    });

    it('getUnionType returns undefined for unknown name', () => {
      expect(tc.getUnionType('Unknown')).toBeUndefined();
    });
  });

  // ─── checkExhaustiveMatch ─────────────────────────────────────────────────
  describe('checkExhaustiveMatch', () => {
    it('returns empty for unknown typeName', () => {
      const diags = tc.checkExhaustiveMatch({ typeName: 'NoSuchType', coveredPatterns: [], line: 0, column: 0 });
      expect(diags).toHaveLength(0);
    });

    it('returns empty when wildcard _ is present', () => {
      tc.registerTypeAlias({ name: 'S', kind: 'simple', definition: '"a" | "b"', line: 1 });
      const diags = tc.checkExhaustiveMatch({ typeName: 'S', coveredPatterns: ['_'], line: 1, column: 0 });
      expect(diags).toHaveLength(0);
    });

    it('returns HSP021 for missing literal cases', () => {
      tc.registerTypeAlias({ name: 'Status', kind: 'simple', definition: '"ok" | "err"', line: 1 });
      const diags = tc.checkExhaustiveMatch({ typeName: 'Status', coveredPatterns: ['ok'], line: 1, column: 0 });
      expect(diags.some(d => d.code === 'HSP021')).toBe(true);
    });

    it('returns empty when all cases covered', () => {
      tc.registerTypeAlias({ name: 'T', kind: 'simple', definition: '"x" | "y"', line: 1 });
      const diags = tc.checkExhaustiveMatch({ typeName: 'T', coveredPatterns: ['x', 'y'], line: 1, column: 0 });
      expect(diags).toHaveLength(0);
    });
  });

  // ─── registerTypeAlias (recursive guard) ─────────────────────────────────
  describe('registerTypeAlias', () => {
    it('non-recursive alias registers without diagnostic', () => {
      tc.registerTypeAlias({ name: 'Color', kind: 'simple', definition: 'string', line: 1 });
      const result = tc.check([]);
      expect(result.diagnostics.filter(d => d.code === 'HSP020')).toHaveLength(0);
    });

    it('recursive alias produces HSP020 error on check()', () => {
      tc.registerTypeAlias({ name: 'Rec', kind: 'simple', definition: 'Rec', line: 1 });
      const result = tc.check([]);
      expect(result.diagnostics.some(d => d.code === 'HSP020')).toBe(true);
    });
  });

  // ─── getType / getAllTypes / reset ────────────────────────────────────────
  describe('getType / getAllTypes / reset', () => {
    it('getType returns undefined for unregistered name', () => {
      expect(tc.getType('unknown_xyz')).toBeUndefined();
    });

    it('getType finds a registered variable', () => {
      tc.check([varNode('myVar', 99)]);
      expect(tc.getType('myVar')?.type).toBe('number');
    });

    it('reset clears user-registered types but not built-ins', () => {
      tc.check([varNode('x', 42)]);
      tc.reset();
      // built-in 'add' still there
      expect(tc.getType('add')?.type).toBe('function');
      // user var gone
      expect(tc.getType('x')).toBeUndefined();
    });

    it('getAllTypes after multiple checks includes all vars', () => {
      tc.check([varNode('a', 1), varNode('b', 'hi')]);
      const types = tc.getAllTypes();
      expect(types.has('a') && types.has('b')).toBe(true);
    });
  });
});
