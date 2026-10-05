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
  RUNTIME_EXPRESSION_CACHE_LIMIT,
  RuntimeExpressionError,
  evaluateRuntimeExpression,
  parseRuntimeExpression,
  returnedExpression,
  runtimeExpressionCacheSize,
  type RuntimeExpression,
} from '../runtime-expression';

/** Why `source` is refused at parse time, or undefined when it parses. */
function refusal(source: string): string | undefined {
  try {
    parseRuntimeExpression(source);
    return undefined;
  } catch (error) {
    return error instanceof RuntimeExpressionError ? error.reason : String(error);
  }
}

describe('ExpressionEvaluator reaches only its context and what it is given', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not run a host built-in the context does not hold (root evaluator)', () => {
    const ev = new RootEvaluator({ price: 3 });
    // Date is no value in the context and not among the provided functions, so the
    // text is not an expression here and comes back as it is.
    expect(ev.evaluate('Date.now()')).toBe('Date.now()');
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

describe('text the parser would misread stays as written', () => {
  afterEach(() => vi.restoreAllMocks());
  const context = { x: 3, score: 5, price: 2, caf: 'C' };

  // Each of these became a different value through the composition lexer, which
  // skips a character it does not know and reads `06` as 6. Main ran them as
  // strict-mode JavaScript, which refused them, so they were kept as text.
  it.each([
    ['72%'], // examples/iot/holotwin-smart-farm.holo:112
    ['2026-06-30'], // examples/webgpu-compute/gpu-acceleration-month-1-receipt.holo:36
    ['$299.99'],
    ['€10'],
    ['\u22125'], // unicode minus
    ['2024-01-05'],
    ['555-0123'],
    ['007'],
    ['`x`'],
    ['x\u00b2'],
    ['~x'],
    ['score%'],
    ['$price'],
    ['caf\u00e9'],
    ['x | 1'],
    ['x & 1'],
    ['x &&& 1'],
    ['True'],
    ['FALSE'],
    ['NULL'],
    ['"\\u0041"'],
    // The parser does not keep a computed index (`a[0]` reads ""), so it is no expression.
    ['F+[[X]-X]-F[-FX]+X'],
    ['scale[0] * scale[1]'],
  ])('%s', (text) => {
    expect(refusal(text)).toBe('parse');
    expect(new RootEvaluator({ ...context }).evaluate(text)).toBe(text);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(new StateEvaluator({ ...context }).evaluate(text)).toBeUndefined();
  });

  it('still reads numbers, strings and literals the lexer reads as written', () => {
    const ev = new RootEvaluator({ ...context });
    expect(ev.evaluate('10 - 0')).toBe(10);
    expect(ev.evaluate('1.05 + 1')).toBe(2.05);
    expect(ev.evaluate('0.5')).toBe(0.5);
    expect(ev.evaluate('"it\'s " + x')).toBe("it's 3");
    expect(ev.evaluate('"a\\tb"')).toBe('a\tb');
    expect(ev.evaluate('x > 2 && score < 9')).toBe(true);
    expect(ev.evaluate('null ?? "none"')).toBe('none');
    expect(ev.evaluate('Infinity')).toBe(Infinity);
    expect(ev.evaluate('-Infinity')).toBe(-Infinity);
    expect(ev.evaluate('NaN')).toBeNaN();
  });

  it('refuses a bracket that closes nothing open, so text cannot close the composition it goes into', () => {
    const splice = '1 } } logic { action runtime_expression() { return x';
    expect(refusal(splice)).toBe('parse');
    expect(new RootEvaluator({ ...context }).evaluate(splice)).toBe(splice);
    expect(refusal('(x')).toBe('parse');
    expect(refusal('x)')).toBe('parse');
    expect(refusal('[x}')).toBe('parse');
    // The composition parser accepts this one; the bracket check is what refuses it.
    expect(refusal('x }')).toBe('parse');
    expect(refusal('"(" + x')).toBeUndefined();
  });

  it('refuses a line break inside or outside a string: an expression is one line', () => {
    expect(refusal('x\n')).toBe('parse');
    expect(refusal('1\r\n+ 2')).toBe('parse');
    expect(refusal('"a\nb"')).toBe('parse');
    expect(refusal('"a')).toBe('parse');
  });
});

describe('a call to a function nobody offers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps its text, as main did', () => {
    const ev = new RootEvaluator({});
    // examples/platforms/openxr-app.holo:75
    expect(ev.evaluate('same_as("LeftHand")')).toBe('same_as("LeftHand")');
    // examples/ar-foundation/persistent-anchors.holo:53
    expect(ev.evaluate('${generateUUID()}')).toBe('generateUUID()');
    expect(ev.evaluate('anchor-${generateUUID()}')).toBe('anchor-generateUUID()');
    // Main threw for these too (not a function), so it kept the text.
    const holding = new RootEvaluator({ score: 1, butler: 'B' });
    expect(holding.evaluate('score(1)')).toBe('score(1)');
    expect(holding.evaluate('1 (butler)')).toBe('1 (butler)');
  });

  it('keeps a word that only starts like a host name as text', () => {
    const ev = new RootEvaluator({});
    expect(ev.evaluate('self-improve')).toBe('self-improve');
    expect(ev.evaluate('__any__')).toBe('__any__');
    expect(ev.evaluate('window')).toBe('window');
  });

  it('fails as an unknown name, naming the callee or its owner', () => {
    for (const [source, name] of [
      ['same_as("LeftHand")', 'same_as'],
      ['Tools.make(1)', 'Tools'],
    ]) {
      try {
        evaluateRuntimeExpression(parseRuntimeExpression(source), {});
        expect.unreachable(source);
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeExpressionError);
        expect((error as RuntimeExpressionError).reason).toBe('unknown-name');
        expect((error as RuntimeExpressionError).unknownName).toBe(name);
      }
    }
  });

  it('still gives undefined for a name main refused', () => {
    const ev = new RootEvaluator({ score: 1, x: {} });
    for (const source of [
      'eval("1")',
      'fs.readFileSync("x")',
      'child_process.exec("x")',
      'Reflect.ownKeys(x)',
      'require("os")',
    ]) {
      expect(ev.evaluate(source), source).toBeUndefined();
    }
    // The lexer reads `Function` as the keyword `function`, so this is no expression.
    expect(ev.evaluate('Function("return 1")')).toBe('Function("return 1")');
  });
});

describe('runtime-expression guards', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses a prototype key at parse time and at evaluation time', () => {
    function fn(): void {}
    expect(refusal('fn.prototype')).toBe('form');
    expect(refusal('{ prototype: 1 }')).toBe('form');
    expect(new RootEvaluator({ fn }).evaluate('fn.prototype')).toBeUndefined();
    // A hand-built IR, as a tampered cache would hold, is refused when it is read.
    const member: RuntimeExpression = {
      kind: 'Member',
      object: { kind: 'Identifier', name: 'fn' },
      property: 'prototype',
    };
    expect(() => evaluateRuntimeExpression(member, { fn })).toThrow(
      '"prototype" cannot be read here'
    );
    const proto: RuntimeExpression = { ...member, property: '__proto__' };
    expect(() => evaluateRuntimeExpression(proto, { fn })).toThrow(
      '"__proto__" cannot be read here'
    );
  });

  it('refuses unary minus on an object without running its valueOf', () => {
    const valueOf = vi.fn(() => 1);
    const ir = parseRuntimeExpression('-player');
    expect(() => evaluateRuntimeExpression(ir, { player: { valueOf } })).toThrow(
      'unary "-" needs a primitive value'
    );
    expect(valueOf).not.toHaveBeenCalled();
  });

  it('hands out frozen IR, so a caller cannot change a later parse', () => {
    const ir = parseRuntimeExpression('score + 1') as Extract<
      RuntimeExpression,
      { kind: 'Binary' }
    >;
    expect(Object.isFrozen(ir)).toBe(true);
    expect(Object.isFrozen(ir.right)).toBe(true);
    expect(() => {
      (ir.right as { value: unknown }).value = 100;
    }).toThrow(TypeError);
    expect(new RootEvaluator({ score: 1 }).evaluate('score + 1')).toBe(2);
  });

  it('keeps the parse cache within its limit', () => {
    for (let i = 0; i < RUNTIME_EXPRESSION_CACHE_LIMIT + 20; i++) {
      parseRuntimeExpression(`cache_probe + ${i}`);
    }
    expect(runtimeExpressionCacheSize()).toBeLessThanOrEqual(RUNTIME_EXPRESSION_CACHE_LIMIT);
  });

  it('takes only the one action, named runtime_expression, returning one value', () => {
    const value = { type: 'Identifier', name: 'x' };
    const ast = (actions: unknown[], extra: Record<string, unknown> = {}) => ({
      type: 'Composition',
      objects: [],
      logic: { actions },
      ...extra,
    });
    const action = (name: string, body: unknown[]) => ({ name, body });
    const returnX = { type: 'ReturnStatement', value };

    expect(returnedExpression(ast([action('runtime_expression', [returnX])]))).toBe(value);
    for (const bad of [
      ast([action('runtime_expression', [returnX]), action('other', [returnX])]),
      ast([action('other', [returnX])]),
      ast([action('runtime_expression', [returnX])], { objects: [{ name: 'spliced' }] }),
      ast([action('runtime_expression', [returnX, returnX])]),
      ast([action('runtime_expression', [{ type: 'ExpressionStatement', expression: value }])]),
      ast([]),
      null,
    ]) {
      expect(() => returnedExpression(bad)).toThrow('not one expression');
    }
  });
});
