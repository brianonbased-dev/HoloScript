import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMemberPath,
  __clearGetMemberPathCache,
  evaluateHoloExpression,
} from '../holo-expression.js';
import type { HoloExpression } from '../../parser/HoloCompositionTypes.js';
import type { HoloExpressionContext } from '../holo-expression.js';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<HoloExpressionContext> = {}): HoloExpressionContext {
  return {
    getVariable: vi.fn().mockReturnValue(undefined),
    setVariable: vi.fn(),
    callFunction: vi.fn().mockResolvedValue({ success: true, output: null }),
    ...overrides,
  };
}

function literal(value: unknown): HoloExpression {
  return { type: 'Literal', value } as unknown as HoloExpression;
}

function identifier(name: string): HoloExpression {
  return { type: 'Identifier', name } as unknown as HoloExpression;
}

function memberExpr(object: HoloExpression, property: string): HoloExpression {
  return { type: 'MemberExpression', object, property } as unknown as HoloExpression;
}

function binary(operator: string, left: HoloExpression, right: HoloExpression): HoloExpression {
  return { type: 'BinaryExpression', operator, left, right } as unknown as HoloExpression;
}

function conditional(
  test: HoloExpression,
  consequent: HoloExpression,
  alternate: HoloExpression,
): HoloExpression {
  return { type: 'ConditionalExpression', test, consequent, alternate } as unknown as HoloExpression;
}

function updateExpr(operator: '++' | '--', argument: HoloExpression, prefix: boolean): HoloExpression {
  return { type: 'UpdateExpression', operator, argument, prefix } as unknown as HoloExpression;
}

function arrayExpr(elements: HoloExpression[]): HoloExpression {
  return { type: 'ArrayExpression', elements } as unknown as HoloExpression;
}

function objectExpr(properties: { key: string; value: HoloExpression }[]): HoloExpression {
  return { type: 'ObjectExpression', properties } as unknown as HoloExpression;
}

// ──────────────────────────────────────────────────────────────────
// getMemberPath
// ──────────────────────────────────────────────────────────────────

describe('getMemberPath', () => {
  beforeEach(() => {
    __clearGetMemberPathCache();
  });

  it('returns name for Identifier', () => {
    expect(getMemberPath(identifier('foo'))).toBe('foo');
  });

  it('returns dotted path for MemberExpression', () => {
    const expr = memberExpr(identifier('a'), 'b');
    expect(getMemberPath(expr)).toBe('a.b');
  });

  it('returns nested dotted path', () => {
    const expr = memberExpr(memberExpr(identifier('a'), 'b'), 'c');
    expect(getMemberPath(expr)).toBe('a.b.c');
  });

  it('returns null for Literal', () => {
    expect(getMemberPath(literal(42))).toBeNull();
  });

  it('returns null for CallExpression', () => {
    const call = {
      type: 'CallExpression',
      callee: identifier('foo'),
      arguments: [],
    } as unknown as HoloExpression;
    expect(getMemberPath(call)).toBeNull();
  });

  it('returns null for MemberExpression with non-Identifier root', () => {
    const expr = memberExpr(literal(42), 'foo');
    expect(getMemberPath(expr)).toBeNull();
  });

  it('caches results — same object stringifies to same key', () => {
    const expr = identifier('cached');
    const r1 = getMemberPath(expr);
    const r2 = getMemberPath(expr);
    expect(r1).toBe('cached');
    expect(r2).toBe('cached');
  });

  it('__clearGetMemberPathCache resets cache', () => {
    getMemberPath(identifier('x'));
    __clearGetMemberPathCache();
    // After clearing, calling again should still work correctly
    expect(getMemberPath(identifier('x'))).toBe('x');
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — basic literals and identifiers
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — Literal', () => {
  it('returns numeric literal', async () => {
    const result = await evaluateHoloExpression(literal(42), undefined, makeCtx());
    expect(result).toBe(42);
  });

  it('returns string literal', async () => {
    const result = await evaluateHoloExpression(literal('hello'), undefined, makeCtx());
    expect(result).toBe('hello');
  });

  it('returns boolean literal', async () => {
    const result = await evaluateHoloExpression(literal(false), undefined, makeCtx());
    expect(result).toBe(false);
  });

  it('returns null literal', async () => {
    const result = await evaluateHoloExpression(literal(null), undefined, makeCtx());
    expect(result).toBeNull();
  });
});

describe('evaluateHoloExpression — Identifier', () => {
  it('calls getVariable with the name', async () => {
    const getVariable = vi.fn().mockReturnValue(99);
    const ctx = makeCtx({ getVariable });
    const result = await evaluateHoloExpression(identifier('myVar'), undefined, ctx);
    expect(getVariable).toHaveBeenCalledWith('myVar', undefined);
    expect(result).toBe(99);
  });

  it('passes scopeOverride to getVariable', async () => {
    const getVariable = vi.fn().mockReturnValue('val');
    const ctx = makeCtx({ getVariable });
    const scope = { variables: new Map() };
    await evaluateHoloExpression(identifier('x'), scope, ctx);
    expect(getVariable).toHaveBeenCalledWith('x', scope);
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — MemberExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — MemberExpression', () => {
  it('accesses property on an object', async () => {
    const obj = { name: 'alice' };
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(obj) });
    const expr = memberExpr(identifier('person'), 'name');
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe('alice');
  });

  it('returns undefined when object is not an object', async () => {
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(42) });
    const expr = memberExpr(identifier('num'), 'prop');
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBeUndefined();
  });

  it('returns undefined for null object', async () => {
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(null) });
    const expr = memberExpr(identifier('n'), 'prop');
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — CallExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — CallExpression', () => {
  it('calls function-value callee with evaluated args', async () => {
    const fn = vi.fn().mockReturnValue(99);
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(fn) });
    const expr = {
      type: 'CallExpression',
      callee: identifier('myFn'),
      arguments: [literal(1), literal(2)],
    } as unknown as HoloExpression;
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(fn).toHaveBeenCalledWith(1, 2);
    expect(result).toBe(99);
  });

  it('dispatches to callFunction for Identifier callee when callee is not a function', async () => {
    const callFunction = vi.fn().mockResolvedValue({ success: true, output: 'returned' });
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(undefined),
      callFunction,
    });
    const expr = {
      type: 'CallExpression',
      callee: identifier('greet'),
      arguments: [literal('world')],
    } as unknown as HoloExpression;
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(callFunction).toHaveBeenCalledWith('greet', ['world']);
    expect(result).toBe('returned');
  });

  it('returns undefined when callee is not function and not Identifier', async () => {
    const ctx = makeCtx({ getVariable: vi.fn().mockReturnValue(undefined) });
    // Use MemberExpression as callee — not an Identifier, not a function
    const expr = {
      type: 'CallExpression',
      callee: memberExpr(identifier('obj'), 'method'),
      arguments: [],
    } as unknown as HoloExpression;
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — BinaryExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — BinaryExpression', () => {
  it.each([
    ['+', 3, 4, 7],
    ['-', 10, 3, 7],
    ['*', 3, 4, 12],
    ['/', 10, 2, 5],
  ])('handles arithmetic operator %s', async (op, l, r, expected) => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(binary(op, literal(l), literal(r)), undefined, ctx);
    expect(result).toBe(expected);
  });

  it.each([
    ['==', 1, 1, true],
    ['===', 1, 1, true],
    ['!=', 1, 2, true],
    ['!==', 1, 2, true],
    ['<', 1, 2, true],
    ['>', 2, 1, true],
    ['<=', 2, 2, true],
    ['>=', 2, 2, true],
  ])('handles comparison operator %s', async (op, l, r, expected) => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(binary(op, literal(l), literal(r)), undefined, ctx);
    expect(result).toBe(expected);
  });

  it('handles && operator (truthy)', async () => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(binary('&&', literal(1), literal(2)), undefined, ctx);
    expect(result).toBe(2);
  });

  it('handles || operator (falsy left)', async () => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(binary('||', literal(0), literal(42)), undefined, ctx);
    expect(result).toBe(42);
  });

  it('returns undefined for unknown operator', async () => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(binary('%', literal(10), literal(3)), undefined, ctx);
    expect(result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — ConditionalExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — ConditionalExpression', () => {
  it('returns consequent when test is truthy', async () => {
    const ctx = makeCtx();
    const expr = conditional(literal(1), literal('yes'), literal('no'));
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe('yes');
  });

  it('returns alternate when test is falsy', async () => {
    const ctx = makeCtx();
    const expr = conditional(literal(0), literal('yes'), literal('no'));
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe('no');
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — UpdateExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — UpdateExpression', () => {
  beforeEach(() => {
    __clearGetMemberPathCache();
  });

  it('prefix ++ increments and returns new value', async () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(5),
      setVariable,
    });
    const expr = updateExpr('++', identifier('counter'), true);
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe(6);
    expect(setVariable).toHaveBeenCalledWith('counter', 6, undefined);
  });

  it('postfix ++ returns old value but writes new', async () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(5),
      setVariable,
    });
    const expr = updateExpr('++', identifier('counter'), false);
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe(5);
    expect(setVariable).toHaveBeenCalledWith('counter', 6, undefined);
  });

  it('prefix -- decrements and returns new value', async () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(10),
      setVariable,
    });
    const expr = updateExpr('--', identifier('n'), true);
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBe(9);
    expect(setVariable).toHaveBeenCalledWith('n', 9, undefined);
  });

  it('does not call setVariable when path is null (non-lvalue)', async () => {
    const setVariable = vi.fn();
    const ctx = makeCtx({
      getVariable: vi.fn().mockReturnValue(3),
      setVariable,
    });
    // literal is not a valid lvalue — getMemberPath returns null
    const expr = updateExpr('++', literal(3), true);
    await evaluateHoloExpression(expr, undefined, ctx);
    expect(setVariable).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — ArrayExpression / ObjectExpression
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — ArrayExpression', () => {
  it('evaluates elements and returns array', async () => {
    const ctx = makeCtx();
    const expr = arrayExpr([literal(1), literal(2), literal(3)]);
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles empty array', async () => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(arrayExpr([]), undefined, ctx);
    expect(result).toEqual([]);
  });
});

describe('evaluateHoloExpression — ObjectExpression', () => {
  it('evaluates properties and returns object', async () => {
    const ctx = makeCtx();
    const expr = objectExpr([
      { key: 'x', value: literal(1) },
      { key: 'y', value: literal(2) },
    ]);
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toEqual({ x: 1, y: 2 });
  });

  it('handles empty object', async () => {
    const ctx = makeCtx();
    const result = await evaluateHoloExpression(objectExpr([]), undefined, ctx);
    expect(result).toEqual({});
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateHoloExpression — unknown type → undefined
// ──────────────────────────────────────────────────────────────────

describe('evaluateHoloExpression — unknown type', () => {
  it('returns undefined for unknown expression type', async () => {
    const ctx = makeCtx();
    const expr = { type: 'UnknownNode' } as unknown as HoloExpression;
    const result = await evaluateHoloExpression(expr, undefined, ctx);
    expect(result).toBeUndefined();
  });
});
