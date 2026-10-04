/**
 * The ReactiveState ExpressionEvaluators parse and interpret; they never run an
 * expression as JavaScript (task_1790602604837_whpw, item 5).
 *
 * Before, both handed the text to `new Function` behind a blocklist of words, so an
 * expression could reach anything the host had in scope that the list did not name,
 * and reading the context ran its getters. These use ordinary values.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpressionEvaluator as RootEvaluator } from '../../ReactiveState';
import { ExpressionEvaluator as StateEvaluator } from '../../state/ReactiveState';
import {
  RuntimeExpressionError,
  evaluateRuntimeExpression,
  parseRuntimeExpression,
} from '../runtime-expression';

describe('ExpressionEvaluator reaches only its context and what it is given', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not run a host built-in the context does not hold (root evaluator)', () => {
    const ev = new RootEvaluator({ price: 3 });
    // Date is no value in the context and not among the provided functions.
    expect(ev.evaluate('Date.now()')).toBeUndefined();
    expect(ev.evaluate('Math.max(price, 5)')).toBe(5);
  });

  it('does not offer Object to an expression (state evaluator)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ev = new StateEvaluator({ config: { size: 2 } });
    // With Object, an expression could also reach Object.prototype through
    // getPrototypeOf and rewrite it with assign.
    expect(ev.evaluate('Object.keys(config)')).toBeUndefined();
    expect(ev.evaluate('config.size * 2')).toBe(4);
  });

  it('reads a context value without running its getter', () => {
    let getterRan = false;
    const context = {
      count: 2,
      get total() {
        getterRan = true;
        return 10;
      },
    };
    expect(new RootEvaluator(context).evaluate('total + count')).toBeUndefined();
    expect(getterRan).toBe(false);
    expect(new RootEvaluator(context).evaluate('count + 1')).toBe(3);
  });
});

describe('ExpressionEvaluator keeps the value rules programs rely on', () => {
  const ev = new RootEvaluator({
    score: 7,
    name: '',
    items: ['a', 'b', 'c'],
    level: 3,
    player: { hp: 40 },
  });

  it.each([
    ['"Score: " + score', 'Score: 7'],
    ['name || "guest"', 'guest'],
    ['player.hp ?? 100', 40],
    ['items.length', 3],
    ['level > 2 ? "high" : "low"', 'high'],
    ['[score, level]', [7, 3]],
    ['{ hp: player.hp, alive: player.hp > 0 }', { hp: 40, alive: true }],
    ['Math.round(score / 2)', 4],
    ['score == "7"', true],
  ])('%s', (expression, expected) => {
    expect(ev.evaluate(expression)).toEqual(expected);
  });

  it('hands back text that is not an expression unchanged, as before', () => {
    expect(ev.evaluate('30 days')).toBe('30 days');
    expect(ev.evaluate('postgresql+pgvector')).toBe('postgresql+pgvector');
    expect(ev.evaluate('Hello ${score}!')).toBe('Hello 7!');
  });
});

describe('runtime-expression', () => {
  it('refuses a prototype name as a member or a call', () => {
    expect(() => parseRuntimeExpression('items.constructor')).toThrow(RuntimeExpressionError);
    expect(() => parseRuntimeExpression('Math.constructor(1)')).toThrow();
  });

  it('calls only a function it is given, never one on a value prototype', () => {
    const ir = parseRuntimeExpression('items.includes("a")');
    expect(() => evaluateRuntimeExpression(ir, { items: ['a'] })).toThrow(
      '"items.includes" is not a function provided here'
    );
  });

  it('refuses an object operand instead of converting it', () => {
    const ir = parseRuntimeExpression('player + 1');
    expect(() => evaluateRuntimeExpression(ir, { player: { hp: 1 } })).toThrow(
      'operator "+" needs primitive values'
    );
  });
});
