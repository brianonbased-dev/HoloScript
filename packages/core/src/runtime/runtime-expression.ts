/**
 * Runtime expressions — what the ReactiveState ExpressionEvaluators evaluate,
 * parsed into a typed IR and interpreted, never run as text.
 *
 * Both evaluators used to hand the expression text to `new Function`, behind a
 * blocklist of dangerous words. A blocklist cannot be made sound: the root
 * evaluator's `\bglobalThis?\b` never matched `global`, so `global.x` ran. This
 * module replaces that with the pattern expression-ir.ts uses: parse, check,
 * interpret.
 *
 * Why not ExpressionIR itself: ExpressionIR is HS-Core v0's expression subset. Its
 * `+` is numeric and its `&&`/`||` return booleans, which is right for compiled
 * guards and wrong for runtime values (`"Score: " + score`, `name || "guest"`, both
 * common in the examples), and the HS-Core tools (HSIIRCompiler, the Kotlin emitter,
 * HSIAuditVerifier, HSILearningGraph) switch over its kinds. So this is a sibling IR
 * with the same fail-closed rules and JavaScript's value semantics, and HS-Core v0
 * stays exactly as it is.
 *
 * Fail-closed rules:
 *  - The text is parsed by the HoloScript parser (parseHolo); nothing is evaluated
 *    as JavaScript. Text the parser would misread (a character its lexer skips, a
 *    leading zero) is refused first, so it stays plain text.
 *  - The interpreter reads values only through own data properties: nothing reaches
 *    a prototype, `__proto__` / `prototype` / `constructor` are refused, and a getter
 *    is refused, not run.
 *  - A call names a function the caller provides (or one the context holds), and is
 *    resolved the same way; no method is looked up on a value's prototype.
 *  - Operators apply to primitives only. An object operand (other than for `===` /
 *    `!==`) is refused, so no valueOf or toString runs for an operator.
 *
 * These hold for the interpreter's own reads. A function the caller provides is
 * ordinary code: `JSON.stringify`, `String` or `Math.max` may still run a getter,
 * valueOf or toString of a value passed to it, as they did before.
 */
import { parseHolo } from '../parser/HoloCompositionParser';
import type { HoloExpression } from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '===' | '!==' | '<' | '>' | '<=' | '>=';

const BINARY_OPERATORS = new Set<string>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
]);
const LOGICAL_OPERATORS = new Set<string>(['&&', '||', '??']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type RuntimeExpression =
  | { kind: 'Literal'; value: string | number | boolean | null }
  | { kind: 'Identifier'; name: string }
  | { kind: 'Member'; object: RuntimeExpression; property: string }
  | { kind: 'Call'; object: string | null; name: string; arguments: RuntimeExpression[] }
  | { kind: 'Unary'; operator: '!' | '-'; argument: RuntimeExpression }
  | { kind: 'Binary'; operator: BinaryOperator; left: RuntimeExpression; right: RuntimeExpression }
  | {
      kind: 'Logical';
      operator: '&&' | '||' | '??';
      left: RuntimeExpression;
      right: RuntimeExpression;
    }
  | {
      kind: 'Conditional';
      test: RuntimeExpression;
      consequent: RuntimeExpression;
      alternate: RuntimeExpression;
    }
  | { kind: 'Array'; elements: RuntimeExpression[] }
  | { kind: 'Object'; properties: Array<{ key: string; value: RuntimeExpression }> };

/**
 * Why an expression was not evaluated:
 *  - `parse`: the text is not one expression (a phrase such as `30 days`);
 *  - `parse` also covers a computed `[...]` read, which the composition parser does
 *    not keep (`items[0]` comes back as a read of ""), so `F+[[X]-X]` stays text;
 *  - `form`: it uses something this IR does not admit (a `prototype` key);
 *  - `unknown-name`: it names something the context does not hold (`name` says what);
 *  - `not-provided`: it calls something that is not a provided function (`score(1)`);
 *  - `value`: an operator or read met a value it refuses (an object, a getter).
 */
export type RuntimeExpressionFailure = 'parse' | 'form' | 'unknown-name' | 'not-provided' | 'value';

export class RuntimeExpressionError extends Error {
  constructor(
    readonly reason: RuntimeExpressionFailure,
    message: string,
    readonly unknownName?: string
  ) {
    super(message);
    this.name = 'RuntimeExpressionError';
  }
}

function fail(reason: RuntimeExpressionFailure, message: string, unknownName?: string): never {
  throw new RuntimeExpressionError(reason, message, unknownName);
}

// =============================================================================
// PARSING
// =============================================================================

const ACTION = 'runtime_expression';
export const RUNTIME_EXPRESSION_CACHE_LIMIT = 2000;
const parsed = new Map<string, RuntimeExpression | RuntimeExpressionError>();

/** How many parses are cached; never more than RUNTIME_EXPRESSION_CACHE_LIMIT. */
export function runtimeExpressionCacheSize(): number {
  return parsed.size;
}

/**
 * Parse expression text into a RuntimeExpression. Throws a RuntimeExpressionError
 * (`parse` or `form`). Results are cached by text, so a hot expression is parsed once;
 * a cached result is frozen, so no caller can change what the next one gets.
 */
export function parseRuntimeExpression(source: string): RuntimeExpression {
  const hit = parsed.get(source);
  if (hit instanceof RuntimeExpressionError) throw hit;
  if (hit) return hit;
  let result: RuntimeExpression | RuntimeExpressionError;
  try {
    result = deepFreeze(lowerRuntimeExpression(parseOne(source)));
  } catch (error) {
    if (!(error instanceof RuntimeExpressionError)) throw error;
    result = error;
  }
  if (parsed.size >= RUNTIME_EXPRESSION_CACHE_LIMIT) {
    parsed.delete(parsed.keys().next().value as string);
  }
  parsed.set(source, result);
  if (result instanceof RuntimeExpressionError) throw result;
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Every character the composition lexer reads outside a string. It skips any other
 * one, so `72%` would lex as `72`. An expression is one line, so no line break.
 */
const LEXER_CHARACTER = /^[A-Za-z0-9_ \t{}[\]():,.=+\-*/<>!@#;?&|]$/;
/** The escapes the lexer decodes. It reads any other `\c` as plain `c`. */
const LEXER_ESCAPES = new Set(['n', 't', 'r', '\\', '"', "'"]);
const CLOSING = new Map([
  [')', '('],
  [']', '['],
  ['}', '{'],
]);
const LITERAL_WORDS = new Set(['true', 'false', 'null']);

/**
 * Refuse, as `parse`, text the composition lexer would read as something other than
 * what it says, so it stays plain text instead of becoming a different value.
 * Strict-mode JavaScript, which main ran this text as, refuses all of it too:
 *  - a character the lexer skips: `72%` would be 72, `$price` would read `price`;
 *  - `&` or `|` other than `&&` / `||`;
 *  - a number with a leading zero, which the lexer reads as decimal: `2026-06-30`
 *    would be 1990;
 *  - `True`, `NULL` and the like, which the lexer reads as literals in any case;
 *  - a string escape the lexer does not decode (`\u0041` would be "u0041"), or a
 *    line break or missing end in a string;
 *  - a bracket that closes nothing open, which could close the composition the text
 *    goes into.
 */
function checkText(source: string): void {
  let code = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' || char === "'") {
      let end = i + 1;
      while (end < source.length && source[end] !== char) {
        if (source[end] === '\n' || source[end] === '\r') fail('parse', 'a line break in a string');
        if (source[end] !== '\\') {
          end++;
        } else if (LEXER_ESCAPES.has(source[end + 1])) {
          end += 2;
        } else {
          fail('parse', 'a string escape the lexer does not decode');
        }
      }
      if (end >= source.length) fail('parse', 'a string with no end');
      code += '""';
      i = end;
    } else if (LEXER_CHARACTER.test(char)) {
      code += char;
    } else {
      fail('parse', `"${char}" is not part of an expression`);
    }
  }
  for (const run of code.match(/&+|\|+/g) ?? []) {
    if (run.length !== 2) fail('parse', `"${run}" is not an operator here`);
  }
  for (const word of code.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?/g) ?? []) {
    if (/^0\d/.test(word)) fail('parse', `"${word}" starts with a zero`);
    if (LITERAL_WORDS.has(word.toLowerCase()) && !LITERAL_WORDS.has(word)) {
      fail('parse', `"${word}" is not a literal`);
    }
  }
  // Every close must match the latest open, so the text cannot close the action it
  // is spliced into (the parser itself accepts `x }`). An unclosed open cannot escape;
  // the parser refuses it.
  const open: string[] = [];
  for (const char of code) {
    if (char === '(' || char === '[' || char === '{') open.push(char);
    else if (CLOSING.has(char) && open.pop() !== CLOSING.get(char)) {
      fail('parse', `"${char}" closes nothing open`);
    }
  }
}

function parseOne(source: string): HoloExpression {
  checkText(source);
  const result = parseHolo(
    `composition "e" {\n  logic {\n    action ${ACTION}() {\n      return ${source}\n    }\n  }\n}\n`
  );
  if (result.errors.length > 0 || !result.ast) {
    fail('parse', `not an expression: ${result.errors[0]?.message ?? 'no result'}`);
  }
  return returnedExpression(result.ast);
}

/**
 * The one expression a parsed `parseOne` composition returns. checkText keeps the text
 * from closing the action it is spliced into; this checks the result anyway: only the
 * one action, named runtime_expression, holding one return and nothing else, counts.
 */
export function returnedExpression(ast: unknown): HoloExpression {
  const root = (ast ?? {}) as Record<string, unknown>;
  const actions = (root.logic as { actions?: Array<{ name?: string; body?: unknown[] }> })?.actions;
  const extra = Object.entries(root).find(([, value]) => Array.isArray(value) && value.length > 0);
  const body = actions?.[0]?.body;
  const only = body?.length === 1 ? (body[0] as { type?: string; value?: HoloExpression }) : null;
  if (
    !actions ||
    actions.length !== 1 ||
    actions[0].name !== ACTION ||
    extra ||
    only?.type !== 'ReturnStatement' ||
    !only.value
  ) {
    fail('parse', 'not one expression');
  }
  return only.value;
}

function checkKey(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) fail('form', `"${key}" cannot be read or written here`);
}

/** Lower a parsed HoloExpression into the runtime IR, refusing anything else. */
export function lowerRuntimeExpression(expr: HoloExpression): RuntimeExpression {
  switch (expr.type) {
    case 'Literal':
      return { kind: 'Literal', value: expr.value };
    case 'Identifier':
      return { kind: 'Identifier', name: expr.name };
    case 'MemberExpression':
      if (expr.computed) fail('parse', 'the parser does not keep a computed member ([...])');
      checkKey(expr.property);
      return {
        kind: 'Member',
        object: lowerRuntimeExpression(expr.object),
        property: expr.property,
      };
    case 'CallExpression': {
      const callee = expr.callee;
      const args = expr.arguments.map(lowerRuntimeExpression);
      if (callee.type === 'Identifier') {
        return { kind: 'Call', object: null, name: callee.name, arguments: args };
      }
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier'
      ) {
        checkKey(callee.property);
        return { kind: 'Call', object: callee.object.name, name: callee.property, arguments: args };
      }
      return fail('not-provided', 'only a provided function can be called');
    }
    case 'UnaryExpression':
      if (expr.operator !== '!' && expr.operator !== '-') {
        fail('form', `unary "${String(expr.operator)}" is not supported`);
      }
      return {
        kind: 'Unary',
        operator: expr.operator,
        argument: lowerRuntimeExpression(expr.argument),
      };
    case 'BinaryExpression': {
      const left = lowerRuntimeExpression(expr.left);
      const right = lowerRuntimeExpression(expr.right);
      if (LOGICAL_OPERATORS.has(expr.operator)) {
        return { kind: 'Logical', operator: expr.operator as '&&' | '||' | '??', left, right };
      }
      if (!BINARY_OPERATORS.has(expr.operator)) {
        fail('form', `operator "${expr.operator}" is not supported`);
      }
      return { kind: 'Binary', operator: expr.operator as BinaryOperator, left, right };
    }
    case 'ConditionalExpression':
      return {
        kind: 'Conditional',
        test: lowerRuntimeExpression(expr.test),
        consequent: lowerRuntimeExpression(expr.consequent),
        alternate: lowerRuntimeExpression(expr.alternate),
      };
    case 'ArrayExpression':
      return { kind: 'Array', elements: expr.elements.map(lowerRuntimeExpression) };
    case 'ObjectExpression':
      return {
        kind: 'Object',
        properties: expr.properties.map((property) => {
          checkKey(property.key);
          return { key: property.key, value: lowerRuntimeExpression(property.value) };
        }),
      };
    default:
      return fail('form', `${String((expr as { type?: unknown }).type)} is not supported`);
  }
}

// =============================================================================
// EVALUATION
// =============================================================================

/** The own data value of `key`, `found: false` when there is none. A getter is refused. */
function ownData(object: unknown, key: string): { found: boolean; value?: unknown } {
  if (FORBIDDEN_KEYS.has(key)) fail('form', `"${key}" cannot be read here`);
  if (object === null || object === undefined) return { found: false };
  const descriptor = Object.getOwnPropertyDescriptor(Object(object), key);
  if (!descriptor) return { found: false };
  if (!('value' in descriptor))
    fail('value', `"${key}" is read through a getter, which is refused`);
  return { found: true, value: descriptor.value };
}

/** The global values an expression may name without anyone providing them. */
const CONSTANTS = new Map<string, unknown>([
  ['undefined', undefined],
  ['Infinity', Infinity],
  ['NaN', NaN],
]);

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');

/**
 * Evaluate a RuntimeExpression. `context` holds the values (state, variables);
 * `provided` holds the functions and namespaces (Math, the runtime's builtins) a
 * call may name. Throws RuntimeExpressionError; never evaluates text.
 */
export function evaluateRuntimeExpression(
  ir: RuntimeExpression,
  context: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>> = {}
): unknown {
  /** A name's value: the context's own, else the provided one, else a constant. */
  const lookup = (name: string): unknown => {
    const own = ownData(context, name);
    if (own.found) return own.value;
    const given = ownData(provided, name);
    if (given.found) return given.value;
    if (CONSTANTS.has(name)) return CONSTANTS.get(name);
    return fail('unknown-name', `"${name}" is not defined here`, name);
  };
  const evaluate = (node: RuntimeExpression): unknown => {
    switch (node.kind) {
      case 'Literal':
        return node.value;
      case 'Identifier':
        return lookup(node.name);
      case 'Member': {
        const object = evaluate(node.object);
        if (object === null || object === undefined) {
          fail('value', `cannot read "${node.property}" of ${String(object)}`);
        }
        return ownData(object, node.property).value;
      }
      case 'Call': {
        // A name nobody holds is `unknown-name`, so `same_as("LeftHand")` stays text.
        let owner: unknown;
        let fn: unknown;
        if (node.object === null) {
          fn = lookup(node.name);
        } else {
          owner = lookup(node.object);
          fn = ownData(owner, node.name).value;
        }
        const args = node.arguments.map(evaluate);
        if (typeof fn !== 'function') {
          const label = node.object === null ? node.name : `${node.object}.${node.name}`;
          fail('not-provided', `"${label}" is not a function provided here`);
        }
        return Reflect.apply(fn as (...a: unknown[]) => unknown, owner, args);
      }
      case 'Unary': {
        const value = evaluate(node.argument);
        if (node.operator === '!') return !value;
        if (!isPrimitive(value)) fail('value', 'unary "-" needs a primitive value');
        return -(value as number);
      }
      case 'Logical': {
        const left = evaluate(node.left);
        if (node.operator === '&&') return left ? evaluate(node.right) : left;
        if (node.operator === '||') return left ? left : evaluate(node.right);
        return left ?? evaluate(node.right);
      }
      case 'Binary': {
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        if (node.operator === '===') return left === right;
        if (node.operator === '!==') return left !== right;
        if (!isPrimitive(left) || !isPrimitive(right)) {
          fail('value', `operator "${node.operator}" needs primitive values`);
        }
        // Primitives only, so no valueOf or toString of a value runs here.
        const a = left as number;
        const b = right as number;
        switch (node.operator) {
          case '+':
            return (a as unknown as string) + (b as unknown as string);
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return a / b;
          case '%':
            return a % b;
          case '==':
            // eslint-disable-next-line eqeqeq
            return a == b;
          case '!=':
            // eslint-disable-next-line eqeqeq
            return a != b;
          case '<':
            return a < b;
          case '>':
            return a > b;
          case '<=':
            return a <= b;
          case '>=':
            return a >= b;
          default:
            return fail('form', `operator "${String(node.operator)}" is not supported`);
        }
      }
      case 'Conditional':
        return evaluate(node.test) ? evaluate(node.consequent) : evaluate(node.alternate);
      case 'Array':
        return node.elements.map(evaluate);
      case 'Object': {
        const out: Record<string, unknown> = {};
        for (const { key, value } of node.properties) {
          Object.defineProperty(out, key, {
            value: evaluate(value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        return out;
      }
      default:
        return fail('form', `${String((node as { kind?: unknown }).kind)} is not supported`);
    }
  };
  return evaluate(ir);
}

/**
 * The names main's blocklist refused (`constructor`, `prototype` and `__proto__` are
 * refused as a `form` already). An expression naming one yields `undefined`, as on
 * main; any other unknown name is plain text.
 */
const HOST_NAMES = new Set([
  'eval',
  'require',
  'import',
  'process',
  'global',
  'globalThis',
  '__dirname',
  '__filename',
  'fs',
  'child_process',
  'Reflect',
  'Proxy',
  'Function',
  'arguments',
]);

/**
 * Evaluate expression text the way the ReactiveState evaluators answer:
 *  - text that is not one expression, that names something nobody holds, or that
 *    calls something that cannot be called (`same_as("LeftHand")`, `1 (butler)`) is
 *    plain text, as it was on main, where JavaScript threw for it: `'text'` returns it
 *    unchanged (the root evaluator, which `.hs` config values such as
 *    `storage: "postgresql+pgvector"` pass through), and `'undefined'` returns undefined;
 *  - a name main's blocklist refused (`global`, `process`, `eval`, ...), or anything
 *    else that is refused, yields undefined.
 * Nothing is executed as text in any case.
 */
export function evaluateExpressionText(
  source: string,
  context: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>>,
  plainText: 'text' | 'undefined'
): unknown {
  try {
    return evaluateRuntimeExpression(parseRuntimeExpression(source), context, provided);
  } catch (error) {
    if (!(error instanceof RuntimeExpressionError)) throw error;
    const isPlainText =
      error.reason === 'parse' ||
      error.reason === 'not-provided' ||
      (error.reason === 'unknown-name' && !HOST_NAMES.has(error.unknownName ?? ''));
    return isPlainText && plainText === 'text' ? source : undefined;
  }
}
