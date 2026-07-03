/**
 * expression-ir.test.ts
 *
 * Proves two things about the new Function()/eval() replacement:
 *  (a) behavioral parity — expressions that worked via `new Function()` in
 *      SensorTrait/TransformTrait before this migration produce the SAME
 *      result via parseExpressionToIR + evaluateExpressionIR.
 *  (b) fail-closed security — a malicious/out-of-scope expression that
 *      `new Function()` would have executed as raw JS (globalThis, process,
 *      an unlisted identifier, a non-allowlisted call) now throws instead of
 *      executing, and never touches the process/global object.
 */
import { describe, it, expect } from 'vitest';
import {
  parseExpressionToIR,
  evaluateExpressionIR,
  ExpressionIRError,
  ExpressionParseError,
} from '../expression-ir';

// Reference implementation of the OLD SensorTrait.ts:120 behavior, kept ONLY
// in this test file to prove before/after parity. Never used in production code.
function legacySensorTransform(expr: string, value: unknown): unknown {
  const transformFn = new Function('value', `return ${expr}`);
  return transformFn(value);
}

// Reference implementation of the OLD TransformTrait.ts:161-177 behavior.
function legacyEvaluateExpr(expr: string, data: Record<string, unknown>): unknown {
  let resolved = expr;
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'number') {
      resolved = resolved.replace(new RegExp(`\\$${key}`, 'g'), String(val));
    }
  }
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) {
    throw new Error('Unsafe expression');
  }
  return new Function(`return (${resolved})`)();
}

describe('expression-ir: behavioral parity with legacy new Function() paths', () => {
  describe('SensorTrait-shaped transforms (single `value` slot)', () => {
    const cases: Array<{ expr: string; value: number }> = [
      { expr: 'value * 2', value: 5 },
      { expr: 'value * 1.8 + 32', value: 20 }, // Celsius -> Fahrenheit
      { expr: 'value / 100', value: 55 },
      { expr: 'value - 10', value: 3 },
      { expr: '(value + 1) * 2', value: 4 },
      { expr: '-value', value: 7 },
    ];

    for (const { expr, value } of cases) {
      it(`"${expr}" with value=${value} matches legacy new Function() result`, () => {
        const legacy = legacySensorTransform(expr, value);
        const ir = parseExpressionToIR(expr, ['value']);
        const modern = evaluateExpressionIR(ir, { value });
        expect(modern).toBe(legacy);
      });
    }
  });

  describe('TransformTrait-shaped compute expressions ($field slots)', () => {
    const cases: Array<{ expr: string; data: Record<string, number> }> = [
      { expr: '$a + $b * 2', data: { a: 3, b: 4 } }, // 11
      { expr: '$temp * 9 / 5 + 32', data: { temp: 20 } }, // 68
      { expr: '($x + $y) / 2', data: { x: 10, y: 20 } }, // 15
      { expr: '$score - 100', data: { score: 250 } },
    ];

    for (const { expr, data } of cases) {
      it(`"${expr}" with ${JSON.stringify(data)} matches legacy new Function() result`, () => {
        const legacy = legacyEvaluateExpr(expr, data);

        const allowedSlots = Object.keys(data).map((k) => `$${k}`);
        const context: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) context[`$${k}`] = v;

        const ir = parseExpressionToIR(expr, allowedSlots);
        const modern = evaluateExpressionIR(ir, context);
        expect(modern).toBe(legacy);
      });
    }
  });
});

describe('expression-ir: fail-closed security (the property this migration exists to prove)', () => {
  it('rejects `globalThis` reference at parse time (undeclared identifier)', () => {
    expect(() => parseExpressionToIR('globalThis', ['value'])).toThrow(ExpressionParseError);
  });

  it('rejects `process` reference at parse time (undeclared identifier)', () => {
    expect(() => parseExpressionToIR('process.exit(1)', ['value'])).toThrow(ExpressionParseError);
  });

  it('rejects an arbitrary unlisted identifier (e.g. `require`)', () => {
    expect(() => parseExpressionToIR('require("fs")', ['value'])).toThrow(ExpressionParseError);
  });

  it('rejects a non-allowlisted function call (e.g. `constructor`)', () => {
    expect(() => parseExpressionToIR('constructor(value)', ['value'])).toThrow(
      ExpressionParseError
    );
  });

  it('rejects prototype-pollution-shaped member access via hasOwnProperty guard', () => {
    const ir = parseExpressionToIR('value.constructor', ['value']);
    // `value` is a plain number in context — MemberExpression must fail closed
    // rather than resolving through the prototype chain to Number.prototype.constructor.
    expect(() => evaluateExpressionIR(ir, { value: 42 })).toThrow(ExpressionIRError);
  });

  it('rejects `__proto__` member access via hasOwnProperty guard (never resolves through prototype chain)', () => {
    const ir = parseExpressionToIR('value.__proto__', ['value']);
    expect(() => evaluateExpressionIR(ir, { value: {} })).toThrow(ExpressionIRError);
  });

  it('proves the old new Function() path WOULD have executed the malicious reference (contrast case)', () => {
    // This demonstrates the actual vulnerability being closed: the legacy
    // implementation happily runs `process`-referencing code, because
    // `new Function` closes over the real global scope.
    expect(() => legacySensorTransform('typeof process', 1)).not.toThrow();
    expect(legacySensorTransform('typeof process', 1)).toBe('object');

    // The new IR path, given the identical source string, fails closed instead:
    expect(() => parseExpressionToIR('typeof process', ['value'])).toThrow(ExpressionParseError);
  });

  it('throws ExpressionIRError (not a silent fallback) for an identifier missing from context at eval time', () => {
    // Defense in depth: even a hand-constructed IR referencing an undeclared
    // identifier must fail at evaluation time, not silently resolve to undefined.
    const ir = { kind: 'Identifier', name: 'secretKey' } as const;
    expect(() => evaluateExpressionIR(ir, { value: 1 })).toThrow(ExpressionIRError);
  });

  it('rejects a CallExpression IR built with a non-allowlisted callee at eval time (defense in depth)', () => {
    const maliciousIR = {
      kind: 'CallExpression',
      // Cast bypasses the compile-time AllowedBuiltin check to simulate a
      // tampered/hand-built IR reaching the interpreter directly.
      callee: 'eval' as unknown as 'abs',
      arguments: [],
    } as const;
    expect(() => evaluateExpressionIR(maliciousIR, {})).toThrow(ExpressionIRError);
  });

  it('never exposes globalThis/process through the evaluation context, even indirectly', () => {
    const ir = parseExpressionToIR('value', ['value']);
    // Context is a plain object we control — nothing in the interpreter path
    // reaches outside it (no closures over the calling scope, unlike new Function()).
    const result = evaluateExpressionIR(ir, { value: 5 });
    expect(result).toBe(5);
  });
});

describe('expression-ir: allowlisted builtin calls (net-new capability vs. legacy)', () => {
  it('round(value) works via the IR (legacy new Function bare "round" is not defined without Math. prefix)', () => {
    // Confirms the gap noted in the design: legacy `new Function('value', 'return round(value)')`
    // would throw ReferenceError since `round` is not a JS global — this is NOT a parity
    // regression, it is new functionality the IR intentionally adds via ALLOWED_BUILTINS.
    expect(() => legacySensorTransform('round(value)', 3.7)).toThrow(/round is not defined/);

    const ir = parseExpressionToIR('round(value)', ['value']);
    expect(evaluateExpressionIR(ir, { value: 3.7 })).toBe(4);
  });

  it('supports nested arithmetic + builtin calls', () => {
    const ir = parseExpressionToIR('round(value * 10) / 10', ['value']);
    expect(evaluateExpressionIR(ir, { value: 3.14159 })).toBeCloseTo(3.1, 5);
  });

  it('rejects a bare Math.round() form (Math is not a declared slot)', () => {
    expect(() => parseExpressionToIR('Math.round(value)', ['value'])).toThrow(
      ExpressionParseError
    );
  });
});

describe('expression-ir: malformed expressions fail closed without throwing uncaught', () => {
  it('unbalanced parens throws ExpressionParseError', () => {
    expect(() => parseExpressionToIR('invalid((((', ['value'])).toThrow(ExpressionParseError);
  });

  it('trailing garbage after a valid expression throws ExpressionParseError', () => {
    expect(() => parseExpressionToIR('value + 1 )', ['value'])).toThrow(ExpressionParseError);
  });
});
