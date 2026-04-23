/**
 * Unit tests for condition-evaluator — AUDIT-mode coverage
 *
 * Covers the pure module extracted in W1-T4 slice 3. The characterization
 * harness locks end-to-end HSR behavior but does not exercise edge cases
 * or security-sensitive paths in isolation. These tests fill that gap.
 *
 * **Security focus**: the `SUSPICIOUS_KEYWORDS` blocklist is the only
 * layer between adversarial condition strings and `evaluate`. Any
 * weakening of the blocklist is a security regression and must break
 * one of these tests.
 *
 * **See**: packages/core/src/runtime/condition-evaluator.ts (slice 3)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts (L4 gate)
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateCondition, type ExpressionEvaluator } from './condition-evaluator';

/** Stub evaluator that returns a caller-provided lookup table. */
function makeEvaluator(table: Record<string, unknown> = {}): ExpressionEvaluator {
  return (expr: string) => {
    if (expr in table) return table[expr];
    // Number literals pass through
    const n = Number(expr);
    if (!Number.isNaN(n) && expr.trim() !== '') return n;
    // String literals: strip surrounding quotes
    const m = expr.match(/^['"](.*)['"]$/);
    if (m) return m[1];
    return undefined;
  };
}

describe('evaluateCondition — boolean literals', () => {
  const evaluate = makeEvaluator();

  it('returns true for string "true"', () => {
    expect(evaluateCondition('true', evaluate)).toBe(true);
  });

  it('returns false for string "false"', () => {
    expect(evaluateCondition('false', evaluate)).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    expect(evaluateCondition('  true  ', evaluate)).toBe(true);
    expect(evaluateCondition('\tfalse\n', evaluate)).toBe(false);
  });

  it('is case-insensitive for boolean literals', () => {
    expect(evaluateCondition('TRUE', evaluate)).toBe(true);
    expect(evaluateCondition('True', evaluate)).toBe(true);
    expect(evaluateCondition('FALSE', evaluate)).toBe(false);
  });
});

describe('evaluateCondition — falsy short-circuits', () => {
  const evaluate = makeEvaluator();

  it('returns false for null', () => {
    expect(evaluateCondition(null, evaluate)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(evaluateCondition(undefined, evaluate)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(evaluateCondition('', evaluate)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(evaluateCondition(0, evaluate)).toBe(false);
  });
});

describe('evaluateCondition — security blocklist (SUSPICIOUS_KEYWORDS)', () => {
  const evaluate = makeEvaluator();

  it.each([
    ['eval', 'eval("malicious")'],
    ['eval case-insensitive', 'EVAL("X")'],
    ['process', 'process.exit(0)'],
    ['require', 'require("fs")'],
    ['__proto__', 'x.__proto__.polluted = true'],
    ['constructor', 'obj.constructor === Object'],
    ['embedded eval', 'foo + eval("bar")'],
    ['embedded require in identifier', 'myrequireMock'],
  ])('blocks "%s" variant → returns false', (_label, condition) => {
    expect(evaluateCondition(condition, evaluate)).toBe(false);
  });

  it('blocks regardless of case', () => {
    expect(evaluateCondition('EvAl(1)', evaluate)).toBe(false);
    expect(evaluateCondition('Process.env', evaluate)).toBe(false);
    expect(evaluateCondition('REQUIRE("x")', evaluate)).toBe(false);
  });

  it('does NOT rely on evaluate callback when blocking — evaluator must not be invoked', () => {
    const spy = vi.fn();
    evaluateCondition('eval(1)', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('evaluateCondition — comparison operators', () => {
  const evaluate = makeEvaluator({ x: 5, y: 10, name: 'alice' });

  it('===', () => {
    expect(evaluateCondition('x === 5', evaluate)).toBe(true);
    expect(evaluateCondition('x === 6', evaluate)).toBe(false);
  });

  it('!== is strict inequality', () => {
    expect(evaluateCondition('x !== 5', evaluate)).toBe(false);
    expect(evaluateCondition('x !== 6', evaluate)).toBe(true);
  });

  it('== performs loose equality', () => {
    // 5 == "5" loosely → true
    expect(evaluateCondition('x == 5', evaluate)).toBe(true);
  });

  it('!=', () => {
    expect(evaluateCondition('x != 6', evaluate)).toBe(true);
  });

  it('>= / <= / > / <', () => {
    expect(evaluateCondition('x >= 5', evaluate)).toBe(true);
    expect(evaluateCondition('x <= 5', evaluate)).toBe(true);
    expect(evaluateCondition('y > x', evaluate)).toBe(true);
    expect(evaluateCondition('x < y', evaluate)).toBe(true);
    expect(evaluateCondition('x > y', evaluate)).toBe(false);
  });

  it('coerces comparison operands to numbers for ordering ops', () => {
    // String comparison via numeric coercion
    expect(evaluateCondition('"10" > "5"', evaluate)).toBe(true);
  });
});

describe('evaluateCondition — logical operators', () => {
  const evaluate = makeEvaluator({ a: true, b: false, n: 5 });

  it('&& — short-circuits both sides', () => {
    expect(evaluateCondition('a && a', evaluate)).toBe(true);
    expect(evaluateCondition('a && b', evaluate)).toBe(false);
    expect(evaluateCondition('b && a', evaluate)).toBe(false);
    expect(evaluateCondition('b && b', evaluate)).toBe(false);
  });

  it('|| — returns true if either side truthy', () => {
    expect(evaluateCondition('a || a', evaluate)).toBe(true);
    expect(evaluateCondition('a || b', evaluate)).toBe(true);
    expect(evaluateCondition('b || a', evaluate)).toBe(true);
    expect(evaluateCondition('b || b', evaluate)).toBe(false);
  });
});

describe('evaluateCondition — unary negation', () => {
  const evaluate = makeEvaluator({ flag: true, off: false });

  it('!true → false', () => {
    expect(evaluateCondition('!flag', evaluate)).toBe(false);
  });

  it('!false → true', () => {
    expect(evaluateCondition('!off', evaluate)).toBe(true);
  });

  it('nested !!', () => {
    // !(!flag) — flag is truthy, !flag → false, !false → true
    expect(evaluateCondition('!!flag', evaluate)).toBe(true);
  });

  it('recursion depth — 3 levels of !', () => {
    expect(evaluateCondition('!!!flag', evaluate)).toBe(false);
  });
});

describe('evaluateCondition — variable truthiness fallback', () => {
  it('identifier resolving to truthy → true', () => {
    const evaluate = makeEvaluator({ enabled: true });
    expect(evaluateCondition('enabled', evaluate)).toBe(true);
  });

  it('identifier resolving to falsy 0 → false', () => {
    const evaluate = makeEvaluator({ count: 0 });
    expect(evaluateCondition('count', evaluate)).toBe(false);
  });

  it('identifier resolving to undefined → false', () => {
    const evaluate = makeEvaluator();
    expect(evaluateCondition('missing', evaluate)).toBe(false);
  });

  it('identifier resolving to non-empty string → true', () => {
    const evaluate = makeEvaluator({ name: 'alice' });
    expect(evaluateCondition('name', evaluate)).toBe(true);
  });
});

describe('evaluateCondition — error handling', () => {
  it('returns false when evaluator throws', () => {
    const throwing: ExpressionEvaluator = () => {
      throw new Error('evaluator blew up');
    };
    // A condition like 'x === 1' forces evaluator invocation
    expect(evaluateCondition('x === 1', throwing)).toBe(false);
  });

  it('returns false on unparseable comparison', () => {
    const evaluate = makeEvaluator();
    // No RHS — the regex won't match, falls through to variable truthiness
    // `===` alone resolves via evaluator which returns undefined → false
    expect(evaluateCondition('===', evaluate)).toBe(false);
  });
});

describe('evaluateCondition — input-type tolerance', () => {
  const evaluate = makeEvaluator({ x: 1 });

  it('accepts non-string conditions (number)', () => {
    // Number 1 → String(1) = '1' → not a bool literal, not a comparison,
    // identifier lookup via evaluator returns number 1 (from makeEvaluator's
    // Number(expr) branch) → Boolean(1) === true
    expect(evaluateCondition(1, evaluate)).toBe(true);
  });

  it('accepts non-string conditions (object with truthy stringification)', () => {
    // Object stringifies to "[object Object]" — not blocked, not parseable,
    // identifier lookup returns undefined → false
    expect(evaluateCondition({ foo: 'bar' }, evaluate)).toBe(false);
  });
});
