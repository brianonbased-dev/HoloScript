import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateCondition } from '../condition-evaluator';
import type { ExpressionEvaluator } from '../condition-evaluator';

describe('evaluateCondition', () => {
  let evaluate: ExpressionEvaluator;

  beforeEach(() => {
    // Default evaluator: try to parse as number, then boolean literal, then return the string
    evaluate = vi.fn((expr: string) => {
      if (expr === 'true') return true;
      if (expr === 'false') return false;
      const n = Number(expr);
      if (!isNaN(n) && expr.trim() !== '') return n;
      return expr;
    });
  });

  describe('falsy/empty conditions', () => {
    it('returns false for empty string', () => {
      expect(evaluateCondition('', evaluate)).toBe(false);
    });

    it('returns false for null', () => {
      expect(evaluateCondition(null, evaluate)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(evaluateCondition(undefined, evaluate)).toBe(false);
    });

    it('returns false for 0', () => {
      expect(evaluateCondition(0, evaluate)).toBe(false);
    });
  });

  describe('suspicious keyword blocking', () => {
    it('blocks conditions containing "eval"', () => {
      expect(evaluateCondition('eval("code")', evaluate)).toBe(false);
    });

    it('blocks conditions containing "process"', () => {
      expect(evaluateCondition('process.exit()', evaluate)).toBe(false);
    });

    it('blocks conditions containing "require"', () => {
      expect(evaluateCondition('require("fs")', evaluate)).toBe(false);
    });

    it('blocks conditions containing "__proto__"', () => {
      expect(evaluateCondition('__proto__.polluted', evaluate)).toBe(false);
    });

    it('blocks conditions containing "constructor"', () => {
      expect(evaluateCondition('constructor.call()', evaluate)).toBe(false);
    });

    it('blocks case-insensitive: "EVAL"', () => {
      expect(evaluateCondition('EVAL("x")', evaluate)).toBe(false);
    });
  });

  describe('boolean literals', () => {
    it('returns true for "true"', () => {
      expect(evaluateCondition('true', evaluate)).toBe(true);
    });

    it('returns false for "false"', () => {
      expect(evaluateCondition('false', evaluate)).toBe(false);
    });

    it('handles whitespace around "true"', () => {
      expect(evaluateCondition('  true  ', evaluate)).toBe(true);
    });

    it('handles uppercase "TRUE"', () => {
      expect(evaluateCondition('TRUE', evaluate)).toBe(true);
    });
  });

  describe('comparison operators', () => {
    it('=== strict equality: equal values', () => {
      const ev: ExpressionEvaluator = (e) => e === 'x' ? 5 : 5;
      expect(evaluateCondition('x === x', ev)).toBe(true);
    });

    it('=== strict equality: unequal values', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 1 : 2;
      expect(evaluateCondition('a === b', ev)).toBe(false);
    });

    it('!== strict inequality', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 1 : 2;
      expect(evaluateCondition('a !== b', ev)).toBe(true);
    });

    it('== loose equality', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? '1' : 1;
      expect(evaluateCondition('a == b', ev)).toBe(true); // '1' == 1
    });

    it('!= loose inequality', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 1 : 2;
      expect(evaluateCondition('a != b', ev)).toBe(true);
    });

    it('>= greater or equal: equal case', () => {
      const ev: ExpressionEvaluator = () => 5;
      expect(evaluateCondition('a >= b', ev)).toBe(true);
    });

    it('>= greater or equal: greater case', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 6 : 5;
      expect(evaluateCondition('a >= b', ev)).toBe(true);
    });

    it('>= greater or equal: less case', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 4 : 5;
      expect(evaluateCondition('a >= b', ev)).toBe(false);
    });

    it('<= less or equal', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 4 : 5;
      expect(evaluateCondition('a <= b', ev)).toBe(true);
    });

    it('> strictly greater', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 6 : 5;
      expect(evaluateCondition('a > b', ev)).toBe(true);
    });

    it('< strictly less', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? 4 : 5;
      expect(evaluateCondition('a < b', ev)).toBe(true);
    });
  });

  describe('logical operators', () => {
    it('&& returns true when both sides are truthy', () => {
      const ev: ExpressionEvaluator = () => true;
      expect(evaluateCondition('a && b', ev)).toBe(true);
    });

    it('&& returns false when left side is falsy', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? false : true;
      expect(evaluateCondition('a && b', ev)).toBe(false);
    });

    it('&& returns false when right side is falsy', () => {
      const ev: ExpressionEvaluator = (e) => e === 'b' ? false : true;
      expect(evaluateCondition('a && b', ev)).toBe(false);
    });

    it('|| returns true when left side is truthy', () => {
      const ev: ExpressionEvaluator = (e) => e === 'a' ? true : false;
      expect(evaluateCondition('a || b', ev)).toBe(true);
    });

    it('|| returns true when right side is truthy', () => {
      const ev: ExpressionEvaluator = (e) => e === 'b' ? true : false;
      expect(evaluateCondition('a || b', ev)).toBe(true);
    });

    it('|| returns false when both sides are falsy', () => {
      const ev: ExpressionEvaluator = () => false;
      expect(evaluateCondition('a || b', ev)).toBe(false);
    });
  });

  describe('unary negation', () => {
    it('!true evaluates to false', () => {
      expect(evaluateCondition('!true', evaluate)).toBe(false);
    });

    it('!false evaluates to true', () => {
      expect(evaluateCondition('!false', evaluate)).toBe(true);
    });

    it('negates a variable truthiness', () => {
      const ev: ExpressionEvaluator = () => false;
      expect(evaluateCondition('!myVar', ev)).toBe(true);
    });
  });

  describe('variable truthiness', () => {
    it('returns true for a truthy variable', () => {
      const ev: ExpressionEvaluator = () => 'hello';
      expect(evaluateCondition('myVar', ev)).toBe(true);
    });

    it('returns false for a falsy variable', () => {
      const ev: ExpressionEvaluator = () => null;
      expect(evaluateCondition('myVar', ev)).toBe(false);
    });

    it('returns false for a 0 variable', () => {
      const ev: ExpressionEvaluator = () => 0;
      expect(evaluateCondition('myVar', ev)).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns false when evaluate throws', () => {
      const ev: ExpressionEvaluator = () => { throw new Error('evaluation failed'); };
      expect(evaluateCondition('badExpr', ev)).toBe(false);
    });
  });
});
